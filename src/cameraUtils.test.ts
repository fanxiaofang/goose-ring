import { describe, expect, it } from 'vitest';
import { computeCameraPosition, derivePitchYaw } from './scene/cameraUtils';
import { cameraModes } from './config/gameConfig';

/**
 * P0-0 相机纯函数测试。
 * 锁定坐标约定（Y 向上、Z+ 指向玩家）与角度语义，防止后续调整悄悄破坏取景方向。
 */
describe('computeCameraPosition', () => {
  it('pitch 0° / yaw 0° 时相机与注视点同高、位于玩家侧（Z+）', () => {
    const p = computeCameraPosition(0, 0, 10, { x: 1, y: 2, z: 3 });
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(13);
  });

  it('pitch 90° 时相机在正上方', () => {
    const p = computeCameraPosition(90, 0, 10, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(0);
  });

  it('yaw 90° 时相机位于场景 +X 一侧', () => {
    const p = computeCameraPosition(0, 90, 10, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(0);
  });

  it('俯视角越高相机越高、越靠近注视点水平位置（单调）', () => {
    const p30 = computeCameraPosition(30, 0, 26);
    const p38 = computeCameraPosition(38, 0, 26);
    const p45 = computeCameraPosition(45, 0, 26);
    expect(p38.y).toBeGreaterThan(p30.y);
    expect(p45.y).toBeGreaterThan(p38.y);
    expect(p38.z).toBeLessThan(p30.z);
    expect(p45.z).toBeLessThan(p38.z);
  });

  it('偏转角增大时相机向 +X 移动、正前方距离缩短', () => {
    const y0 = computeCameraPosition(38, 0, 26);
    const y12 = computeCameraPosition(38, 12, 26);
    const y18 = computeCameraPosition(38, 18, 26);
    expect(y12.x).toBeGreaterThan(y0.x);
    expect(y18.x).toBeGreaterThan(y12.x);
    expect(y18.z).toBeLessThan(y0.z);
  });

  it('相机与注视点距离恒定', () => {
    for (const pitch of [30, 38, 45]) {
      for (const yaw of [0, 12, 18]) {
        const target = { x: 0, y: 0.6, z: 0 };
        const p = computeCameraPosition(pitch, yaw, 26, target);
        const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
        expect(d).toBeCloseTo(26, 6);
      }
    }
  });
});

describe('derivePitchYaw', () => {
  it('与 computeCameraPosition 互为逆运算（界面角度与实际姿态一致）', () => {
    for (const pitch of [30, 38, 45]) {
      for (const yaw of [0, 12, 18]) {
        const target = { x: 0, y: 0.6, z: 0 };
        const pos = computeCameraPosition(pitch, yaw, 26, target);
        const pose = derivePitchYaw(pos, target);
        expect(pose.pitchDeg).toBeCloseTo(pitch, 6);
        expect(pose.yawDeg).toBeCloseTo(yaw, 6);
        expect(pose.distance).toBeCloseTo(26, 6);
      }
    }
  });
});

describe('相机对比模式取景', () => {
  it('三种模式在注视点平面的可视高度接近（围栏占比近似相同）', () => {
    const ortho = cameraModes.find((m) => m.kind === 'ortho');
    if (!ortho || ortho.kind !== 'ortho') throw new Error('缺少正交模式');
    for (const mode of cameraModes) {
      if (mode.kind !== 'persp') continue;
      const visibleHeight = 2 * mode.distance * Math.tan((mode.fov * Math.PI) / 360);
      expect(Math.abs(visibleHeight - ortho.viewHeight)).toBeLessThan(0.6);
    }
  });
});
