/**
 * P0-0 实验参数集中配置。
 * 依据 docs/agent-plan/04_决策与参数.md：所有【待测】数值均为实验起点，不写死在逻辑里。
 */

export type CameraModeId = 'ortho' | 'persp25' | 'persp30' | 'persp35';

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
 * 各档默认 30° 俯视 + 0° 偏转，供投影视角与距离对比。
 * 构图收紧：正交可视高 9.8 m，注视点略靠近玩家，
 * 让围栏顶部贴住 12% UI 安全区、前栏杆落到约 73% 屏高；
 * 透视距离按“注视点平面可视高度 ≈ 正交 9.8 m”估算（d ≈ 9.8 / (2×tan(fov/2))），
 * 近边宽度差异属透视本身特性。
 */
export const cameraModes: CameraMode[] = [
  { id: 'ortho', label: 'A 正交', kind: 'ortho', distance: 26, viewHeight: 9.8 },
  { id: 'persp25', label: 'B 透视25°', kind: 'persp', distance: 19.9, fov: 25 },
  { id: 'persp30', label: '透视30°', kind: 'persp', distance: 18.3, fov: 30 },
  { id: 'persp35', label: 'C 透视35°', kind: 'persp', distance: 14.0, fov: 35 },
];

// Use the same radii for the visible head and neck and their Rapier colliders.
const gooseHeadRadius = 0.216;
const gooseNeckRadius = 0.1296;

export const gameConfig = {
  camera: {
    defaultMode: 'persp30' as CameraModeId,
    /** 俯视角（相机相对水平面的仰高角，度）。 */
    pitchDeg: 30,
    pitchOptionsDeg: [30, 38, 45] as number[],
    /** 水平偏转角固定 0°：围栏前后边在屏幕上保持水平。 */
    yawDeg: 0,
    /** 注视点：略向玩家侧，兼顾顶部 UI 区与前栏杆位置。 */
    target: { x: 0, y: 0.4, z: 0.65 },
  },
  physics: {
    gravityY: -9.81,
    /** 固定物理步长（技术方案 §5.1：1/60 s）。 */
    fixedDt: 1 / 60,
    /** 帧率暴跌时最多补多少个物理步，防止死亡螺旋。 */
    maxCatchUpSteps: 5,
  },
  /** 天空不可见（俯视视角全是地面），仅保留背景色与远处薄雾。 */
  sky: {
    horizon: '#f3efe6',
    fog: '#f3efe6',
    fogNear: 32,
    fogFar: 64,
  },
  /** 摊位日光与草地反射补光。 */
  lighting: {
    hemiSky: '#fff6e5',
    hemiGround: '#5c6b4d',
    hemiIntensity: 0.4,
    rimColor: '#ffe9cc',
    rimIntensity: 0.24,
    rimPosition: { x: -7.2, y: 10.4, z: -12.8 },
    sun: '#fff2dc',
    sunIntensity: 1.25,
    sunPosition: { x: 8.8, y: 18.4, z: 10.88 },
    shadowRadius: 1.8,
  },
  render: {
    /** 方向光阴影贴图边长（2048 对移动端可能偏重，待真机测量）。 */
    shadowMapSize: 2048,
    /** 设备像素比上限：DPR 1.5 时 1280×720 CSS 会渲染约 1899×939 像素。 */
    maxPixelRatio: 2,
  },
  fence: {
    /** 围栏宽（X，米）。 */
    width: 14,
    /** 围栏深（Z，米）。Z+ 为玩家一侧。 */
    depth: 10,
    /** 远侧（Z-）栏高：形成侧向可见面，提供纵深线索。 */
    farHeight: 1.05,
    /** 左右侧栏高。 */
    sideHeight: 1.05,
    /** 玩家侧（Z+）栏高：压低避免遮挡栏内目标与落地反馈。 */
    nearHeight: 0.7,
    /** 角柱石脚的最大横向包络，供默认透视取景。 */
    postSize: 0.62,
  },
  ground: {
    sizeX: 80,
    sizeZ: 60,
  },
  /**
   * 玩家出手点：绝对坐标 z=6.10、离地 1.85 m 的悬浮套圈位置。
   * 近栏 z=5.0、投掷线 z=5.55（围栏 depth=10），出手点在投掷线后 0.55 m，
   * 读作“玩家站在线后、手里举着圈”；横向随瞄准滑移（见 input.aimLateralMax）。
   * 出手点为绝对坐标，不随围栏尺寸缩放，保证物理弹道稳定。
   */
  throwOrigin: {
    x: 0,
    y: 1.85,
    z: 6.1,
  },
  /**
   * 投掷输入（P0-1 手感打磨）：按住蓄力、横向拖动瞄准、松手投掷。
   * 全部为实验起点，见 docs/agent-plan/04_决策与参数.md。
   */
  input: {
    /** 左右最大偏转（度）：±40°。 */
    maxAimDeg: 40,
    /** 横向拖动达到起手时安全区宽度的该比例时打满偏转。 */
    aimFullWidthRatio: 0.2,
    /** 手持圈最大横移（米，±40° 时正好到达 ±该值）。 */
    aimLateralMax: 1.15,
    /** 每秒蓄力增量（charge 0 → 1，约 1.72 s 充满）。 */
    chargePerSec: 0.58,
    /** 松手时保留的最低速度比例（charge = 0 时）。 */
    minSpeedFactor: 0.35,
    /** 无明确竖向动作时，至少按住这么久才出手（毫秒）。 */
    minHoldMs: 175,
    /** 从下拉回到起点时，判断是否仍有横向瞄准（CSS px）。 */
    aimIntentPx: 8,
    /** 区分有意拉动与轻触抖动的竖向位移。 */
    intentPx: 10,
    /** 正常抓圈满力下拉距离占安全区高度的比例。 */
    pullHeightRatio: 0.25,
    /** 底带允许轻拉，较短余量也不把小位移放大成满力（CSS px）。 */
    minPullFullDistancePx: 72,
    /** 前甩的满力距离。短拨使用距离比例的平方限制速度贡献（CSS px）。 */
    flickFullChargeDistancePx: 88,
    /** 明确上拨在末段速度较低时的基础力度。 */
    flickMinCharge: 0.16,
    flickWindowMs: 90,
    /** 近期向上速度，单位 CSS px/s。 */
    flickMinSpeed: 180,
    flickFullSpeed: 1500,
  },
  /** 站位垫前缘和横木的世界尺寸，供布景和取景使用。 */
  throwLine: {
    /** 近栏外沿再向玩家一侧偏移（米）。0.55→0.43（2026-11-26）：围栏收窄后相机拉近，站位线在 844×390 仅距底部起手带 5.2px，后移 0.12m 补足 PL-04 的 ≥8px。纯视觉标记，不参与碰撞。 */
    offsetZ: 0.43,
    width: 5.74,
    depth: 0.18,
  },
  /** P0-0 灰盒鹅占位：仅用于检查立体尺度，非正式鹅模型。 */
  goose: {
    practicePosition: { x: 0, z: -1.5, rotY: 0 },
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
    /**
     * 静态场站位：按"简单 / 适中 / 比较有难度"三档，以离玩家距离划分（Z 越负越远越难），
     * 每档内横向位置与朝向随机打散，避免 8 只齐刷刷朝向玩家的"列队盯人"观感。
     * 相邻最近间距 ≥2.4 m（鹅身直径 1.08 m），x 最外 6.0 m，距侧栏 1.0 m。
     * 改任一位置或 rotY 都会移动头颈目标点，必须用真实 Rapier 重新采样套中真值。
     */
    staticLayout: [
      // 简单（Z ≈ 2.1 ~ 2.5，最近，轻投即可）
      { x: -3.0, z: 2.5, rotY: 1.9 },
      { x: 1.2, z: 2.1, rotY: -2.3 },
      // 适中（Z ≈ -1.3 ~ -0.4，中投）
      { x: -5.4, z: -0.6, rotY: 0.6 },
      { x: -0.8, z: -1.3, rotY: -1.4 },
      { x: 3.4, z: -0.4, rotY: 2.7 },
      // 比较有难度（Z ≈ -3.5 ~ -3.0，接近满力）
      { x: -2.6, z: -3.5, rotY: -0.9 },
      { x: 5.0, z: -3.2, rotY: 1.3 },
      { x: -6.0, z: -3.0, rotY: -2.6 },
    ],
    body: { rx: 0.54, ry: 0.38, rz: 0.58, y: 0.48 },
    /** 脖子：从身体前上方弯到头部；forward 为颈部中心相对身体的前移量。 */
    neck: { radius: gooseNeckRadius, y: 1.15, forward: 0.34 },
    head: { radius: gooseHeadRadius, y: 1.6, forward: 0.39 },
    /** 静态碰撞体近似尺寸（P0-2 再换成随动画同步的正式头颈 Collider）。 */
    collider: { bodyRadius: 0.43, neckRadius: gooseNeckRadius, neckHalfHeight: 0.35, headRadius: gooseHeadRadius },
  },
  /**
   * P0-2 套中判定（RingJudge）。规则依据 GDD §229 与 01_技术方案 §6.1。
   */
  judge: {
    /** 入颈后需保持的稳定时长（秒）。几何上环被身体卡住不会掉，0.25s 足够滤掉擦边滑脱。 */
    settleSeconds: 0.25,
    /**
     * 环平面法线与竖直方向的允许夹角（度）；超出视为侧向穿入。
     * 斜抛下落时环管会贴着鹅头侧面滑过，实测鹅头穿越瞬间环最多倾斜约 69°，
     * 因此 55° 会误杀合法套中；75° 仍能排除接近竖直的侧向穿颈。
     */
    maxTiltDeg: 75,
    /** 低于该线速度视为“基本静止”（m/s），用于识别停在鹅头/鹅身上的环。 */
    restSpeed: 0.25,
    /** 持续静止多久判 MISSED（秒）。 */
    restSeconds: 0.4,
    /** 鹅体接触在多久内仍可作为失败归因（秒）。斜抛会贴着头侧滑入颈，接触不能立即判负。 */
    contactMemorySeconds: 0.5,
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
   * 环体由 16 段胶囊围成，内孔真实空出；套中判定由 P0-2 的 RingJudge 负责。
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
    /** 拖拽投掷的最大初速度（m/s）。 */
    speed: 11.8,
    /** 初始抛射仰角（度）。 */
    elevationDeg: 30,
    /** 自旋角速度（rad/s，绕世界 Y 轴）。 */
    spin: 10,
    /** 场上套圈上限，超出回收最旧的。 */
    maxCount: 12,
    /** 高速投掷启用 CCD，防止穿过 0.08 m 薄栏。 */
    ccd: true,
    /** 垂直落颈测试在鹅头碰撞体上方的起始间隙（米）。 */
    dropClearance: 0.4,
    /** 偏移落颈测试在鹅头上方的间隙及水平偏移（米）。 */
    offsetClearance: 0.2,
    offsetDistance: 0.3,
    /** 静止超过该秒数后回收，避免长期堆积。 */
    sleepRecycleSec: 8,
    /** 落地后连续低于速度和角速度阈值，再补下一只手持圈。 */
    settleSeconds: 0.18,
    settleSpeed: 0.2,
    settleAngularSpeed: 1,
  },
  /**
   * 套圈出手预览（纯视觉，不参与物理与命中判定）。
   * 三段式表现：手持悬浮圈 + 橙色轨迹点 + 地面落点环；
   * 弹道与真实投掷共用出手位置、速度、重力及线阻尼，预测无遮挡路径。
   */
  ringPreview: {
    ringRadius: 0.42,
    tubeRadius: 0.045,
    /** 练习场和静态场的默认轨迹辅助状态。 */
    assistDefault: true,
    /** 轨迹点数量（参考仓库 18 个，作为初始参数）。 */
    dotCount: 18,
    dotRadius: 0.035,
    dotColor: '#f27d24',
    /** 地面预测落点环的内外半径（米）。 */
    landingRingInner: 0.34,
    landingRingOuter: 0.5,
    landingRingColor: '#f27d24',
    /** 手持圈上下浮动幅度（米）与角速度（rad/s）。 */
    hoverAmplitude: 0.03,
    hoverSpeed: 2.5,
    /** 蓄力时手持圈前倾，瞄准时侧倾（弧度，分别乘 charge / 归一化偏转）。 */
    chargeTiltX: -0.18,
    aimTiltZ: -0.28,
    /** 下拉后摆 / 上拨前甩的最大位移（米，随 charge 线性）。 */
    pullBackMax: 0.2,
    /** 灰盒手与前臂的颜色（视觉锚点，不参与物理与判定）。 */
    handColor: '#bd8f6d',
    sleeveColor: '#6b5343',
  },
} as const;
