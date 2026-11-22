import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { Vec3Like } from '../goose/GoosePlaceholder';

/**
 * 套圈飞行预览（P0-0 构图验证工具）。
 *
 * 仅做视觉演示：一条抛物线轨迹 + 一个圈 + 地面投影 + 目标脖子标记。
 * 不创建物理刚体、不参与命中判定、不影响正式玩法数据。
 */
export class RingPreview {
  private readonly root = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly shadow: THREE.Mesh;
  private readonly shadowMat: THREE.MeshBasicMaterial;
  private readonly neckMarker: THREE.Mesh;
  private readonly neckMarkerMat: THREE.MeshBasicMaterial;
  private readonly line: THREE.Line;
  private readonly lineMat: THREE.LineDashedMaterial;

  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();

  private elapsed = 0;
  private active = false;
  private loop = false;
  private fadeK = 1;

  constructor(scene: THREE.Scene) {
    const { ringRadius, tubeRadius } = gameConfig.ringPreview;

    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#ffd23f',
      transparent: true,
      opacity: 1,
    });
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, tubeRadius, 10, 36),
      this.ringMat,
    );
    this.ring.rotation.x = Math.PI / 2;
    this.root.add(this.ring);

    this.shadowMat = new THREE.MeshBasicMaterial({
      color: '#000000',
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(ringRadius * 0.55, 24), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);

    this.neckMarkerMat = new THREE.MeshBasicMaterial({
      color: '#35d6e8',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    this.neckMarker = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius * 0.46, 0.022, 8, 28),
      this.neckMarkerMat,
    );
    this.neckMarker.rotation.x = Math.PI / 2;
    this.root.add(this.neckMarker);

    this.lineMat = new THREE.LineDashedMaterial({
      color: '#ffd23f',
      dashSize: 0.18,
      gapSize: 0.13,
      transparent: true,
      opacity: 0.75,
    });
    this.line = new THREE.Line(new THREE.BufferGeometry(), this.lineMat);
    this.root.add(this.line);

    this.root.visible = false;
    scene.add(this.root);
  }

  /** 从投掷起点飞向鹅脖位置；loop 用于截图时循环演示。 */
  start(from: Vec3Like, target: Vec3Like, loop = false): void {
    this.p0.set(from.x, from.y, from.z);
    this.p2.set(target.x, target.y, target.z);
    this.p1.set(
      (this.p0.x + this.p2.x) / 2,
      (this.p0.y + this.p2.y) / 2 + gameConfig.ringPreview.arcLift,
      (this.p0.z + this.p2.z) / 2,
    );

    this.neckMarker.position.set(this.p2.x, this.p2.y, this.p2.z);
    this.buildTrajectoryLine();

    this.elapsed = 0;
    this.loop = loop;
    this.active = true;
    this.root.visible = true;
    this.setOpacity(1);
    this.placeAtPath(0);
  }

  /**
   * 截图/人工核对用：直接停在落点保持阶段，不再推进动画。
   * 仅视觉冻结，不生成刚体、不影响物理与判定。
   */
  freezeAtTarget(): void {
    this.placeAtPath(1);
    this.setOpacity(1);
    this.neckMarkerMat.opacity = 0.9;
    this.active = false;
    this.root.visible = true;
  }

  /** 每帧由 GameApp 传入帧间隔（视觉动画，不进入物理步）。 */
  update(dt: number): void {
    if (!this.active) return;
    const { durationSec, holdSec, fadeSec } = gameConfig.ringPreview;
    this.elapsed += dt;

    if (this.elapsed < durationSec) {
      const t = this.elapsed / durationSec;
      this.placeAtPath(t);
      this.setOpacity(1);
      this.neckMarkerMat.opacity = 0.55 + 0.35 * t;
      return;
    }

    if (this.elapsed < durationSec + holdSec) {
      this.placeAtPath(1);
      this.ring.rotation.x = Math.PI / 2 + Math.sin(this.elapsed * 5) * 0.12;
      this.setOpacity(1);
      return;
    }

    if (this.elapsed < durationSec + holdSec + fadeSec) {
      const k = (this.elapsed - durationSec - holdSec) / fadeSec;
      this.placeAtPath(1);
      this.setOpacity(1 - k);
      return;
    }

    if (this.loop) {
      this.start(this.p0, this.p2, true);
      return;
    }
    this.active = false;
    this.root.visible = false;
  }

  private placeAtPath(t: number): void {
    const it = 1 - t;
    const x = it * it * this.p0.x + 2 * it * t * this.p1.x + t * t * this.p2.x;
    const y = it * it * this.p0.y + 2 * it * t * this.p1.y + t * t * this.p2.y;
    const z = it * it * this.p0.z + 2 * it * t * this.p1.z + t * t * this.p2.z;
    this.ring.position.set(x, y, z);
    this.ring.rotation.x = Math.PI / 2 + Math.sin(this.elapsed * 7) * 0.18;
    this.shadow.position.set(x, 0.025, z);
    const h = Math.max(0, Math.min(1, y / 4));
    this.shadowMat.opacity = 0.3 * (1 - h * 0.6) * this.fadeK;
    const s = 1 + h * 0.5;
    this.shadow.scale.set(s, s, s);
  }

  private buildTrajectoryLine(): void {
    const segments = 28;
    const positions = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const it = 1 - t;
      positions[i * 3] = it * it * this.p0.x + 2 * it * t * this.p1.x + t * t * this.p2.x;
      positions[i * 3 + 1] =
        it * it * this.p0.y + 2 * it * t * this.p1.y + t * t * this.p2.y;
      positions[i * 3 + 2] =
        it * it * this.p0.z + 2 * it * t * this.p1.z + t * t * this.p2.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.line.geometry.dispose();
    this.line.geometry = geo;
    this.line.computeLineDistances();
  }

  private setOpacity(k: number): void {
    this.fadeK = Math.max(0, k);
    this.ringMat.opacity = Math.max(0, k);
    this.neckMarkerMat.opacity = Math.max(0, 0.9 * k);
    this.lineMat.opacity = Math.max(0, 0.75 * k);
  }
}
