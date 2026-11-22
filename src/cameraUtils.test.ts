import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeCameraPosition, derivePitchYaw } from './scene/cameraUtils';
import { cameraModes, gameConfig, type CameraMode } from './config/gameConfig';
import { getGooseNeckWorldPosition } from './goose/GoosePlaceholder';

/**
 * P0-0 相机纯函数测试。
 * 锁定坐标约定（Y 向上、Z+ 指向玩家）与角度语义，防止后续调整悄悄破坏取景方向。
 */
describe('computeCameraPosition', () => {
  it('pitch 0° / yaw 0° 时相机与注视点同高、位于玩家侧（Z+）', () => {
    const p = computeCameraPosition(0, 0, 10, { x: 1, y: 2, z: 3 });
    expect(p.x).toBeCloseTo(1);
    expect(p.y).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(13);
  });

  it('pitch 90° 时相机在正上方', () => {
    const p = computeCameraPosition(90, 0, 10, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(0);
  });

  it('yaw 90° 时相机位于场景 +X 一侧', () => {
    const p = computeCameraPosition(0, 90, 10, { x: 0, y: 0, z: 0 });
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(0);
  });

  it('俯视角越高相机越高、越靠近注视点水平位置（单调）', () => {
    const p30 = computeCameraPosition(30, 0, 26);
    const p38 = computeCameraPosition(38, 0, 26);
    const p45 = computeCameraPosition(45, 0, 26);
    expect(p38.y).toBeGreaterThan(p30.y);
    expect(p45.y).toBeGreaterThan(p38.y);
    expect(p38.z).toBeLessThan(p30.z);
    expect(p45.z).toBeLessThan(p38.z);
  });

  it('偏转角增大时相机向 +X 移动、正前方距离缩短', () => {
    const y0 = computeCameraPosition(38, 0, 26);
    const y12 = computeCameraPosition(38, 12, 26);
    const y18 = computeCameraPosition(38, 18, 26);
    expect(y12.x).toBeGreaterThan(y0.x);
    expect(y18.x).toBeGreaterThan(y12.x);
    expect(y18.z).toBeLessThan(y0.z);
  });

  it('相机与注视点距离恒定', () => {
    for (const pitch of [30, 38, 45]) {
      for (const yaw of [0, 12, 18]) {
        const target = { x: 0, y: 0.6, z: 0 };
        const p = computeCameraPosition(pitch, yaw, 26, target);
        const d = Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z);
        expect(d).toBeCloseTo(26, 6);
      }
    }
  });
});

describe('derivePitchYaw', () => {
  it('与 computeCameraPosition 互为逆运算（界面角度与实际姿态一致）', () => {
    for (const pitch of [30, 38, 45]) {
      for (const yaw of [0, 12, 18]) {
        const target = { x: 0, y: 0.6, z: 0 };
        const pos = computeCameraPosition(pitch, yaw, 26, target);
        const pose = derivePitchYaw(pos, target);
        expect(pose.pitchDeg).toBeCloseTo(pitch, 6);
        expect(pose.yawDeg).toBeCloseTo(yaw, 6);
        expect(pose.distance).toBeCloseTo(26, 6);
      }
    }
  });
});

describe('相机对比模式取景', () => {
  function makeCamera(mode: CameraMode, aspect = 16 / 9): THREE.Camera {
    const { target } = gameConfig.camera;
    const pos = computeCameraPosition(
      gameConfig.camera.pitchDeg,
      gameConfig.camera.yawDeg,
      mode.distance,
      target,
    );
    if (mode.kind === 'ortho') {
      const halfH = mode.viewHeight / 2;
      const halfW = halfH * aspect;
      const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
      cam.position.set(pos.x, pos.y, pos.z);
      cam.lookAt(target.x, target.y, target.z);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      return cam;
    }
    const cam = new THREE.PerspectiveCamera(mode.fov, aspect, 0.5, 200);
    cam.position.set(pos.x, pos.y, pos.z);
    cam.lookAt(target.x, target.y, target.z);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    return cam;
  }

  /** 世界坐标投影到屏幕百分比（左上为 0，右下为 100）。 */
  function screenOf(cam: THREE.Camera, x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(cam);
    return { x: ((v.x + 1) / 2) * 100, y: ((1 - v.y) / 2) * 100 };
  }

  /**
   * P0-1 复核：不再用“注视点平面可视高度差 < 1.1 m”这种间接指标，
   * 改为直接验收屏幕构图与 UI 安全区：
   * - 围栏顶部不压 12% 顶部 UI 带，也不留下过大空白；
   * - 前栏杆落在 62%~92% 之间（靠近底部但不出画）；
   * - 围栏纵向占屏 ≥ 45%；
   * - 远栏左右角仍在画面内；
   * - 鹅头（目标区）不被顶部/底部 UI 安全带压住。
   * C 透视 35° 前栏杆进入底部安全带，仅保留为实验模式，不做正式候选验收。
   */
  it.each(['ortho', 'persp25'] as const)('%s 满足屏幕构图与 UI 安全区验收', (id) => {
    const mode = cameraModes.find((m) => m.id === id);
    expect(mode).toBeDefined();
    const cam = makeCamera(mode!);

    const farTopLeft = screenOf(cam, -8, gameConfig.fence.farHeight, -5);
    const farTopRight = screenOf(cam, 8, gameConfig.fence.farHeight, -5);
    const nearRail = screenOf(cam, 0, gameConfig.fence.nearHeight, 5);

    // 围栏顶部：在 12% UI 带下方、且不高于 25%（避免上方大片空地）
    expect(farTopLeft.y).toBeGreaterThan(10);
    expect(farTopLeft.y).toBeLessThan(25);
    expect(Math.abs(farTopLeft.y - farTopRight.y)).toBeLessThan(1);

    // 前栏杆靠近底部但完整可见
    expect(nearRail.y).toBeGreaterThan(62);
    expect(nearRail.y).toBeLessThan(92);

    // 围栏纵向占据足够屏高
    expect(nearRail.y - farTopLeft.y).toBeGreaterThan(45);

    // 远栏左右角仍在画面内（允许侧栏近端被裁，正式要求是物理边界完整）
    expect(farTopLeft.x).toBeGreaterThan(0);
    expect(farTopRight.x).toBeLessThan(100);

    // 实验目标鹅的头部不能被顶部 12% / 底部 8% UI 安全带压住
    const testGoose = gameConfig.goose.layout.reduce((best, cur) =>
      cur.z > best.z ? cur : best,
    );
    const neck = getGooseNeckWorldPosition(testGoose);
    const head = screenOf(cam, neck.x, gameConfig.goose.head.y, neck.z);
    expect(head.y).toBeGreaterThan(12);
    expect(head.y).toBeLessThan(92);
  });

  it('三种相机模式仍可切换（A/B/C 实验能力保留）', () => {
    expect(cameraModes.map((m) => m.id)).toEqual(['ortho', 'persp25', 'persp35']);
  });
});
