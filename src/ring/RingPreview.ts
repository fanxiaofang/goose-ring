import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { aimLateralOffset, sampleThrowArc, speedFromCharge, velocityWithYaw } from './throwMath';

/** 每帧传入的输入态势：蓄力、瞄准、当前参数与辅助开关。 */
export interface RingPreviewState {
  charging: boolean;
  /** 0~1 蓄力值。 */
  charge: number;
  /** 当前偏转（弧度，正为 +X）。 */
  aimRad: number;
  maxAimRad: number;
  /** 满蓄力对应的出手速度（与真实投掷共用 tuning.speed）。 */
  maxSpeed: number;
  elevationDeg: number;
  /** 轨迹辅助开关：正式模式可关闭，只保留手持圈与力度反馈。 */
  assist: boolean;
}

/**
 * 套圈出手预览（纯视觉，不参与物理与命中判定）。
 *
 * 三段式表现：
 * 1. 手中的悬浮套圈（常驻，蓄力时前倾、瞄准时侧倾）；
 * 2. 橙色高对比轨迹点（18 个，InstancedMesh）；
 * 3. 地面预测落点环。
 *
 * 弹道与真实投掷共用 velocityWithYaw + 重力 + 线阻尼，
 * 因此预览点与 Rapier 实际路径在整段飞行内基本重合。
 */
export class RingPreview {
  private readonly root = new THREE.Group();
  private readonly hand = new THREE.Group();
  private readonly dots: THREE.InstancedMesh;
  private readonly landing: THREE.Mesh;
  private readonly launchMark: THREE.Mesh;
  private readonly landingMat: THREE.MeshBasicMaterial;
  private readonly origin = new THREE.Vector3(
    gameConfig.throwOrigin.x,
    gameConfig.throwOrigin.y,
    gameConfig.throwOrigin.z,
  );
  private readonly dummy = new THREE.Object3D();
  private hoverPhase = 0;
  private elapsed = 0;
  /** 最近一次采样的落点，供调试读取。 */
  private landingPoint = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const cfg = gameConfig.ringPreview;

    // ---- 1. 手中的悬浮套圈 ----
    const handRing = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.ringRadius, cfg.tubeRadius, 10, 40),
      new THREE.MeshLambertMaterial({ color: '#e0a83c' }),
    );
    handRing.rotation.x = Math.PI / 2; // 默认在 XY 平面，转为水平（XZ）
    this.hand.add(handRing);
    this.hand.position.copy(this.origin);
    this.root.add(this.hand);

    // 站位垫上的橙色站位标记，和手持圈一起横移。
    this.launchMark = new THREE.Mesh(
      new THREE.RingGeometry(cfg.ringRadius - cfg.tubeRadius, cfg.ringRadius + cfg.tubeRadius, 40),
      new THREE.MeshBasicMaterial({ color: '#db703b', transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.launchMark.rotation.x = -Math.PI / 2;
    this.launchMark.position.set(this.origin.x, 0.007, this.origin.z);
    this.root.add(this.launchMark);

    // ---- 2. 轨迹点（实例化球体）----
    const dotGeo = new THREE.SphereGeometry(cfg.dotRadius, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: cfg.dotColor,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.dots = new THREE.InstancedMesh(dotGeo, dotMat, cfg.dotCount);
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.visible = false;
    this.dots.frustumCulled = false;
    this.root.add(this.dots);

    // ---- 3. 地面预测落点环 ----
    this.landingMat = new THREE.MeshBasicMaterial({
      color: cfg.landingRingColor,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(cfg.landingRingInner, cfg.landingRingOuter, 40),
      this.landingMat,
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.landing.position.set(this.origin.x, 0.02, this.origin.z);
    this.landing.visible = false;
    this.root.add(this.landing);

    scene.add(this.root);
  }

  /** 每帧由 GameApp 传入真实帧间隔与输入态势。 */
  update(dt: number, state: RingPreviewState): void {
    this.elapsed += dt;
    this.hoverPhase += dt * gameConfig.ringPreview.hoverSpeed;

    const charge = clamp01(state.charge);
    const aimRatio = state.maxAimRad > 1e-6 ? clamp11(state.aimRad / state.maxAimRad) : 0;
    // 瞄准时手持圈跟着左右滑移，扩大近场覆盖（参考仓库的 launchX 做法）。
    const lateral = aimLateralOffset(
      state.aimRad,
      state.maxAimRad,
      gameConfig.input.aimLateralMax,
    );

    // 手持圈：常驻悬浮；蓄力前倾、瞄准侧倾，并随瞄准横移。
    this.hand.position.x = this.origin.x + lateral;
    this.launchMark.position.x = this.hand.position.x;
    this.hand.position.y =
      this.origin.y +
      Math.sin(this.hoverPhase) * gameConfig.ringPreview.hoverAmplitude;
    this.hand.rotation.x = gameConfig.ringPreview.chargeTiltX * charge;
    this.hand.rotation.z = gameConfig.ringPreview.aimTiltZ * aimRatio;

    const showArc = state.charging && state.assist;
    this.dots.visible = showArc;
    this.landing.visible = showArc;
    if (!showArc) {
      this.landingPoint.set(this.origin.x, this.origin.y, this.origin.z);
      return;
    }

    // 与真实投掷同源的初速度 + 解析落点采样（出手点同样带横移）。
    const launchOrigin = {
      x: this.origin.x + lateral,
      y: this.origin.y,
      z: this.origin.z,
    };
    const speed = speedFromCharge(
      state.maxSpeed,
      charge,
      gameConfig.input.minSpeedFactor,
    );
    const linvel = velocityWithYaw(speed, state.elevationDeg, state.aimRad);
    const gravity = Math.abs(gameConfig.physics.gravityY);
    const points = sampleThrowArc(
      launchOrigin,
      linvel,
      gravity,
      gameConfig.ringPreview.dotCount,
      gameConfig.ring.linearDamping,
    );

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.updateMatrix();
      this.dots.setMatrixAt(i, this.dummy.matrix);
    }
    this.dots.instanceMatrix.needsUpdate = true;

    const last = points[points.length - 1];
    this.landingPoint.set(last.x, 0, last.z);
    this.landing.position.set(last.x, 0.02, last.z);
    const pulse = 1 + Math.sin(this.elapsed * 6) * 0.04;
    this.landing.scale.set(pulse, pulse, 1);
  }

  /** 最近一次采样落点（x, 0, z），仅调试读取。 */
  getLandingPoint(): THREE.Vector3 {
    return this.landingPoint;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clamp11(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
