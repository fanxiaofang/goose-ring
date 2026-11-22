import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { gameConfig } from '../config/gameConfig';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { QuatLike } from './ringBody';
import type { Vec3Like } from './throwMath';

/** 可在调试面板实时调整的套圈参数（只影响之后新建的套圈）。 */
export interface RingTuning {
  radius: number;
  tubeRadius: number;
  segments: number;
  mass: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
  /** 拖拽投掷的最大初速度（m/s）。 */
  speed: number;
  elevationDeg: number;
  spin: number;
  ccd: boolean;
}

/** 一次投掷的完整初始条件；保存后可原样重放，用于确定性复现。 */
export interface RingLaunchSpec {
  position: Vec3Like;
  rotation: QuatLike;
  linvel: Vec3Like;
  angvel: Vec3Like;
}

interface RingEntry {
  body: RAPIER.RigidBody;
  mesh: THREE.Mesh;
  /** 本圈创建的几何体，回收时释放。 */
  geometries: THREE.BufferGeometry[];
  age: number;
  sleepTime: number;
}

/**
 * 套圈可视与生命周期管理（P0-1）。
 * 物理刚体由 createRingRigidBody 创建；这里只负责网格同步、上限回收与静止回收。
 * 不参与套中判定、不计分、不写任何正式数据。
 */
export class RingSystem {
  readonly tuning: RingTuning;
  private readonly rings: RingEntry[] = [];
  private readonly ringMat = new THREE.MeshLambertMaterial({ color: '#e0a83c' });
  /** 环体旋转对称，单看圆环看不出自转；一个小珠用于观察角速度是否生效。 */
  private readonly beadMat = new THREE.MeshLambertMaterial({ color: '#b8542a' });

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
  ) {
    this.tuning = {
      radius: gameConfig.ring.radius,
      tubeRadius: gameConfig.ring.tubeRadius,
      segments: gameConfig.ring.segments,
      mass: gameConfig.ring.mass,
      restitution: gameConfig.ring.restitution,
      friction: gameConfig.ring.friction,
      linearDamping: gameConfig.ring.linearDamping,
      angularDamping: gameConfig.ring.angularDamping,
      speed: gameConfig.ring.speed,
      elevationDeg: gameConfig.ring.elevationDeg,
      spin: gameConfig.ring.spin,
      ccd: gameConfig.ring.ccd,
    };
  }

  get count(): number {
    return this.rings.length;
  }

  /** 只读快照（开发调试用）：位置、速度、是否静止；不参与判定。 */
  snapshot(): Array<{ x: number; y: number; z: number; speed: number; sleeping: boolean }> {
    return this.rings.map((entry) => {
      const t = entry.body.translation();
      const v = entry.body.linvel();
      return {
        x: t.x,
        y: t.y,
        z: t.z,
        speed: Math.hypot(v.x, v.y, v.z),
        sleeping: entry.body.isSleeping(),
      };
    });
  }

  /** 按给定初始条件发射一个真实物理套圈。 */
  launch(spec: RingLaunchSpec): void {
    const t = this.tuning;
    const body = this.physics.spawnRing({
      radius: t.radius,
      tubeRadius: t.tubeRadius,
      segments: t.segments,
      mass: t.mass,
      restitution: t.restitution,
      friction: t.friction,
      linearDamping: t.linearDamping,
      angularDamping: t.angularDamping,
      ccd: t.ccd,
      position: spec.position,
      rotation: spec.rotation,
      linvel: spec.linvel,
      angvel: spec.angvel,
    });

    // 环平面与 Collider 一致：TorusGeometry 默认位于局部 XY 平面，法线为局部 Z。
    const torusGeo = new THREE.TorusGeometry(t.radius, t.tubeRadius, 10, 40);
    const mesh = new THREE.Mesh(torusGeo, this.ringMat);
    mesh.castShadow = true;

    const beadGeo = new THREE.SphereGeometry(t.tubeRadius * 1.35, 8, 6);
    const bead = new THREE.Mesh(beadGeo, this.beadMat);
    bead.position.set(t.radius, 0, 0);
    mesh.add(bead);

    const pos = body.translation();
    const rot = body.rotation();
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    this.scene.add(mesh);

    this.rings.push({ body, mesh, geometries: [torusGeo, beadGeo], age: 0, sleepTime: 0 });

    if (this.rings.length > gameConfig.ring.maxCount) {
      this.removeAt(0);
    }
  }

  /** 每帧同步网格并回收越界/静止过久的套圈（不进入物理步）。 */
  update(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const entry = this.rings[i];
      const pos = entry.body.translation();
      const rot = entry.body.rotation();
      entry.mesh.position.set(pos.x, pos.y, pos.z);
      entry.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);

      entry.age += dt;
      if (pos.y < -2) {
        this.removeAt(i);
        continue;
      }
      if (entry.body.isSleeping()) {
        entry.sleepTime += dt;
        if (entry.sleepTime > gameConfig.ring.sleepRecycleSec) this.removeAt(i);
      } else {
        entry.sleepTime = 0;
      }
    }
  }

  clear(): void {
    for (let i = this.rings.length - 1; i >= 0; i--) this.removeAt(i);
  }

  private removeAt(index: number): void {
    const entry = this.rings[index];
    if (!entry) return;
    this.physics.removeBody(entry.body);
    this.scene.remove(entry.mesh);
    for (const geo of entry.geometries) geo.dispose();
    this.rings.splice(index, 1);
  }
}
