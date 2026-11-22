/**
 * 固定步长累加器：把任意渲染帧间隔转换为整数个固定物理步。
 * 物理结果只取决于固定步数与初始条件，与渲染帧率无关（01_技术方案.md §5.1）。
 */
export class FixedStepAccumulator {
  private accumulator = 0;

  constructor(
    private readonly fixedDt: number,
    private readonly maxSteps: number,
  ) {}

  /**
   * 喂入一帧的真实时长，返回本帧应执行的物理步数。
   * 超过 maxSteps 时丢弃积压，避免低帧率下的死亡螺旋。
   */
  add(frameDt: number): number {
    this.accumulator += Math.max(0, frameDt);
    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxSteps) {
      steps++;
      this.accumulator -= this.fixedDt;
    }
    if (steps >= this.maxSteps) this.accumulator = 0;
    return steps;
  }
}
