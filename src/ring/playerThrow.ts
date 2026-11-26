import { gameConfig } from '../config/gameConfig';
import { horizontalRingRotation } from './ringGeometry';
import type { RingLaunchSpec, RingTuning } from './RingSystem';
import { aimLateralOffset, speedFromCharge, velocityWithYaw } from './throwMath';

/** The same launch description drives the player preview, release and replay. */
export function buildPlayerThrow(
  charge: number,
  aimRad: number,
  tuning: Pick<RingTuning, 'speed' | 'elevationDeg' | 'spin'>,
): RingLaunchSpec {
  const lateral = aimLateralOffset(
    aimRad, gameConfig.input.maxAimDeg * Math.PI / 180, gameConfig.input.aimLateralMax,
  );
  return {
    position: { ...gameConfig.throwOrigin, x: gameConfig.throwOrigin.x + lateral },
    rotation: horizontalRingRotation(),
    linvel: velocityWithYaw(
      speedFromCharge(tuning.speed, charge, gameConfig.input.minSpeedFactor),
      tuning.elevationDeg,
      aimRad,
    ),
    angvel: { x: 0, y: tuning.spin, z: 0 },
  };
}
