import * as THREE from 'three';
import { gameConfig, cameraModes, type CameraModeId } from '../config/gameConfig';
import { GameScene } from '../scene/GameScene';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FixedStepAccumulator } from '../physics/fixedStep';
import { DebugPanel, FrameStats } from '../ui/DebugPanel';
import { GameHud, resolveScreenMode } from '../ui/GameHud';
import { getPreviewRingCount } from '../ui/LobbyEntry';
import { computeRingStart, containsPoint, type GameLayout, type Rect } from '../layout/computeLayout';
import { SoundSynth } from '../audio/SoundSynth';
import { RingPreview, type RingPreviewState } from '../ring/RingPreview';
import { RingSystem, type RingLaunchSpec, type RingTuning } from '../ring/RingSystem';
import { buildPlayerThrow } from '../ring/playerThrow';
import { ThrowGesture, type ThrowIntent } from '../input/ThrowGesture';
import {
  PRESET_SPEED_FACTOR,
  FENCE_PRESET_ELEVATION_DEG,
  THROW_PRESETS,
  type ThrowPreset,
} from '../ring/throwPresets';
import { horizontalRingRotation } from '../ring/ringGeometry';
import { velocityToward } from '../ring/throwMath';
import {
  getGooseNeckWorldPosition,
  type GooseLayoutEntry,
} from '../goose/GoosePlaceholder';
import { RingJudge, type JudgeOutcome } from '../judge/RingJudge';
import type { GoosePart } from '../physics/PhysicsWorld';

interface BallEntry {
  body: import('@dimforge/rapier3d-compat').RigidBody;
  mesh: THREE.Mesh;
}

interface DragState {
  pointerId: number;
  gesture: ThrowGesture;
}

/**
 * 游戏生命周期主控：固定物理步长循环 + 渲染 + 输入 + 调试。
 * P0-2 范围：真实有孔套圈的投掷 + RingJudge 套中判定（本盘计数）；不做正式历史累计。
 */
export class GameApp {
  private scene!: GameScene;
  private physics!: PhysicsWorld;
  private panel!: DebugPanel;
  private hud!: GameHud;
  private layout!: GameLayout;
  private ringPreview!: RingPreview;
  private ringSystem!: RingSystem;
  private readonly sound = new SoundSynth();
  private throwCount = 0;
  private roundRings: number | null = null;
  private roundThrows = 0;
  private roundCaught = 0;
  private readonly caughtGeese = new Set<number>();
  private gooseLayout: readonly GooseLayoutEntry[] = [];
  private judge: RingJudge | null = null;
  private lastJudgeOutcome: JudgeOutcome | null = null;
  private judgeDebug: HTMLElement | null = null;
  private pendingPlayerRing: ReturnType<RingSystem['launch']> | null = null;
  private groundRestTime = 0;
  private paused = false;
  private pendingPreset: ThrowPreset | null = null;

  private balls: BallEntry[] = [];
  private ballGeo = new THREE.SphereGeometry(gameConfig.ball.radius, 24, 16);
  private ballMat = new THREE.MeshLambertMaterial({ color: '#d94f4f' });
  /** 构图预览：隐藏测试球网格（物理仍在运行）。 */
  private previewClean = false;

  /** 固定步长累加器：渲染帧率不影响物理结果。 */
  private readonly fixedStep = new FixedStepAccumulator(
    gameConfig.physics.fixedDt,
    gameConfig.physics.maxCatchUpSteps,
  );
  private lastTime = 0;
  private physicsMs = 0;
  private fps = 0;
  private frameCount = 0;
  private statTimer = 0;
  /** 物理时间缩放（仅用于慢动作观察，不改变固定步长）。 */
  private timeScale = 1;

  private drag: DragState | null = null;
  private lastThrow: RingLaunchSpec | null = null;
  private lastTuning: RingTuning | null = null;
  private lastIntent: ThrowIntent | null = null;
  private lastInputEvent = 'idle';
  /** 调试投掷目标：练习场的单鹅，或其他场离玩家最近的一只。 */
  private testGoose!: GooseLayoutEntry;
  private assistAvailable = false;
  /** 练习和静态场可开关轨迹辅助。 */
  private assist: boolean = gameConfig.ringPreview.assistDefault;
  /** 截图冻结态：?charge=0.8&aim=12 时保持蓄力预览，不响应指针。 */
  private frozenPreview: { charge: number; aimRad: number } | null = null;
  private canvasEl: HTMLCanvasElement | null = null;

  /** 复用向量，避免每 0.25 s 统计时新建对象。 */
  private drawBufferSize = new THREE.Vector2();

  async start(canvas: HTMLCanvasElement): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    this.canvasEl = canvas;
    const mode = resolveScreenMode(params);
    this.assistAvailable = mode === 'practice' || mode === 'static';
    if (mode !== 'lobby' && mode !== 'practice') this.roundRings = getPreviewRingCount(params);
    this.hud = new GameHud(mode, params, {
      toggleAssist: () => this.setAssist(!this.assist),
      soundChanged: (enabled) => {
        this.sound.setMuted(!enabled);
        if (enabled) this.sound.unlock();
      },
      clearField: () => {
        this.cancelDrag();
        this.clearBalls();
        this.ringSystem.clear();
        this.lastThrow = null;
        this.lastTuning = null;
        this.throwCount = 0;
      },
      cancelDrag: () => this.cancelDrag(),
      setPaused: (paused) => this.setPaused(paused),
    });
    this.layout = this.hud.measure();

    const { practicePosition, staticLayout, layout } = gameConfig.goose;
    const gooseLayout = mode === 'practice' ? [practicePosition] : mode === 'static' ? staticLayout : layout;
    this.gooseLayout = gooseLayout;
    this.testGoose = pickTestGoose(gooseLayout);

    this.scene = new GameScene(canvas, this.layout, gooseLayout);
    this.physics = await PhysicsWorld.create(this.scene.scene, gooseLayout);
    const ringMaterial = new THREE.MeshLambertMaterial({
      color: '#c9382e', emissive: '#c9382e', emissiveIntensity: 0.1,
    });
    this.ringPreview = new RingPreview(this.scene.scene, ringMaterial);
    this.ringSystem = new RingSystem(this.scene.scene, this.physics, ringMaterial);
    this.hud.setRoundCaught(this.roundCaught);
    if (params.get('judge') === '1') {
      this.judgeDebug = document.querySelector<HTMLElement>('#judge-debug');
      if (this.judgeDebug) this.judgeDebug.hidden = false;
    }

    // 支持 URL 指定相机模式，也可由调试面板切换。
    const requested = params.get('camera');
    if (requested && cameraModes.some((m) => m.id === requested)) {
      this.scene.setCameraMode(requested as CameraModeId);
    }

    this.panel = new DebugPanel(
      {
        onPitchChange: (deg) => {
          this.scene.setCameraPitch(deg);
          this.syncCameraReadout();
        },
        onModeChange: (id) => {
          this.scene.setCameraMode(id);
          this.syncCameraReadout();
        },
        onSpawnBall: () => this.spawnBallNearCenter(),
        onClearBalls: () => this.clearBalls(),
        onToggleDebugLines: (visible) => this.physics.setDebugVisible(visible),
        onTogglePreviewClean: (clean) => this.setPreviewClean(clean),
        onToggleAssist: (enabled) => this.setAssist(enabled),
        onToggleUiSafeGuide: (visible) => this.setUiSafeGuide(visible),
        onThrowPreset: (preset) => this.throwPreset(preset),
        onReplayThrow: () => this.replayThrow(),
        onClearRings: () => this.ringSystem.clear(),
        onRingTuningChange: (tuning) => Object.assign(this.ringSystem.tuning, tuning),
      },
      this.ringSystem.tuning,
    );
    this.hud.applyLayout(this.layout);
    this.hud.setRoundRings(this.roundRings);
    this.syncCameraReadout();

    // ?wire=1：显示 Rapier 碰撞线框，用于核对环体 16 段胶囊与真实内孔
    if (params.get('wire') === '1') this.physics.setDebugVisible(true);
    // ?slowmo=0.35：慢动作观察弹道（物理仍按固定步长推进）
    const slowParam = params.get('slowmo');
    if (slowParam !== null) {
      const slow = Number(slowParam);
      if (Number.isFinite(slow) && slow > 0) {
        this.timeScale = Math.min(1, Math.max(0.1, slow));
      }
    }

    // ?assist=0：关闭轨迹辅助，验证正式模式只剩手持圈与力度反馈
    this.setAssist(params.get('assist') !== '0' && this.assist);
    // ?charge=0.8&aim=12：冻结蓄力/偏转预览，便于固定截图；不响应指针
    const chargeParam = params.get('charge');
    if (chargeParam !== null) {
      const charge = Number(chargeParam);
      const aimDeg = Number(params.get('aim') ?? '0');
      const maxAim = gameConfig.input.maxAimDeg;
      this.frozenPreview = {
        charge: Number.isFinite(charge) ? THREE.MathUtils.clamp(charge, 0, 1) : 0.8,
        aimRad: THREE.MathUtils.degToRad(
          Number.isFinite(aimDeg) ? THREE.MathUtils.clamp(aimDeg, -maxAim, maxAim) : 0,
        ),
      };
    }
    if (params.get('layout') === '1' || params.get('safe') === '1') this.setUiSafeGuide(true);

    // ?throw=drop|offset|soft|mid|hard|fence：固定投掷，可重复截图/复现
    const throwParam = params.get('throw');
    if (throwParam && THROW_PRESETS.includes(throwParam as ThrowPreset)) {
      window.setTimeout(() => { this.pendingPreset = throwParam as ThrowPreset; }, 600);
    }

    // 开发环境只读调试快照：用于验证落点/静止状态，不参与判定与正式数据
    if (import.meta.env.DEV) {
      (window as unknown as { __p01?: () => unknown }).__p01 = () => ({
        rings: this.ringSystem.snapshot(),
        timeScale: this.timeScale,
        throwCount: this.throwCount,
        lastThrow: this.lastThrow,
        lastTuning: this.lastTuning,
        activePointer: this.drag?.pointerId ?? null,
        gesture: this.drag?.gesture.preview(performance.now()) ?? null,
        pullDistance: this.drag?.gesture.pullDistance ?? null,
        lastIntent: this.lastIntent,
        lastInputEvent: this.lastInputEvent,
        preview: this.buildPreviewState(),
        landing: this.ringPreview.getLandingPoint().toArray(),
        paused: this.paused,
        awaitingRing: this.pendingPlayerRing !== null,
        roundRings: this.roundRings,
        assist: this.assist,
        layout: this.layout,
        ringStart: this.getRingStart(),
        camera: this.scene.getCameraState(),
        projections: this.scene.getProjectedBounds(),
      });
    }

    // 鼠标 / 触摸统一走 Pointer Events：按住拖动蓄力，松手投掷
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e, canvas));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    const cancelPointer = (e: PointerEvent) => {
      if (e.pointerId === this.drag?.pointerId) {
        this.lastInputEvent = e.type;
        this.cancelDrag();
      }
    };
    canvas.addEventListener('pointercancel', cancelPointer);
    canvas.addEventListener('lostpointercapture', (e) => {
      // Chrome can drop capture while the pointer is still pressed on the canvas.
      // Continue handling that pointer until it releases, leaves, or is cancelled.
      if ((e.buttons & 1) === 0) cancelPointer(e);
    });
    canvas.addEventListener('pointerleave', (e) => {
      if (!canvas.hasPointerCapture(e.pointerId)) cancelPointer(e);
    });
    window.addEventListener('blur', () => {
      this.lastInputEvent = 'blur';
      this.cancelDrag();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.lastInputEvent = 'hidden';
        this.cancelDrag();
      }
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    const resize = () => this.syncLayout();
    const observer = new ResizeObserver(resize);
    observer.observe(this.hud.surface);
    observer.observe(this.hud.safeProbe, { box: 'border-box' });
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.screen.orientation?.addEventListener('change', () => {
      this.cancelDrag();
      resize();
    });
    resize();

    this.lastTime = performance.now();
    this.scene.renderer.setAnimationLoop(() => this.frame());
  }

  private syncLayout(): void {
    const next = this.hud.measure();
    const old = this.layout;
    if (
      old.viewport.width === next.viewport.width &&
      old.viewport.height === next.viewport.height &&
      old.insets.top === next.insets.top &&
      old.insets.right === next.insets.right &&
      old.insets.bottom === next.insets.bottom &&
      old.insets.left === next.insets.left &&
      this.scene.renderer.getPixelRatio() === Math.min(window.devicePixelRatio, gameConfig.render.maxPixelRatio)
    ) return;
    this.cancelDrag();
    this.lastInputEvent = 'viewport-change';
    this.layout = next;
    this.hud.applyLayout(next);
    this.scene.setLayout(next);
    this.syncCameraReadout();
  }

  private syncCameraReadout(): void {
    this.panel.setCameraState(this.scene.getCameraState());
    if (this.hud.guideVisible) this.drawLayoutGuide();
  }

  private frame(): void {
    const now = performance.now();
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.25); // 切后台回来防跳变
    this.lastTime = now;
    const simulationDt = this.paused ? 0 : frameDt;
    const scaledDt = simulationDt * this.timeScale;

    if (!this.paused && !this.pendingPlayerRing && this.roundRings !== 0 && this.pendingPreset) {
      this.throwPreset(this.pendingPreset);
      this.pendingPreset = null;
    }

    const steps = this.fixedStep.add(scaledDt);
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      this.physics.step();
      this.trackGroundRest();
      this.stepJudge();
    }
    if (steps > 0) this.physicsMs = performance.now() - t0;

    this.syncBalls();
    this.ringSystem.update(scaledDt);
    this.finishPlayerThrow();
    this.updateChargeHint();
    this.ringPreview.update(simulationDt, this.buildPreviewState());
    if (this.hud.guideVisible) this.hud.updateRingStartGuide(this.getRingStart());
    this.physics.updateDebugLines();
    this.updateJudgeDebug();
    this.scene.render();

    // 统计约 4 次/秒刷新
    this.frameCount++;
    this.statTimer += frameDt;
    if (this.statTimer >= 0.25) {
      this.fps = this.frameCount / this.statTimer;
      this.frameCount = 0;
      this.statTimer = 0;
      this.scene.renderer.getDrawingBufferSize(this.drawBufferSize);
      const renderInfo = this.scene.renderer.info.render;
      const stats: FrameStats = {
        fps: this.fps,
        physicsMs: this.physicsMs,
        ballCount: this.balls.length,
        ringCount: this.ringSystem.count,
        throwCount: this.throwCount,
        pixelWidth: this.drawBufferSize.x,
        pixelHeight: this.drawBufferSize.y,
        dpr: this.scene.renderer.getPixelRatio(),
        drawCalls: renderInfo.calls,
        triangles: renderInfo.triangles,
        shadowMapSize: gameConfig.render.shadowMapSize,
      };
      this.panel.updateStats(stats);
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.lastTime = performance.now();
    if (paused) this.cancelDrag();
  }

  private trackGroundRest(): void {
    const ring = this.pendingPlayerRing;
    if (!ring?.isValid() || ring.isSleeping()) return;
    const velocity = ring.linvel();
    const angular = ring.angvel();
    const resting = Math.hypot(velocity.x, velocity.y, velocity.z) <= gameConfig.ring.settleSpeed
      && Math.hypot(angular.x, angular.y, angular.z) <= gameConfig.ring.settleAngularSpeed
      && this.physics.isTouchingGround(ring);
    this.groundRestTime = resting ? this.groundRestTime + gameConfig.physics.fixedDt : 0;
  }

  /** 每物理步喂一次判定：环位姿 + 与地面/鹅各部位的接触。 */
  private stepJudge(): void {
    const ring = this.pendingPlayerRing;
    const judge = this.judge;
    if (!ring || !judge || !ring.isValid() || this.paused) return;
    const position = ring.translation();
    const rotation = ring.rotation();
    const linvel = ring.linvel();
    const gooseContacts: Array<{ index: number; part: GoosePart }> = [];
    let groundContact = this.physics.isTouchingGround(ring);
    for (let c = 0; c < ring.numColliders(); c++) {
      this.physics.world.contactPairsWith(ring.collider(c), (other) => {
        const part = this.physics.goosePartOf(other.handle);
        if (part) gooseContacts.push(part);
        if (this.physics.labelOf(other.handle) === 'ground') groundContact = true;
      });
    }
    const outcome = judge.update(gameConfig.physics.fixedDt, {
      position, rotation, linvel, groundContact, gooseContacts,
    });
    if (outcome) this.onJudgeOutcome(outcome, ring);
  }

  /** 判定结算：套中则记本盘 +1、鹅与圈一起退场（占位：即时隐藏，动画留待美术阶段）。 */
  private onJudgeOutcome(outcome: JudgeOutcome, ring: NonNullable<GameApp['pendingPlayerRing']>): void {
    this.lastJudgeOutcome = outcome;
    if (outcome.type !== 'caught' || outcome.gooseIndex === null) return;
    const index = outcome.gooseIndex;
    this.roundCaught++;
    this.caughtGeese.add(index);
    this.hud.setRoundCaught(this.roundCaught);
    const goose = this.scene.gooseGroup.children[index];
    if (goose) goose.visible = false;
    this.physics.removeGoose(index);
    this.ringSystem.remove(ring);
  }

  /** `?judge=1` 时的判定状态视图：状态 / 锁定目标 / 结算结果。 */
  private updateJudgeDebug(): void {
    const el = this.judgeDebug;
    if (!el) return;
    const judge = this.judge;
    const outcome = this.lastJudgeOutcome;
    const result = outcome
      ? `${outcome.type}${outcome.reason ? `(${outcome.reason})` : ''} @tick ${outcome.tick}`
      : '—';
    el.textContent = `RingJudge ${judge?.state ?? 'IDLE'} | 目标 ${judge?.target ?? '—'} | ${result}`;
  }

  private finishPlayerThrow(): void {
    const ring = this.pendingPlayerRing;
    if (this.paused || !ring) return;
    if (ring.isValid() && !ring.isSleeping() && this.groundRestTime < gameConfig.ring.settleSeconds) return;

    this.pendingPlayerRing = null;
    this.hud.setWaitingForRing(false);
    if (this.roundRings === 0) {
      this.setPaused(true);
      this.hud.showRoundResult(this.roundThrows);
    } else {
      this.ringPreview.setVisible(true);
    }
  }

  // ---------------- P0-1 投掷 ----------------

  /** 固定投掷：所有初始条件写死，可重复复现（无随机项）。 */
  private throwPreset(preset: ThrowPreset): void {
    if (this.paused || this.pendingPlayerRing || this.roundRings === 0) return;
    const tuning = this.ringSystem.tuning;
    const rotation = horizontalRingRotation();
    const origin = {
      x: gameConfig.throwOrigin.x,
      y: gameConfig.throwOrigin.y,
      z: gameConfig.throwOrigin.z,
    };
    const neck = getGooseNeckWorldPosition(this.testGoose);
    let spec: RingLaunchSpec;

    if (preset === 'drop' || preset === 'offset') {
      const offset = preset === 'offset' ? gameConfig.ring.offsetDistance : 0;
      const { head, collider } = gameConfig.goose;
      const clearance = preset === 'offset' ? gameConfig.ring.offsetClearance : gameConfig.ring.dropClearance;
      spec = {
        position: {
          x: neck.x + offset,
          y: head.y + collider.headRadius + clearance,
          z: neck.z,
        },
        rotation,
        linvel: { x: 0, y: 0, z: 0 },
        angvel: { x: 0, y: 0, z: 0 },
      };
    } else if (preset === 'fence') {
      // 朝远侧围栏低平抛出：验证薄栏碰撞与 CCD 不穿透。
      const speed = tuning.speed * PRESET_SPEED_FACTOR.fence;
      const elevation = (FENCE_PRESET_ELEVATION_DEG * Math.PI) / 180;
      spec = {
        position: origin,
        rotation,
        linvel: {
          x: 0,
          y: Math.sin(elevation) * speed,
          z: -Math.cos(elevation) * speed,
        },
        angvel: { x: 0, y: tuning.spin, z: 0 },
      };
    } else {
      const speed = tuning.speed * PRESET_SPEED_FACTOR[preset];
      spec = {
        position: origin,
        rotation,
        linvel: velocityToward(origin, neck, speed, tuning.elevationDeg),
        angvel: { x: 0, y: tuning.spin, z: 0 },
      };
    }

    this.launchRing(spec);
  }

  private launchRing(
    spec: RingLaunchSpec,
    tuning: RingTuning = this.ringSystem.tuning,
  ): ReturnType<RingSystem['launch']> {
    this.lastThrow = spec;
    this.lastTuning = { ...tuning };
    const body = this.ringSystem.launch(spec, tuning);
    this.throwCount++;
    this.judge = new RingJudge(this.gooseLayout, this.throwCount, {
      excludeIndices: [...this.caughtGeese],
    });
    this.lastJudgeOutcome = null;
    this.sound.play('throw');
    return body;
  }

  private replayThrow(): void {
    if (this.lastThrow && this.lastTuning && !this.paused && !this.pendingPlayerRing && this.roundRings !== 0) {
      this.launchRing(this.lastThrow, this.lastTuning);
    }
  }

  private onPointerDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    const { aimStart, safe } = this.layout;
    if (this.paused || this.pendingPlayerRing || this.roundRings === 0 || this.frozenPreview || this.drag
        || !aimStart || !e.isPrimary || e.button !== 0) return;
    const { left, top } = this.hud.surface.getBoundingClientRect();
    const x = e.clientX - left;
    const y = e.clientY - top;
    if (!containsPoint(aimStart, x, y)) {
      const ringStart = this.getRingStart();
      if (!ringStart || !containsPoint(ringStart, x, y)) return;
    }
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    this.sound.unlock();
    this.lastInputEvent = 'pointerdown';
    this.drag = {
      pointerId: e.pointerId,
      gesture: new ThrowGesture(
        { x: e.clientX, y: e.clientY, time: e.timeStamp },
        safe.width,
        safe.height,
        safe.y + safe.height - y,
        gameConfig.input,
      ),
    };
    this.panel.setCharge(0, 0);
    this.hud.setCharge(0, 0);
  }

  private getRingStart(): Rect | null {
    if (!this.layout.aimStart || this.pendingPlayerRing || this.roundRings === 0) return null;
    return computeRingStart(
      this.ringPreview.getHandBounds(this.scene.camera, this.layout.viewport),
      this.scene.getThrowLineBounds(),
      this.layout,
    );
  }

  private setAssist(enabled: boolean): void {
    this.assist = this.assistAvailable && enabled;
    this.panel.setAssist(this.assist, this.assistAvailable);
    this.hud.setAssist(this.assist, this.assistAvailable);
  }

  private onPointerMove(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (e.pointerId !== this.drag?.pointerId) return;
    if ((e.buttons & 1) === 0) {
      this.lastInputEvent = 'pointer-released';
      this.cancelDrag();
      return;
    }
    if (!canvas.hasPointerCapture(e.pointerId)) canvas.setPointerCapture(e.pointerId);
    for (const sample of e.getCoalescedEvents?.() ?? []) {
      this.drag.gesture.update({ x: sample.clientX, y: sample.clientY, time: sample.timeStamp });
    }
    this.drag.gesture.update({ x: e.clientX, y: e.clientY, time: e.timeStamp });
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.drag?.pointerId) return;
    const intent = this.drag.gesture.release({ x: e.clientX, y: e.clientY, time: e.timeStamp });
    this.cancelDrag();
    this.lastInputEvent = intent ? 'release' : 'release-cancelled';
    if (!intent) return;
    this.lastIntent = intent;
    this.pendingPlayerRing = this.launchRing(buildPlayerThrow(intent.charge, intent.aimRad, this.ringSystem.tuning));
    this.groundRestTime = 0;
    this.ringPreview.setVisible(false);
    this.hud.setWaitingForRing(true);
    if (this.roundRings !== null) {
      this.roundThrows++;
      this.roundRings--;
      this.hud.setRoundRings(this.roundRings);
    }
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    const { pointerId } = this.drag;
    this.drag = null;
    if (this.canvasEl?.hasPointerCapture(pointerId)) this.canvasEl.releasePointerCapture(pointerId);
    this.panel.setCharge(null);
    this.hud.setCharge(null);
  }

  /** 调试面板实时显示蓄力与偏转。 */
  private updateChargeHint(): void {
    if (this.frozenPreview) {
      this.panel.setCharge(this.frozenPreview.charge, this.frozenPreview.aimRad);
      this.hud.setCharge(this.frozenPreview.charge, this.frozenPreview.aimRad);
      return;
    }
    if (!this.drag) return;
    const intent = this.drag.gesture.preview(performance.now());
    this.panel.setCharge(intent.charge, intent.aimRad);
    this.hud.setCharge(intent.charge, intent.aimRad);
  }

  /** 交给 RingPreview 的当前输入态势（截图冻结态优先）。 */
  private buildPreviewState(): RingPreviewState {
    const tuning = this.ringSystem.tuning;
    const gestureIntent = this.drag?.gesture.preview(performance.now());
    const intent = this.frozenPreview ?? gestureIntent ?? { charge: 0, aimRad: 0 };
    return {
      charging: this.layout.aimStart !== null && (this.frozenPreview !== null || this.drag !== null),
      charge: intent.charge,
      aimRad: intent.aimRad,
      maxAimRad: THREE.MathUtils.degToRad(gameConfig.input.maxAimDeg),
      launch: buildPlayerThrow(intent.charge, intent.aimRad, tuning),
      linearDamping: tuning.linearDamping,
      assist: this.assist,
      mode: this.frozenPreview !== null ? 'pull' : gestureIntent?.mode ?? 'idle',
    };
  }

  // ---------------- P0-0 遗留工具 ----------------

  private spawnBall(x: number, z: number): void {
    const body = this.physics.spawnBall(x, z);
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.castShadow = true;
    mesh.visible = !this.previewClean;
    this.scene.scene.add(mesh);
    this.balls.push({ body, mesh });

    if (this.balls.length > gameConfig.ball.maxCount) {
      const oldest = this.balls.shift();
      if (oldest) {
        this.physics.removeBody(oldest.body);
        this.scene.scene.remove(oldest.mesh);
      }
    }
  }

  private spawnBallNearCenter(): void {
    const { width, depth } = gameConfig.fence;
    const x = (Math.random() - 0.5) * (width * 0.6);
    const z = (Math.random() - 0.5) * (depth * 0.6);
    this.spawnBall(x, z);
  }

  private clearBalls(): void {
    for (const b of this.balls) {
      this.physics.removeBody(b.body);
      this.scene.scene.remove(b.mesh);
    }
    this.balls = [];
  }

  private setPreviewClean(clean: boolean): void {
    this.previewClean = clean;
    for (const b of this.balls) {
      b.mesh.visible = !clean;
    }
  }

  private setUiSafeGuide(visible: boolean): void {
    this.hud.setGuideVisible(visible);
    if (visible) this.drawLayoutGuide();
  }

  private drawLayoutGuide(): void {
    this.hud.drawGuide(this.layout, this.scene.getProjectedBounds());
    this.hud.updateRingStartGuide(this.getRingStart());
  }

  /** 渲染网格与物理刚体每帧同步（AGENTS.md §6 的最小体现）。 */
  private syncBalls(): void {
    for (const { body, mesh } of this.balls) {
      const t = body.translation();
      mesh.position.set(t.x, t.y, t.z);
      const r = body.rotation();
      mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}

/** 从当前场的鹅中选离玩家最近的一只作为调试目标。 */
function pickTestGoose(layout: readonly GooseLayoutEntry[]): GooseLayoutEntry {
  return layout.reduce((best, cur) => (cur.z > best.z ? cur : best));
}
