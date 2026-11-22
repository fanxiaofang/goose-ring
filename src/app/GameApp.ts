import * as THREE from 'three';
import { gameConfig, cameraModes, type CameraModeId } from '../config/gameConfig';
import { GameScene } from '../scene/GameScene';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { DebugPanel, FrameStats } from '../ui/DebugPanel';

interface BallEntry {
  body: import('@dimforge/rapier3d-compat').RigidBody;
  mesh: THREE.Mesh;
}

/**
 * 游戏生命周期主控：固定物理步长循环 + 渲染 + 输入 + 调试。
 * P0-0 范围：场景、相机、测试球投放；无鹅、无套圈、无玩法。
 */
export class GameApp {
  private scene!: GameScene;
  private physics!: PhysicsWorld;
  private panel!: DebugPanel;

  private balls: BallEntry[] = [];
  private ballGeo = new THREE.SphereGeometry(gameConfig.ball.radius, 24, 16);
  private ballMat = new THREE.MeshLambertMaterial({ color: '#d94f4f' });
  /** 构图预览：隐藏测试球网格（物理仍在运行）。 */
  private previewClean = false;

  private accumulator = 0;
  private lastTime = 0;
  private physicsMs = 0;
  private fps = 0;
  private frameCount = 0;
  private statTimer = 0;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  async start(canvas: HTMLCanvasElement): Promise<void> {
    this.scene = new GameScene(canvas);
    this.physics = await PhysicsWorld.create(this.scene.scene);

    // 支持 URL 指定相机模式（便于固定 1280×720 截图对比）：?camera=ortho|persp25|persp35
    const requested = new URLSearchParams(window.location.search).get('camera');
    if (requested && cameraModes.some((m) => m.id === requested)) {
      this.scene.setCameraMode(requested as CameraModeId);
    }

    this.panel = new DebugPanel({
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
    });
    this.panel.setCameraState(this.scene.getCameraState());

    // ?ui=0：隐藏调试面板，便于截取纯场景构图（面板信息可由 URL 相机参数复现）
    if (new URLSearchParams(window.location.search).get('ui') === '0') {
      const panelEl = document.getElementById('debug-panel');
      if (panelEl) panelEl.style.display = 'none';
    }

    // 鼠标 / 触摸统一走 Pointer Events（AGENTS.md §9：触摸和鼠标同逻辑）
    canvas.addEventListener('pointerdown', (e) => {
      const hit = this.pickGroundPoint(e.clientX, e.clientY);
      if (hit) this.spawnBall(hit.x, hit.z);
    });

    this.lastTime = performance.now();
    this.scene.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const now = performance.now();
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.25); // 切后台回来防跳变
    this.lastTime = now;

    // 固定步长累加器：物理结果不随帧率变化（01_技术方案.md §5.1）
    this.accumulator += frameDt;
    let steps = 0;
    const t0 = performance.now();
    while (this.accumulator >= gameConfig.physics.fixedDt && steps < gameConfig.physics.maxCatchUpSteps) {
      this.physics.step();
      this.accumulator -= gameConfig.physics.fixedDt;
      steps++;
    }
    if (steps >= gameConfig.physics.maxCatchUpSteps) {
      this.accumulator = 0; // 放弃积压，避免死亡螺旋
    }
    if (steps > 0) this.physicsMs = performance.now() - t0;

    this.syncBalls();
    this.physics.updateDebugLines();
    this.scene.render();

    // 统计约 4 次/秒刷新
    this.frameCount++;
    this.statTimer += frameDt;
    if (this.statTimer >= 0.25) {
      this.fps = this.frameCount / this.statTimer;
      this.frameCount = 0;
      this.statTimer = 0;
      const stats: FrameStats = {
        fps: this.fps,
        physicsMs: this.physicsMs,
        ballCount: this.balls.length,
      };
      this.panel.updateStats(stats);
    }
  }

  /** 屏幕坐标 → 地面平面求交（3D 射线，不是二维距离）。 */
  private pickGroundPoint(clientX: number, clientY: number): { x: number; z: number } | null {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.scene.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    // 落点限制在围栏内（玩家应能看到球落在栏中的碰撞结果）
    const { width, depth } = gameConfig.fence;
    const margin = gameConfig.ball.radius + 0.1;
    return {
      x: THREE.MathUtils.clamp(hit.x, -width / 2 + margin, width / 2 - margin),
      z: THREE.MathUtils.clamp(hit.z, -depth / 2 + margin, depth / 2 - margin),
    };
  }

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
