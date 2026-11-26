import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import { getGooseNeckWorldPosition, type GooseLayoutEntry } from '../goose/GoosePlaceholder';
import type { GoosePart } from '../physics/PhysicsWorld';
import { ringInnerRadius } from '../ring/ringGeometry';

/**
 * 一次物理步的判定输入：环位姿、速度、与地面/鹅各部位的接触。
 * 判定器不直接读 Rapier，便于用固定输入复现与单测。
 */
export interface JudgeFrame {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  linvel: { x: number; y: number; z: number };
  groundContact: boolean;
  gooseContacts: ReadonlyArray<{ index: number; part: GoosePart }>;
}

export type JudgeState = 'FLYING' | 'ENTER_NECK' | 'SETTLING' | 'CAUGHT' | 'MISSED';
export type MissReason = 'ground' | 'head-hit' | 'body-hit' | 'slip' | 'tilt';

/** 判定器可调项；缺省取 gameConfig.judge。 */
export interface JudgeOptions {
  settleSeconds?: number;
  maxTiltDeg?: number;
  /** 低于该线速度视为“基本静止”，用于识别停在鹅头/鹅身上的环。 */
  restSpeed?: number;
  /** 持续静止多久判 MISSED（秒）。 */
  restSeconds?: number;
  /** 鹅体接触在多久内仍可作为失败归因（秒）。 */
  contactMemorySeconds?: number;
  /** 已退场的鹅序号：这些鹅不再作为可套目标（避免退场后仍被幽灵锁定）。 */
  excludeIndices?: readonly number[];
}

export interface JudgeOutcome {
  type: 'caught' | 'missed';
  gooseIndex: number | null;
  reason: MissReason | null;
  tick: number;
}

interface GooseTarget {
  neck: THREE.Vector3;
  head: THREE.Vector3;
  headPassed: boolean;
  previousNeck: THREE.Vector3;
  previousHead: THREE.Vector3;
  hasPrevious: boolean;
}

/**
 * P0-2 套中判定状态机（GDD §229 / 01_技术方案 §6.1）。
 *
 * FLYING → ENTER_NECK → SETTLING → CAUGHT | MISSED
 * - ENTER_NECK：必须先有"鹅头从上方穿环"的证据，且颈轴从环平面下方穿到上方（下降中）。
 * - SETTLING：入颈要求颈轴落在内孔内；稳定期内颈轴不离开内孔满 settleSeconds 即 CAUGHT。
 * - 一次投掷最多一只：首个入颈者锁定后，其他鹅一律忽略。
 * - 同一实例只结算一次（幂等）。
 *
 * 设计要点：环的内孔只比鹅头略大，斜抛下落时环管会贴着鹅头侧面滑过再套到颈上，
 * 因此“碰到头/身”不能立即判负，否则合法套中会被误杀。判定只看穿越证据，
 * 头/身接触仅用于失败归因（落地或静止时回报最近接触部位）。
 */
export class RingJudge {
  readonly throwId: number;
  private stateValue: JudgeState = 'FLYING';
  private readonly targets: Array<GooseTarget | undefined>;
  private readonly innerRadius: number;
  private readonly neckClearance: number;
  private readonly cosMaxTilt: number;
  private readonly settleSeconds: number;
  private readonly restSpeed: number;
  private readonly restSeconds: number;
  private readonly contactMemoryTicks: number;

  private lockedIndex: number | null = null;
  private settling = 0;
  private restTimer = 0;
  private tick = 0;
  private lastHeadTick = -Infinity;
  private lastBodyTick = -Infinity;
  private outcome: JudgeOutcome | null = null;

  constructor(
    layout: readonly GooseLayoutEntry[],
    throwId: number,
    options: JudgeOptions = {},
  ) {
    const { radius, tubeRadius } = gameConfig.ring;
    const { head } = gameConfig.goose;
    this.throwId = throwId;
    this.innerRadius = ringInnerRadius(radius, tubeRadius);
    // 入颈容差：颈轴落在孔内即视为可穿过（GDD §6.3「宁可容差，不要看起来中了却没中」）。
    // 最初用“整根颈截面都在孔内”（0.2454 m）过严，实测大量环已挂在颈上却被误判 MISS。
    this.neckClearance = this.innerRadius;
    this.settleSeconds = options.settleSeconds ?? gameConfig.judge.settleSeconds;
    this.cosMaxTilt = Math.cos(THREE.MathUtils.degToRad(options.maxTiltDeg ?? gameConfig.judge.maxTiltDeg));
    this.restSpeed = options.restSpeed ?? gameConfig.judge.restSpeed;
    this.restSeconds = options.restSeconds ?? gameConfig.judge.restSeconds;
    this.contactMemoryTicks = Math.round(
      (options.contactMemorySeconds ?? gameConfig.judge.contactMemorySeconds) / gameConfig.physics.fixedDt,
    );
    const excluded = new Set(options.excludeIndices ?? []);
    this.targets = layout.map((entry, index) => {
      // 已退场的鹅保留占位但不再参与判定，outcome 的 gooseIndex 仍与原始布局对齐。
      if (excluded.has(index)) return undefined;
      const neck = getGooseNeckWorldPosition(entry);
      return {
        neck: new THREE.Vector3(neck.x, neck.y, neck.z),
        head: new THREE.Vector3(
          entry.x + Math.sin(entry.rotY) * head.forward,
          head.y,
          entry.z + Math.cos(entry.rotY) * head.forward,
        ),
        headPassed: false,
        previousNeck: new THREE.Vector3(),
        previousHead: new THREE.Vector3(),
        hasPrevious: false,
      };
    });
  }

  get state(): JudgeState {
    return this.stateValue;
  }

  /** 已锁定的目标鹅序号（ENTER_NECK 之后才有值）。 */
  get target(): number | null {
    return this.lockedIndex;
  }

  /** 推进一个物理步；返回非空表示本次投掷已结算（只会返回一次）。 */
  update(dt: number, frame: JudgeFrame): JudgeOutcome | null {
    if (this.outcome) return null;
    this.tick++;

    const quaternion = new THREE.Quaternion(
      frame.rotation.x, frame.rotation.y, frame.rotation.z, frame.rotation.w,
    );
    const inverse = quaternion.clone().invert();
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const tiltOk = Math.abs(normal.y) >= this.cosMaxTilt;
    // “从上方穿过环平面”要求环沿自身法线向下运动；侧向掠过时速度几乎与法线垂直，会被排除。
    const alongNormal = frame.linvel.x * normal.x + frame.linvel.y * normal.y + frame.linvel.z * normal.z;
    const descending = alongNormal < -0.1;

    // 鹅体接触只用于失败归因，不立即判负（斜抛会贴着头侧滑入颈）。
    for (const contact of frame.gooseContacts) {
      if (contact.part === 'head') this.lastHeadTick = this.tick;
      else if (contact.part === 'body') this.lastBodyTick = this.tick;
    }

    // 未入颈就落地：按最近接触部位归因（太久之前的接触不算）。
    if (frame.groundContact) return this.resolveMiss(this.contactReason() ?? 'ground');

    const ringOrigin = new THREE.Vector3(frame.position.x, frame.position.y, frame.position.z);
    let candidate: { index: number; distance: number } | null = null;
    for (let index = 0; index < this.targets.length; index++) {
      const target = this.targets[index];
      if (!target) continue;
      const headLocal = target.head.clone().sub(ringOrigin).applyQuaternion(inverse);
      const neckLocal = target.neck.clone().sub(ringOrigin).applyQuaternion(inverse);

      if (target.hasPrevious && descending && tiltOk) {
        // 1) 鹅头先从上方穿环：证明环是从鹅头这一侧下来的，而不是从脖子侧面蹭入。
        //    只记“穿过了”这一事实，不要求头中心落在某个严格半径内——环倾斜时该投影会偏大。
        if (target.previousHead.z < 0 && headLocal.z >= 0) {
          target.headPassed = true;
        }
        // 2) 颈轴由下往上穿过环平面，且头已先过 → 进入颈部。
        if (
          target.headPassed && this.lockedIndex === null
          && target.previousNeck.z < 0 && neckLocal.z >= 0
        ) {
          const neckCrossing = this.crossingDistance(target.previousNeck, neckLocal);
          if (neckCrossing < this.neckClearance) {
            // 同一 tick 多只同时入颈时取水平距离环心最近者（PH-09）。
            if (!candidate || neckCrossing < candidate.distance) {
              candidate = { index, distance: neckCrossing };
            }
          }
        }
      }

      target.previousHead.copy(headLocal);
      target.previousNeck.copy(neckLocal);
      target.hasPrevious = true;
    }
    if (candidate) {
      this.lockedIndex = candidate.index;
      this.stateValue = 'ENTER_NECK';
    }

    if (this.lockedIndex !== null) {
      const locked = this.targets[this.lockedIndex];
      if (!locked) return this.resolveMiss('slip');
      // 入颈要求整根颈都在孔内；稳定期只要求颈轴仍在孔内——环挂在颈上贴住环管属正常，
      // 颈轴离开内孔才说明已经滑脱。倾斜不再单独判负：已经挂在颈上的环歪一点仍是套中。
      if (this.neckAxisDistance(ringOrigin, normal, locked.neck) >= this.innerRadius) {
        return this.resolveMiss('slip');
      }
      this.stateValue = 'SETTLING';
      this.settling += dt;
      if (this.settling >= this.settleSeconds) {
        this.stateValue = 'CAUGHT';
        this.outcome = { type: 'caught', gooseIndex: this.lockedIndex, reason: null, tick: this.tick };
        return this.outcome;
      }
      return null;
    }

    // 未入颈且基本静止（例如停在鹅头顶或身上）→ 先看是否其实“停在颈根”，否则按最近接触归因。
    const speed = Math.hypot(frame.linvel.x, frame.linvel.y, frame.linvel.z);
    if (speed < this.restSpeed) {
      this.restTimer += dt;
      if (this.restTimer >= this.restSeconds) {
        const seated = this.findSeatedGoose(ringOrigin, normal, frame.position);
        if (seated !== null) {
          this.stateValue = 'CAUGHT';
          this.outcome = { type: 'caught', gooseIndex: seated, reason: null, tick: this.tick };
          return this.outcome;
        }
        return this.resolveMiss(this.contactReason() ?? 'ground');
      }
    } else {
      this.restTimer = 0;
    }

    return null;
  }

  /**
   * 静止时判断是否实际停在某只鹅的颈根：环大致朝上、低于颈中心（排除停在鹅头）、
   * 且竖直颈轴落在内孔内。用于兜住“环已挂在脖子里、但穿越瞬间倾斜偏大没锁定”的合法套中。
   */
  private findSeatedGoose(
    origin: THREE.Vector3,
    normal: THREE.Vector3,
    position: { y: number },
  ): number | null {
    if (normal.y <= 0.1) return null;
    let best: { index: number; distance: number } | null = null;
    for (let index = 0; index < this.targets.length; index++) {
      const target = this.targets[index];
      if (!target) continue;
      if (position.y >= target.neck.y) continue;
      const distance = this.neckAxisDistance(origin, normal, target.neck);
      if (distance < this.innerRadius && (!best || distance < best.distance)) {
        best = { index, distance };
      }
    }
    return best?.index ?? null;
  }

  /** 最近一次鹅体接触的失败原因；头部优先，超出记忆窗口则返回 null。 */
  private contactReason(): MissReason | null {
    const fresh = (tick: number) => this.tick - tick <= this.contactMemoryTicks;
    if (fresh(this.lastHeadTick)) return 'head-hit';
    if (fresh(this.lastBodyTick)) return 'body-hit';
    return null;
  }

  /**
   * 竖直颈轴与环平面的交点，到环轴线的距离。
   * 环倾斜时，颈中心点在平面上的投影会偏离真实穿环位置；用竖直轴线求交才准确。
   */
  private neckAxisDistance(origin: THREE.Vector3, normal: THREE.Vector3, neck: THREE.Vector3): number {
    if (Math.abs(normal.y) < 1e-4) return Infinity;
    const t = origin.y
      - ((neck.x - origin.x) * normal.x + (neck.z - origin.z) * normal.z) / normal.y;
    return Math.hypot(neck.x - origin.x, t - origin.y, neck.z - origin.z);
  }

  /** 两帧之间环平面穿越点的水平距离（按 z 线性插值）。 */
  private crossingDistance(previous: THREE.Vector3, current: THREE.Vector3): number {
    const span = current.z - previous.z;
    const t = span === 0 ? 0 : -previous.z / span;
    const x = previous.x + (current.x - previous.x) * t;
    const y = previous.y + (current.y - previous.y) * t;
    return Math.hypot(x, y);
  }

  private resolveMiss(reason: MissReason): JudgeOutcome {
    this.stateValue = 'MISSED';
    this.outcome = { type: 'missed', gooseIndex: this.lockedIndex, reason, tick: this.tick };
    return this.outcome;
  }
}
