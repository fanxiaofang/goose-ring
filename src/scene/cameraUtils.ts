import * as THREE from 'three';
import { throwLineClearance, type Rect } from '../layout/computeLayout';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPose {
  pitchDeg: number;
  yawDeg: number;
  distance: number;
}

/** 调试面板回显用：相机真实姿态 + 当前投影模式。 */
export interface CameraState extends CameraPose {
  modeId: string;
  modeLabel: string;
  kind: 'ortho' | 'persp';
  viewHeight?: number;
  fov?: number;
}

/**
 * 由俯视角 + 水平偏转角计算正交相机位置。
 *
 * 约定（01_技术方案.md §3）：
 * - Y 向上、XZ 地面、Z+ 指向玩家。
 * - pitch = 0° 时相机与注视点同高；pitch = 90° 时正上方俯视。
 * - yaw = 0° 时相机在正前方（+Z）；yaw > 0 时绕 Y 轴向右（+X）偏移。
 */
export function computeCameraPosition(
  pitchDeg: number,
  yawDeg: number,
  distance: number,
  target: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const horizontal = Math.cos(pitch) * distance;
  return {
    x: target.x + Math.sin(yaw) * horizontal,
    y: target.y + Math.sin(pitch) * distance,
    z: target.z + Math.cos(yaw) * horizontal,
  };
}

/**
 * 从相机实际位置反解俯视角与偏转角。
 * 用于调试面板回显，保证“界面显示的角度 = 相机真实姿态”。
 */
export function derivePitchYaw(position: Vec3, target: Vec3): CameraPose {
  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  const distance = Math.hypot(dx, dy, dz) || 1;
  return {
    pitchDeg: (Math.asin(dy / distance) * 180) / Math.PI,
    yawDeg: (Math.atan2(dx, dz) * 180) / Math.PI,
    distance,
  };
}

/** 转成 three 类型仅供场景使用。 */
export function toVector3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

export function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  if (box.isEmpty()) return [];
  return [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) =>
      [box.min.z, box.max.z].map((z) => new THREE.Vector3(x, y, z)),
    ),
  );
}

interface PlayRectFraming {
  baseDistance: number;
  pitchDeg: number;
  yawDeg: number;
  target: Vec3;
  viewport: Rect;
  play: Rect;
  points: readonly THREE.Vector3[];
  /** Decorative fence ends can extend past the safe horizontal frame. */
  perimeter?: readonly THREE.Vector3[];
}

/** Fit the content to a CSS-pixel rect while preserving the full-canvas pixel scale. */
export function framePerspective(camera: THREE.PerspectiveCamera, options: PlayRectFraming): void {
  const { baseDistance, pitchDeg, yawDeg, target, viewport, play, points, perimeter } = options;
  const origin = toVector3(target);
  const backward = toVector3(computeCameraPosition(pitchDeg, yawDeg, 1));
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const up = backward.clone().cross(right);
  const focalPx = viewport.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const halfWidth = Math.max(1, play.width / (2 * 1.1));
  const gutterY = Math.min(throwLineClearance, play.height / 4);
  const halfHeight = Math.max(1, play.height / 2 - gutterY);

  let distance = baseDistance;
  const delta = new THREE.Vector3();
  function fit(bounds: readonly THREE.Vector3[], width: number): void {
    for (const point of bounds) {
      delta.subVectors(point, origin);
      const depth = Math.max(
        focalPx * Math.abs(delta.dot(right)) / width,
        focalPx * Math.abs(delta.dot(up)) / halfHeight,
        camera.near + 0.01,
      );
      distance = Math.max(distance, depth + delta.dot(backward));
    }
  }
  fit(points, halfWidth);
  if (perimeter) fit(perimeter, Math.max(1, play.width * 0.54));

  camera.position.copy(origin).addScaledVector(backward, distance);
  camera.lookAt(origin);
  camera.far = Math.max(80, distance + 40);
  // Using the full dimensions for both views shifts the principal point without zooming.
  camera.setViewOffset(
    viewport.width,
    viewport.height,
    (viewport.width - play.width) / 2 - play.x,
    (viewport.height - play.height) / 2 - play.y,
    viewport.width,
    viewport.height,
  );
  camera.updateMatrixWorld(true);
}

export function projectBounds(
  points: readonly THREE.Vector3[],
  camera: THREE.Camera,
  viewport: Rect,
): Rect {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  const ndc = new THREE.Vector3();
  for (const point of points) {
    ndc.copy(point).project(camera);
    const x = (ndc.x + 1) * viewport.width / 2;
    const y = (1 - ndc.y) * viewport.height / 2;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface PerspectiveFitOptions {
  /** 设计基准距离（16:9 下期望的构图距离）。 */
  baseDistance: number;
  fovDeg: number;
  pitchDeg: number;
  yawDeg: number;
  aspect: number;
  target: Vec3;
  fenceWidth: number;
  fenceDepth: number;
  postSize?: number;
  /** 围栏最高处（用于取角点，保守估计）。 */
  fenceHeight: number;
  /** 两侧留白系数，>1 让栏角不贴边。 */
  margin?: number;
  /** 可选的栏外地面投掷线也随取景完整入画。 */
  throwLine?: { width: number; depth: number; offsetZ: number };
}

/**
 * 透视模式下按屏幕宽高比自适应后拉距离。
 *
 * 约束（P0-1 评审）：
 * - 相机锁定，俯仰/偏转不变，只沿同一条俯仰射线调整距离；
 * - 根据围栏外沿和可选投掷线投影，留出两侧边距；
 * - 屏幕越窄后拉越多，16:9 时尽量贴近设计基准距离。
 *
 * 解析解：对围栏 8 个外沿角点，要求
 *   |lateral| ≤ tan(halfFovH) × forwardDistance
 * forwardDistance = d + dot(P - target, forward)，对 d 单调递增，
 * 于是每个角点给出一个最小 d，取最大值即可。
 */
export function computeAdaptivePerspectiveDistance(options: PerspectiveFitOptions): number {
  const {
    baseDistance,
    fovDeg,
    pitchDeg,
    yawDeg,
    aspect,
    target,
    fenceWidth,
    fenceDepth,
    fenceHeight,
    margin = 1.04,
    postSize,
    throwLine,
  } = options;

  const pitch = (pitchDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const tanHalfHorizontal = Math.tan((fovDeg * Math.PI) / 360) * aspect;
  if (!(tanHalfHorizontal > 0)) return baseDistance;

  // 相机方向单位向量（target → camera）与视线方向（camera → target）。
  const toCamera = {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.cos(yaw) * Math.cos(pitch),
  };
  const forward = { x: -toCamera.x, y: -toCamera.y, z: -toCamera.z };
  // 相机右方向（yaw=0 时为 +X）。
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };

  const halfW = fenceWidth / 2 + (postSize === undefined ? 0.08 : postSize / 2);
  const halfD = fenceDepth / 2 + (postSize ?? 0) / 2;
  let required = 0;

  const include = (x: number, y: number, z: number) => {
    const dx = x - target.x;
    const dy = y - target.y;
    const dz = z - target.z;
    const lateral = Math.abs(dx * right.x + dy * right.y + dz * right.z);
    const along = dx * forward.x + dy * forward.y + dz * forward.z;
    required = Math.max(required, (lateral * margin) / tanHalfHorizontal - along);
  };

  for (const x of [-halfW, halfW]) {
    for (const z of [-halfD, halfD]) {
      for (const y of [0, fenceHeight]) {
        include(x, y, z);
      }
    }
  }

  if (throwLine) {
    const centerZ = fenceDepth / 2 + throwLine.offsetZ;
    for (const x of [-throwLine.width / 2, throwLine.width / 2]) {
      include(x, 0.015, centerZ - throwLine.depth / 2);
      include(x, 0.015, centerZ + throwLine.depth / 2);
    }
  }

  return Math.max(baseDistance, required);
}
