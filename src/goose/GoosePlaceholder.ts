import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';

export interface GooseLayoutEntry {
  x: number;
  z: number;
  rotY: number;
}

/**
 * P0-0 灰盒鹅占位体：身体 + 脖子 + 头 + 喙。
 * 仅用于检查立体尺度与纵深，不包含动画；正式鹅模型在 P3 才引入。
 * 物理静态碰撞体由 PhysicsWorld 依据同一份 gameConfig.goose 生成，坐标保持一致。
 */
export function createGoosePlaceholder(entry: GooseLayoutEntry): THREE.Group {
  const { body, neck, head } = gameConfig.goose;
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({ color: '#f5f1e6' });
  const beakMat = new THREE.MeshLambertMaterial({ color: '#e0913a' });

  const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), bodyMat);
  bodyMesh.scale.set(body.rx, body.ry, body.rz);
  bodyMesh.position.set(0, body.y, 0);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(neck.radius * 0.9, neck.radius * 1.15, neck.height, 12),
    bodyMat,
  );
  neckMesh.position.set(0, neck.y, neck.forward);
  neckMesh.castShadow = true;
  group.add(neckMesh);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(head.radius, 18, 14), bodyMat);
  headMesh.position.set(0, head.y, head.forward);
  headMesh.castShadow = true;
  group.add(headMesh);

  const beakMesh = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 10), beakMat);
  beakMesh.rotation.x = Math.PI / 2;
  beakMesh.position.set(0, head.y - 0.01, head.forward + 0.14);
  beakMesh.castShadow = true;
  group.add(beakMesh);

  group.position.set(entry.x, 0, entry.z);
  group.rotation.y = entry.rotY;
  return group;
}
