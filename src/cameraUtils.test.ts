import { describe, expect, it } from 'vitest';
import { computeCameraPosition } from './scene/cameraUtils';

/**
 * P0-0 最小单测：相机位置纯函数。
 * 目的：锁定坐标约定（Y 向上、Z+ 指向玩家），防止相机改动悄悄破坏取景方向。
 */
describe('computeCameraPosition', () => {
  it('pitch 0° 时相机与注视点同高、位于玩家侧（Z+）', () => {
    const p = computeCameraPosition(0, 10, { x: 1, y: 2, z: 3 });
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(13); // 3 + 10
  });

  it('pitch 90° 时相机在正上方', () => {
    const p = computeCameraPosition(90, 10, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(0);
  });

  it('俯视角越高相机越高、越靠近注视点水平位置（单调）', () => {
    const p30 = computeCameraPosition(30, 20);
    const p38 = computeCameraPosition(38, 20);
    const p45 = computeCameraPosition(45, 20);
    expect(p38.y).toBeGreaterThan(p30.y);
    expect(p45.y).toBeGreaterThan(p38.y);
    expect(p38.z).toBeLessThan(p30.z);
    expect(p45.z).toBeLessThan(p38.z);
  });

  it('相机与注视点距离恒定（正交取景稳定）', () => {
    for (const deg of [30, 38, 45]) {
      const p = computeCameraPosition(deg, 22, { x: 0, y: 0.6, z: -0.5 });
      const dist = Math.hypot(p.x - 0, p.y - 0.6, p.z - -0.5);
      expect(dist).toBeCloseTo(22, 6);
    }
  });
});
