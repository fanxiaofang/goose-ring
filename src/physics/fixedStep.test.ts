import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from './fixedStep';

/**
 * 固定步长累加器测试：
 * 渲染帧率不同，但同一真实时长内推进的物理步数必须一致；
 * 低帧率积压必须有上限，避免死亡螺旋。
 */
describe('FixedStepAccumulator', () => {
  it('60 FPS 与 30 FPS 在相同真实时长内产生相同物理步数', () => {
    const at60 = new FixedStepAccumulator(1 / 60, 5);
    const at30 = new FixedStepAccumulator(1 / 60, 5);

    let steps60 = 0;
    let steps30 = 0;
    for (let i = 0; i < 120; i++) steps60 += at60.add(1 / 60); // 2 秒
    for (let i = 0; i < 60; i++) steps30 += at30.add(1 / 30); // 2 秒
    expect(steps60).toBe(120);
    expect(steps30).toBe(120);
  });

  it('超大帧间隔只补上限步数，并丢弃积压', () => {
    const acc = new FixedStepAccumulator(1 / 60, 5);
    expect(acc.add(0.5)).toBe(5);
    // 积压已清空，下一帧只补一帧的步数
    expect(acc.add(1 / 60)).toBe(1);
  });
});
