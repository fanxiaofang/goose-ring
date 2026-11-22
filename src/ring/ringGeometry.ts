/**
 * 套圈碰撞几何（纯函数，无 Rapier 依赖，便于单元测试）。
 *
 * 真实有孔环不能用实心圆盘 Collider 冒充。
 * 这里把环中心线均分为 N 段，每段是一根与切线方向一致的胶囊：
 * - 胶囊局部轴为 Y，绕 Z 轴旋转 theta 后与环在该点的切线方向一致；
 * - 相邻胶囊的端点圆帽互相重叠，保证内孔没有可穿过的缝隙；
 * - 内孔净半径 = radius - tubeRadius（胶囊表面到环中心的最近距离）。
 */

export interface RingSegmentDesc {
  /** 胶囊中心相对刚体的局部位移（环平面为局部 XY，法线为局部 Z）。 */
  x: number;
  y: number;
  z: number;
  /** 胶囊旋转四元数（绕局部 Z 轴，使胶囊轴与环切线一致）。 */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  /** 胶囊半高（沿切线方向）。 */
  halfHeight: number;
  /** 胶囊端帽半径，等于环管半径。 */
  radius: number;
}

/** 环内孔净半径（米）。 */
export function ringInnerRadius(radius: number, tubeRadius: number): number {
  return radius - tubeRadius;
}

/**
 * 生成闭合环的胶囊段描述。
 * 段数至少 8；段数越多越接近真实圆环，碰撞成本也越高。
 */
export function buildRingSegmentDescs(
  radius: number,
  tubeRadius: number,
  segments: number,
): RingSegmentDesc[] {
  const count = Math.max(8, Math.round(segments));
  const angleStep = (Math.PI * 2) / count;
  // 相邻采样点弦长的一半即胶囊半高；圆帽再向外延伸 tubeRadius，形成重叠。
  const halfHeight = radius * Math.sin(Math.PI / count);

  const descs: RingSegmentDesc[] = [];
  for (let i = 0; i < count; i++) {
    const theta = i * angleStep;
    descs.push({
      x: radius * Math.cos(theta),
      y: radius * Math.sin(theta),
      z: 0,
      qx: 0,
      qy: 0,
      qz: Math.sin(theta / 2),
      qw: Math.cos(theta / 2),
      halfHeight,
      radius: tubeRadius,
    });
  }
  return descs;
}

/** 水平环（环平面平行地面、法线朝上）的初始姿态四元数。 */
export function horizontalRingRotation(): { x: number; y: number; z: number; w: number } {
  // 局部 Z 轴转到世界 +Y：绕 X 轴 -90°。
  const half = -Math.PI / 4;
  return { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) };
}
