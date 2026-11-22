import { gameConfig, cameraModes, type CameraModeId } from '../config/gameConfig';
import type { CameraState } from '../scene/cameraUtils';

export interface DebugPanelCallbacks {
  onPitchChange: (deg: number) => void;
  onModeChange: (id: CameraModeId) => void;
  onSpawnBall: () => void;
  onClearBalls: () => void;
  onToggleDebugLines: (visible: boolean) => void;
  /** 构图预览：隐藏红色测试球，避免干扰三种相机模式的对比截图。 */
  onTogglePreviewClean: (clean: boolean) => void;
  /** 套圈飞行预览（纯视觉）：预览近处/远处鹅。 */
  onPreviewRing: (depth: 'near' | 'far') => void;
  /** 显示/隐藏正式 UI 安全区参考带。 */
  onToggleUiSafeGuide: (visible: boolean) => void;
}

export interface FrameStats {
  fps: number;
  physicsMs: number;
  ballCount: number;
}

/** 简易 DOM 调试面板（正式 UI 后续会替换；P0-0 只用于观察与验证）。 */
export class DebugPanel {
  private statsEl: HTMLElement;
  private cameraEl: HTMLElement;

  constructor(private cb: DebugPanelCallbacks) {
    const root = document.getElementById('debug-panel');
    if (!root) throw new Error('#debug-panel 不存在');
    root.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'P0-0 相机实验';
    root.appendChild(title);

    // 相机投影模式 A/B/C
    const modeRow = document.createElement('div');
    modeRow.className = 'row';
    modeRow.append(this.label('相机'));
    for (const mode of cameraModes) {
      const btn = document.createElement('button');
      btn.textContent = mode.label;
      btn.dataset.mode = mode.id;
      btn.addEventListener('click', () => this.cb.onModeChange(mode.id));
      modeRow.appendChild(btn);
    }
    root.appendChild(modeRow);

    // 俯视角三档（本轮默认 30°）
    const pitchRow = this.optionRow('俯视角', gameConfig.camera.pitchOptionsDeg);
    root.appendChild(pitchRow);

    // 相机真实姿态回显（由相机位置反解）
    this.cameraEl = document.createElement('div');
    this.cameraEl.className = 'camera-info';
    root.appendChild(this.cameraEl);

    // 投球 / 清空
    const actionRow = document.createElement('div');
    actionRow.className = 'row';
    actionRow.append(
      this.button('投放测试球', () => this.cb.onSpawnBall()),
      this.button('清空测试球', () => this.cb.onClearBalls()),
    );
    root.appendChild(actionRow);

    // 套圈飞行预览（近 / 远）
    const previewRingRow = document.createElement('div');
    previewRingRow.className = 'row';
    previewRingRow.append(this.label('套圈预览'));
    previewRingRow.append(
      this.button('近处鹅', () => this.cb.onPreviewRing('near')),
      this.button('远处鹅', () => this.cb.onPreviewRing('far')),
    );
    root.appendChild(previewRingRow);

    // 构图预览：隐藏测试球
    const previewRow = document.createElement('div');
    previewRow.className = 'row';
    previewRow.append(this.label('构图预览'));
    const preview = document.createElement('input');
    preview.type = 'checkbox';
    preview.id = 'preview-toggle';
    preview.addEventListener('change', () => this.cb.onTogglePreviewClean(preview.checked));
    const previewLabel = document.createElement('label');
    previewLabel.htmlFor = 'preview-toggle';
    previewLabel.textContent = '隐藏测试球';
    previewRow.append(preview, previewLabel);
    root.appendChild(previewRow);

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

    // UI 安全区参考带
    const safeRow = document.createElement('div');
    safeRow.className = 'row';
    safeRow.append(this.label('UI 安全区'));
    const safe = document.createElement('input');
    safe.type = 'checkbox';
    safe.id = 'safe-toggle';
    safe.addEventListener('change', () => this.cb.onToggleUiSafeGuide(safe.checked));
    const safeLabel = document.createElement('label');
    safeLabel.htmlFor = 'safe-toggle';
    safeLabel.textContent = '显示';
    safeRow.append(safe, safeLabel);
    root.appendChild(safeRow);

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

  /** 显示相机实际姿态与投影参数，并同步按钮高亮。 */
  setCameraState(state: CameraState): void {
    const projection =
      state.kind === 'ortho'
        ? `正交 可视高${state.viewHeight}m`
        : `透视 FOV${state.fov}°`;
    this.cameraEl.textContent =
      `实际：${state.modeLabel} | ${projection}\n` +
      `俯视 ${state.pitchDeg.toFixed(1)}° / 偏转 ${state.yawDeg.toFixed(1)}° / 距 ${state.distance.toFixed(1)}m`;
    this.highlightMode(state.modeId);
    this.highlightPitch(Math.round(state.pitchDeg));
  }

  private optionRow(labelText: string, options: readonly number[]): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(this.label(labelText));
    for (const deg of options) {
      const btn = document.createElement('button');
      btn.textContent = `${deg}°`;
      btn.dataset.pitch = String(deg);
      btn.addEventListener('click', () => this.cb.onPitchChange(deg));
      row.appendChild(btn);
    }
    return row;
  }

  private highlightMode(modeId: string): void {
    document
      .querySelectorAll<HTMLButtonElement>('button[data-mode]')
      .forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === modeId));
  }

  private highlightPitch(activeDeg: number): void {
    document
      .querySelectorAll<HTMLButtonElement>('button[data-pitch]')
      .forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.pitch) === activeDeg));
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
