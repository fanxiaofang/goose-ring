import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { computeCameraPosition, toVector3 } from './cameraUtils';

/**
 * 3D 灰盒场景：地面、大围栏、灯光、固定正交相机。
 * 坐标约定：Y 向上、XZ 地面、Z+ 指向玩家（01_技术方案.md §3）。
 */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly groundMesh: THREE.Mesh;
  readonly fenceGroup: THREE.Group;

  private currentPitchDeg: number;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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
    this.applyCameraPitch(this.currentPitchDeg);

    // ---- 灯光：环境光 + 一盏方向光带阴影 ----
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xfff4e0, 1.4);
    dir.position.set(10, 20, 8);
    dir.castShadow = true;
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    this.scene.add(dir);

    // ---- 地面（灰盒清洁地面 + 参考网格）----
    const groundGeo = new THREE.PlaneGeometry(gameConfig.ground.sizeX, gameConfig.ground.sizeZ);
    this.groundMesh = new THREE.Mesh(
      groundGeo,
      new THREE.MeshLambertMaterial({ color: '#d9c9a8' }),
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    const grid = new THREE.GridHelper(
      Math.max(gameConfig.ground.sizeX, gameConfig.ground.sizeZ),
      Math.max(gameConfig.ground.sizeX, gameConfig.ground.sizeZ),
      0x9a8a6a,
      0xbfae8a,
    );
    grid.position.y = 0.01;
    this.scene.add(grid);

    // ---- 围栏（视觉主体，灰盒木质栏杆）----
    this.fenceGroup = this.buildFence();
    this.scene.add(this.fenceGroup);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  /** 切换俯视角档位（30/38/45°）。正交投影下只改变观察方向，不改变可视尺寸。 */
  setCameraPitch(pitchDeg: number): void {
    this.currentPitchDeg = pitchDeg;
    this.applyCameraPitch(pitchDeg);
  }

  get pitchDeg(): number {
    return this.currentPitchDeg;
  }

  private applyCameraPitch(pitchDeg: number): void {
    const { distance, target } = gameConfig.camera;
    const pos = computeCameraPosition(pitchDeg, distance, target);
    this.camera.position.copy(toVector3(pos));
    this.camera.lookAt(toVector3(target));
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

  /** 木栏视觉：四角与边等距立柱 + 每侧两根横杆。Collider 由 PhysicsWorld 用相同尺寸建立。 */
  private buildFence(): THREE.Group {
    const { width, depth, height, postSpacing } = gameConfig.fence;
    const group = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: '#8f6b4a' });
    const postGeo = new THREE.BoxGeometry(0.14, height, 0.14);

    const postXs: number[] = [];
    for (let x = -width / 2; x <= width / 2 + 0.01; x += postSpacing) {
      postXs.push(Math.min(x, width / 2));
    }
    const postZs: number[] = [];
    for (let z = -depth / 2; z <= depth / 2 + 0.01; z += postSpacing) {
      postZs.push(Math.min(z, depth / 2));
    }

    const addPost = (x: number, z: number) => {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(x, height / 2, z);
      post.castShadow = true;
      group.add(post);
    };
    for (const x of postXs) {
      addPost(x, -depth / 2);
      addPost(x, depth / 2);
    }
    for (const z of postZs.slice(1, -1)) {
      addPost(-width / 2, z);
      addPost(width / 2, z);
    }

    // 每侧两根横杆（低 0.3 / 高 0.65），与物理墙高度一致
    const railYs = [0.3, 0.65];
    for (const y of railYs) {
      const railX = new THREE.Mesh(new THREE.BoxGeometry(width, 0.09, 0.09), woodMat);
      railX.position.set(0, y, -depth / 2);
      group.add(railX);
      const railX2 = railX.clone();
      railX2.position.z = depth / 2;
      group.add(railX2);
      const railZ = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, depth), woodMat);
      railZ.position.set(-width / 2, y, 0);
      group.add(railZ);
      const railZ2 = railZ.clone();
      railZ2.position.x = width / 2;
      group.add(railZ2);
    }
    return group;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
