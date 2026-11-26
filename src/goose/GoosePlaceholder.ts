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

  const bodyMat = new THREE.MeshLambertMaterial({ color: '#fff8eb' });
  const wingMat = new THREE.MeshLambertMaterial({ color: '#e9e2d5' });
  const billMat = new THREE.MeshLambertMaterial({ color: '#f98020' });
  const eyeMat = new THREE.MeshLambertMaterial({ color: '#261b17' });
  const detailGeo = new THREE.SphereGeometry(1, 16, 12);

  // 身体：略压扁的椭球
  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), bodyMat);
  bodyMesh.scale.set(body.rx, body.ry, body.rz);
  bodyMesh.position.set(0, body.y, 0);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  // 尾部：向后的小锥包，勾勒身体朝向
  const tailMesh = new THREE.Mesh(detailGeo, bodyMat);
  tailMesh.scale.set(0.2, 0.16, 0.24);
  tailMesh.position.set(0, body.y + 0.19, -body.rz * 0.83);
  tailMesh.rotation.x = 0.35;
  tailMesh.castShadow = true;
  group.add(tailMesh);

  // 脖子：S 形曲线管，明确区分“身体—脖子—头”
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, body.y + 0.08, body.rz * 0.67),
    new THREE.Vector3(0, body.y + 0.31, neck.forward - 0.01),
    new THREE.Vector3(0, neck.y, neck.forward),
    new THREE.Vector3(0, head.y - 0.02, head.forward),
  ]);
  const neckMesh = new THREE.Mesh(
    new THREE.TubeGeometry(neckCurve, 20, neck.radius, 10, false),
    bodyMat,
  );
  neckMesh.name = 'neck';
  neckMesh.castShadow = true;
  group.add(neckMesh);

  // 头
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(head.radius, 20, 16), bodyMat);
  headMesh.name = 'head';
  headMesh.position.set(0, head.y, head.forward);
  headMesh.castShadow = true;
  group.add(headMesh);

  const headDetailScale = head.radius / 0.18;
  // 喙：指向 +Z（鹅面向的方向）
  const beakMesh = new THREE.Mesh(detailGeo, billMat);
  beakMesh.scale.set(0.093, 0.049, 0.144);
  beakMesh.rotation.x = 0.22;
  beakMesh.position.set(0, head.y - 0.04, head.forward + head.radius + 0.005);
  beakMesh.castShadow = true;
  group.add(beakMesh);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(detailGeo, eyeMat);
    eye.scale.setScalar(0.033);
    eye.position.set(
      sx * 0.125 * headDetailScale,
      head.y + 0.056 * headDetailScale,
      head.forward + 0.114 * headDetailScale,
    );
    group.add(eye);

    const wing = new THREE.Mesh(detailGeo, wingMat);
    wing.scale.set(0.14, 0.215, 0.38);
    wing.position.set(sx * (body.rx - 0.09), body.y + 0.015, -0.11);
    wing.rotation.x = -0.22;
    wing.castShadow = true;
    group.add(wing);

    const foot = new THREE.Mesh(detailGeo, billMat);
    foot.scale.set(0.125, 0.05, 0.19);
    foot.position.set(sx * 0.18, 0.075, 0.24);
    foot.rotation.y = sx * 0.19;
    group.add(foot);
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
