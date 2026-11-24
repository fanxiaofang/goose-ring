import * as THREE from 'three';
import { gameConfig, cameraModes, type CameraModeId } from '../config/gameConfig';
import { GameScene } from '../scene/GameScene';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FixedStepAccumulator } from '../physics/fixedStep';
import { DebugPanel, FrameStats } from '../ui/DebugPanel';
import { SoundSynth } from '../audio/SoundSynth';
import { RingPreview, type RingPreviewState } from '../ring/RingPreview';
import { RingSystem, type RingLaunchSpec } from '../ring/RingSystem';
import {
  PRESET_SPEED_FACTOR,
  FENCE_PRESET_ELEVATION_DEG,
  THROW_PRESETS,
  type ThrowPreset,
} from '../ring/throwPresets';
import { horizontalRingRotation } from '../ring/ringGeometry';
import {
  aimLateralOffset,
  clampAimRad,
  speedFromCharge,
  velocityToward,
  velocityWithYaw,
} from '../ring/throwMath';
import {
  getGooseNeckWorldPosition,
  type GooseLayoutEntry,
} from '../goose/GoosePlaceholder';

interface BallEntry {
  body: import('@dimforge/rapier3d-compat').RigidBody;
  mesh: THREE.Mesh;
}

interface DragState {
  startX: number;
  /** pointerdown 时刻（performance.now），蓄力按真实按住时长计算。 */
  startTime: number;
  /** 当前偏转（弧度，正为 +X）。 */
  aimRad: number;
}

/**
 * 游戏生命周期主控：固定物理步长循环 + 渲染 + 输入 + 调试。
 * P0-1 范围：真实有孔套圈的物理投掷、可重复实验预设与参数调试；
 * 不做套中判定、不计分、不写正式数据（P0-2 才实现）。
 */
export class GameApp {
  private scene!: GameScene;
  private physics!: PhysicsWorld;
  private panel!: DebugPanel;
  private ringPreview!: RingPreview;
  private ringSystem!: RingSystem;
  private readonly sound = new SoundSynth();
  private throwCount = 0;
  private throwCountEl: HTMLElement | null = null;

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
  /** P0-1 实验目标：离玩家最近的静止鹅（单鹅模式下只有它）。 */
  private testGoose!: GooseLayoutEntry;
  /** 轨迹辅助开关：练习默认开；正式模式可关闭，只保留手持圈与力度反馈。 */
  private assist: boolean = gameConfig.ringPreview.assistDefault;
  /** 截图冻结态：?charge=0.8&aim=12 时保持蓄力预览，不响应指针。 */
  private frozenPreview: { charge: number; aimRad: number } | null = null;
  private canvasEl: HTMLCanvasElement | null = null;

  /** 复用向量，避免每 0.25 s 统计时新建对象。 */
  private drawBufferSize = new THREE.Vector2();

  async start(canvas: HTMLCanvasElement): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    this.canvasEl = canvas;

    // 单鹅实验模式：只保留离玩家最近的一只，视觉与 Collider 同步缩减。
    const singleGoose = params.get('geese') === 'single';
    this.testGoose = pickTestGoose();
    const layout = singleGoose ? [this.testGoose] : gameConfig.goose.layout;

    this.scene = new GameScene(canvas, layout);
    this.physics = await PhysicsWorld.create(this.scene.scene, layout);
    this.ringPreview = new RingPreview(this.scene.scene);
    this.ringSystem = new RingSystem(this.scene.scene, this.physics);

    // 支持 URL 指定相机模式，也可由调试面板切换。
    const requested = params.get('camera');
    if (requested && cameraModes.some((m) => m.id === requested)) {
      this.scene.setCameraMode(requested as CameraModeId);
    }

    this.panel = new DebugPanel(
      {
        onPitchChange: (deg) => {
          this.scene.setCameraPitch(deg);
          this.panel.setCameraState(this.scene.getCameraState());
        },
        onModeChange: (id) => {
          this.scene.setCameraMode(id);
          this.panel.setCameraState(this.scene.getCameraState());
        },
        onSpawnBall: () => this.spawnBallNearCenter(),
        onClearBalls: () => this.clearBalls(),
        onToggleDebugLines: (visible) => this.physics.setDebugVisible(visible),
        onTogglePreviewClean: (clean) => this.setPreviewClean(clean),
        onToggleAssist: (enabled) => {
          this.assist = enabled;
        },
        onToggleUiSafeGuide: (visible) => this.setUiSafeGuide(visible),
        onThrowPreset: (preset) => this.throwPreset(preset),
        onReplayThrow: () => this.replayThrow(),
        onClearRings: () => this.ringSystem.clear(),
        onRingTuningChange: (tuning) => Object.assign(this.ringSystem.tuning, tuning),
      },
      this.ringSystem.tuning,
    );
    this.panel.setCameraState(this.scene.getCameraState());

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
    if (params.get('assist') === '0') {
      this.assist = false;
      this.panel.setAssist(false);
    }
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
    // ?safe=1：显示正式 UI 安全区参考带，便于截图核对
    if (params.get('safe') === '1') this.setUiSafeGuide(true);

    this.bindThrowHud(params);

    // ?throw=drop|offset|soft|mid|hard|fence：固定投掷，可重复截图/复现
    const throwParam = params.get('throw');
    if (throwParam && THROW_PRESETS.includes(throwParam as ThrowPreset)) {
      window.setTimeout(() => this.throwPreset(throwParam as ThrowPreset), 600);
    }

    // 开发环境只读调试快照：用于验证落点/静止状态，不参与判定与正式数据
    if (import.meta.env.DEV) {
      (window as unknown as { __p01?: () => unknown }).__p01 = () => ({
        rings: this.ringSystem.snapshot(),
        timeScale: this.timeScale,
      });
    }

    // 鼠标 / 触摸统一走 Pointer Events：按住拖动蓄力，松手投掷
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e, canvas));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', () => this.cancelDrag());

    this.lastTime = performance.now();
    this.scene.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const now = performance.now();
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.25); // 切后台回来防跳变
    this.lastTime = now;
    const scaledDt = frameDt * this.timeScale;

    const steps = this.fixedStep.add(scaledDt);
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) this.physics.step();
    if (steps > 0) this.physicsMs = performance.now() - t0;

    this.syncBalls();
    this.ringSystem.update(scaledDt);
    this.updateChargeHint();
    this.ringPreview.update(frameDt, this.buildPreviewState());
    this.physics.updateDebugLines();
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

  // ---------------- P0-1 投掷 ----------------

  /** 固定投掷：所有初始条件写死，可重复复现（无随机项）。 */
  private throwPreset(preset: ThrowPreset): void {
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

  private launchRing(spec: RingLaunchSpec): void {
    this.lastThrow = spec;
    this.ringSystem.launch(spec);
    this.setThrowCount(this.throwCount + 1);
    this.sound.play('throw');
  }

  private replayThrow(): void {
    if (this.lastThrow) this.launchRing(this.lastThrow);
  }

  private onPointerDown(e: PointerEvent, canvas: HTMLCanvasElement): void {
    if (this.frozenPreview) return; // 截图冻结态不响应输入
    this.sound.unlock();
    this.drag = { startX: e.clientX, startTime: performance.now(), aimRad: 0 };
    canvas.setPointerCapture(e.pointerId);
    this.panel.setCharge(0, 0);
  }

  private bindThrowHud(params: URLSearchParams): void {
    const hud = document.getElementById('throw-hud')!;
    const debugPanel = document.getElementById('debug-panel')!;
    const debugToggle = document.getElementById('debug-toggle')!;
    const soundToggle = document.getElementById('sound-toggle')!;
    const clearField = document.getElementById('clear-field')!;
    this.throwCountEl = document.getElementById('throw-count');
    if (params.get('ui') === '0') return;

    const setDebugOpen = (open: boolean) => {
      debugPanel.hidden = !open;
      debugToggle.setAttribute('aria-expanded', String(open));
    };
    setDebugOpen(params.get('debug') === '1');
    debugToggle.addEventListener('click', () => setDebugOpen(debugPanel.hidden === true));
    soundToggle.addEventListener('click', () => {
      const enabled = soundToggle.getAttribute('aria-pressed') === 'false';
      soundToggle.setAttribute('aria-pressed', String(enabled));
      this.sound.setMuted(!enabled);
      if (enabled) this.sound.unlock();
    });
    clearField.addEventListener('click', () => {
      this.cancelDrag();
      this.clearBalls();
      this.ringSystem.clear();
      this.lastThrow = null;
      this.setThrowCount(0);
    });
    hud.hidden = false;
  }

  private setThrowCount(count: number): void {
    this.throwCount = count;
    if (this.throwCountEl) this.throwCountEl.textContent = String(count);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.drag || !this.canvasEl) return;
    const dx = e.clientX - this.drag.startX;
    // 横向拖动决定左右偏转：30% 画布宽打满 ±30°，避免甩出围栏。
    this.drag.aimRad = clampAimRad(
      dx,
      this.canvasEl.clientWidth,
      gameConfig.input.maxAimDeg,
      gameConfig.input.aimFullWidthRatio,
    );
    this.panel.setCharge(this.dragCharge(), this.drag.aimRad);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag) return;
    const charge = this.dragCharge();
    const aimRad = this.drag.aimRad;
    const dx = e.clientX - this.drag.startX;
    this.drag = null;
    this.panel.setCharge(null);

    // 轻点（蓄力很小且几乎没有横向拖动）视为误触，不投掷。
    if (charge < gameConfig.input.tapCancelCharge && Math.abs(dx) < gameConfig.input.tapCancelPx) {
      return;
    }

    const tuning = this.ringSystem.tuning;
    const speed = speedFromCharge(tuning.speed, charge, gameConfig.input.minSpeedFactor);
    // 出手点随瞄准横移，与 RingPreview 的滑移完全一致。
    const lateral = aimLateralOffset(
      aimRad,
      THREE.MathUtils.degToRad(gameConfig.input.maxAimDeg),
      gameConfig.input.aimLateralMax,
    );
    this.launchRing({
      position: {
        x: gameConfig.throwOrigin.x + lateral,
        y: gameConfig.throwOrigin.y,
        z: gameConfig.throwOrigin.z,
      },
      rotation: horizontalRingRotation(),
      linvel: velocityWithYaw(speed, tuning.elevationDeg, aimRad),
      angvel: { x: 0, y: tuning.spin, z: 0 },
    });
  }

  private cancelDrag(): void {
    this.drag = null;
    this.panel.setCharge(null);
  }

  /** 蓄力值完全由按住时长决定，不依赖渲染帧率。 */
  private dragCharge(): number {
    if (!this.drag) return 0;
    const heldSec = (performance.now() - this.drag.startTime) / 1000;
    return Math.min(1, heldSec * gameConfig.input.chargePerSec);
  }

  /** 调试面板实时显示蓄力与偏转。 */
  private updateChargeHint(): void {
    if (!this.drag) return;
    this.panel.setCharge(this.dragCharge(), this.drag.aimRad);
  }

  /** 交给 RingPreview 的当前输入态势（截图冻结态优先）。 */
  private buildPreviewState(): RingPreviewState {
    const tuning = this.ringSystem.tuning;
    const frozen = this.frozenPreview;
    return {
      charging: frozen !== null || this.drag !== null,
      charge: frozen ? frozen.charge : this.dragCharge(),
      aimRad: frozen ? frozen.aimRad : (this.drag?.aimRad ?? 0),
      maxAimRad: THREE.MathUtils.degToRad(gameConfig.input.maxAimDeg),
      maxSpeed: tuning.speed,
      elevationDeg: tuning.elevationDeg,
      assist: this.assist,
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

  /** 正式 UI 安全区参考带（仅调试参考，不属于正式界面）。 */
  private setUiSafeGuide(visible: boolean): void {
    const el = document.getElementById('ui-safe-guide');
    if (el) el.hidden = !visible;
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

/** 离玩家最近的鹅（Z 最大）作为 P0-1 单鹅实验目标。 */
function pickTestGoose(): GooseLayoutEntry {
  return gameConfig.goose.layout.reduce((best, cur) => (cur.z > best.z ? cur : best));
}
