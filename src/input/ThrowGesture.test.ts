import { describe, expect, it } from 'vitest';
import { gameConfig } from '../config/gameConfig';
import { ThrowGesture } from './ThrowGesture';
import { buildPlayerThrow } from '../ring/playerThrow';

function gesture(availableDown = 110) {
  return new ThrowGesture({ x: 400, y: 260, time: 0 }, 844, 390, availableDown, gameConfig.input);
}

describe('三种手势的意图与释放', () => {
  it('计时蓄力留有从轻投到满力的时间，短点和短横滑取消', () => {
    const hold = gesture();
    expect(hold.preview(1000).charge).toBeCloseTo(0.58);
    expect(hold.preview(1724).charge).toBeCloseTo(1);
    expect(hold.release({ x: 400, y: 260, time: 100 })).toBeNull();
    expect(gesture().release({ x: 445, y: 260, time: 100 })).toBeNull();
  });

  it('按住并横移瞄准时仍按计时蓄力出手', () => {
    const input = gesture();
    input.update({ x: 440, y: 260, time: 500 });
    const released = input.release({ x: 440, y: 260, time: 800 })!;
    expect(released.mode).toBe('hold');
    expect(released.charge).toBeCloseTo(0.464);
  });

  it('下拉距离决定力度，斜拉的横向分量仍能瞄准', () => {
    const pull = gesture();
    pull.update({ x: 300, y: 310, time: 100 });
    const preview = pull.preview(300);
    expect(preview.mode).toBe('pull');
    expect(preview.charge).toBeCloseTo((50 / 97.5) ** 1.35);
    expect(preview.aimRad).toBeLessThan(0);
    expect(pull.release({ x: 300, y: 310, time: 400 })).toEqual(preview);
  });

  it('下拉回推减力，回到起点取消，继续向上拨可出手', () => {
    const pull = gesture();
    pull.update({ x: 400, y: 320, time: 100 });
    pull.update({ x: 400, y: 285, time: 200 });
    expect(pull.preview(200).charge).toBeCloseTo((25 / 97.5) ** 1.35);
    const cancelled = gesture();
    cancelled.update({ x: 400, y: 320, time: 100 });
    expect(cancelled.release({ x: 400, y: 260, time: 250 })).toBeNull();
    expect(pull.release({ x: 400, y: 200, time: 250 })).not.toBeNull();
  });

  it('前甩使用最近窗口的上滑速度，并在松手时才确认', () => {
    const flick = gesture();
    flick.update({ x: 400, y: 220, time: 50 });
    expect(flick.preview(50).mode).toBe('flick');
    expect(flick.release({ x: 430, y: 180, time: 100 })!.charge)
      .toBeCloseTo((800 - 180) / (1500 - 180) * (80 / 88) ** 2);
  });

  it('连续向上短拨或慢推会轻投，轻触抖动和明显回拉仍会取消', () => {
    expect(gesture().release({ x: 400, y: 251, time: 100 })).toBeNull();
    expect(gesture().release({ x: 400, y: 245, time: 10 })?.mode).toBe('flick');

    const slow = gesture();
    slow.update({ x: 400, y: 255, time: 60 });
    slow.update({ x: 400, y: 242, time: 225 });
    expect(slow.release({ x: 400, y: 180, time: 1000 })?.charge).toBeCloseTo(0.58);
    const stopped = gesture();
    stopped.update({ x: 400, y: 180, time: 100 });
    expect(stopped.preview(300).charge).toBeCloseTo((800 - 180) / (1500 - 180) * (80 / 88) ** 2);
    expect(stopped.release({ x: 400, y: 180, time: 300 })?.charge).toBeCloseTo(stopped.preview(300).charge);
    const reversed = gesture();
    reversed.update({ x: 400, y: 180, time: 100 });
    reversed.update({ x: 400, y: 210, time: 150 });
    expect(reversed.release({ x: 400, y: 210, time: 300 })).toBeNull();
  });

  it('回到下拉区后可重新上拨，不受上一次上拨距离影响', () => {
    const input = gesture();
    input.update({ x: 400, y: 190, time: 100 });
    input.update({ x: 400, y: 280, time: 200 });
    expect(input.release({ x: 400, y: 230, time: 250 })).not.toBeNull();
  });

  it('从底带下拉 26 px 只产生轻投，长下拉可以满力', () => {
    const bottom = gesture(32);
    expect(bottom.pullDistance).toBe(72);
    expect(bottom.release({ x: 400, y: 286, time: 100 })?.charge).toBeCloseTo((26 / 72) ** 1.35);
    expect(gesture().release({ x: 400, y: 358, time: 120 })?.charge).toBe(1);
  });

  it('极快的短拨仍是轻投，明确的长快甩仍可满力', () => {
    const short = gesture().release({ x: 400, y: 236, time: 12 })!;
    expect(short.charge).toBeCloseTo((24 / 88) ** 2);
    const launch = buildPlayerThrow(short.charge, short.aimRad, gameConfig.ring);
    expect(Math.hypot(launch.linvel.x, launch.linvel.y, launch.linvel.z)).toBeLessThan(4.8);
    expect(gesture().release({ x: 400, y: 172, time: 55 })?.charge).toBe(1);
  });
});

it.each([[844, 390], [667, 375]])('静态场八只鹅名义输入在 %i×%i 可由三种手势生成相同发射状态', (width, height) => {
  const cases = [[-27.3, 0.312], [8.5, 0.338], [-34, 0.652], [-8.6, 0.64],
    [22.2, 0.644], [-15.5, 0.816], [25.7, 0.86], [-29.9, 0.894]];
  for (const [aimDeg, charge] of cases) {
    const start = { x: width / 2, y: height * 0.65, time: 0 };
    const x = start.x + aimDeg / 40 * width * gameConfig.input.aimFullWidthRatio;
    const make = () => new ThrowGesture(start, width, height, height - start.y, gameConfig.input);
    const held = make().release({ x, y: start.y, time: charge / gameConfig.input.chargePerSec * 1000 })!;
    const pull = make();
    const pulled = pull.release({ x, y: start.y + charge ** (1 / 1.35) * pull.pullDistance, time: 120 })!;
    const { flickMinSpeed, flickFullSpeed, flickFullChargeDistancePx } = gameConfig.input;
    const speed = flickMinSpeed + charge * (flickFullSpeed - flickMinSpeed);
    const flicked = make().release({
      x, y: start.y - flickFullChargeDistancePx, time: flickFullChargeDistancePx / speed * 1000,
    })!;
    for (const intent of [held, pulled, flicked]) {
      expect(intent).not.toBeNull();
      expect(intent.charge).toBeCloseTo(charge, 10);
      expect(intent.aimRad).toBeCloseTo(aimDeg * Math.PI / 180, 10);
      const launch = buildPlayerThrow(intent.charge, intent.aimRad, gameConfig.ring);
      const expected = buildPlayerThrow(charge, aimDeg * Math.PI / 180, gameConfig.ring);
      expect(launch.position.x).toBeCloseTo(expected.position.x, 10);
      expect(launch.linvel.x).toBeCloseTo(expected.linvel.x, 10);
      expect(launch.linvel.y).toBeCloseTo(expected.linvel.y, 10);
      expect(launch.linvel.z).toBeCloseTo(expected.linvel.z, 10);
    }
  }
});
