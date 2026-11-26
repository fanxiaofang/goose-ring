import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { getGooseNeckWorldPosition, type GooseLayoutEntry } from '../goose/GoosePlaceholder';
import { createRingRigidBody } from '../ring/ringBody';
import { horizontalRingRotation, ringInnerRadius } from '../ring/ringGeometry';
import { buildPlayerThrow } from '../ring/playerThrow';
import { sampleThrowArc, type Vec3Like } from '../ring/throwMath';
import { FixedStepAccumulator } from './fixedStep';
import { PhysicsWorld } from './PhysicsWorld';

/**
 * 套圈物理集成测试（Rapier WASM，与运行时共用 createRingRigidBody）。
 * 覆盖：真实内孔、地面稳定、确定性复现、高速 CCD 防穿透。
 * 不包含任何套中判定——本阶段不做判定。
 */
const ring = gameConfig.ring;

function makeWorld(gravityY: number = gameConfig.physics.gravityY): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  world.timestep = gameConfig.physics.fixedDt;
  return world;
}

function spawnRing(
  world: RAPIER.World,
  position: Vec3Like,
  linvel: Vec3Like = { x: 0, y: 0, z: 0 },
  angvel: Vec3Like = { x: 0, y: 0, z: 0 },
): RAPIER.RigidBody {
  return createRingRigidBody(world, {
    radius: ring.radius,
    tubeRadius: ring.tubeRadius,
    segments: ring.segments,
    mass: ring.mass,
    restitution: ring.restitution,
    friction: ring.friction,
    linearDamping: ring.linearDamping,
    angularDamping: ring.angularDamping,
    ccd: ring.ccd,
    position,
    rotation: horizontalRingRotation(),
    linvel,
    angvel,
  });
}

function step(world: RAPIER.World, count: number): void {
  for (let i = 0; i < count; i++) world.step();
}

beforeAll(async () => {
  await RAPIER.init();
});

describe('套圈真实内孔', () => {
  it('环可以绕过竖直颈柱继续下落，而实心圆盘会被挡住', () => {
    // 对照实验：同一高度、同一障碍物，仅碰撞体不同。
    function dropOntoNeck(useRing: boolean): number {
      const world = makeWorld();
      const neckBody = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.85, 0),
      );
      // 竖直颈柱：顶面 1.6 m，半径 0.12 m（比鹅颈 Collider 略粗）。
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.75, 0.12).setFriction(0.5),
        neckBody,
      );

      if (useRing) {
        const body = spawnRing(world, { x: 0, y: 2.2, z: 0 });
        step(world, 120); // 2 s
        return body.translation().y;
      }

      const disc = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2.2, 0),
      );
      // 实心盘：半径与套圈外径相同。
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.045, ring.radius).setMass(ring.mass),
        disc,
      );
      step(world, 120);
      return disc.translation().y;
    }

    const ringY = dropOntoNeck(true);
    const discY = dropOntoNeck(false);

    // 有孔环从颈柱外侧滑落（没有地面，2 s 后远低于障碍物顶部）。
    expect(ringY).toBeLessThan(0.5);
    // 实心盘被颈柱顶面挡住，稳定停在 1.6 m 之上。
    expect(discY).toBeGreaterThan(1.4);
  });

  it('内孔净半径大于鹅头/鹅颈碰撞半径，几何上不会卡住', () => {
    expect(ring.radius - ring.tubeRadius).toBeGreaterThan(gameConfig.goose.collider.headRadius);
    expect(ring.radius - ring.tubeRadius).toBeGreaterThan(gameConfig.goose.collider.neckRadius);
  });
});

const originalBoardCases = [
  { name: '最近鹅', index: 6, aimDeg: -30.2, charges: [0.265, 0.27, 0.28] },
  { name: '左后鹅', index: 0, aimDeg: -28.6, charges: [0.86, 0.865, 0.87] },
  { name: '中后鹅', index: 1, aimDeg: -9.3, charges: [0.795, 0.8, 0.805] },
  { name: '右后鹅', index: 2, aimDeg: 21.2, charges: [0.8, 0.805, 0.81] },
];

it.each(originalBoardCases)('$name 有多个正常投掷输入能从鹅头穿入颈区', async ({ index, aimDeg, charges }) => {
  const results = await replayNeckEntries(gameConfig.goose.layout, index, charges.map(charge => [aimDeg, charge]));
  expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(2);
});

const staticCases = [
  { name: '简单·左近', index: 0, samples: [[-27.3, 0.312], [-27.3, 0.326]] },
  { name: '简单·右近', index: 1, samples: [[8.5, 0.338], [8.5, 0.35]] },
  { name: '适中·左后', index: 2, samples: [[-34, 0.652], [-34, 0.666]] },
  { name: '适中·中后', index: 3, samples: [[-8.6, 0.64], [-8.6, 0.654]] },
  { name: '适中·右后', index: 4, samples: [[22.2, 0.644], [22.2, 0.65]] },
  { name: '有难度·左中', index: 5, samples: [[-15.5, 0.816], [-15.5, 0.834]] },
  { name: '有难度·右中', index: 6, samples: [[25.7, 0.86], [25.7, 0.88]] },
  { name: '有难度·极左', index: 7, samples: [[-29.9, 0.894], [-29.9, 0.908]] },
] satisfies Array<{ name: string; index: number; samples: Array<[number, number]> }>;

it.each(staticCases)('静态场 $name 有可重放的名义投掷、邻近投掷及偏转反例', async ({ index, samples }) => {
  const [aimDeg, charge] = samples[0]!;
  expect(await replayNeckEntries(gameConfig.goose.staticLayout, index, [
    ...samples,
    [aimDeg + 5, charge],
  ], true)).toEqual([...samples.map(() => true), false]);
});

it('练习场中线站位允许不同力度的正前方投掷入颈', async () => {
  expect(await replayNeckEntries([gameConfig.goose.practicePosition], 0, [
    [0, 0.6175],
    [0, 0.62],
    [0, 0.6325],
    [5, 0.62],
  ])).toEqual([true, true, true, false]);
});

async function replayNeckEntries(
  layout: readonly GooseLayoutEntry[],
  index: number,
  samples: ReadonlyArray<readonly [aimDeg: number, charge: number]>,
  requireNeckCrossing = false,
): Promise<boolean[]> {
  const { goose } = gameConfig;
  const target = layout[index];
  const neck = getGooseNeckWorldPosition(target);
  const head = new THREE.Vector3(
    target.x + Math.sin(target.rotY) * goose.head.forward,
    goose.head.y,
    target.z + Math.cos(target.rotY) * goose.head.forward,
  );
  const headClearance = ringInnerRadius(ring.radius, ring.tubeRadius) - goose.collider.headRadius;

  return Promise.all(samples.map(async ([aimDeg, charge]) => {
    const physics = await PhysicsWorld.create(new THREE.Scene(), layout);
    const spec = buildPlayerThrow(charge, THREE.MathUtils.degToRad(aimDeg), ring);
    try {
      const body = spawnRing(
        physics.world, spec.position, spec.linvel, spec.angvel,
      );
      const localHead = new THREE.Vector3();
      const inverseRotation = new THREE.Quaternion();
      const previous = new THREE.Vector3();
      let passedHead = false;
      let passedNeck = false;
      let previousNeckZ = -Infinity;
      const localNeck = new THREE.Vector3();
      for (let frame = 0; frame < 90; frame++) {
        const pos = body.translation();
        const rot = body.rotation();
        localHead.copy(head).sub(pos).applyQuaternion(inverseRotation.copy(rot).invert());
        if (frame > 0 && previous.z < 0 && localHead.z >= 0 && body.linvel().y < 0) {
          previous.lerp(localHead, -previous.z / (localHead.z - previous.z));
          passedHead ||= Math.hypot(previous.x, previous.y) < headClearance;
        }
        previous.copy(localHead);
        localNeck.set(neck.x, neck.y, neck.z).sub(pos).applyQuaternion(inverseRotation);
        if (passedHead && previousNeckZ < 0 && localNeck.z >= 0
            && Math.hypot(localNeck.x, localNeck.y)
              < ringInnerRadius(ring.radius, ring.tubeRadius) - goose.collider.neckRadius) {
          passedNeck = true;
        }
        previousNeckZ = localNeck.z;
        physics.step();
      }
      const end = body.translation();
      return passedHead && (!requireNeckCrossing || passedNeck)
        && end.y > goose.body.y + goose.body.ry / 2 && end.y < neck.y
        && Math.hypot(end.x - neck.x, end.z - neck.z) < 0.3;
    } finally {
      physics.world.free();
    }
  }));
}

it.each([0.05, 0.6])('当前线阻尼 %f 的无遮挡预览与固定步进首碰位置接近', (linearDamping) => {
  const world = makeWorld();
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(40, 0.5, 30).setTranslation(0, -0.5, 0), ground);
  const spec = buildPlayerThrow(0.65, 0.2, ring);
  const body = spawnRing(world, spec.position, spec.linvel, spec.angvel);
  body.setLinearDamping(linearDamping);
  const predicted = sampleThrowArc(spec.position, spec.linvel, 9.81, 18, linearDamping).at(-1)!;
  try {
    let contacted = false;
    for (let tick = 0; tick < 240 && !contacted; tick++) {
      world.step();
      for (let i = 0; i < body.numColliders(); i++) {
        world.contactPairsWith(body.collider(i), () => { contacted = true; });
      }
    }
    expect(contacted).toBe(true);
    const actual = body.translation();
    expect(Math.hypot(actual.x - predicted.x, actual.z - predicted.z)).toBeLessThan(0.2);
  } finally {
    world.free();
  }
});

describe('套圈地面碰撞与稳定', () => {
  it('空中低速的圈不会被当成接地，真实落地后才有地面接触', async () => {
    const physics = await PhysicsWorld.create(new THREE.Scene(), []);
    try {
      const body = spawnRing(physics.world, { x: 0, y: 0.7, z: 0 });
      physics.step();
      expect(physics.isTouchingGround(body)).toBe(false);
      for (let tick = 0; tick < 120; tick++) physics.step();
      expect(physics.isTouchingGround(body)).toBe(true);
    } finally {
      physics.world.free();
    }
  });

  it('水平落地的套圈会停在地面上，而不是无限下沉', () => {
    const world = makeWorld();
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(8, 0.5, 6).setTranslation(0, -0.5, 0),
      ground,
    );

    const body = spawnRing(world, { x: 0, y: 1, z: 0 });
    step(world, 300); // 5 s
    const y = body.translation().y;
    expect(y).toBeGreaterThan(-0.05);
    expect(y).toBeLessThan(0.2);
  });
});

describe('确定性复现', () => {
  it('相同初始条件在两次独立模拟中得到相同终态', () => {
    function simulate(): { t: Vec3Like; r: { x: number; y: number; z: number; w: number } } {
      const world = makeWorld();
      const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(8, 0.5, 6).setTranslation(0, -0.5, 0),
        ground,
      );
      const body = spawnRing(
        world,
        { x: 0, y: 1, z: 6.6 },
        { x: 0, y: 4.2, z: -9 },
        { x: 0, y: 8, z: 0 },
      );
      step(world, 300);
      const t = body.translation();
      const r = body.rotation();
      return {
        t: { x: t.x, y: t.y, z: t.z },
        r: { x: r.x, y: r.y, z: r.z, w: r.w },
      };
    }

    const a = simulate();
    const b = simulate();
    expect(a.t.x).toBeCloseTo(b.t.x, 6);
    expect(a.t.y).toBeCloseTo(b.t.y, 6);
    expect(a.t.z).toBeCloseTo(b.t.z, 6);
    expect(a.r.x).toBeCloseTo(b.r.x, 6);
    expect(a.r.y).toBeCloseTo(b.r.y, 6);
    expect(a.r.z).toBeCloseTo(b.r.z, 6);
    expect(a.r.w).toBeCloseTo(b.r.w, 6);
  });

  it('30 FPS 与 60 FPS 渲染下，2 秒后的套圈终态一致（固定步长）', () => {
    function simulateAt(renderFps: number): Vec3Like {
      const world = makeWorld();
      const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(8, 0.5, 6).setTranslation(0, -0.5, 0),
        ground,
      );
      const body = spawnRing(
        world,
        { x: 0, y: 1, z: 6.6 },
        { x: 0, y: 4.2, z: -9 },
        { x: 0, y: 8, z: 0 },
      );

      const accumulator = new FixedStepAccumulator(gameConfig.physics.fixedDt, 5);
      const frames = renderFps * 2;
      for (let i = 0; i < frames; i++) {
        const steps = accumulator.add(1 / renderFps);
        for (let s = 0; s < steps; s++) world.step();
      }
      const t = body.translation();
      return { x: t.x, y: t.y, z: t.z };
    }

    const at30 = simulateAt(30);
    const at60 = simulateAt(60);
    expect(at30.x).toBeCloseTo(at60.x, 6);
    expect(at30.y).toBeCloseTo(at60.y, 6);
    expect(at30.z).toBeCloseTo(at60.z, 6);
  });
});

describe('高速防穿透（CCD）', () => {
  it('25 m/s 撞 0.08 m 薄栏时不会穿到栏后', () => {
    const world = makeWorld(0); // 去重力，单独验证离散碰撞
    const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    // 与游戏内围栏同厚（0.08 m），高 1.05 m。
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(gameConfig.fence.width / 2, gameConfig.fence.farHeight / 2, 0.04).setTranslation(
        0,
        gameConfig.fence.farHeight / 2,
        -1,
      ),
      wallBody,
    );

    const body = spawnRing(world, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 0, z: -25 });
    step(world, 90); // 1.5 s；若无 CCD 早已到 -37 m

    const z = body.translation().z;
    expect(z).toBeGreaterThan(-1.0);
  });
});
