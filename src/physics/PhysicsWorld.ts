import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { GooseLayoutEntry } from '../goose/GoosePlaceholder';
import { createRingRigidBody, type RingBodyOptions } from '../ring/ringBody';

/** 鹅的碰撞部位：身体 / 颈 / 头。 */
export type GoosePart = 'body' | 'neck' | 'head';

/**
 * Rapier 物理世界封装：静态地面/围栏/灰盒鹅 Collider、测试球投放、固定步进、碰撞线框调试。
 * 约束（AGENTS.md）：单份物理状态源；围栏每段边界覆盖真实可见尺寸，球/圈不能穿栏。
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  private groundCollider!: RAPIER.Collider;
  /** 碰撞体 handle → 可读名称（ground / fence / goose-N），用于调试与证据导出。 */
  private readonly labels = new Map<number, string>();
  /** 碰撞体 handle → 鹅序号与部位，供套中判定使用。 */
  private readonly parts = new Map<number, { index: number; part: GoosePart }>();
  /** 每只鹅的刚体（套中退场时整体移除）。 */
  private readonly gooseBodies: Array<RAPIER.RigidBody | undefined> = [];

  /** Rapier 碰撞体线框（调试图层，默认关闭）。 */
  private debugLines: THREE.LineSegments;

  private constructor(world: RAPIER.World, debugLines: THREE.LineSegments) {
    this.world = world;
    this.debugLines = debugLines;
  }

  /**
   * @param gooseLayout 参与碰撞的鹅布局；默认 8 只，P0-1 可传单只测试鹅。
   * 视觉与碰撞使用同一份布局，避免“看得见却没碰撞”。
   */
  static async create(
    scene: THREE.Scene,
    gooseLayout: readonly GooseLayoutEntry[] = gameConfig.goose.layout,
  ): Promise<PhysicsWorld> {
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
    pw.buildGooseColliders(gooseLayout);
    return pw;
  }

  /** 地面 + 四面围栏墙；各侧高度与 GameScene 的视觉栏杆一一对应。 */
  private buildStaticColliders(): void {
    const { ground, fence } = gameConfig;
    const staticBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

    // 地面：厚盒，顶面正好在 y=0
    this.groundCollider = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(ground.sizeX / 2, 0.5, ground.sizeZ / 2).setTranslation(0, -0.5, 0),
      staticBody,
    );
    this.labels.set(this.groundCollider.handle, 'ground');

    // 围栏四面薄墙：每侧高度 = 视觉栏杆高度，不留下可穿过的缝隙
    const t = 0.08; // 墙厚
    const { width, depth, farHeight, sideHeight, nearHeight } = fence;
    const walls: Array<[number, number, number, number, number]> = [
      // [halfX, halfY, halfZ, x, z]
      [width / 2 + t, farHeight / 2, t, 0, -depth / 2], // 远侧
      [width / 2 + t, nearHeight / 2, t, 0, depth / 2], // 玩家侧（低栏）
      [t, sideHeight / 2, depth / 2 + t, -width / 2, 0], // 左侧
      [t, sideHeight / 2, depth / 2 + t, width / 2, 0], // 右侧
    ];
    const heights = [farHeight, nearHeight, sideHeight, sideHeight];
    walls.forEach(([hx, hy, hz, x, z], i) => {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(x, heights[i] / 2, z)
          .setFriction(0.8)
          .setRestitution(0.3),
        staticBody,
      );
      this.labels.set(collider.handle, 'fence');
    });
  }

  /** 灰盒鹅静态碰撞体：身体球 + 颈胶囊 + 头球，与视觉占位体使用同一份配置。 */
  private buildGooseColliders(layout: readonly GooseLayoutEntry[]): void {
    const { body, neck, head, collider } = gameConfig.goose;
    layout.forEach((entry, index) => {
      const half = entry.rotY / 2;
      const gooseBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(entry.x, 0, entry.z)
          .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) }),
      );
      this.gooseBodies[index] = gooseBody;
      const label = `goose-${index + 1}`;
      const register = (handle: number, part: GoosePart) => {
        this.labels.set(handle, label);
        this.parts.set(handle, { index, part });
      };
      // 身体（近似球）
      register(this.world.createCollider(
        RAPIER.ColliderDesc.ball(collider.bodyRadius).setTranslation(0, body.y, 0),
        gooseBody,
      ).handle, 'body');
      // 颈（竖直胶囊）
      register(this.world.createCollider(
        RAPIER.ColliderDesc.capsule(collider.neckHalfHeight, collider.neckRadius).setTranslation(
          0,
          neck.y,
          neck.forward,
        ),
        gooseBody,
      ).handle, 'neck');
      // 头（球）
      register(this.world.createCollider(
        RAPIER.ColliderDesc.ball(collider.headRadius).setTranslation(
          0,
          head.y,
          head.forward,
        ),
        gooseBody,
      ).handle, 'head');
    });
  }

  /** 碰撞体 handle 对应的可读名称；未知返回 undefined。 */
  labelOf(handle: number): string | undefined {
    return this.labels.get(handle);
  }

  /** 碰撞体 handle 对应的鹅与部位（身体/颈/头）；非鹅碰撞体返回 null。 */
  goosePartOf(handle: number): { index: number; part: GoosePart } | null {
    return this.parts.get(handle) ?? null;
  }

  /** 移除一只鹅的全部碰撞体（套中退场用）；之后不再参与碰撞与判定。 */
  removeGoose(index: number): void {
    const body = this.gooseBodies[index];
    if (!body) return;
    const colliders = body.numColliders();
    for (let i = 0; i < colliders; i++) {
      const handle = body.collider(i).handle;
      this.labels.delete(handle);
      this.parts.delete(handle);
    }
    this.world.removeRigidBody(body);
    this.gooseBodies[index] = undefined;
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

  /**
   * 投放一个真实有孔的套圈刚体（16 段胶囊复合 Collider）。
   * 使用与单元测试相同的 createRingRigidBody，保证运行时与测试一致。
   */
  spawnRing(options: RingBodyOptions): RAPIER.RigidBody {
    return createRingRigidBody(this.world, options);
  }

  removeBody(body: RAPIER.RigidBody): void {
    this.world.removeRigidBody(body);
  }

  isTouchingGround(body: RAPIER.RigidBody): boolean {
    let touching = false;
    for (let i = 0; i < body.numColliders() && !touching; i++) {
      this.world.contactPair(body.collider(i), this.groundCollider, (manifold) => {
        touching ||= manifold.numSolverContacts() > 0;
      });
    }
    return touching;
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
