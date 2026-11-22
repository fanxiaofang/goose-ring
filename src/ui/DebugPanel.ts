import { gameConfig, cameraModes, type CameraModeId } from '../config/gameConfig';
import type { CameraState } from '../scene/cameraUtils';
import type { RingTuning } from '../ring/RingSystem';
import type { ThrowPreset } from '../ring/throwPresets';

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
  /** P0-1 固定投掷预设（可重复实验）。 */
  onThrowPreset: (preset: ThrowPreset) => void;
  /** 用上次完全相同的初始条件重放。 */
  onReplayThrow: () => void;
  onClearRings: () => void;
  /** 调整套圈参数（只影响之后新建的套圈）。 */
  onRingTuningChange: (tuning: RingTuning) => void;
}

export interface FrameStats {
  fps: number;
  physicsMs: number;
  ballCount: number;
  /** 场上真实物理套圈数量。 */
  ringCount: number;
  /** 当前渲染缓冲尺寸（不是 CSS 尺寸）。 */
  pixelWidth: number;
  pixelHeight: number;
  /** devicePixelRatio 实际生效值（受上限限制）。 */
  dpr: number;
  /** 每帧 draw call 数。 */
  drawCalls: number;
  /** 每帧三角形数。 */
  triangles: number;
  /** 方向光阴影贴图边长。 */
  shadowMapSize: number;
}

/** 简易 DOM 调试面板（正式 UI 后续会替换；P0-1 用于观察套圈物理与参数）。 */
export class DebugPanel {
  private statsEl: HTMLElement;
  private cameraEl: HTMLElement;
  private hintEl: HTMLElement;
  private readonly tuning: RingTuning;

  constructor(
    private cb: DebugPanelCallbacks,
    initialTuning: RingTuning,
  ) {
    this.tuning = { ...initialTuning };
    const root = document.getElementById('debug-panel');
    if (!root) throw new Error('#debug-panel 不存在');
    root.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'P0-1 套圈物理';
    root.appendChild(title);

    // 相机投影模式 A/B/C（保留 P0-0 实验能力）
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

    // 俯视角三档（B 透视 25° + 30° 是正式候选）
    const pitchRow = this.optionRow('俯视角', gameConfig.camera.pitchOptionsDeg);
    root.appendChild(pitchRow);

    // 相机真实姿态回显（由相机位置反解）
    this.cameraEl = document.createElement('div');
    this.cameraEl.className = 'camera-info';
    root.appendChild(this.cameraEl);

    // ---- P0-1 固定投掷（确定性实验入口）----
    const presetRow = document.createElement('div');
    presetRow.className = 'row wrap';
    presetRow.append(this.label('固定投掷'));
    presetRow.append(
      this.button('垂直落颈', () => this.cb.onThrowPreset('drop')),
      this.button('偏移落颈', () => this.cb.onThrowPreset('offset')),
      this.button('轻抛', () => this.cb.onThrowPreset('soft')),
      this.button('中抛', () => this.cb.onThrowPreset('mid')),
      this.button('重抛', () => this.cb.onThrowPreset('hard')),
      this.button('撞围栏', () => this.cb.onThrowPreset('fence')),
    );
    root.appendChild(presetRow);

    const ringActionRow = document.createElement('div');
    ringActionRow.className = 'row';
    ringActionRow.append(
      this.button('重放上次', () => this.cb.onReplayThrow()),
      this.button('清空套圈', () => this.cb.onClearRings()),
    );
    root.appendChild(ringActionRow);

    // ---- 可调参数（影响之后新建的套圈）----
    const tuningTitle = document.createElement('div');
    tuningTitle.className = 'sub-title';
    tuningTitle.textContent = '套圈参数（新投掷生效）';
    root.appendChild(tuningTitle);

    root.appendChild(this.numberRow('半径', 'radius', 'm', 0.28, 0.52, 0.01));
    root.appendChild(this.numberRow('质量', 'mass', 'kg', 0.05, 1, 0.05));
    root.appendChild(this.numberRow('初速', 'speed', 'm/s', 4, 20, 0.5));
    root.appendChild(this.numberRow('仰角', 'elevationDeg', '°', 5, 60, 1));
    root.appendChild(this.numberRow('自旋', 'spin', 'rad/s', 0, 30, 1));
    root.appendChild(this.numberRow('弹性', 'restitution', '', 0, 0.9, 0.05));
    root.appendChild(this.numberRow('摩擦', 'friction', '', 0, 1, 0.05));
    root.appendChild(this.numberRow('线阻尼', 'linearDamping', '', 0, 0.5, 0.05));
    root.appendChild(this.numberRow('角阻尼', 'angularDamping', '', 0, 0.5, 0.05));

    // ---- P0-0 遗留：测试球与构图预览 ----
    const actionRow = document.createElement('div');
    actionRow.className = 'row';
    actionRow.append(
      this.button('投放测试球', () => this.cb.onSpawnBall()),
      this.button('清空测试球', () => this.cb.onClearBalls()),
    );
    root.appendChild(actionRow);

    const previewRingRow = document.createElement('div');
    previewRingRow.className = 'row';
    previewRingRow.append(this.label('套圈预览'));
    previewRingRow.append(
      this.button('近处鹅', () => this.cb.onPreviewRing('near')),
      this.button('远处鹅', () => this.cb.onPreviewRing('far')),
    );
    root.appendChild(previewRingRow);

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

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'hint';
    this.setDragPower(null);
    root.appendChild(this.hintEl);
  }

  updateStats(stats: FrameStats): void {
    this.statsEl.textContent =
      `FPS ${stats.fps.toFixed(0)} | 物理 ${stats.physicsMs.toFixed(2)}ms | 圈 ${stats.ringCount} | 球 ${stats.ballCount}\n` +
      `绘制 ${stats.drawCalls} / ${(stats.triangles / 1000).toFixed(1)}k 三角 | ` +
      `${stats.pixelWidth}×${stats.pixelHeight} @DPR${stats.dpr.toFixed(2)} | 阴影 ${stats.shadowMapSize}`;
  }

  /** 拖拽蓄力时显示力度；传 null 恢复默认提示。 */
  setDragPower(power: number | null): void {
    this.hintEl.textContent =
      power === null
        ? '画布按住拖动蓄力，松手投圈（拖得越远力度越大）'
        : `蓄力中：力度 ${Math.round(power * 100)}%`;
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

  private numberRow(
    labelText: string,
    key: Exclude<keyof RingTuning, 'segments' | 'tubeRadius' | 'ccd'>,
    unit: string,
    min: number,
    max: number,
    step: number,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.append(this.label(labelText));
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(this.tuning[key]);
    input.dataset.key = key;
    input.addEventListener('change', () => {
      const raw = Number(input.value);
      const value = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : this.tuning[key];
      input.value = String(value);
      this.tuning[key] = value;
      this.cb.onRingTuningChange({ ...this.tuning });
    });
    row.appendChild(input);
    if (unit) {
      const unitEl = document.createElement('span');
      unitEl.className = 'unit';
      unitEl.textContent = unit;
      row.appendChild(unitEl);
    }
    return row;
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
