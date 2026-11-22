/**
 * P0-0 实验参数集中配置。
 * 依据 docs/agent-plan/04_决策与参数.md：所有【待测】数值均为实验起点，不写死在逻辑里。
 */

export type CameraModeId = 'ortho' | 'persp25' | 'persp35';

export interface OrthoCameraMode {
  id: CameraModeId;
  label: string;
  kind: 'ortho';
  /** 相机到注视点距离（正交下只影响裁剪）。 */
  distance: number;
  /** 正交可视高度（米），16:9 下宽度 ≈ viewHeight × 1.778。 */
  viewHeight: number;
}

export interface PerspectiveCameraMode {
  id: CameraModeId;
  label: string;
  kind: 'persp';
  distance: number;
  /** 垂直 FOV（度）。 */
  fov: number;
}

export type CameraMode = OrthoCameraMode | PerspectiveCameraMode;

/**
 * 相机对比模式（P0-0 投影实验）：
 * 三种模式统一 30° 俯视 + 0° 偏转，只改变投影方式与距离。
 * 构图收紧：正交可视高 9.8 m、注视点 z=0.4，
 * 让围栏顶部贴住 12% UI 安全区、前栏杆落到约 73% 屏高；
 * 透视距离按“注视点平面可视高度 ≈ 正交 9.8 m”估算（d ≈ 9.8 / (2×tan(fov/2))），
 * 近边宽度差异属透视本身特性。
 */
export const cameraModes: CameraMode[] = [
  { id: 'ortho', label: 'A 正交', kind: 'ortho', distance: 26, viewHeight: 9.8 },
  { id: 'persp25', label: 'B 透视25°', kind: 'persp', distance: 19.9, fov: 25 },
  { id: 'persp35', label: 'C 透视35°', kind: 'persp', distance: 14.0, fov: 35 },
];

export const gameConfig = {
  camera: {
    /** 俯视角（相机相对水平面的仰高角，度）。 */
    pitchDeg: 30,
    pitchOptionsDeg: [30, 38, 45] as number[],
    /** 水平偏转角固定 0°：围栏前后边在屏幕上保持水平。 */
    yawDeg: 0,
    /** 注视点：略向玩家侧，兼顾顶部 UI 区与前栏杆位置。 */
    target: { x: 0, y: 0.4, z: 0.4 },
  },
  physics: {
    gravityY: -9.81,
    /** 固定物理步长（技术方案 §5.1：1/60 s）。 */
    fixedDt: 1 / 60,
    /** 帧率暴跌时最多补多少个物理步，防止死亡螺旋。 */
    maxCatchUpSteps: 5,
  },
  /** 渲染性能相关参数（集中配置，便于按设备档位调整）。 */
  render: {
    /** 方向光阴影贴图边长（2048 对移动端可能偏重，待真机测量）。 */
    shadowMapSize: 2048,
    /** 设备像素比上限：DPR 1.5 时 1280×720 CSS 会渲染约 1899×939 像素。 */
    maxPixelRatio: 2,
  },
  fence: {
    /** 围栏宽（X，米）。 */
    width: 16,
    /** 围栏深（Z，米）。Z+ 为玩家一侧。 */
    depth: 10,
    /** 远侧（Z-）栏高：形成侧向可见面，提供纵深线索。 */
    farHeight: 1.05,
    /** 左右侧栏高。 */
    sideHeight: 1.05,
    /** 玩家侧（Z+）栏高：压低避免遮挡栏内目标与落地反馈。 */
    nearHeight: 0.5,
    postSpacing: 2,
    postSize: 0.14,
  },
  ground: {
    sizeX: 80,
    sizeZ: 60,
    outerColor: '#c2ad88',
    innerColor: '#e6d8ba',
    gridColor: '#bfa980',
  },
  /** 玩家投掷起点标记：围栏外近端，箭头指向栏内（-Z）。 */
  throwOrigin: {
    x: 0,
    z: 6.6,
    padRadius: 0.72,
  },
  /** P0-0 灰盒鹅占位：仅用于检查立体尺度，非正式鹅模型。 */
  goose: {
    /**
     * 8 只鹅按前/中/后三段深度分布（Z 负为远、正为近），
     * 中轴留空作为投掷通道，避免互相遮挡。
     */
    layout: [
      // 后段（Z ≈ -3.6 ~ -3.0）
      { x: -5.8, z: -3.4, rotY: 0.35 },
      { x: -1.6, z: -3.6, rotY: -0.2 },
      { x: 4.0, z: -3.1, rotY: 0.25 },
      // 中段（Z ≈ -1.0 ~ 0.2）
      { x: -4.6, z: -0.5, rotY: 0.55 },
      { x: 0.6, z: -1.0, rotY: -0.35 },
      { x: 5.4, z: -0.2, rotY: 0.15 },
      // 前段（Z ≈ 2.0 ~ 3.0，最靠近玩家）
      { x: -2.6, z: 2.6, rotY: -0.5 },
      { x: 3.2, z: 2.1, rotY: 0.4 },
    ],
    body: { rx: 0.44, ry: 0.3, rz: 0.32, y: 0.34 },
    /** 脖子：从身体前上方弯到头部；forward 为颈部中心相对身体的前移量。 */
    neck: { radius: 0.078, y: 0.65, forward: 0.17 },
    head: { radius: 0.135, y: 0.94, forward: 0.2 },
    /** 静态碰撞体近似尺寸（P0-2 再换成随动画同步的正式头颈 Collider）。 */
    collider: { bodyRadius: 0.32, neckRadius: 0.1, neckHalfHeight: 0.2, headRadius: 0.15 },
  },
  ball: {
    radius: 0.3,
    restitution: 0.55,
    friction: 0.9,
    /** 点击投放时球离地高度（米）。 */
    spawnHeight: 5,
    /** 场上测试球上限，超出回收最旧的（P0-0 资源清理验证）。 */
    maxCount: 60,
  },
  /**
   * P0-1 真实套圈物理参数（全部为实验起点，见 04_决策与参数.md）。
   * 环体由 16 段胶囊围成，内孔真实空出；不参与套中判定（P0-2 才做）。
   */
  ring: {
    /** 环中心线半径（米）；内孔半径 = radius - tubeRadius。 */
    radius: 0.42,
    /** 环管半径（米），也是胶囊碰撞体半径。 */
    tubeRadius: 0.045,
    /** 碰撞胶囊段数：段间重叠，内孔连续。 */
    segments: 16,
    /** 环体总质量（kg，按段均分到各 Collider）。 */
    mass: 0.25,
    /** 恢复系数（地面/围栏/鹅体通用起点）。 */
    restitution: 0.3,
    friction: 0.6,
    linearDamping: 0.05,
    angularDamping: 0.05,
    /** 出手高度（米）。 */
    releaseHeight: 1.0,
    /** 拖拽投掷的最大初速度（m/s）。 */
    speed: 11,
    /** 初始抛射仰角（度）。 */
    elevationDeg: 25,
    /** 自旋角速度（rad/s，绕世界 Y 轴）。 */
    spin: 10,
    /** 场上套圈上限，超出回收最旧的。 */
    maxCount: 12,
    /** 高速投掷启用 CCD，防止穿过 0.08 m 薄栏。 */
    ccd: true,
    /** 垂直落颈测试的出手高度（米）。 */
    dropHeight: 1.7,
    /** 偏移落颈测试高度与水平偏移（米），用于撞头/撞颈验证。 */
    offsetHeight: 1.5,
    offsetDistance: 0.3,
    /** 静止超过该秒数后回收，避免长期堆积。 */
    sleepRecycleSec: 8,
  },
  /**
   * 套圈飞行预览（纯视觉，不参与物理与命中判定）。
   * 用于判断玩家能否读懂飞行纵深、落点与鹅脖位置。
   */
  ringPreview: {
    ringRadius: 0.42,
    tubeRadius: 0.045,
    /** 出手高度（米）。 */
    releaseHeight: 1.0,
    /** 抛物线中点相对两端连线上抬高度（米）。 */
    arcLift: 2.2,
    durationSec: 1.15,
    holdSec: 1.6,
    fadeSec: 0.35,
  },
} as const;
