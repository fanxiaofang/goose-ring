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

/**
 * 横向拖动 dx（CSS 像素）→ 投掷偏转角（弧度，正为 +X）。
 * dx 达到画布宽度 × fullWidthRatio 时打满 ±maxAimDeg，超出直接夹紧。
 */
export function clampAimRad(
  dxPx: number,
  viewportWidthPx: number,
  maxAimDeg: number,
  fullWidthRatio: number,
): number {
  const span = Math.max(1, viewportWidthPx * fullWidthRatio);
  const ratio = Math.max(-1, Math.min(1, dxPx / span));
  return (ratio * maxAimDeg * Math.PI) / 180;
}

/** 蓄力值（0~1）→ 出手速度：保留最低速度比例，避免零蓄力完全不飞。 */
export function speedFromCharge(
  maxSpeed: number,
  charge: number,
  minSpeedFactor: number,
): number {
  const c = Math.max(0, Math.min(1, charge));
  return maxSpeed * (minSpeedFactor + (1 - minSpeedFactor) * c);
}

/**
 * 瞄准时手持圈的横向滑移：打满偏转时正好到达 ±maxLateral，中间按 sin 比例插值。
 * 目的是让近场左右两侧的鹅也落入可投掷范围（固定出手点的锥角覆盖不到边角）。
 */
export function aimLateralOffset(
  aimRad: number,
  maxAimRad: number,
  maxLateral: number,
): number {
  const maxAim = Math.max(1e-6, Math.abs(maxAimRad));
  const ratio = Math.sin(aimRad) / Math.sin(maxAim);
  return maxLateral * Math.max(-1, Math.min(1, ratio));
}

/** 从出手高度 y0、竖直初速 vy 落到 y = 0 的时间解析解（gravity 取正值）。 */
export function landingTime(y0: number, vy: number, gravity: number): number {
  const g = Math.max(1e-6, gravity);
  const disc = vy * vy + 2 * g * y0;
  return (vy + Math.sqrt(Math.max(0, disc))) / g;
}

/**
 * 按与真实投掷相同的初速度、重力与线阻尼采样抛物线点（含首尾）。
 * 返回点数 = dotCount；首点在 origin，尾点落在 y ≈ 0 的地面。
 *
 * 线阻尼 λ 下 Rapier 的速度衰减为指数形式：
 *   水平 v(t) = v0 · e^(-λt)
 *   竖直 v(t) = (v0y + g/λ)·e^(-λt) - g/λ
 * 对应位置有解析解，落点时间用二分法求解；λ = 0 时退化为普通抛体。
 */
export function sampleThrowArc(
  origin: Vec3Like,
  linvel: Vec3Like,
  gravity: number,
  dotCount: number,
  linearDamping = 0,
): Vec3Like[] {
  const count = Math.max(2, Math.floor(dotCount));
  const g = Math.max(1e-6, gravity);
  const k = Math.max(0, linearDamping);
  const total = k > 1e-6 ? dampedLandingTime(origin, linvel, g, k) : landingTime(origin.y, linvel.y, g);
  const points: Vec3Like[] = [];
  for (let i = 0; i < count; i++) {
    const t = (total * i) / (count - 1);
    if (k > 1e-6) {
      const decay = (1 - Math.exp(-k * t)) / k;
      points.push({
        x: origin.x + linvel.x * decay,
        y: origin.y + (linvel.y + g / k) * decay - (g / k) * t,
        z: origin.z + linvel.z * decay,
      });
    } else {
      points.push({
        x: origin.x + linvel.x * t,
        y: origin.y + linvel.y * t - 0.5 * g * t * t,
        z: origin.z + linvel.z * t,
      });
    }
  }
  return points;
}

/** 带线阻尼时的落地时间：先按 1/240 s 步进找到穿越点，再二分收敛。 */
function dampedLandingTime(origin: Vec3Like, linvel: Vec3Like, g: number, k: number): number {
  const heightAt = (t: number): number => {
    const decay = (1 - Math.exp(-k * t)) / k;
    return origin.y + (linvel.y + g / k) * decay - (g / k) * t;
  };
  const step = 1 / 240;
  let prevT = 0;
  let prevH = origin.y;
  for (let t = step; t <= 30; t += step) {
    const h = heightAt(t);
    if (h <= 0) {
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (heightAt(mid) > 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prevT = t;
    prevH = h;
  }
  return prevH > 0 ? 30 : prevT;
}
