/**
 * 投掷初速度的纯计算（不依赖 Three.js / Rapier，便于确定性单测）。
 * 约定：Y 向上、XZ 地面、Z+ 指向玩家。
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * 从 origin 朝目标点的水平方向，以固定仰角抛出。
 * 只取目标的 XZ 方向，垂直分量完全由仰角与初速决定；
 * 这样同一初速/仰角/水平方向必然得到同一条弹道（无随机项）。
 */
export function velocityToward(
  origin: Vec3Like,
  target: Vec3Like,
  speed: number,
  elevationDeg: number,
): Vec3Like {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const horizontalLength = Math.hypot(dx, dz) || 1;
  const elevation = (elevationDeg * Math.PI) / 180;
  const horizontalSpeed = Math.cos(elevation) * speed;
  return {
    x: (dx / horizontalLength) * horizontalSpeed,
    y: Math.sin(elevation) * speed,
    z: (dz / horizontalLength) * horizontalSpeed,
  };
}

/** 以 -Z 为基础方向、绕 Y 轴偏转 yaw（弧度，正为 +X）的水平初速度。 */
export function velocityWithYaw(speed: number, elevationDeg: number, yaw: number): Vec3Like {
  const elevation = (elevationDeg * Math.PI) / 180;
  const horizontalSpeed = Math.cos(elevation) * speed;
  return {
    x: Math.sin(yaw) * horizontalSpeed,
    y: Math.sin(elevation) * speed,
    z: -Math.cos(yaw) * horizontalSpeed,
  };
}
