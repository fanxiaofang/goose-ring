import * as THREE from 'three';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 由俯视角（相对水平面的仰角）计算正交相机位置。
 * 相机始终位于注视点 Z+ 一侧（玩家侧，符合 01_技术方案.md §3：Z+ 指向玩家），
 * pitch=0° 时与注视点同高，pitch=90° 时正上方俯视。
 */
export function computeCameraPosition(
  pitchDeg: number,
  distance: number,
  target: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  const pitch = (pitchDeg * Math.PI) / 180;
  return {
    x: target.x,
    y: target.y + Math.sin(pitch) * distance,
    z: target.z + Math.cos(pitch) * distance,
  };
}

/** 转成 three 类型仅供场景使用。 */
export function toVector3(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}
