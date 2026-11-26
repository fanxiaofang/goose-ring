import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { getGooseNeckWorldPosition, type GooseLayoutEntry } from '../goose/GoosePlaceholder';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { buildPlayerThrow } from '../ring/playerThrow';
import { createRingRigidBody } from '../ring/ringBody';
import { RingJudge, type JudgeFrame } from './RingJudge';

const FIXED_DT = gameConfig.physics.fixedDt;
const staticLayout = gameConfig.goose.staticLayout;
/** 水平环初始姿态：局部 +Z 指向世界 +Y（ringGeometry.horizontalRingRotation）。 */
const HORIZONTAL = { x: -Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

async function initWorld(layout: readonly GooseLayoutEntry[]): Promise<PhysicsWorld> {
  return PhysicsWorld.create(new THREE.Scene(), layout);
}

function spawnRing(world: PhysicsWorld, position: { x: number; y: number; z: number }, linvel: {
  x: number; y: number; z: number;
}, rotation = HORIZONTAL, angvel: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): RAPIER.RigidBody {
  const ring = gameConfig.ring;
  return createRingRigidBody(world.world, {
    radius: ring.radius,
    tubeRadius: ring.tubeRadius,
    segments: ring.segments,
    mass: ring.mass,
    restitution: ring.restitution,
    friction: ring.friction,
    linearDamping: ring.linearDamping,
    angularDamping: ring.angularDamping,
    ccd: true,
    position,
    rotation,
    linvel,
    angvel,
  });
}

function frameOf(world: PhysicsWorld, ring: RAPIER.RigidBody): JudgeFrame {
  let groundContact = false;
  const gooseContacts: Array<{ index: number; part: 'body' | 'neck' | 'head' }> = [];
  for (let i = 0; i < ring.numColliders(); i++) {
    world.world.contactPairsWith(ring.collider(i), (other) => {
      const part = world.goosePartOf(other.handle);
      if (part) gooseContacts.push(part);
      if (world.labelOf(other.handle) === 'ground') groundContact = true;
    });
  }
  return {
    position: ring.translation(),
    rotation: ring.rotation(),
    linvel: ring.linvel(),
    groundContact,
    gooseContacts,
  };
}

/** 物理回放直到判定结算或超时。 */
function runPhysics(
  world: PhysicsWorld,
  ring: RAPIER.RigidBody,
  judge: RingJudge,
  maxTicks = 240,
) {
  for (let i = 0; i < maxTicks; i++) {
    world.step();
    const outcome = judge.update(FIXED_DT, frameOf(world, ring));
    if (outcome) return outcome;
  }
  return null;
}

describe('RingJudge 静态场八鹅名义投掷', () => {
  // 与 src/physics/ringPhysics.test.ts 的 staticCases 同源样本（改布局必须同步重采样）。
  const cases = [
    { name: '简单·左近', index: 0, aimDeg: -27.3, charge: 0.312 },
    { name: '简单·右近', index: 1, aimDeg: 8.5, charge: 0.338 },
    { name: '适中·左后', index: 2, aimDeg: -34, charge: 0.652 },
    { name: '适中·中后', index: 3, aimDeg: -8.6, charge: 0.64 },
    { name: '适中·右后', index: 4, aimDeg: 22.2, charge: 0.644 },
    { name: '有难度·左中', index: 5, aimDeg: -15.5, charge: 0.816 },
    { name: '有难度·右中', index: 6, aimDeg: 25.7, charge: 0.86 },
    { name: '有难度·极左', index: 7, aimDeg: -29.9, charge: 0.894 },
  ];

  it.each(cases)('$name：$aimDeg° / $charge 判 CAUGHT 目标 $index', async ({ index, aimDeg, charge }) => {
    const world = await initWorld(staticLayout);
    const spec = buildPlayerThrow(charge, (aimDeg * Math.PI) / 180, gameConfig.ring);
    const ring = spawnRing(world, spec.position, spec.linvel, HORIZONTAL, spec.angvel);
    const judge = new RingJudge(staticLayout, 100 + index);

    const outcome = runPhysics(world, ring, judge, 300);

    expect(outcome?.type).toBe('caught');
    expect(outcome?.gooseIndex).toBe(index);
  });

  it.each(cases)('$name：偏转 +5° 不判 CAUGHT', async ({ index, aimDeg, charge }) => {
    const world = await initWorld(staticLayout);
    const spec = buildPlayerThrow(charge, ((aimDeg + 5) * Math.PI) / 180, gameConfig.ring);
    const ring = spawnRing(world, spec.position, spec.linvel, HORIZONTAL, spec.angvel);
    const judge = new RingJudge(staticLayout, 200 + index);

    const outcome = runPhysics(world, ring, judge, 300);

    expect(outcome?.type).toBe('missed');
  });
});

describe('RingJudge 状态机', () => {
  it('合法套中：名义投掷进入 ENTER_NECK，稳定 0.25s 后 CAUGHT 且只结算一次', async () => {
    const world = await initWorld(staticLayout);
    const spec = buildPlayerThrow(0.312, (-27.3 * Math.PI) / 180, gameConfig.ring);
    const ring = spawnRing(world, spec.position, spec.linvel, HORIZONTAL, spec.angvel);
    const judge = new RingJudge(staticLayout, 1);

    const outcome = runPhysics(world, ring, judge);

    expect(outcome?.type).toBe('caught');
    expect(outcome?.gooseIndex).toBe(0);
    expect(judge.target).toBe(0);
    // 幂等：结算后再喂帧不再产出结果
    for (let i = 0; i < 30; i++) {
      world.step();
      expect(judge.update(FIXED_DT, frameOf(world, ring))).toBeNull();
    }
  });

  it('撞头：环落在鹅头顶部并停住，判 MISSED(head-hit)', async () => {
    const world = await initWorld(staticLayout);
    const entry = staticLayout[0]!;
    const headX = entry.x + Math.sin(entry.rotY) * gameConfig.goose.head.forward;
    const headZ = entry.z + Math.cos(entry.rotY) * gameConfig.goose.head.forward;
    const ring = spawnRing(
      world,
      { x: headX + gameConfig.ring.radius, y: gameConfig.goose.head.y + 0.5, z: headZ },
      { x: 0, y: 0, z: 0 },
    );
    const judge = new RingJudge(staticLayout, 2);

    const outcome = runPhysics(world, ring, judge);

    expect(outcome?.type).toBe('missed');
    expect(outcome?.reason).toBe('head-hit');
  });

  it('撞身：环落在鹅身侧后方、鹅头不在孔上方时判 MISSED(body-hit)', async () => {
    const world = await initWorld(staticLayout);
    const entry = staticLayout[0]!;
    const lateral = { x: Math.cos(entry.rotY), z: -Math.sin(entry.rotY) };
    const ring = spawnRing(
      world,
      {
        x: entry.x + lateral.x * 0.6,
        y: gameConfig.goose.body.y + gameConfig.goose.collider.bodyRadius + 0.3,
        z: entry.z + lateral.z * 0.6,
      },
      { x: 0, y: 0, z: 0 },
    );
    const judge = new RingJudge(staticLayout, 3);

    const outcome = runPhysics(world, ring, judge);

    expect(outcome?.type).toBe('missed');
    expect(outcome?.reason).toBe('body-hit');
  });

  it('侧穿：环从侧面水平穿过颈部高度不算套中', async () => {
    const world = await initWorld(staticLayout);
    const neck = getGooseNeckWorldPosition(staticLayout[0]!);
    const sideRotation = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const ring = spawnRing(
      world,
      { x: neck.x - 1.6, y: neck.y, z: neck.z },
      { x: 6, y: 0, z: 0 },
      sideRotation,
    );
    const judge = new RingJudge(staticLayout, 4);

    const outcome = runPhysics(world, ring, judge);

    expect(outcome?.type).not.toBe('caught');
    expect(outcome?.type).toBe('missed');
  });

  it('滑脱：入颈后稳定期内颈心滑出内孔判 MISSED(slip)', () => {
    const layout: GooseLayoutEntry[] = [{ x: 0, z: 0, rotY: 0 }];
    const judge = new RingJudge(layout, 5);
    const neck = getGooseNeckWorldPosition(layout[0]!);
    const frame = (y: number, x = 0): JudgeFrame => ({
      position: { x, y, z: neck.z },
      rotation: HORIZONTAL,
      linvel: { x: 0, y: -1, z: 0 },
      groundContact: false,
      gooseContacts: [],
    });

    let outcome = null;
    // 1.75 → 1.10 下降：先过头再入颈
    for (let y = 1.75; y >= 1.1 && !outcome; y -= 0.05) outcome = judge.update(FIXED_DT, frame(y));
    expect(judge.state).toBe('SETTLING');
    // 稳定期内横向滑出内孔
    for (let i = 0; i < 5 && !outcome; i++) outcome = judge.update(FIXED_DT, frame(1.1));
    outcome = judge.update(FIXED_DT, frame(1.1, 0.5));
    expect(outcome?.type).toBe('missed');
    expect(outcome?.reason).toBe('slip');
  });

  it('多鹅同 tick 入颈取水平距离最近者，且只结算一只', () => {
    const layout: GooseLayoutEntry[] = [
      { x: 0, z: 0, rotY: 0 },
      { x: 0.12, z: 0, rotY: 0 },
    ];
    const judge = new RingJudge(layout, 6);
    const neck = getGooseNeckWorldPosition(layout[0]!);
    const frame = (y: number): JudgeFrame => ({
      position: { x: 0, y, z: neck.z },
      rotation: HORIZONTAL,
      linvel: { x: 0, y: -1, z: 0 },
      groundContact: false,
      gooseContacts: [],
    });

    let outcome = null;
    for (let i = 0; i < 80 && !outcome; i++) {
      const y = 1.75 - i * 0.05;
      outcome = judge.update(FIXED_DT, frame(y));
      if (!outcome) continue;
      expect(outcome.type).toBe('caught');
      expect(outcome.gooseIndex).toBe(0);
    }
    expect(outcome?.type).toBe('caught');
    expect(judge.update(FIXED_DT, frame(1.0))).toBeNull();
  });

  it('已退场的鹅不再作为目标：排除 0 号后同一落点改判 1 号', () => {
    const layout: GooseLayoutEntry[] = [
      { x: 0, z: 0, rotY: 0 },
      { x: 0.12, z: 0, rotY: 0 },
    ];
    const judge = new RingJudge(layout, 8, { excludeIndices: [0] });
    const neck = getGooseNeckWorldPosition(layout[0]!);
    const frame = (y: number): JudgeFrame => ({
      position: { x: 0, y, z: neck.z },
      rotation: HORIZONTAL,
      linvel: { x: 0, y: -1, z: 0 },
      groundContact: false,
      gooseContacts: [],
    });

    let outcome = null;
    for (let i = 0; i < 80 && !outcome; i++) outcome = judge.update(FIXED_DT, frame(1.75 - i * 0.05));
    expect(outcome?.type).toBe('caught');
    expect(outcome?.gooseIndex).toBe(1);
  });

  it('全部鹅都退场后不会幽灵锁定', () => {
    const layout: GooseLayoutEntry[] = [{ x: 0, z: 0, rotY: 0 }];
    const judge = new RingJudge(layout, 9, { excludeIndices: [0] });
    const neck = getGooseNeckWorldPosition(layout[0]!);
    const frame = (y: number): JudgeFrame => ({
      position: { x: 0, y, z: neck.z },
      rotation: HORIZONTAL,
      linvel: { x: 0, y: -1, z: 0 },
      groundContact: false,
      gooseContacts: [],
    });

    let outcome = null;
    for (let i = 0; i < 80 && !outcome; i++) outcome = judge.update(FIXED_DT, frame(1.75 - i * 0.05));
    expect(outcome).toBeNull();
    expect(judge.target).toBeNull();
    expect(judge.state).toBe('FLYING');
  });

  it('头接触不立即结算：停在鹅头上静止一段时间后判 MISSED(head-hit)', () => {
    const layout: GooseLayoutEntry[] = [{ x: 0, z: 0, rotY: 0 }];
    const judge = new RingJudge(layout, 7);
    const frame: JudgeFrame = {
      position: { x: 0, y: 1.5, z: 0 },
      rotation: HORIZONTAL,
      linvel: { x: 0, y: 0, z: 0 },
      groundContact: false,
      gooseContacts: [{ index: 0, part: 'head' }],
    };
    // 接触本身不判负
    expect(judge.update(FIXED_DT, frame)).toBeNull();
    // 持续静止达到 restSeconds 后才结算，并归因为 head-hit
    let outcome = null;
    for (let i = 0; i < 40 && !outcome; i++) outcome = judge.update(FIXED_DT, frame);
    expect(outcome?.type).toBe('missed');
    expect(outcome?.reason).toBe('head-hit');
  });
});
