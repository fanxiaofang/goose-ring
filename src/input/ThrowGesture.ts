import { clampAimRad } from '../ring/throwMath';

export type ThrowGestureMode = 'hold' | 'pull' | 'flick';

export interface GestureSample {
  x: number;
  y: number;
  time: number;
}

export interface GestureConfig {
  maxAimDeg: number;
  aimFullWidthRatio: number;
  chargePerSec: number;
  minHoldMs: number;
  aimIntentPx: number;
  intentPx: number;
  pullHeightRatio: number;
  minPullFullDistancePx: number;
  flickFullChargeDistancePx: number;
  flickMinCharge: number;
  flickWindowMs: number;
  flickMinSpeed: number;
  flickFullSpeed: number;
}

export interface ThrowIntent {
  mode: ThrowGestureMode;
  charge: number;
  aimRad: number;
}

/** Host-independent gesture mapping. Dimensions and origin stay fixed until release. */
export class ThrowGesture {
  private peakUpwardDistance = 0;
  private peakDownwardDistance = 0;
  private peakFlickCharge = 0;
  private current: GestureSample;
  private readonly history: GestureSample[];
  readonly pullDistance: number;

  constructor(
    private readonly start: GestureSample,
    private readonly aimWidth: number,
    safeHeight: number,
    availableDown: number,
    private readonly config: GestureConfig,
  ) {
    this.current = start;
    this.history = [start];
    this.pullDistance = Math.max(config.minPullFullDistancePx, Math.min(
      safeHeight * config.pullHeightRatio,
      availableDown - 6,
    ));
  }

  update(sample: GestureSample): void {
    if (sample.time < this.current.time) return;
    this.current = sample;
    const dy = sample.y - this.start.y;
    this.peakUpwardDistance = dy > 0 ? 0 : Math.max(this.peakUpwardDistance, -dy);
    this.peakDownwardDistance = Math.max(this.peakDownwardDistance, dy);
    if (sample.time === this.history.at(-1)!.time) this.history[this.history.length - 1] = sample;
    else this.history.push(sample);
    const cutoff = sample.time - this.config.flickWindowMs;
    while (this.history.length > 2 && this.history[1].time <= cutoff) this.history.shift();
    if (dy >= 0) {
      this.peakFlickCharge = 0;
    } else {
      const speedCharge = (this.upwardSpeed(sample.time) - this.config.flickMinSpeed)
        / (this.config.flickFullSpeed - this.config.flickMinSpeed);
      const distanceScale = Math.min(1, -dy / this.config.flickFullChargeDistancePx);
      const flickCharge = Math.min(1, Math.max(this.config.flickMinCharge, speedCharge));
      this.peakFlickCharge = Math.max(this.peakFlickCharge, flickCharge * distanceScale ** 2);
    }
  }

  preview(time: number): ThrowIntent {
    const { config, start, current } = this;
    const aimRad = clampAimRad(
      current.x - start.x, this.aimWidth, config.maxAimDeg, config.aimFullWidthRatio,
    );
    const dy = current.y - start.y;
    const hold = this.holdCharge(time);
    const pull = Math.max(0, dy / this.pullDistance) ** 1.35;
    // A short pause or a slow release does not erase the upward stroke's contribution.
    const flick = this.peakFlickCharge * Math.max(0, -dy) / Math.max(1, this.peakUpwardDistance);
    const charge = Math.max(0, Math.min(1, Math.max(hold, pull, flick)));
    const mode: ThrowGestureMode = hold >= pull && hold >= flick ? 'hold' : pull >= flick ? 'pull' : 'flick';
    return { mode, charge, aimRad };
  }

  release(sample: GestureSample): ThrowIntent | null {
    this.update(sample);
    const intent = this.preview(sample.time);
    const { intentPx, minHoldMs, aimIntentPx } = this.config;
    const dy = sample.y - this.start.y;
    if (dy <= 0 && this.peakUpwardDistance >= intentPx && this.peakUpwardDistance + dy >= intentPx) {
      return null;
    }
    if (Math.abs(dy) >= intentPx) return intent;
    const aimed = Math.abs(sample.x - this.start.x) >= aimIntentPx;
    if (sample.time - this.start.time < minHoldMs || (this.peakDownwardDistance >= intentPx && !aimed)) {
      return null;
    }
    return intent;
  }

  private holdCharge(time: number): number {
    return (time - this.start.time) / 1000 * this.config.chargePerSec;
  }

  private upwardSpeed(time: number): number {
    const cutoff = Math.max(this.start.time, time - this.config.flickWindowMs);
    const first = this.history[0];
    const next = this.history[1] ?? first;
    const fraction = next.time > first.time
      ? Math.max(0, Math.min(1, (cutoff - first.time) / (next.time - first.time)))
      : 0;
    const startY = first.y + (next.y - first.y) * fraction;
    const elapsed = time - Math.max(cutoff, first.time);
    return elapsed > 0 ? Math.max(0, (startY - this.current.y) * 1000 / elapsed) : 0;
  }
}
