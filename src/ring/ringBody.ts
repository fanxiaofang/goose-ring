import RAPIER from '@dimforge/rapier3d-compat';
import { buildRingSegmentDescs } from './ringGeometry';
import type { Vec3Like } from './throwMath';

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface RingBodyOptions {
  radius: number;
  tubeRadius: number;
  segments: number;
  mass: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
  ccd: boolean;
  position: Vec3Like;
  rotation: QuatLike;
  linvel: Vec3Like;
  angvel: Vec3Like;
}

/**
 * 在 Rapier 世界中创建真实有孔的环刚体。
 *
 * 关键约束（01_技术方案.md §5.1）：
 * - 不使用实心圆盘 Collider；
 * - 由 N 段与切线一致的胶囊围成闭合环，内孔真实空出；
 * - 质量按段均分，保留真实的转动惯量；
 * - 高速投掷启用 CCD，防止穿过薄围栏。
 *
 * 供 PhysicsWorld 与单元测试共用同一份实现，避免测试与运行时不一致。
 */
export function createRingRigidBody(
  world: RAPIER.World,
  options: RingBodyOptions,
): RAPIER.RigidBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(options.position.x, options.position.y, options.position.z)
      .setRotation(options.rotation)
      .setLinearDamping(options.linearDamping)
      .setAngularDamping(options.angularDamping)
      .setCcdEnabled(options.ccd)
      .setLinvel(options.linvel.x, options.linvel.y, options.linvel.z)
      .setAngvel(options.angvel),
  );

  const descs = buildRingSegmentDescs(options.radius, options.tubeRadius, options.segments);
  const segmentMass = options.mass / descs.length;
  for (const desc of descs) {
    world.createCollider(
      RAPIER.ColliderDesc.capsule(desc.halfHeight, desc.radius)
        .setTranslation(desc.x, desc.y, desc.z)
        .setRotation({ x: desc.qx, y: desc.qy, z: desc.qz, w: desc.qw })
        .setMass(segmentMass)
        .setRestitution(options.restitution)
        .setFriction(options.friction),
      body,
    );
  }

  return body;
}
