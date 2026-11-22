/**
 * P0-0 实验参数集中配置。
 * 依据 docs/agent-plan/04_决策与参数.md：所有【待测】数值均为实验起点，不写死在逻辑里。
 */
export const gameConfig = {
  camera: {
    /** 默认俯视角（相对水平面，度）。GDD 2.3：【建议】38°，【待测】30/38/45 三档。 */
    pitchDeg: 38,
    pitchOptionsDeg: [30, 38, 45] as number[],
    /** 相机到注视点的距离（只影响正交相机取景位置，不影响大小）。 */
    distance: 22,
    /** 正交可视高度（米）。横屏 16:9 基线；鹅栏视觉主体占比约 60~70%【待测】。 */
    viewHeight: 12,
    /** 注视点：围栏中心略偏上。 */
    target: { x: 0, y: 0.6, z: -0.5 },
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
    /** 围栏高度（米）。 */
    height: 0.9,
    postSpacing: 2,
  },
  ground: {
    sizeX: 80,
    sizeZ: 60,
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
