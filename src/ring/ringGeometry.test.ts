import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildRingSegmentDescs,
  horizontalRingRotation,
  ringInnerRadius,
} from './ringGeometry';
import { velocityToward, velocityWithYaw } from './throwMath';
import { gameConfig } from '../config/gameConfig';

/**
 * 套圈几何与投掷初速度的纯逻辑测试。
 * 目的：证明碰撞体是“有孔环”而不是实心圆盘，且投掷计算无随机项。
 */
describe('套圈碰撞几何', () => {
  const { radius, tubeRadius, segments } = gameConfig.ring;

  it('按配置生成闭合的胶囊段', () => {
    const descs = buildRingSegmentDescs(radius, tubeRadius, segments);
    expect(descs).toHaveLength(segments);
    for (const d of descs) {
      expect(Math.hypot(d.x, d.y)).toBeCloseTo(radius, 6);
      expect(d.radius).toBeCloseTo(tubeRadius, 6);
      expect(d.halfHeight).toBeGreaterThan(0);
    }
  });

  it('内孔净半径容得下鹅头与鹅颈碰撞体', () => {
    const inner = ringInnerRadius(radius, tubeRadius);
    expect(inner).toBeCloseTo(0.375, 6);
    expect(inner).toBeGreaterThan(gameConfig.goose.collider.headRadius);
    expect(inner).toBeGreaterThan(gameConfig.goose.collider.neckRadius);
  });

  it('相邻胶囊圆帽重叠，内孔没有可穿过的缝隙', () => {
    const descs = buildRingSegmentDescs(radius, tubeRadius, segments);
    const chord = 2 * radius * Math.sin(Math.PI / segments);
    const capsuleReach = descs[0].halfHeight * 2 + descs[0].radius * 2;
    expect(capsuleReach).toBeGreaterThan(chord);
  });

  it('水平环姿态把局部法线转到世界 +Y', () => {
    const q = horizontalRingRotation();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      new THREE.Quaternion(q.x, q.y, q.z, q.w),
    );
    expect(normal.x).toBeCloseTo(0, 6);
    expect(normal.y).toBeCloseTo(1, 6);
    expect(normal.z).toBeCloseTo(0, 6);
  });
});

describe('投掷初速度', () => {
  it('朝目标方向分解水平分量，仰角决定垂直分量，且速度大小不变', () => {
    const origin = { x: 0, y: 1, z: 6.6 };
    const target = { x: 3, y: 0.65, z: 0 };
    const speed = 9;
    const v = velocityToward(origin, target, speed, 25);
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(speed, 6);
    expect(v.x).toBeGreaterThan(0); // 目标在 +X，水平分量同向
    expect(v.z).toBeLessThan(0); // 目标在 -Z，向栏内
    expect(v.y).toBeCloseTo(speed * Math.sin((25 * Math.PI) / 180), 6);
  });

  it('无水平偏转时朝 -Z 直线出手；偏转只改变水平方向', () => {
    const straight = velocityWithYaw(10, 20, 0);
    expect(straight.x).toBeCloseTo(0, 6);
    expect(straight.z).toBeCloseTo(-10 * Math.cos((20 * Math.PI) / 180), 6);

    const right = velocityWithYaw(10, 20, 0.4);
    expect(right.x).toBeGreaterThan(0);
    expect(right.y).toBeCloseTo(straight.y, 6);
    expect(Math.hypot(right.x, right.z)).toBeCloseTo(Math.hypot(straight.x, straight.z), 6);
  });
});
