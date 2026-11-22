import { gameConfig } from '../config/gameConfig';

export interface DebugPanelCallbacks {
  onPitchChange: (deg: number) => void;
  onSpawnBall: () => void;
  onClearBalls: () => void;
  onToggleDebugLines: (visible: boolean) => void;
}

export interface FrameStats {
  fps: number;
  physicsMs: number;
  ballCount: number;
}

/** 简易 DOM 调试面板（正式 UI 后续会替换；P0-0 只用于观察与验证）。 */
export class DebugPanel {
  private statsEl: HTMLElement;

  constructor(private cb: DebugPanelCallbacks) {
    const root = document.getElementById('debug-panel');
    if (!root) throw new Error('#debug-panel 不存在');
    root.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'P0-0 调试面板';
    root.appendChild(title);

    // 相机俯视角三档
    const camRow = document.createElement('div');
    camRow.className = 'row';
    camRow.append(this.label('俯视角'));
    for (const deg of gameConfig.camera.pitchOptionsDeg) {
      const btn = document.createElement('button');
      btn.textContent = `${deg}°`;
      btn.dataset.deg = String(deg);
      btn.addEventListener('click', () => {
        this.highlightPitch(deg);
        this.cb.onPitchChange(deg);
      });
      camRow.appendChild(btn);
    }
    root.appendChild(camRow);
    this.highlightPitch(gameConfig.camera.pitchDeg);

    // 投球 / 清空
    const actionRow = document.createElement('div');
    actionRow.className = 'row';
    const spawn = this.button('投放测试球', () => this.cb.onSpawnBall());
    const clear = this.button('清空测试球', () => this.cb.onClearBalls());
    actionRow.append(spawn, clear);
    root.appendChild(actionRow);

    // 碰撞线框开关
    const debugRow = document.createElement('div');
    debugRow.className = 'row';
    debugRow.append(this.label('碰撞线框'));
    const wire = document.createElement('input');
    wire.type = 'checkbox';
    wire.id = 'wire-toggle';
    wire.addEventListener('change', () => this.cb.onToggleDebugLines(wire.checked));
    const wireLabel = document.createElement('label');
    wireLabel.htmlFor = 'wire-toggle';
    wireLabel.textContent = '显示';
    debugRow.append(wire, wireLabel);
    root.appendChild(debugRow);

    // 运行统计
    this.statsEl = document.createElement('div');
    this.statsEl.className = 'stats';
    root.appendChild(this.statsEl);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '点击/触摸场景任意位置 = 在该落点上方投放测试球';
    root.appendChild(hint);
  }

  updateStats(stats: FrameStats): void {
    this.statsEl.textContent =
      `FPS ${stats.fps.toFixed(0)} | 物理 ${stats.physicsMs.toFixed(2)}ms | 球 ${stats.ballCount}`;
  }

  private highlightPitch(activeDeg: number): void {
    const root = document.getElementById('debug-panel');
    root?.querySelectorAll<HTMLButtonElement>('button[data-deg]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.deg) === activeDeg);
    });
  }

  private label(text: string): HTMLElement {
    const el = document.createElement('span');
    el.className = 'lbl';
    el.textContent = text;
    return el;
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }
}
