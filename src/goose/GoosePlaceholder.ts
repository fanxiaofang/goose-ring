import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

export interface GooseLayoutEntry {
  x: number;
  z: number;
  rotY: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * P0-0 灰盒鹅占位体：身体 + 弯曲脖子 + 头 + 喙 + 眼睛。
 * 仅用于检查立体尺度与头颈可读性，不包含动画；正式鹅模型在 P3 才引入。
 * 物理静态碰撞体由 PhysicsWorld 依据同一份 gameConfig.goose 生成，坐标保持一致。
 */
export function createGoosePlaceholder(entry: GooseLayoutEntry): THREE.Group {
  const { body, neck, head } = gameConfig.goose;
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: '#f0eadb' });
  const neckMat = new THREE.MeshLambertMaterial({ color: '#faf6ea' });
  const headMat = new THREE.MeshLambertMaterial({ color: '#fffdf6' });
  const beakMat = new THREE.MeshLambertMaterial({ color: '#e0913a' });
  const eyeMat = new THREE.MeshLambertMaterial({ color: '#2a2a2a' });

  // 身体：略压扁的椭球
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), bodyMat);
  bodyMesh.scale.set(body.rx, body.ry, body.rz);
  bodyMesh.position.set(0, body.y, 0);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // 尾部：向后的小锥包，勾勒身体朝向
  const tailMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bodyMat);
  tailMesh.scale.set(0.16, 0.13, 0.22);
  tailMesh.position.set(0, 0.4, -body.rz - 0.12);
  tailMesh.castShadow = true;
  group.add(tailMesh);

  // 脖子：S 形曲线管，明确区分“身体—脖子—头”
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, body.y + 0.06, body.rz * 0.45),
    new THREE.Vector3(0, body.y + 0.24, body.rz * 0.6),
    new THREE.Vector3(0, head.y - 0.2, neck.forward - 0.01),
    new THREE.Vector3(0, head.y - 0.03, neck.forward + 0.02),
  ]);
  const neckMesh = new THREE.Mesh(
    new THREE.TubeGeometry(neckCurve, 20, neck.radius, 10, false),
    neckMat,
  );
  neckMesh.castShadow = true;
  group.add(neckMesh);

  // 头
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(head.radius, 20, 16), headMat);
  headMesh.position.set(0, head.y, head.forward);
  headMesh.castShadow = true;
  group.add(headMesh);

  // 喙：指向 +Z（鹅面向的方向）
  const beakMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.17, 12), beakMat);
  beakMesh.rotation.x = Math.PI / 2;
  beakMesh.position.set(0, head.y - 0.015, head.forward + 0.15);
  beakMesh.castShadow = true;
  group.add(beakMesh);

  // 眼睛：两只小黑球，帮助在远处识别头部朝向
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), eyeMat);
    eye.position.set(sx * 0.062, head.y + 0.035, head.forward + 0.09);
    group.add(eye);
  }

  group.position.set(entry.x, 0, entry.z);
  group.rotation.y = entry.rotY;
  return group;
}

/** 鹅脖子中段的世界坐标（供套圈飞行预览瞄准，旋转与视觉保持一致）。 */
export function getGooseNeckWorldPosition(entry: GooseLayoutEntry): Vec3Like {
  const { neck } = gameConfig.goose;
  return {
    x: entry.x + Math.sin(entry.rotY) * neck.forward,
    y: neck.y,
    z: entry.z + Math.cos(entry.rotY) * neck.forward,
  };
}
