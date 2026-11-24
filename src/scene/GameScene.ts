import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  gameConfig,
  cameraModes,
  type CameraMode,
  type CameraModeId,
} from '../config/gameConfig';
import {
  computeAdaptivePerspectiveDistance,
  computeCameraPosition,
  derivePitchYaw,
  toVector3,
  type CameraState,
} from './cameraUtils';
import { createGoosePlaceholder, type GooseLayoutEntry } from '../goose/GoosePlaceholder';
import { buildStallScene } from './stallScene';
import { createSimpleTextures } from './stallTextures';

/**
 * 3D 庙会摊位与当前鹅模型的渲染场景。
 * 相机支持正交 / 透视两种投影对比，姿态统一为 30° 俯视 + 0° 偏转。
 * 坐标约定：Y 向上、XZ 地面、Z+ 指向玩家（01_技术方案.md §3）。
 */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly gooseGroup: THREE.Group;

  private readonly orthoCamera: THREE.OrthographicCamera;
  private readonly perspCamera: THREE.PerspectiveCamera;
  private activeCamera: THREE.Camera;
  private activeMode: CameraMode;

  private currentPitchDeg: number;
  private readonly currentYawDeg: number;
  private readonly lookTarget: THREE.Vector3;
  private aspect: number;

  constructor(
    canvas: HTMLCanvasElement,
    gooseLayout: readonly GooseLayoutEntry[] = gameConfig.goose.layout,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, gameConfig.render.maxPixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.shadowMap.enabled = true;
    // Three r187 已移除 PCFSoftShadowMap，使用 PCF（与阴影贴图 2048 配合）。
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    // 俯视视角看不到天空，背景色只在地面裁切边缘兜底；远处用同色薄雾过渡。
    this.scene.background = new THREE.Color(gameConfig.sky.horizon);
    this.scene.fog = new THREE.Fog(
      gameConfig.sky.fog,
      gameConfig.sky.fogNear,
      gameConfig.sky.fogFar,
    );
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(environment, 0.04, 0.1, 100, { size: 128 }).texture;
    this.scene.environmentIntensity = 0.18;
    environment.dispose();
    pmrem.dispose();

    // ---- 相机：正交与透视各一台，按模式切换 ----
    this.aspect = window.innerWidth / window.innerHeight;
    const defaultMode = cameraModes.find((mode) => mode.id === gameConfig.camera.defaultMode)!;
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    // 窄视场长焦透视：保留近大远小纵深，避免广角畸变；near/far 覆盖自适应后拉范围。
    this.perspCamera = new THREE.PerspectiveCamera(30, this.aspect, 0.1, 80);
    this.activeMode = defaultMode;
    this.activeCamera = defaultMode.kind === 'ortho' ? this.orthoCamera : this.perspCamera;

    this.currentPitchDeg = gameConfig.camera.pitchDeg;
    this.currentYawDeg = gameConfig.camera.yawDeg;
    this.lookTarget = toVector3(gameConfig.camera.target);

    // ---- 灯光：冷调天空光 + 暖色斜阳，强化鹅与木栏的体积感和投影 ----
    const light = gameConfig.lighting;
    this.scene.add(
      new THREE.HemisphereLight(light.hemiSky, light.hemiGround, light.hemiIntensity),
    );
    const rim = new THREE.DirectionalLight(light.rimColor, light.rimIntensity);
    rim.position.set(light.rimPosition.x, light.rimPosition.y, light.rimPosition.z);
    this.scene.add(rim);

    const dir = new THREE.DirectionalLight(light.sun, light.sunIntensity);
    dir.position.set(light.sunPosition.x, light.sunPosition.y, light.sunPosition.z);
    dir.castShadow = true;
    dir.shadow.mapSize.set(gameConfig.render.shadowMapSize, gameConfig.render.shadowMapSize);
    dir.shadow.camera.left = -16;
    dir.shadow.camera.right = 16;
    dir.shadow.camera.top = 16;
    dir.shadow.camera.bottom = -16;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 60;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.02;
    dir.shadow.radius = light.shadowRadius;
    this.scene.add(dir);

    const textures = createSimpleTextures();
    const maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    for (const texture of Object.values(textures)) texture.anisotropy = maxAnisotropy;
    this.scene.add(buildStallScene(textures).stallGroup);

    // ---- 灰盒鹅占位（检查立体尺度）----
    this.gooseGroup = new THREE.Group();
    for (const entry of gooseLayout) {
      this.gooseGroup.add(createGoosePlaceholder(entry));
    }
    this.scene.add(this.gooseGroup);

    window.addEventListener('resize', () => this.onResize());
    // 初次同步尺寸与相机姿态（onResize 内部会调用 applyCameraPose）。
    this.onResize();
  }

  /** 当前生效的相机（正交或透视）。 */
  get camera(): THREE.Camera {
    return this.activeCamera;
  }

  get modeId(): CameraModeId {
    return this.activeMode.id;
  }

  setCameraMode(id: CameraModeId): void {
    const mode = cameraModes.find((m) => m.id === id);
    if (!mode) return;
    this.activeMode = mode;
    this.activeCamera = mode.kind === 'ortho' ? this.orthoCamera : this.perspCamera;
    this.applyCameraPose();
  }

  setCameraPitch(pitchDeg: number): void {
    this.currentPitchDeg = pitchDeg;
    this.applyCameraPose();
  }

  /** 从相机真实位置反解的角度与当前投影参数，供调试面板回显。 */
  getCameraState(): CameraState {
    const mode = this.activeMode;
    const pose = derivePitchYaw(
      {
        x: this.activeCamera.position.x,
        y: this.activeCamera.position.y,
        z: this.activeCamera.position.z,
      },
      { x: this.lookTarget.x, y: this.lookTarget.y, z: this.lookTarget.z },
    );
    return {
      ...pose,
      modeId: mode.id,
      modeLabel: mode.label,
      kind: mode.kind,
      viewHeight: mode.kind === 'ortho' ? mode.viewHeight : undefined,
      fov: mode.kind === 'persp' ? mode.fov : undefined,
    };
  }

  private applyCameraPose(): void {
    const { target } = gameConfig.camera;
    const mode = this.activeMode;
    // 透视模式按屏幕宽高比沿同一俯仰射线后拉，保证整个围栏完整入画；正交模式保持设计距离。
    const distance =
      mode.kind === 'persp'
        ? computeAdaptivePerspectiveDistance({
            baseDistance: mode.distance,
            fovDeg: mode.fov,
            pitchDeg: this.currentPitchDeg,
            yawDeg: this.currentYawDeg,
            aspect: this.aspect,
            target,
            fenceWidth: gameConfig.fence.width,
            fenceDepth: gameConfig.fence.depth,
            ...(mode.id === 'persp30' && {
              postSize: gameConfig.fence.postSize,
              throwLine: gameConfig.throwLine,
              margin: 1.1,
            }),
            fenceHeight: Math.max(
              gameConfig.fence.farHeight,
              gameConfig.fence.sideHeight,
              gameConfig.fence.nearHeight,
            ),
          })
        : mode.distance;
    const pos = computeCameraPosition(
      this.currentPitchDeg,
      this.currentYawDeg,
      distance,
      target,
    );
    const vpos = toVector3(pos);
    if (mode.kind === 'ortho') {
      this.orthoCamera.position.copy(vpos);
      this.orthoCamera.lookAt(this.lookTarget);
      this.updateOrthoFrustum(mode.viewHeight);
      this.activeCamera = this.orthoCamera;
    } else {
      this.perspCamera.position.copy(vpos);
      this.perspCamera.lookAt(this.lookTarget);
      this.perspCamera.fov = mode.fov;
      this.perspCamera.aspect = this.aspect;
      this.perspCamera.updateProjectionMatrix();
      this.activeCamera = this.perspCamera;
    }
  }

  private updateOrthoFrustum(viewHeight: number): void {
    this.orthoCamera.left = (-viewHeight * this.aspect) / 2;
    this.orthoCamera.right = (viewHeight * this.aspect) / 2;
    this.orthoCamera.top = viewHeight / 2;
    this.orthoCamera.bottom = -viewHeight / 2;
    this.orthoCamera.updateProjectionMatrix();
  }

  private onResize(): void {
    this.aspect = window.innerWidth / window.innerHeight;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // 宽高比变化会改变透视模式的所需距离，统一重算相机姿态。
    this.applyCameraPose();
  }

  render(): void {
    this.renderer.render(this.scene, this.activeCamera);
  }
}
