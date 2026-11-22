import * as THREE from 'three';
import {
  gameConfig,
  cameraModes,
  type CameraMode,
  type CameraModeId,
} from '../config/gameConfig';
import {
  computeCameraPosition,
  derivePitchYaw,
  toVector3,
  type CameraState,
} from './cameraUtils';
import { createGoosePlaceholder } from '../goose/GoosePlaceholder';

/**
 * 3D 灰盒场景：地面、大围栏、灯光、灰盒鹅占位、投掷起点标记。
 * 相机支持正交 / 透视两种投影对比，姿态统一为 30° 俯视 + 0° 偏转。
 * 坐标约定：Y 向上、XZ 地面、Z+ 指向玩家（01_技术方案.md §3）。
 */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly groundMesh: THREE.Mesh;
  readonly fenceGroup: THREE.Group;
  readonly gooseGroup: THREE.Group;
  readonly throwMarker: THREE.Group;

  private readonly orthoCamera: THREE.OrthographicCamera;
  private readonly perspCamera: THREE.PerspectiveCamera;
  private activeCamera: THREE.Camera;
  private activeMode: CameraMode;

  private currentPitchDeg: number;
  private readonly currentYawDeg: number;
  private readonly lookTarget: THREE.Vector3;
  private aspect: number;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b8d4e8'); // 灰盒天空

    // ---- 相机：正交与透视各一台，按模式切换 ----
    this.aspect = window.innerWidth / window.innerHeight;
    const orthoMode = cameraModes[0] as Extract<CameraMode, { kind: 'ortho' }>;
    this.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.perspCamera = new THREE.PerspectiveCamera(25, this.aspect, 0.5, 200);
    this.activeMode = orthoMode;
    this.activeCamera = this.orthoCamera;

    this.currentPitchDeg = gameConfig.camera.pitchDeg;
    this.currentYawDeg = gameConfig.camera.yawDeg;
    this.lookTarget = toVector3(gameConfig.camera.target);

    // ---- 灯光：半球光提供天空/地面色差，侧向方向光产生方向性阴影 ----
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0xc9b48c, 0.55));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.32));

    const dir = new THREE.DirectionalLight(0xfff1da, 1.35);
    dir.position.set(-10, 16, 9); // 侧向斜光：柱子与鹅产生可辨认的投影
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -16;
    dir.shadow.camera.right = 16;
    dir.shadow.camera.top = 16;
    dir.shadow.camera.bottom = -16;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 60;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.02;
    this.scene.add(dir);

    // ---- 地面：外层大地 + 围栏内浅色地面，形成清晰的空间边界 ----
    const outerGeo = new THREE.PlaneGeometry(gameConfig.ground.sizeX, gameConfig.ground.sizeZ);
    this.groundMesh = new THREE.Mesh(
      outerGeo,
      new THREE.MeshLambertMaterial({ color: gameConfig.ground.outerColor }),
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    const innerGeo = new THREE.PlaneGeometry(gameConfig.fence.width, gameConfig.fence.depth);
    const innerGround = new THREE.Mesh(
      innerGeo,
      new THREE.MeshLambertMaterial({ color: gameConfig.ground.innerColor }),
    );
    innerGround.rotation.x = -Math.PI / 2;
    innerGround.position.y = 0.004;
    innerGround.receiveShadow = true;
    this.scene.add(innerGround);

    // 网格只铺在围栏内部，避免“无限平面地图”的观感
    this.scene.add(this.buildInnerGrid());

    // ---- 围栏（视觉主体，灰盒木质栏杆）----
    this.fenceGroup = this.buildFence();
    this.scene.add(this.fenceGroup);

    // ---- 灰盒鹅占位（检查立体尺度）----
    this.gooseGroup = new THREE.Group();
    for (const entry of gameConfig.goose.layout) {
      this.gooseGroup.add(createGoosePlaceholder(entry));
    }
    this.scene.add(this.gooseGroup);

    // ---- 玩家投掷起点标记（栏外近端，箭头指向 -Z）----
    this.throwMarker = this.buildThrowMarker();
    this.scene.add(this.throwMarker);

    this.applyCameraPose();
    window.addEventListener('resize', () => this.onResize());
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
    const pos = computeCameraPosition(
      this.currentPitchDeg,
      this.currentYawDeg,
      mode.distance,
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
    const mode = this.activeMode;
    if (mode.kind === 'ortho') {
      this.updateOrthoFrustum(mode.viewHeight);
    } else {
      this.perspCamera.aspect = this.aspect;
      this.perspCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** 围栏内 2m 网格，仅用于读距离，不横贯全屏。 */
  private buildInnerGrid(): THREE.LineSegments {
    const { width, depth } = gameConfig.fence;
    const step = 2;
    const y = 0.012;
    const points: number[] = [];
    for (let x = -width / 2; x <= width / 2 + 0.001; x += step) {
      points.push(x, y, -depth / 2, x, y, depth / 2);
    }
    for (let z = -depth / 2; z <= depth / 2 + 0.001; z += step) {
      points.push(-width / 2, y, z, width / 2, y, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const mat = new THREE.LineBasicMaterial({
      color: gameConfig.ground.gridColor,
      transparent: true,
      opacity: 0.55,
    });
    return new THREE.LineSegments(geo, mat);
  }

  /** 投掷起点：地面圆垫 + 指向栏内（-Z）的扁平箭头。 */
  private buildThrowMarker(): THREE.Group {
    const { x, z, padRadius } = gameConfig.throwOrigin;
    const group = new THREE.Group();

    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(padRadius, 32),
      new THREE.MeshLambertMaterial({ color: '#7fa8c9' }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.016, 0);
    group.add(pad);

    const arrowGeo = new THREE.BufferGeometry();
    arrowGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0, 0, -0.9, -0.38, 0, -0.15, 0.38, 0, -0.15],
        3,
      ),
    );
    arrowGeo.setIndex([0, 1, 2]);
    arrowGeo.computeVertexNormals();
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshLambertMaterial({ color: '#4f7fa8', side: THREE.DoubleSide }),
    );
    arrow.position.set(0, 0.02, 0);
    group.add(arrow);

    group.position.set(x, 0, z);
    return group;
  }

  /**
   * 木栏视觉：四角闭合、远/侧栏较高、玩家侧栏较低。
   * Collider 由 PhysicsWorld 依据同一配置逐侧建立，高度与视觉一致。
   */
  private buildFence(): THREE.Group {
    const { width, depth, farHeight, sideHeight, nearHeight, postSpacing, postSize } =
      gameConfig.fence;
    const group = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: '#8f6b4a' });
    const halfW = width / 2;
    const halfD = depth / 2;

    const addPost = (x: number, z: number, height: number) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), woodMat);
      post.position.set(x, height / 2, z);
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);
    };

    const xs: number[] = [];
    for (let x = -halfW; x <= halfW + 0.001; x += postSpacing) {
      xs.push(Math.min(x, halfW));
    }

    // 远侧（Z-）与近侧（Z+）立柱
    for (const x of xs) {
      addPost(x, -halfD, farHeight);
      addPost(x, halfD, nearHeight);
    }
    // 左右两侧立柱（跳过与前后边重合的角柱）
    for (let z = -halfD + postSpacing; z < halfD - 0.001; z += postSpacing) {
      addPost(-halfW, z, sideHeight);
      addPost(halfW, z, sideHeight);
    }

    const addRailX = (z: number, y: number) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.08), woodMat);
      rail.position.set(0, y, z);
      rail.castShadow = true;
      group.add(rail);
    };
    const addRailZ = (x: number, y: number) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, depth), woodMat);
      rail.position.set(x, y, 0);
      rail.castShadow = true;
      group.add(rail);
    };

    // 远栏与侧栏各两根横杆；近栏一根低横杆，避免遮挡栏内目标
    addRailX(-halfD, farHeight * 0.42);
    addRailX(-halfD, farHeight * 0.82);
    addRailZ(-halfW, sideHeight * 0.42);
    addRailZ(-halfW, sideHeight * 0.82);
    addRailZ(halfW, sideHeight * 0.42);
    addRailZ(halfW, sideHeight * 0.82);
    addRailX(halfD, nearHeight * 0.68);

    return group;
  }

  render(): void {
    this.renderer.render(this.scene, this.activeCamera);
  }
}
