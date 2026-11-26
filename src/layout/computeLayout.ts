export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type GameScreen = 'lobby' | 'throw';

export interface GameLayout {
  viewport: Rect;
  safe: Rect;
  topBar: Rect;
  play: Rect;
  aimStart: Rect | null;
  ad: Rect | null;
  insets: Insets;
}

const uiMargin = 8;
const fallbackStartHeight = 32;
const throwStartPadding = 24;
export const throwLineClearance = 8;

/** All coordinates are CSS pixels, relative to the host's game surface. */
export function computeLayout(
  width: number,
  height: number,
  insets: Insets,
  screen: GameScreen,
): GameLayout {
  const viewport = { x: 0, y: 0, width, height };
  const safe = {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, width - insets.left - insets.right),
    height: Math.max(0, height - insets.top - insets.bottom),
  };
  const lobby = screen === 'lobby';
  const wide = safe.width >= 750;
  const topHeight = Math.min(safe.height * 0.45, lobby ? 100 : wide ? 56 : 52);
  const bottomHeight = Math.min(safe.height * 0.25, lobby ? uiMargin : fallbackStartHeight);
  const contentHeight = safe.height - topHeight - bottomHeight;
  const adWidth = lobby ? Math.min(wide ? 112 : 96, safe.width * 0.2) : 0;
  const adHeight = Math.min(200, contentHeight);
  const play = {
    x: safe.x,
    y: safe.y + topHeight,
    width: Math.max(0, safe.width - (lobby ? adWidth + uiMargin * 2 : 0)),
    height: contentHeight,
  };
  return {
    viewport,
    safe,
    topBar: {
      x: safe.x + uiMargin,
      y: safe.y + 4,
      width: Math.max(0, safe.width - uiMargin * 2),
      height: Math.max(0, topHeight - 4),
    },
    play,
    aimStart: lobby ? null : { ...safe, y: play.y + play.height, height: bottomHeight },
    ad: lobby ? {
      x: play.x + play.width + uiMargin,
      y: play.y + (contentHeight - adHeight) / 2,
      width: adWidth,
      height: adHeight,
    } : null,
    insets,
  };
}

export function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** One start area from the hand ring past the standing mat to the safe bottom edge. */
export function computeRingStart(hand: Rect, line: Rect, layout: GameLayout): Rect | null {
  const { safe, play, aimStart } = layout;
  if (!aimStart) return null;
  const x = Math.max(safe.x, Math.min(hand.x, line.x) - throwStartPadding);
  const y = Math.max(play.y, Math.min(hand.y, line.y) - throwStartPadding / 2);
  const right = Math.min(safe.x + safe.width,
    Math.max(hand.x + hand.width, line.x + line.width) + throwStartPadding);
  const width = right - x;
  const height = safe.y + safe.height - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}
