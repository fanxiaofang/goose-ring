import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

/**
 * Rapier 物理世界封装：静态地面/围栏 Collider、测试球投放、固定步进、碰撞线框调试。
 * 约束（AGENTS.md）：单份物理状态源；围栏每段边界覆盖真实可见尺寸，圈/球不能穿栏。
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  /** Rapier 碰撞体线框（调试图层，默认关闭）。 */
  private debugLines: THREE.LineSegments;

  private constructor(world: RAPIER.World, debugLines: THREE.LineSegments) {
    this.world = world;
    this.debugLines = debugLines;
  }

  static async create(scene: THREE.Scene): Promise<PhysicsWorld> {
    await RAPIER.init(); // WASM 初始化；失败会抛异常，由上层展示 fatal error
    const world = new RAPIER.World({
      x: 0,
      y: gameConfig.physics.gravityY,
      z: 0,
    });

    const debugLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true }),
    );
    debugLines.visible = false;
    debugLines.frustumCulled = false;
    scene.add(debugLines);

    const pw = new PhysicsWorld(world, debugLines);
    pw.buildStaticColliders();
    return pw;
  }

  /** 地面 + 四面围栏墙，尺寸与 GameScene 的视觉围栏完全一致。 */
  private buildStaticColliders(): void {
    const { ground, fence } = gameConfig;
    const staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    // 地面：厚盒，顶面正好在 y=0
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(ground.sizeX / 2, 0.5, ground.sizeZ / 2).setTranslation(0, -0.5, 0),
      staticBody,
    );

    // 围栏四面薄墙：真实高度 fence.height，不留在缝隙
    const t = 0.08; // 墙厚
    const hx = fence.width / 2 + t;
    const hz = fence.depth / 2 + t;
    const walls: Array<[number, number, number, number, number]> = [
      // [halfX, halfY, halfZ, x, z]
      [hx, fence.height / 2, t, 0, -fence.depth / 2], // 后墙（远处）
      [hx, fence.height / 2, t, 0, fence.depth / 2], // 前墙（玩家侧）
      [t, fence.height / 2, hz, -fence.width / 2, 0], // 左墙
      [t, fence.height / 2, hz, fence.width / 2, 0], // 右墙
    ];
    for (const [hxw, hy, hzw, x, z] of walls) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hxw, hy, hzw)
          .setTranslation(x, fence.height / 2, z)
          .setFriction(0.8)
          .setRestitution(0.3),
        staticBody,
      );
    }
  }

  /** 投放一颗测试刚体球，落到地面证明碰撞有效。返回其刚体。 */
  spawnBall(x: number, z: number): RAPIER.RigidBody {
    const { radius, restitution, friction, spawnHeight } = gameConfig.ball;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, spawnHeight, z),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(radius).setRestitution(restitution).setFriction(friction),
      body,
    );
    return body;
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  /** 固定步进（由 GameApp 的累加器驱动，防止帧率影响物理结果）。 */
  step(): void {
    this.world.timestep = gameConfig.physics.fixedDt;
    this.world.step();
  }

  setDebugVisible(visible: boolean): void {
    this.debugLines.visible = visible;
  }

  isDebugVisible(): boolean {
    return this.debugLines.visible;
  }

  /** 从 Rapier debugRender() 刷新线框缓冲。 */
  updateDebugLines(): void {
    if (!this.debugLines.visible) return;
    const { vertices, colors } = this.world.debugRender();
    const geo = this.debugLines.geometry as THREE.BufferGeometry;
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
}
