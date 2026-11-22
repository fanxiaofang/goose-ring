import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { computeCameraPosition, derivePitchYaw, toVector3, CameraPose } from './cameraUtils';
import { createGoosePlaceholder } from '../goose/GoosePlaceholder';

/**
 * 3D 灰盒场景：地面、大围栏、灯光、灰盒鹅占位、固定正交相机。
 * 坐标约定：Y 向上、XZ 地面、Z+ 指向玩家（01_技术方案.md §3）。
 */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly groundMesh: THREE.Mesh;
  readonly fenceGroup: THREE.Group;
  readonly gooseGroup: THREE.Group;

  private currentPitchDeg: number;
  private currentYawDeg: number;
  private readonly lookTarget: THREE.Vector3;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b8d4e8'); // 灰盒天空

    // ---- 相机：固定正交，横屏 16:9 基线 ----
    const aspect = window.innerWidth / window.innerHeight;
    const h = gameConfig.camera.viewHeight;
    this.camera = new THREE.OrthographicCamera(
      (-h * aspect) / 2,
      (h * aspect) / 2,
      h / 2,
      -h / 2,
      0.1,
      200,
    );
    this.currentPitchDeg = gameConfig.camera.pitchDeg;
    this.currentYawDeg = gameConfig.camera.yawDeg;
    this.lookTarget = toVector3(gameConfig.camera.target);
    this.applyCameraPose();

    // ---- 灯光：半球光提供天空/地面色差，侧向方向光产生方向性阴影 ----
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0xc9b48c, 0.55));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

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

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  /** 切换俯视角档位（30/38/45°）。 */
  setCameraPitch(pitchDeg: number): void {
    this.currentPitchDeg = pitchDeg;
    this.applyCameraPose();
  }

  /** 切换水平偏转角档位（0/12/18°）。 */
  setCameraYaw(yawDeg: number): void {
    this.currentYawDeg = yawDeg;
    this.applyCameraPose();
  }

  /** 从相机真实位置反解的角度，供调试面板回显。 */
  getCameraPose(): CameraPose {
    return derivePitchYaw(
      { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
      { x: this.lookTarget.x, y: this.lookTarget.y, z: this.lookTarget.z },
    );
  }

  private applyCameraPose(): void {
    const { distance, target } = gameConfig.camera;
    const pos = computeCameraPosition(this.currentPitchDeg, this.currentYawDeg, distance, target);
    this.camera.position.copy(toVector3(pos));
    this.camera.lookAt(this.lookTarget);
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    const vh = gameConfig.camera.viewHeight;
    this.camera.left = (-vh * aspect) / 2;
    this.camera.right = (vh * aspect) / 2;
    this.camera.top = vh / 2;
    this.camera.bottom = -vh / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
    this.renderer.render(this.scene, this.camera);
  }
}
