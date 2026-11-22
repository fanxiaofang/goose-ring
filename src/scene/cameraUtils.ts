import * as THREE from 'three';

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
