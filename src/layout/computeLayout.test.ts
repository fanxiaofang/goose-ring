import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gameConfig } from '../config/gameConfig';
import { boxCorners, framePerspective, projectBounds } from '../scene/cameraUtils';
import { computeLayout, computeRingStart, containsPoint, throwLineClearance } from './computeLayout';

const noInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const { camera, fence, throwLine, throwOrigin, ringPreview, input } = gameConfig;
const fenceX = (fence.width + fence.postSize) / 2;
const fenceZ = (fence.depth + fence.postSize) / 2;
const lineZ = fence.depth / 2 + throwLine.offsetZ;
const ringRadius = ringPreview.ringRadius + ringPreview.tubeRadius;
const box = (min: [number, number, number], max: [number, number, number]) =>
  boxCorners(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)));
const points = [
  ...box([-fenceX, 0, -fenceZ], [fenceX, fence.sideHeight + 0.21, fenceZ]),
  ...box(
    [-throwLine.width / 2, 0, lineZ - throwLine.depth / 2],
    [throwLine.width / 2, 0.13, lineZ + throwLine.depth / 2],
  ),
  ...box(
    [-input.aimLateralMax - ringRadius, throwOrigin.y - ringRadius - ringPreview.hoverAmplitude, throwOrigin.z - ringRadius],
    [input.aimLateralMax + ringRadius, throwOrigin.y + ringRadius + ringPreview.hoverAmplitude, throwOrigin.z + ringRadius],
  ),
];

describe('P0-L Play Rect', () => {
  it.each([
    [844, 390, noInsets],
    [667, 375, noInsets],
    [852, 340, noInsets],
    [1280, 720, noInsets],
    [844, 390, { top: 3, right: 0, bottom: 21, left: 47 }],
    [844, 390, { top: 3, right: 47, bottom: 21, left: 0 }],
    [667, 375, { top: 3, right: 0, bottom: 21, left: 47 }],
    [667, 375, { top: 3, right: 47, bottom: 21, left: 0 }],
  ])('keeps the layout and projected content inside %i×%i with insets %j', (width, height, insets) => {
    for (const screen of ['lobby', 'throw'] as const) {
      const layout = computeLayout(width, height, insets, screen);
      const { viewport, safe, topBar, play, aimStart, ad } = layout;
      expect(topBar.y).toBeGreaterThanOrEqual(safe.y);
      expect(topBar.y + topBar.height).toBe(play.y);
      expect(play.x).toBe(safe.x);
      expect(play.x + play.width).toBeLessThanOrEqual(safe.x + safe.width);
      if (screen === 'lobby') {
        expect(aimStart).toBeNull();
        expect(ad!.x).toBeGreaterThan(play.x + play.width);
        expect(ad!.x + ad!.width).toBeLessThan(safe.x + safe.width);
      } else {
        expect(ad).toBeNull();
        expect(aimStart!.height).toBe(32);
        expect(aimStart!.y).toBe(play.y + play.height);
        expect(containsPoint(aimStart!, safe.x, aimStart!.y)).toBe(true);
        expect(containsPoint(aimStart!, safe.x, aimStart!.y - 0.01)).toBe(false);
        expect(containsPoint(aimStart!, safe.x + safe.width, aimStart!.y)).toBe(false);
      }

      const lens = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
      framePerspective(lens, { ...camera, viewport, play, points, baseDistance: 18.3 });
      const projected = projectBounds(points, lens, viewport);
      expect(projected.x).toBeGreaterThan(play.x);
      expect(projected.x + projected.width).toBeLessThan(play.x + play.width);
      expect(projected.y - play.y).toBeGreaterThanOrEqual(throwLineClearance - 1e-6);
      expect(play.y + play.height - projected.y - projected.height)
        .toBeGreaterThanOrEqual(throwLineClearance - 1e-6);

      const principal = projectBounds([new THREE.Vector3().copy(camera.target)], lens, viewport);
      expect(principal.x).toBeCloseTo(play.x + play.width / 2, 8);
      expect(principal.y).toBeCloseTo(play.y + play.height / 2, 8);
      const pair = [
        new THREE.Vector3(0, 0, -10),
        new THREE.Vector3(1, 1, -10),
      ].map((point) => point.applyMatrix4(lens.matrixWorld));
      const scale = projectBounds(pair, lens, viewport);
      expect(scale.width).toBeCloseTo(scale.height, 8);
      expect(lens.aspect).toBeCloseTo(width / height, 8);
    }
  });

  it('joins the ring, its sides, and the mat to the safe bottom start strip', () => {
    const layout = computeLayout(852, 340, { ...noInsets, bottom: 8 }, 'throw');
    const hand = { x: 403, y: 228, width: 46, height: 26 };
    const mat = { x: 285, y: 285, width: 282, height: 10 };
    const start = computeRingStart(hand, mat, layout)!;
    for (const [x, y] of [[426, 241], [350, 241], [500, 241], [270, 292], [580, 292], [426, 331]]) {
      expect(containsPoint(start, x, y)).toBe(true);
    }
    expect(containsPoint(start, 426, 210)).toBe(false);
    expect(containsPoint(start, 426, 332)).toBe(false);
    expect(computeRingStart(hand, mat, computeLayout(852, 340, noInsets, 'lobby'))).toBeNull();
  });

  it('frames the targets and throwing area more closely when fence ends can crop', () => {
    const { viewport, play } = computeLayout(667, 375, noInsets, 'throw');
    const full = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
    const close = full.clone();
    const perimeter = points.slice(0, 8);
    const core = points.slice(8);
    const framing = { ...camera, viewport, play, baseDistance: 18.3 };
    framePerspective(full, { ...framing, points });
    framePerspective(close, { ...framing, points: core, perimeter });
    expect(close.position.distanceTo(camera.target)).toBeLessThan(full.position.distanceTo(camera.target));
    const bound = projectBounds(core, close, viewport);
    expect(bound.x).toBeGreaterThan(play.x);
    expect(bound.x + bound.width).toBeLessThan(play.x + play.width);
    expect(bound.y).toBeGreaterThan(play.y);
    expect(bound.y + bound.height).toBeLessThan(play.y + play.height);
  });
});
