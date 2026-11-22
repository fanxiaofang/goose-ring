/**
 * P0-0 实验参数集中配置。
 * 依据 docs/agent-plan/04_决策与参数.md：所有【待测】数值均为实验起点，不写死在逻辑里。
 */
export const gameConfig = {
  camera: {
    /** 俯视角（相机相对水平面的仰高角，度）。GDD 2.3：【建议】38°，【待测】30/38/45。 */
    pitchDeg: 38,
    pitchOptionsDeg: [30, 38, 45] as number[],
    /** 水平偏转角（相机围绕场景中心的水平观察方向，度）。0° = 正对围栏。 */
    yawDeg: 12,
    yawOptionsDeg: [0, 12, 18] as number[],
    /** 相机到注视点的距离；正交投影下不影响大小，只影响裁剪与观感。 */
    distance: 26,
    /** 正交可视高度（米）。16:9 下宽度 ≈ viewHeight × 1.778。 */
    viewHeight: 13,
    /** 注视点：围栏中心略抬高，兼顾地面与鹅头。 */
    target: { x: 0, y: 0.6, z: 0 },
  },
  physics: {
    gravityY: -9.81,
    /** 固定物理步长（技术方案 §5.1：1/60 s）。 */
    fixedDt: 1 / 60,
    /** 帧率暴跌时最多补多少个物理步，防止死亡螺旋。 */
    maxCatchUpSteps: 5,
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
    /** 玩家侧（Z+）栏高：压低避免遮挡内部目标与落地反馈。 */
    nearHeight: 0.5,
    postSpacing: 2,
    postSize: 0.14,
  },
  ground: {
    sizeX: 80,
    sizeZ: 60,
    outerColor: '#cbb894',
    innerColor: '#e4d6b6',
    gridColor: '#bfa980',
  },
  /** P0-0 灰盒鹅占位：仅用于检查立体尺度，非正式鹅模型。 */
  goose: {
    layout: [
      { x: -4.6, z: -2.4, rotY: 0.35 },
      { x: -1.2, z: -3.3, rotY: -0.2 },
      { x: 2.4, z: -2.8, rotY: 0.1 },
      { x: 5.2, z: -1.2, rotY: -0.35 },
    ],
    body: { rx: 0.42, ry: 0.28, rz: 0.3, y: 0.34 },
    neck: { radius: 0.085, height: 0.46, y: 0.68, forward: 0.1 },
    head: { radius: 0.135, y: 0.94, forward: 0.12 },
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
} as const;
