import { describe, expect, it } from 'vitest';
import {
  aimLateralOffset,
  clampAimRad,
  landingTime,
  sampleThrowArc,
  speedFromCharge,
  velocityWithYaw,
} from './throwMath';

const DEG = Math.PI / 180;

describe('clampAimRad 横向拖动 → 偏转', () => {
  it('0 拖动不偏转，30% 画布宽打满 ±30°', () => {
    expect(clampAimRad(0, 1280, 30, 0.3)).toBeCloseTo(0, 6);
    expect(clampAimRad(384, 1280, 30, 0.3)).toBeCloseTo(30 * DEG, 6);
    expect(clampAimRad(-384, 1280, 30, 0.3)).toBeCloseTo(-30 * DEG, 6);
  });

  it('半程线性，超出范围夹紧在 ±30°', () => {
    expect(clampAimRad(192, 1280, 30, 0.3)).toBeCloseTo(15 * DEG, 6);
    expect(clampAimRad(5000, 1280, 30, 0.3)).toBeCloseTo(30 * DEG, 6);
    expect(clampAimRad(-5000, 1280, 30, 0.3)).toBeCloseTo(-30 * DEG, 6);
  });
});

describe('aimLateralOffset 手持圈横移', () => {
  const MAX_AIM = 40 * DEG;

  it('0° 不横移，打满 ±40° 时正好到达 ±1.15 m', () => {
    expect(aimLateralOffset(0, MAX_AIM, 1.15)).toBeCloseTo(0, 6);
    expect(aimLateralOffset(MAX_AIM, MAX_AIM, 1.15)).toBeCloseTo(1.15, 6);
    expect(aimLateralOffset(-MAX_AIM, MAX_AIM, 1.15)).toBeCloseTo(-1.15, 6);
  });

  it('中间角度按 sin 比例插值，超出范围夹紧', () => {
    expect(aimLateralOffset(20 * DEG, MAX_AIM, 1.15)).toBeCloseTo(
      (1.15 * Math.sin(20 * DEG)) / Math.sin(MAX_AIM),
      6,
    );
    expect(aimLateralOffset(80 * DEG, MAX_AIM, 1.15)).toBeCloseTo(1.15, 6);
    expect(aimLateralOffset(-80 * DEG, MAX_AIM, 1.15)).toBeCloseTo(-1.15, 6);
  });

  it('横移与偏转同号，用来扩大近场左右覆盖', () => {
    expect(aimLateralOffset(20 * DEG, MAX_AIM, 1.15)).toBeGreaterThan(0);
    expect(aimLateralOffset(-20 * DEG, MAX_AIM, 1.15)).toBeLessThan(0);
  });
});

describe('speedFromCharge 蓄力 → 初速', () => {
  it('零蓄力保留 35% 速度，满蓄力达到最大速度', () => {
    expect(speedFromCharge(11, 0, 0.35)).toBeCloseTo(3.85, 6);
    expect(speedFromCharge(11, 1, 0.35)).toBeCloseTo(11, 6);
    expect(speedFromCharge(11, 0.5, 0.35)).toBeCloseTo(7.425, 6);
  });

  it('蓄力值越界时夹紧到 0~1', () => {
    expect(speedFromCharge(11, -1, 0.35)).toBeCloseTo(3.85, 6);
    expect(speedFromCharge(11, 2, 0.35)).toBeCloseTo(11, 6);
  });
});

describe('landingTime 解析落点时间', () => {
  it('代回抛体方程后高度为 0', () => {
    const y0 = 0.62;
    const vy = 5;
    const g = 9.81;
    const t = landingTime(y0, vy, g);
    expect(y0 + vy * t - 0.5 * g * t * t).toBeCloseTo(0, 6);
  });

  it('竖直初速为 0 时退化为自由落体', () => {
    expect(landingTime(0.62, 0, 9.81)).toBeCloseTo(Math.sqrt((2 * 0.62) / 9.81), 6);
  });
});

describe('sampleThrowArc 与真实投掷同源', () => {
  const origin = { x: 0, y: 0.62, z: 5 };
  const speed = 11;
  const elevationDeg = 25;
  const gravity = 9.81;

  it('采样 18 点，首点在出手点，尾点落在地面', () => {
    const linvel = velocityWithYaw(speed, elevationDeg, 0);
    const points = sampleThrowArc(origin, linvel, gravity, 18);
    expect(points).toHaveLength(18);
    expect(points[0]).toEqual(origin);
    expect(Math.abs(points[17].y)).toBeLessThan(1e-6);
  });

  it('尾点符合解析落点，且朝 -Z 飞行', () => {
    const linvel = velocityWithYaw(speed, elevationDeg, 0);
    const tLand = landingTime(origin.y, linvel.y, gravity);
    const points = sampleThrowArc(origin, linvel, gravity, 18);
    const last = points[points.length - 1];
    expect(last.z).toBeCloseTo(origin.z + linvel.z * tLand, 6);
    expect(last.z).toBeLessThan(origin.z);
    expect(last.x).toBeCloseTo(origin.x, 6);
  });

  it('偏转 +30° 时轨迹向 +X 偏移', () => {
    const linvel = velocityWithYaw(speed, elevationDeg, 30 * DEG);
    const points = sampleThrowArc(origin, linvel, gravity, 18);
    expect(points[points.length - 1].x).toBeGreaterThan(origin.x + 1);
  });

  it('线阻尼让落点更近，且尾点仍落在地面', () => {
    const linvel = velocityWithYaw(speed, elevationDeg, 0);
    const plain = sampleThrowArc(origin, linvel, gravity, 18, 0);
    const damped = sampleThrowArc(origin, linvel, gravity, 18, 0.05);
    const plainDist = Math.abs(plain[17].z - origin.z);
    const dampedDist = Math.abs(damped[17].z - origin.z);
    expect(dampedDist).toBeLessThan(plainDist);
    expect(dampedDist).toBeGreaterThan(plainDist - 0.8);
    expect(Math.abs(damped[17].y)).toBeLessThan(0.02);
  });
});
