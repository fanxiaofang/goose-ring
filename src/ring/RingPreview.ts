import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { Rect } from '../layout/computeLayout';
import { boxCorners, projectBounds } from '../scene/cameraUtils';
import type { RingLaunchSpec } from './RingSystem';
import { sampleThrowArc } from './throwMath';

/** 每帧传入的输入态势：蓄力、瞄准、当前参数与辅助开关。 */
export interface RingPreviewState {
  charging: boolean;
  /** 0~1 蓄力值。 */
  charge: number;
  /** 当前偏转（弧度，正为 +X）。 */
  aimRad: number;
  maxAimRad: number;
  launch: RingLaunchSpec;
  linearDamping: number;
  /** 轨迹辅助开关：正式模式可关闭，只保留手持圈与力度反馈。 */
  assist: boolean;
  /** 当前手势：下拉后摆 / 上拨前甩 / 待机。 */
  mode: 'hold' | 'pull' | 'flick' | 'idle';
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
  private readonly handRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshLambertMaterial>;
  private readonly handCorners: readonly THREE.Vector3[];
  private readonly projectedCorners: THREE.Vector3[];
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

  constructor(scene: THREE.Scene, ringMaterial: THREE.MeshLambertMaterial) {
    const cfg = gameConfig.ringPreview;

    // ---- 1. 手中的悬浮套圈 ----
    this.handRing = new THREE.Mesh(
      new THREE.TorusGeometry(cfg.ringRadius, cfg.tubeRadius, 10, 40),
      ringMaterial,
    );
    this.handRing.geometry.computeBoundingBox();
    this.handCorners = boxCorners(this.handRing.geometry.boundingBox!);
    this.projectedCorners = this.handCorners.map(() => new THREE.Vector3());
    this.handRing.rotation.x = Math.PI / 2; // 默认在 XY 平面，转为水平（XZ）
    this.hand.add(this.handRing);
    this.hand.add(buildHandPlaceholder(cfg.handColor, cfg.sleeveColor));
    this.hand.position.copy(this.origin);
    this.root.add(this.hand);

    // 站位垫上的淡色标记和手持圈一起横移。
    this.launchMark = new THREE.Mesh(
      new THREE.RingGeometry(cfg.ringRadius - cfg.tubeRadius, cfg.ringRadius + cfg.tubeRadius, 40),
      new THREE.MeshBasicMaterial({ color: '#5e4938', transparent: true, opacity: 0.23, depthWrite: false }),
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

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  /** 每帧由 GameApp 传入真实帧间隔与输入态势。 */
  update(dt: number, state: RingPreviewState): void {
    this.elapsed += dt;
    this.hoverPhase += dt * gameConfig.ringPreview.hoverSpeed;

    const charge = clamp01(state.charge);
    const aimRatio = state.maxAimRad > 1e-6 ? clamp11(state.aimRad / state.maxAimRad) : 0;
    // 瞄准时手持圈跟着左右滑移，扩大近场覆盖（参考仓库的 launchX 做法）。

    // 手持圈：常驻悬浮；蓄力前倾、瞄准侧倾，并随瞄准横移。
    // 下拉向后下方摆、上拨向前上方甩，让圈读作被手指带着动。
    this.hand.position.x = state.launch.position.x;
    this.launchMark.position.x = this.hand.position.x;
    const pullBack = gameConfig.ringPreview.pullBackMax * charge;
    const forward = state.mode === 'flick';
    const pull = state.mode === 'pull';
    this.hand.position.y =
      this.origin.y +
      Math.sin(this.hoverPhase) * gameConfig.ringPreview.hoverAmplitude +
      (forward ? pullBack : pull ? -pullBack : 0);
    this.hand.position.z = this.origin.z + (forward ? -pullBack : pull ? pullBack : 0);
    this.hand.rotation.x = 0.24 + gameConfig.ringPreview.chargeTiltX * charge;
    this.hand.rotation.z = gameConfig.ringPreview.aimTiltZ * aimRatio;

    const showArc = state.charging && state.assist;
    this.dots.visible = showArc;
    this.landing.visible = showArc;
    if (!showArc) {
      this.landingPoint.set(this.origin.x, this.origin.y, this.origin.z);
      return;
    }

    // 与真实投掷同源的初速度 + 解析落点采样（出手点同样带横移）。
    const gravity = Math.abs(gameConfig.physics.gravityY);
    const points = sampleThrowArc(
      state.launch.position,
      state.launch.linvel,
      gravity,
      gameConfig.ringPreview.dotCount,
      state.linearDamping,
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

  /** Screen bounds of the ring at its current rendered pose. */
  getHandBounds(camera: THREE.Camera, viewport: Rect): Rect {
    this.handRing.updateWorldMatrix(true, false);
    this.handCorners.forEach((corner, index) => {
      this.projectedCorners[index].copy(corner).applyMatrix4(this.handRing.matrixWorld);
    });
    return projectBounds(this.projectedCorners, camera, viewport);
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

/**
 * 灰盒手与前臂：只解释"圈被握住"，不参与物理与命中判定。
 * 以手持圈中心为原点：+Z 指向玩家、+Y 向上、圈在 XZ 平面。
 */
function buildHandPlaceholder(skinColor: string, sleeveColor: string): THREE.Group {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const sleeve = new THREE.MeshLambertMaterial({ color: sleeveColor });

  // 掌心托在圈的近侧下沿。
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.22), skin);
  palm.position.set(0, -0.085, 0.34);
  group.add(palm);

  // 三根手指轻搭在圈的近侧环管上。
  for (const x of [-0.13, 0, 0.13]) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.16), skin);
    finger.position.set(x, 0.015, 0.38);
    group.add(finger);
  }

  // 拇指从左侧勾住圈沿。
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14), skin);
  thumb.position.set(-0.21, 0.03, 0.3);
  thumb.rotation.y = 0.5;
  group.add(thumb);

  // 手腕与前臂：真实比例约 0.3 m，基本与圈同高，只在圈下方探出一点。
  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.16), skin);
  wrist.position.set(0, -0.095, 0.52);
  group.add(wrist);
  const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.3), skin);
  forearm.position.set(0.04, -0.14, 0.74);
  forearm.rotation.x = 0.12;
  group.add(forearm);
  // 袖口：收住前臂末端，避免读成悬空的截断管。
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), sleeve);
  cuff.position.set(0.06, -0.16, 0.94);
  cuff.rotation.x = 0.12;
  group.add(cuff);

  return group;
}
