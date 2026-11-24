/**
 * P0-1 固定投掷预设：所有参数写死，不含随机项，可重复复现同一条物理轨迹。
 */
export type ThrowPreset = 'drop' | 'offset' | 'soft' | 'mid' | 'hard' | 'fence';

export const THROW_PRESETS: readonly ThrowPreset[] = [
  'drop',
  'offset',
  'soft',
  'mid',
  'hard',
  'fence',
];

/** 斜抛预设相对“初速”参数的倍率；落颈为垂直下落，不使用初速。 */
export const PRESET_SPEED_FACTOR: Record<ThrowPreset, number> = {
  drop: 0,
  offset: 0,
  soft: 0.55,
  mid: 0.8,
  hard: 1,
  fence: 1.45,
};

/** 撞围栏预设使用较低的仰角，确保撞到栏板而不是提前落地。 */
export const FENCE_PRESET_ELEVATION_DEG = 5;
