import { computeLayout, type GameLayout, type Rect } from '../layout/computeLayout';
import type { ProjectedBounds } from '../scene/GameScene';
import { gameConfig } from '../config/gameConfig';
import { bindLobbyEntry } from './LobbyEntry';

const modeLabels = {
  lobby: '大厅',
  /** 练习场已从玩家模式移除（2026-11-26），仅保留 ?mode=practice / ?geese=single 调试直达。 */
  practice: '调试练习',
  static: '静态场',
  normal: '普通场',
  clever: '机灵场',
};
export type ScreenMode = keyof typeof modeLabels;

export function resolveScreenMode(params: URLSearchParams): ScreenMode {
  const mode = params.get('mode');
  if (mode && Object.hasOwn(modeLabels, mode)) return mode as ScreenMode;
  return params.get('geese') === 'single' ? 'practice' : 'static';
}

interface HudActions {
  toggleAssist: () => void;
  soundChanged: (enabled: boolean) => void;
  clearField: () => void;
  cancelDrag: () => void;
  setPaused: (paused: boolean) => void;
}

const practiceInstruction = '抓住圈，上下拖动，松手投出';

export class GameHud {
  readonly surface = document.querySelector<HTMLElement>('#game-surface')!;
  readonly safeProbe = document.querySelector<HTMLElement>('#safe-area-probe')!;
  private readonly lobby = document.querySelector<HTMLElement>('#lobby-hud')!;
  private readonly throwHud = document.querySelector<HTMLElement>('#throw-hud')!;
  private readonly assist = document.querySelector<HTMLButtonElement>('#hud-assist')!;
  private readonly startHint = document.querySelector<HTMLElement>('#throw-start-hint')!;
  private readonly hintText = document.querySelector<HTMLElement>('#hint-text')!;
  private readonly meter = document.querySelector<HTMLElement>('#throw-meter')!;
  private readonly chargeFill = document.querySelector<HTMLElement>('#charge-fill')!;
  private readonly chargeValue = document.querySelector<HTMLElement>('#charge-value')!;
  private readonly aimFill = document.querySelector<HTMLElement>('#aim-fill')!;
  private readonly aimValue = document.querySelector<HTMLElement>('#aim-value')!;
  private readonly ad = document.querySelector<HTMLElement>('#lobby-ad')!;
  private readonly guide = document.querySelector<HTMLElement>('#ui-safe-guide')!;
  private readonly ringStartGuide = guideBox('投掷起手区', { x: 0, y: 0, width: 0, height: 0 }, 'hit');
  private readonly roundResult = document.querySelector<HTMLDialogElement>('#round-result')!;
  private readonly ringsDisplay = document.querySelector<HTMLElement>('#round-rings')!;
  private readonly caughtDisplay = document.querySelector<HTMLElement>('#round-caught')!;
  private readonly hideUi: boolean;
  private roundRings: number | null = null;
  private waitingForRing = false;

  constructor(private readonly mode: ScreenMode, params: URLSearchParams, actions: HudActions) {
    this.hideUi = params.get('ui') === '0';
    document.querySelector<HTMLElement>('#mode-label')!.textContent = modeLabels[mode];
    document.querySelector<HTMLElement>('#formal-stats')!.hidden = mode === 'practice';
    const pauseButton = document.querySelector<HTMLButtonElement>('#pause-game')!;
    pauseButton.hidden = mode === 'practice' || mode === 'lobby';
    document.querySelector<HTMLElement>('#practice-lobby')!.hidden = mode !== 'practice';

    for (const link of this.surface.querySelectorAll<HTMLAnchorElement>('[data-screen-mode]')) {
      link.href = screenUrl(link.dataset.screenMode as ScreenMode).href;
    }

    if (mode === 'lobby') bindLobbyEntry(modeLabels, (selected, rings) => {
      const url = screenUrl(selected);
      url.searchParams.set('previewRings', String(rings));
      window.location.assign(url);
    });

    const pauseMenu = document.querySelector<HTMLDialogElement>('#pause-menu')!;
    const pauseTitle = document.querySelector<HTMLElement>('#pause-title')!;
    const pauseActions = document.querySelector<HTMLElement>('#pause-actions')!;
    const endConfirm = document.querySelector<HTMLElement>('#end-round-confirm')!;
    const remaining = document.querySelector<HTMLElement>('#end-round-remaining')!;
    const cancelEnd = document.querySelector<HTMLButtonElement>('#cancel-end-round')!;
    const endRound = document.querySelector<HTMLButtonElement>('#end-round')!;
    const showEndConfirmation = (open: boolean) => {
      pauseTitle.textContent = open ? '提前结束本场？' : '歇口气';
      pauseActions.hidden = open;
      endConfirm.hidden = !open;
      remaining.hidden = this.roundRings === null;
      if (this.roundRings !== null) remaining.textContent = `本场还剩 ${this.roundRings} 圈。`;
    };
    pauseButton.addEventListener('click', () => {
      showEndConfirmation(false);
      pauseMenu.showModal();
      actions.setPaused(true);
    });
    endRound.addEventListener('click', () => {
      showEndConfirmation(true);
      cancelEnd.focus();
    });
    const backToPause = () => {
      showEndConfirmation(false);
      endRound.focus();
    };
    cancelEnd.addEventListener('click', backToPause);
    pauseMenu.addEventListener('cancel', (event) => {
      if (endConfirm.hidden) return;
      event.preventDefault();
      backToPause();
    });
    pauseMenu.addEventListener('close', () => actions.setPaused(false));
    this.roundResult.addEventListener('cancel', (event) => event.preventDefault());

    this.assist.addEventListener('click', actions.toggleAssist);
    const debugPanel = document.querySelector<HTMLElement>('#debug-panel')!;
    const debugToggle = document.querySelector<HTMLButtonElement>('#debug-toggle')!;
    const setDebugOpen = (open: boolean) => {
      debugPanel.hidden = !open;
      debugToggle.setAttribute('aria-expanded', String(open));
    };
    setDebugOpen(!this.hideUi && params.get('debug') === '1');
    debugToggle.addEventListener('click', () => {
      actions.cancelDrag();
      setDebugOpen(debugPanel.hidden === true);
    });

    const settings = document.querySelector<HTMLDialogElement>('#game-settings')!;
    for (const button of this.surface.querySelectorAll('[data-open-settings]')) {
      button.addEventListener('click', () => {
        settings.showModal();
        actions.setPaused(true);
      });
    }
    settings.addEventListener('close', () => actions.setPaused(false));
    const soundToggle = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
    soundToggle.addEventListener('click', () => {
      const enabled = soundToggle.getAttribute('aria-pressed') === 'false';
      soundToggle.setAttribute('aria-pressed', String(enabled));
      actions.soundChanged(enabled);
    });
    document.querySelector<HTMLButtonElement>('#clear-field')!.addEventListener('click', () => {
      actions.clearField();
      settings.close();
    });
  }

  measure(): GameLayout {
    const { width, height } = this.surface.getBoundingClientRect();
    const style = getComputedStyle(this.safeProbe);
    return computeLayout(Math.max(1, width), Math.max(1, height), {
      top: parseFloat(style.paddingTop),
      right: parseFloat(style.paddingRight),
      bottom: parseFloat(style.paddingBottom),
      left: parseFloat(style.paddingLeft),
    }, this.mode === 'lobby' ? 'lobby' : 'throw');
  }

  applyLayout(layout: GameLayout): void {
    const lobby = this.mode === 'lobby';
    this.lobby.hidden = this.hideUi || !lobby;
    this.throwHud.hidden = this.hideUi || lobby;
    this.ad.hidden = this.hideUi || !lobby;
    this.updateHintVisibility();
    position(lobby ? this.lobby : this.throwHud, layout.topBar);
    if (layout.ad) position(this.ad, layout.ad);
    if (layout.aimStart) position(this.startHint, layout.aimStart);
    this.surface.style.setProperty('--play-top', `${layout.play.y}px`);
    this.surface.style.setProperty('--play-height', `${layout.play.height}px`);
    this.surface.style.setProperty('--safe-right', `${layout.insets.right}px`);
  }

  setAssist(enabled: boolean, available: boolean): void {
    this.assist.setAttribute('aria-pressed', String(enabled));
    this.assist.hidden = !available;
  }

  setWaitingForRing(waiting: boolean): void {
    this.waitingForRing = waiting;
    this.setCharge(null);
  }

  setRoundRings(rings: number | null): void {
    this.roundRings = rings;
    this.ringsDisplay.textContent = rings === null ? '—' : String(rings);
    this.setCharge(null);
  }

  /** 本盘已套数量（P0-2 判定成功时 +1）。 */
  setRoundCaught(count: number): void {
    this.caughtDisplay.textContent = String(count);
  }

  showRoundResult(throws: number): void {
    if (this.hideUi) return;
    document.querySelector('#result-mode')!.textContent = modeLabels[this.mode];
    document.querySelector('#result-throws')!.textContent = `${throws} 圈`;
    this.startHint.hidden = true;
    this.roundResult.showModal();
  }

  setCharge(charge: number | null, aimRad = 0): void {
    const showNumbers = this.mode === 'practice' || this.mode === 'static';
    const meterActive = !this.waitingForRing && this.roundRings !== 0
      && charge !== null && showNumbers;
    const text = !meterActive && charge === null && !this.waitingForRing
      && this.roundRings !== 0 && this.mode === 'practice' ? practiceInstruction : '';
    if (meterActive) this.updateMeter(charge, aimRad);
    const changed = this.meter.hidden !== !meterActive || this.hintText.textContent !== text;
    this.meter.hidden = !meterActive;
    this.hintText.textContent = text;
    this.hintText.hidden = !text;
    if (changed) this.updateHintVisibility();
  }

  /** 蓄力条从左往右填充；偏转条以中线为原点向左右生长。 */
  private updateMeter(charge: number, aimRad: number): void {
    const percent = Math.round(charge * 100);
    if (this.chargeValue.textContent !== `${percent}%`) {
      this.chargeValue.textContent = `${percent}%`;
      this.chargeFill.style.width = `${percent}%`;
    }
    const aimDeg = Math.round((aimRad * 180) / Math.PI);
    const half = Math.min(1, Math.abs(aimDeg) / gameConfig.input.maxAimDeg) * 50;
    if (this.aimValue.textContent !== `${aimDeg > 0 ? '+' : ''}${aimDeg}°`) {
      this.aimValue.textContent = `${aimDeg > 0 ? '+' : ''}${aimDeg}°`;
      this.aimFill.style.width = `${half}%`;
      this.aimFill.style.left = aimDeg >= 0 ? '50%' : `${50 - half}%`;
    }
  }

  private updateHintVisibility(): void {
    this.startHint.hidden = this.hideUi || this.mode === 'lobby'
      || this.roundResult.open || (this.meter.hidden && !this.hintText.textContent);
  }

  setGuideVisible(visible: boolean): void {
    this.guide.hidden = !visible;
    const toggle = document.querySelector<HTMLInputElement>('#safe-toggle');
    if (toggle) toggle.checked = visible;
  }

  get guideVisible(): boolean {
    return !this.guide.hidden;
  }

  drawGuide(layout: GameLayout, world: readonly ProjectedBounds[]): void {
    const { insets } = layout;
    const boxes = [
      guideBox(`安全区 ↑${insets.top} →${insets.right} ↓${insets.bottom} ←${insets.left}`, layout.safe, 'ui'),
      guideBox('顶栏', layout.topBar, 'ui'),
      guideBox('Play Rect', layout.play, 'play'),
      ...world.map(({ label, rect, headHeight, neckWidth }) => guideBox(
        label,
        rect,
        'world',
        headHeight === undefined || neckWidth === undefined
          ? undefined
          : `#${label.split(' ')[1]} 头${headHeight.toFixed(1)} 颈${neckWidth.toFixed(1)}`,
      )),
    ];
    if (layout.aimStart) {
      boxes.push(guideBox('底部起手区', layout.aimStart, 'ui'), this.ringStartGuide);
    }
    if (layout.ad) boxes.push(guideBox('广告位', layout.ad, 'ui'));
    this.guide.replaceChildren(...boxes);
  }

  updateRingStartGuide(rect: Rect | null): void {
    this.ringStartGuide.hidden = rect === null;
    if (!rect) return;
    position(this.ringStartGuide, rect);
    const caption = this.ringStartGuide.firstElementChild!;
    const text = `投掷起手区 ${Math.round(rect.width)}×${Math.round(rect.height)}`;
    if (caption.textContent !== text) caption.textContent = text;
  }
}

function screenUrl(mode: ScreenMode): URL {
  const url = new URL(window.location.href);
  for (const key of ['geese', 'throw', 'charge', 'aim', 'previewRings']) url.searchParams.delete(key);
  url.searchParams.set('mode', mode);
  return url;
}

function position(el: HTMLElement, { x, y, width, height }: Rect): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
}

function guideBox(label: string, rect: Rect, kind: string, text?: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'layout-box';
  box.dataset.kind = kind;
  box.dataset.label = label;
  position(box, rect);
  const caption = document.createElement('span');
  caption.textContent = text ?? `${label} ${Math.round(rect.width)}×${Math.round(rect.height)}`;
  box.append(caption);
  return box;
}
