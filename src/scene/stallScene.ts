import * as THREE from 'three';
import { gameConfig } from '../config/gameConfig';
import type { SceneTextures } from './stallTextures';

// Source: fanxiaofang/goose-test, src/three/stallScene.ts. Coordinates below describe its artwork.
const PEN_HALF_WIDTH = 4.8;
const PEN_HALF_DEPTH = 3.2;
const PEN_CENTER_Z = -0.6;

export interface StallSceneHandles {
  stallGroup: THREE.Group;
  dispose: () => void;
}

function createRoundedRectShape(
  width: number,
  depth: number,
  radius: number,
): THREE.Shape {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw, hd);
  const s = new THREE.Shape();
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  return s;
}

export function buildStallScene(
  textures: SceneTextures,
  shadowsEnabled = true,
): StallSceneHandles {
  const stallGroup = new THREE.Group();
  const { fence, throwLine } = gameConfig;
  const scaleX = fence.width / (2 * PEN_HALF_WIDTH);
  const scaleZ = fence.depth / (2 * PEN_HALF_DEPTH);
  stallGroup.name = 'fairground-stall';
  stallGroup.scale.set(scaleX, 1, scaleZ);
  stallGroup.position.z = -PEN_CENTER_Z * scaleZ;
  // The mat threshold stays on the existing throwing line after fitting the art to the pen.
  const matFrontZ = PEN_CENTER_Z + (fence.depth / 2 + throwLine.offsetZ) / scaleZ;
  const matCenterZ = matFrontZ + 1.18 / 2;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const registerMat = <T extends THREE.Material>(mat: T): T => {
    materials.push(mat);
    return mat;
  };

  const setShadow = (
    mesh: THREE.Mesh,
    castsShadow = false,
    receivesShadow = false,
  ) => {
    mesh.castShadow = shadowsEnabled && castsShadow;
    mesh.receiveShadow = shadowsEnabled && receivesShadow;
  };

  const minX = -PEN_HALF_WIDTH;
  const maxX = PEN_HALF_WIDTH;
  const minZ = PEN_CENTER_Z - PEN_HALF_DEPTH;
  const maxZ = PEN_CENTER_Z + PEN_HALF_DEPTH;

  // 1. Outer countryside park meadow lawn
  const outerGroundGeo = new THREE.PlaneGeometry(64, 64);
  outerGroundGeo.rotateX(-Math.PI / 2);
  geometries.push(outerGroundGeo);

  const outerGroundPbr = registerMat(
    new THREE.MeshStandardMaterial({
      map: textures.outerMeadowTexture,
      color: 0xd0dac4,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.08,
    }),
  );
  const outerGround = new THREE.Mesh(outerGroundGeo, outerGroundPbr);
  outerGround.position.y = -0.045;
  stallGroup.add(outerGround);
  setShadow(outerGround, false, true);

  // 2. Warm packed-sandstone gravel fairground apron
  const apronWidth = PEN_HALF_WIDTH * 2 + 2.0;
  const apronDepth = PEN_HALF_DEPTH * 2 + 4.4;
  const apronCenterZ = PEN_CENTER_Z + 1.4;
  const apronShape = createRoundedRectShape(apronWidth, apronDepth, 0.9);
  const apronGeo = new THREE.ExtrudeGeometry(apronShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  apronGeo.rotateX(-Math.PI / 2);
  const apronPos = apronGeo.attributes.position;
  const apronUv = apronGeo.attributes.uv;
  for (let i = 0; i < apronPos.count; i++) {
    apronUv.setXY(i, apronPos.getX(i) * 0.14, apronPos.getZ(i) * 0.14);
  }
  apronUv.needsUpdate = true;
  geometries.push(apronGeo);

  const apronPbr = registerMat(
    new THREE.MeshStandardMaterial({
      map: textures.courtyardTexture,
      color: 0xdcd2c0,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.08,
    }),
  );
  const gravelApron = new THREE.Mesh(apronGeo, apronPbr);
  gravelApron.position.set(0, -0.054, apronCenterZ);
  stallGroup.add(gravelApron);
  setShadow(gravelApron, false, true);

  // 3. Side stepping flagstones along the left & right gravel walkways
  const stoneStepGeo = new THREE.CylinderGeometry(0.28, 0.31, 0.014, 7);
  geometries.push(stoneStepGeo);
  const stoneStepPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xccbfa7,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.12,
    }),
  );

  const stepCoords: {
    x: number;
    z: number;
    sx: number;
    sz: number;
    ry: number;
    tint: number;
  }[] = [
    { x: -5.3, z: 1.9, sx: 0.85, sz: 1.05, ry: 0.14, tint: 0xb6a991 },
    { x: -5.32, z: 0.4, sx: 0.82, sz: 0.98, ry: -0.2, tint: 0xafa28b },
    { x: -5.28, z: -3.1, sx: 0.86, sz: 1.04, ry: 0.26, tint: 0xbbae96 },
    { x: 5.3, z: 1.75, sx: 0.84, sz: 1.06, ry: -0.16, tint: 0xb5a890 },
    { x: 5.32, z: 0.1, sx: 0.86, sz: 1.0, ry: 0.22, tint: 0xbcb099 },
    { x: 5.28, z: -1.65, sx: 0.82, sz: 1.04, ry: -0.12, tint: 0xb1a48e },
    { x: 5.3, z: -3.2, sx: 0.86, sz: 0.96, ry: 0.19, tint: 0xb9ac95 },
  ];

  const stepsMesh = new THREE.InstancedMesh(
    stoneStepGeo,
    stoneStepPbr,
    stepCoords.length,
  );
  const dummy = new THREE.Object3D();
  const tempColor = new THREE.Color();
  stepCoords.forEach((st, i) => {
    dummy.position.set(st.x, -0.015, st.z);
    dummy.rotation.set(0, st.ry, 0);
    dummy.scale.set(st.sx, 1, st.sz);
    dummy.updateMatrix();
    stepsMesh.setMatrixAt(i, dummy.matrix);
    tempColor.setHex(st.tint);
    stepsMesh.setColorAt(i, tempColor);
  });
  stepsMesh.instanceMatrix.needsUpdate = true;
  if (stepsMesh.instanceColor) stepsMesh.instanceColor.needsUpdate = true;
  stepsMesh.computeBoundingSphere();
  stallGroup.add(stepsMesh);
  setShadow(stepsMesh, false, true);

  // 4. Timber curb border framing the pen turf
  const turfBorderGeo = new THREE.BoxGeometry(
    PEN_HALF_WIDTH * 2 + 0.36,
    0.036,
    PEN_HALF_DEPTH * 2 + 0.36,
  );
  geometries.push(turfBorderGeo);
  const turfBorderPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x8f6b47,
      roughness: 0.78,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.4,
    }),
  );
  const turfBorder = new THREE.Mesh(turfBorderGeo, turfBorderPbr);
  turfBorder.position.set(0, -0.018, PEN_CENTER_Z);
  stallGroup.add(turfBorder);
  setShadow(turfBorder, true, true);

  // 5. Pen inner turf floor
  const penFloorGeo = new THREE.PlaneGeometry(
    PEN_HALF_WIDTH * 2 + 0.08,
    PEN_HALF_DEPTH * 2 + 0.08,
  );
  penFloorGeo.rotateX(-Math.PI / 2);
  geometries.push(penFloorGeo);
  const penFloorPbr = registerMat(
    new THREE.MeshStandardMaterial({
      map: textures.penTurfTexture,
      color: 0xeef3e8,
      roughness: 0.95,
      metalness: 0.0,
      envMapIntensity: 0.1,
    }),
  );
  const penFloor = new THREE.Mesh(penFloorGeo, penFloorPbr);
  penFloor.position.set(0, 0.002, PEN_CENTER_Z);
  stallGroup.add(penFloor);
  setShadow(penFloor, false, true);

  // 6. Foreground Wooden Stall Deck + Central Woven Linen Throw Mat
  const deckWidth = 14.6;
  const deckDepth = 3.24;
  const deckCenterZ = 4.30;
  const halfDeckWidth = deckWidth / 2;
  const halfSeam = 0.006;
  const deckEdges = [
    -deckDepth / 2,
    ...[-deckDepth / 4, 0, deckDepth / 4].flatMap((z) => [z - halfSeam, z + halfSeam]),
    deckDepth / 2,
  ];
  const deckVertices: number[] = [];
  const deckColors: number[] = [];
  const boardColor = new THREE.Color(0xad845d);
  const seamColor = new THREE.Color(0x97714f);
  for (let strip = 0; strip < deckEdges.length - 1; strip++) {
    const z0 = deckEdges[strip];
    const z1 = deckEdges[strip + 1];
    deckVertices.push(
      -halfDeckWidth, 0, z0, -halfDeckWidth, 0, z1, halfDeckWidth, 0, z0,
      halfDeckWidth, 0, z0, -halfDeckWidth, 0, z1, halfDeckWidth, 0, z1,
    );
    const color = strip % 2 === 0 ? boardColor : seamColor;
    for (let vertex = 0; vertex < 6; vertex++) deckColors.push(color.r, color.g, color.b);
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckVertices, 3));
  deckGeo.setAttribute('color', new THREE.Float32BufferAttribute(deckColors, 3));
  deckGeo.computeVertexNormals();
  geometries.push(deckGeo);
  const deckPbr = registerMat(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      envMapIntensity: 0.22,
    }),
  );
  const deck = new THREE.Mesh(deckGeo, deckPbr);
  deck.position.z = deckCenterZ;
  stallGroup.add(deck);
  setShadow(deck, false, true);

  // Central woven oatmeal-linen throw mat resting on the wooden deck
  const matTrimGeo = new THREE.BoxGeometry(3.38, 0.012, 1.26);
  const matBodyGeo = new THREE.BoxGeometry(3.3, 0.016, 1.18);
  const matBattenGeo = new THREE.BoxGeometry(throwLine.width / scaleX, 0.026, 0.075);
  geometries.push(matTrimGeo, matBodyGeo, matBattenGeo);

  const matTrimPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x735236,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  const matTopPbr = registerMat(
    new THREE.MeshStandardMaterial({
      map: textures.throwMatTexture,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.14,
    }),
  );

  const matTrim = new THREE.Mesh(matTrimGeo, matTrimPbr);
  matTrim.position.set(0, -0.003, matCenterZ);
  stallGroup.add(matTrim);
  setShadow(matTrim, false, true);

  const throwMat = new THREE.Mesh(matBodyGeo, matTopPbr);
  throwMat.position.set(0, -0.003, matCenterZ);
  stallGroup.add(throwMat);
  setShadow(throwMat, true, true);

  const matBatten = new THREE.Mesh(matBattenGeo, matTrimPbr);
  matBatten.position.set(0, -0.01, matFrontZ);
  stallGroup.add(matBatten);
  setShadow(matBatten, true, true);

  // 7. Wooden Fence Materials (satin wood contrast vs matte turf)
  const woodPbr = registerMat(
    new THREE.MeshStandardMaterial({
      map: textures.woodTexture,
      roughness: 0.72,
      metalness: 0.02,
      flatShading: true,
      envMapIntensity: 0.5,
    }),
  );
  const woodTrimPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xd69a68,
      roughness: 0.68,
      metalness: 0.02,
      flatShading: true,
      envMapIntensity: 0.5,
    }),
  );
  const woodDarkPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x7d4c2a,
      roughness: 0.74,
      metalness: 0.02,
      flatShading: true,
      envMapIntensity: 0.45,
    }),
  );
  const stonePbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x9b9589,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.35,
    }),
  );

  const postGeo = new THREE.BoxGeometry(0.16, 0.94, 0.16);
  const postCapGeo = new THREE.ConeGeometry(0.145, 0.1, 4);
  postCapGeo.rotateY(Math.PI / 4);
  const postCollarGeo = new THREE.BoxGeometry(0.2, 0.06, 0.2);
  const footingGeo = new THREE.CylinderGeometry(0.13, 0.16, 0.08, 6);
  geometries.push(postGeo, postCapGeo, postCollarGeo, footingGeo);

  const addPost = (
    x: number,
    z: number,
    height: number,
    { corner = false, capped = true } = {},
  ) => {
    const widthScale = corner ? 1.15 : 1;
    const h = capped ? height - 0.14 : height;
    const footing = new THREE.Mesh(footingGeo, stonePbr);
    footing.scale.set(widthScale, 1, widthScale);
    footing.position.set(x, 0.04, z);
    stallGroup.add(footing);
    setShadow(footing, false, true);

    const post = new THREE.Mesh(postGeo, woodPbr);
    post.scale.set(widthScale, h / 0.94, widthScale);
    post.position.set(x, h / 2, z);
    stallGroup.add(post);
    setShadow(post, true, true);

    if (!capped) return;

    const collar = new THREE.Mesh(postCollarGeo, woodDarkPbr);
    collar.scale.set(widthScale, 1, widthScale);
    collar.position.set(x, h + 0.03, z);
    stallGroup.add(collar);
    setShadow(collar, true, true);

    const cap = new THREE.Mesh(postCapGeo, woodDarkPbr);
    cap.scale.set(widthScale, 1, widthScale);
    cap.position.set(x, h + 0.09, z);
    stallGroup.add(cap);
    setShadow(cap, true, true);
  };

  const xStops = [-4.8, -3.2, -1.6, 0, 1.6, 3.2, 4.8];
  const zStops = [minZ, minZ + 1.6, minZ + 3.2, minZ + 4.8, maxZ];

  for (const x of xStops) {
    const corner = Math.abs(x) === PEN_HALF_WIDTH;
    addPost(x, minZ, fence.farHeight + (corner ? 0.21 : 0.14), { corner });
    const frontPostTop = corner ? fence.sideHeight + 0.21 : fence.nearHeight + (x === 0 ? 0 : 0.29);
    addPost(x, maxZ, frontPostTop, {
      corner,
      capped: x !== 0,
    });
  }

  for (let i = 1; i < zStops.length - 1; i++) {
    addPost(minX, zStops[i], fence.sideHeight + 0.14);
    addPost(maxX, zStops[i], fence.sideHeight + 0.14);
  }

  // Throw mat front-edge boundary pegs
  const throwPegGeo = new THREE.CylinderGeometry(0.046, 0.056, 0.13, 8);
  geometries.push(throwPegGeo);
  const throwPegPbr = registerMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xd9483b,
      roughness: 0.32,
      metalness: 0.03,
      clearcoat: 0.32,
      clearcoatRoughness: 0.24,
    }),
  );
  [-throwLine.width / (2 * scaleX), throwLine.width / (2 * scaleX)].forEach((px) => {
    const peg = new THREE.Mesh(throwPegGeo, throwPegPbr);
    peg.position.set(px, 0.065, matFrontZ);
    stallGroup.add(peg);
    setShadow(peg, true, true);
  });

  // The corner posts carry the level side rail above the lower front rail.
  const beamGeo = new THREE.BoxGeometry(1, 1, 1);
  geometries.push(beamGeo);
  const addBeam = (from: THREE.Vector3, to: THREE.Vector3, trimmed = false) => {
    const direction = to.clone().sub(from);
    const beam = new THREE.Mesh(beamGeo, woodPbr);
    beam.position.copy(from).lerp(to, 0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.clone().normalize());
    beam.scale.set(0.075, 0.11, direction.length());
    stallGroup.add(beam);
    setShadow(beam, true, true);

    if (trimmed) {
      const trim = new THREE.Mesh(beamGeo, woodTrimPbr);
      trim.position.set(0, 0.075, 0).applyQuaternion(beam.quaternion).add(beam.position);
      trim.quaternion.copy(beam.quaternion);
      trim.scale.set(0.095, 0.04, direction.length());
      stallGroup.add(trim);
      setShadow(trim, true, true);
    }
  };

  const backRailY = fence.farHeight - 0.095;
  const sideRailY = fence.sideHeight - 0.095;
  const frontRailY = fence.nearHeight - 0.095;
  addBeam(new THREE.Vector3(minX, 0.32, minZ), new THREE.Vector3(maxX, 0.32, minZ));
  addBeam(new THREE.Vector3(minX, backRailY, minZ), new THREE.Vector3(maxX, backRailY, minZ), true);
  addBeam(new THREE.Vector3(minX, frontRailY, maxZ), new THREE.Vector3(maxX, frontRailY, maxZ), true);
  for (const x of [minX, maxX]) {
    addBeam(new THREE.Vector3(x, 0.32, minZ), new THREE.Vector3(x, 0.32, maxZ));
    addBeam(new THREE.Vector3(x, sideRailY, minZ), new THREE.Vector3(x, sideRailY, maxZ), true);
  }

  // 8. Carnival Bunting Pennants
  const pennantGeo = new THREE.ConeGeometry(0.11, 0.22, 3);
  pennantGeo.rotateX(Math.PI);
  pennantGeo.scale(1.1, 1, 0.25);
  geometries.push(pennantGeo);

  const pennantPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0.0,
      flatShading: true,
    }),
  );

  const pennantCount = 24;
  const pennantsMesh = new THREE.InstancedMesh(
    pennantGeo,
    pennantPbr,
    pennantCount,
  );
  const pennantPalette = [
    new THREE.Color(0x8fb082),
    new THREE.Color(0xc7a76c),
    new THREE.Color(0xdad2c3),
    new THREE.Color(0xbf7d6b),
  ];
  for (let i = 0; i < pennantCount; i++) {
    const spanIdx = Math.floor(i / 4);
    const localT = ((i % 4) + 0.5) / 4;
    const x0 = xStops[spanIdx];
    const x1 = xStops[spanIdx + 1];
    const px = THREE.MathUtils.lerp(x0, x1, localT);
    const sag = Math.sin(localT * Math.PI) * 0.06;
    dummy.position.set(px, backRailY + 0.17 - sag, minZ + 0.086);
    dummy.rotation.set(0, 0, (localT - 0.5) * -0.18);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    pennantsMesh.setMatrixAt(i, dummy.matrix);
    pennantsMesh.setColorAt(i, pennantPalette[i % pennantPalette.length]);
  }
  pennantsMesh.instanceMatrix.needsUpdate = true;
  if (pennantsMesh.instanceColor) pennantsMesh.instanceColor.needsUpdate = true;
  pennantsMesh.computeBoundingSphere();
  stallGroup.add(pennantsMesh);
  setShadow(pennantsMesh, true, false);

  // 9. Exterior Stall Props

  // 9a. Spare Red Toss-Ring Stand on front-right wooden deck
  const standGroup = new THREE.Group();
  standGroup.position.set(4.15, 0.028, 3.16);
  standGroup.scale.setScalar(1.08);
  const standBaseGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.06, 12);
  const standPegGeo = new THREE.CylinderGeometry(0.036, 0.044, 0.56, 10);
  const standCapGeo = new THREE.SphereGeometry(0.052, 10, 8);
  const spareRingGeo = new THREE.TorusGeometry(0.255, 0.032, 10, 20);
  spareRingGeo.rotateX(Math.PI / 2);
  geometries.push(standBaseGeo, standPegGeo, standCapGeo, spareRingGeo);

  const spareRingPbr = registerMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe24638,
      roughness: 0.3,
      metalness: 0.03,
      clearcoat: 0.35,
      clearcoatRoughness: 0.24,
      envMapIntensity: 0.6,
    }),
  );

  const standBase = new THREE.Mesh(standBaseGeo, woodDarkPbr);
  standBase.position.y = 0.03;
  standGroup.add(standBase);
  setShadow(standBase, true, true);

  const standPeg = new THREE.Mesh(standPegGeo, woodTrimPbr);
  standPeg.position.y = 0.3;
  standGroup.add(standPeg);
  setShadow(standPeg, true, true);

  const standCap = new THREE.Mesh(standCapGeo, woodDarkPbr);
  standCap.position.y = 0.59;
  standGroup.add(standCap);
  setShadow(standCap, true, true);

  for (let r = 0; r < 4; r++) {
    const sr = new THREE.Mesh(spareRingGeo, spareRingPbr);
    sr.position.set((r % 2 === 0 ? 1 : -1) * 0.012, 0.095 + r * 0.072, 0);
    sr.rotation.z = (r - 1.5) * 0.035;
    standGroup.add(sr);
    setShadow(sr, true, true);
  }
  stallGroup.add(standGroup);

  // 9b. Front-left wooden supply crate + galvanized metal feed bucket on wooden deck
  const cratePbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xc98a52,
      roughness: 0.72,
      metalness: 0.02,
      flatShading: true,
    }),
  );
  const metalPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xb6c0c8,
      roughness: 0.3,
      metalness: 0.8,
      envMapIntensity: 1.35,
    }),
  );
  const grainPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xe6c15a,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
    }),
  );

  const crateGeo = new THREE.BoxGeometry(0.54, 0.38, 0.48);
  const crateTrimGeo = new THREE.BoxGeometry(0.58, 0.06, 0.52);
  const bucketGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.24, 14);
  const grainGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12);
  geometries.push(crateGeo, crateTrimGeo, bucketGeo, grainGeo);

  const crateGroup = new THREE.Group();
  crateGroup.position.set(-4.15, 0.028, 3.16);
  crateGroup.rotation.y = 0.3;
  crateGroup.scale.setScalar(1.08);

  const crateBox = new THREE.Mesh(crateGeo, cratePbr);
  crateBox.position.y = 0.19;
  crateGroup.add(crateBox);
  setShadow(crateBox, true, true);

  const crateRim = new THREE.Mesh(crateTrimGeo, woodDarkPbr);
  crateRim.position.y = 0.36;
  crateGroup.add(crateRim);
  setShadow(crateRim, true, true);

  const bucket = new THREE.Mesh(bucketGeo, metalPbr);
  bucket.position.set(0.06, 0.5, 0.02);
  crateGroup.add(bucket);
  setShadow(bucket, true, true);

  const grainTop = new THREE.Mesh(grainGeo, grainPbr);
  grainTop.position.set(0.06, 0.61, 0.02);
  crateGroup.add(grainTop);
  setShadow(grainTop, false, true);
  stallGroup.add(crateGroup);

  // 9b-2. Sturdy A-frame wooden stall signboard beside front-left crate
  const signPostGeo = new THREE.BoxGeometry(0.075, 0.56, 0.065);
  const signBackLegGeo = new THREE.BoxGeometry(0.065, 0.54, 0.055);
  const signBoardGeo = new THREE.BoxGeometry(0.86, 0.5, 0.05);
  const signCapGeo = new THREE.BoxGeometry(0.92, 0.055, 0.08);
  const signFaceGeo = new THREE.PlaneGeometry(0.8, 0.44);
  geometries.push(
    signPostGeo,
    signBackLegGeo,
    signBoardGeo,
    signCapGeo,
    signFaceGeo,
  );

  const signFacePbr = registerMat(
    new THREE.MeshStandardMaterial({
      map: textures.signTexture,
      roughness: 0.78,
      metalness: 0.0,
      envMapIntensity: 0.2,
    }),
  );

  const signGroup = new THREE.Group();
  signGroup.position.set(-2.95, 0.028, 3.16);
  signGroup.rotation.y = 0.24;

  [-0.28, 0.28].forEach((lx) => {
    const frontLeg = new THREE.Mesh(signPostGeo, woodDarkPbr);
    frontLeg.position.set(lx, 0.27, 0.06);
    frontLeg.rotation.x = -0.18;
    signGroup.add(frontLeg);
    setShadow(frontLeg, true, true);

    const backLeg = new THREE.Mesh(signBackLegGeo, woodDarkPbr);
    backLeg.position.set(lx, 0.25, -0.09);
    backLeg.rotation.x = 0.24;
    signGroup.add(backLeg);
    setShadow(backLeg, true, true);
  });

  const signTilt = new THREE.Group();
  signTilt.position.set(0, 0.34, 0.05);
  signTilt.rotation.x = -0.22;

  const board = new THREE.Mesh(signBoardGeo, woodPbr);
  signTilt.add(board);
  setShadow(board, true, true);

  const boardCap = new THREE.Mesh(signCapGeo, woodDarkPbr);
  boardCap.position.y = 0.255;
  signTilt.add(boardCap);
  setShadow(boardCap, true, true);

  const boardFace = new THREE.Mesh(signFaceGeo, signFacePbr);
  boardFace.position.z = 0.027;
  signTilt.add(boardFace);
  setShadow(boardFace, false, true);

  signGroup.add(signTilt);
  stallGroup.add(signGroup);

  // 9c. Left-side lengthened wooden water trough outside fence
  const troughGroup = new THREE.Group();
  troughGroup.position.set(-5.48, -0.022, -1.15);
  const troughBodyGeo = new THREE.BoxGeometry(0.44, 0.22, 1.88);
  const troughWaterGeo = new THREE.PlaneGeometry(0.32, 1.72);
  troughWaterGeo.rotateX(-Math.PI / 2);
  const troughFootGeo = new THREE.BoxGeometry(0.48, 0.06, 0.14);
  geometries.push(troughBodyGeo, troughWaterGeo, troughFootGeo);

  const waterPbr = registerMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x4d8ca8,
      roughness: 0.22,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.2,
      envMapIntensity: 0.35,
    }),
  );

  [-0.72, 0.72].forEach((fz) => {
    const foot = new THREE.Mesh(troughFootGeo, woodPbr);
    foot.position.set(0, 0.03, fz);
    troughGroup.add(foot);
    setShadow(foot, true, true);
  });

  const troughBody = new THREE.Mesh(troughBodyGeo, woodDarkPbr);
  troughBody.position.y = 0.13;
  troughGroup.add(troughBody);
  setShadow(troughBody, true, true);

  const troughWater = new THREE.Mesh(troughWaterGeo, waterPbr);
  troughWater.position.y = 0.245;
  troughGroup.add(troughWater);
  setShadow(troughWater, false, true);
  stallGroup.add(troughGroup);

  // 9d. Back-left stacked muted hay bales
  const hayPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xc29c4c,
      roughness: 0.94,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  const twinePbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.86,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  const hayGeo = new THREE.BoxGeometry(0.86, 0.48, 0.56);
  const twineGeo = new THREE.BoxGeometry(0.04, 0.5, 0.58);
  geometries.push(hayGeo, twineGeo);

  const addHayBale = (x: number, y: number, z: number, ry: number) => {
    const bale = new THREE.Group();
    bale.position.set(x, y, z);
    bale.rotation.y = ry;
    const body = new THREE.Mesh(hayGeo, hayPbr);
    bale.add(body);
    setShadow(body, false, true);
    [-0.22, 0.22].forEach((tx) => {
      const band = new THREE.Mesh(twineGeo, twinePbr);
      band.position.x = tx;
      bale.add(band);
      setShadow(band, false, true);
    });
    stallGroup.add(bale);
  };
  addHayBale(-6.2, 0.2, -4.65, 0.22);
  addHayBale(-6.6, 0.2, -3.95, -0.35);
  addHayBale(-6.35, 0.68, -4.35, 0.08);

  // 9e. Back-right cozy goose pond (sky-reflecting glossy water + matte stones)
  const pondGroup = new THREE.Group();
  pondGroup.position.set(6.35, -0.045, -4.75);

  const pondGeo = new THREE.CircleGeometry(1.12, 22);
  pondGeo.rotateX(-Math.PI / 2);
  pondGeo.scale(1.18, 1, 0.88);
  const pondInnerGeo = new THREE.CircleGeometry(0.76, 18);
  pondInnerGeo.rotateX(-Math.PI / 2);
  pondInnerGeo.scale(1.12, 1, 0.84);
  geometries.push(pondGeo, pondInnerGeo);

  const pondInnerPbr = registerMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x5d9ab5,
      roughness: 0.2,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.18,
      envMapIntensity: 0.38,
    }),
  );

  const pondWater = new THREE.Mesh(pondGeo, waterPbr);
  pondWater.position.y = 0.015;
  pondGroup.add(pondWater);
  setShadow(pondWater, false, true);

  const pondHighlight = new THREE.Mesh(pondInnerGeo, pondInnerPbr);
  pondHighlight.position.set(-0.08, 0.02, 0.04);
  pondGroup.add(pondHighlight);
  setShadow(pondHighlight, false, true);

  const rimRockGeo = new THREE.DodecahedronGeometry(0.16, 0);
  geometries.push(rimRockGeo);
  const rimRockPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x9e9a8e,
      roughness: 0.84,
      metalness: 0.0,
      flatShading: true,
    }),
  );

  const rimCount = 18;
  const rimRocks = new THREE.InstancedMesh(rimRockGeo, rimRockPbr, rimCount);
  for (let i = 0; i < rimCount; i++) {
    const a = (i / rimCount) * Math.PI * 2;
    const rx = Math.cos(a) * 1.32;
    const rz = Math.sin(a) * 0.98;
    dummy.position.set(rx, 0.05, rz);
    dummy.rotation.set(i * 0.4, a, i * 0.3);
    const sc = 0.78 + (i % 3) * 0.24;
    dummy.scale.set(sc * 1.15, sc * 0.65, sc);
    dummy.updateMatrix();
    rimRocks.setMatrixAt(i, dummy.matrix);
    tempColor.setHex(i % 2 === 0 ? 0xa39e92 : 0x8a877d);
    rimRocks.setColorAt(i, tempColor);
  }
  rimRocks.instanceMatrix.needsUpdate = true;
  if (rimRocks.instanceColor) rimRocks.instanceColor.needsUpdate = true;
  rimRocks.computeBoundingSphere();
  pondGroup.add(rimRocks);
  setShadow(rimRocks, false, true);

  // Lily pads & cattails
  const lilyGeo = new THREE.CircleGeometry(0.16, 12, 0.3, Math.PI * 1.82);
  lilyGeo.rotateX(-Math.PI / 2);
  const lilyPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c9e47,
      roughness: 0.52,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  const reedStalkGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.68, 6);
  const reedHeadGeo = new THREE.CylinderGeometry(0.036, 0.036, 0.16, 8);
  const reedHeadPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x6b3e22,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  geometries.push(lilyGeo, reedStalkGeo, reedHeadGeo);

  [
    { x: -0.35, z: -0.1, s: 1.0, r: 0.4 },
    { x: 0.32, z: 0.22, s: 0.82, r: 2.1 },
  ].forEach((lp) => {
    const pad = new THREE.Mesh(lilyGeo, lilyPbr);
    pad.position.set(lp.x, 0.026, lp.z);
    pad.rotation.y = lp.r;
    pad.scale.setScalar(lp.s);
    pondGroup.add(pad);
    setShadow(pad, false, true);
  });

  [
    { x: 1.08, z: -0.45, lean: 0.12 },
    { x: 1.18, z: -0.28, lean: -0.08 },
    { x: 0.96, z: -0.58, lean: 0.16 },
  ].forEach((rd) => {
    const stalk = new THREE.Mesh(reedStalkGeo, lilyPbr);
    stalk.position.set(rd.x, 0.34, rd.z);
    stalk.rotation.z = rd.lean;
    pondGroup.add(stalk);
    setShadow(stalk, false, false);

    const head = new THREE.Mesh(reedHeadGeo, reedHeadPbr);
    head.position.set(rd.x - rd.lean * 0.22, 0.56, rd.z);
    head.rotation.z = rd.lean;
    pondGroup.add(head);
    setShadow(head, false, false);
  });
  stallGroup.add(pondGroup);

  // 9f. Warm wooden stall lantern posts
  const lanternBodyGeo = new THREE.CylinderGeometry(0.11, 0.09, 0.22, 8);
  const lanternCapGeo = new THREE.ConeGeometry(0.15, 0.09, 8);
  const lanternPoleGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.45, 8);
  const lanternGlowPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xefe3bd,
      emissive: 0xd98a26,
      emissiveIntensity: 0.25,
      roughness: 0.55,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  geometries.push(lanternBodyGeo, lanternCapGeo, lanternPoleGeo);

  [-5.25, 5.25].forEach((lx) => {
    const lPost = new THREE.Group();
    lPost.position.set(lx, -0.022, minZ - 0.35);
    const pole = new THREE.Mesh(lanternPoleGeo, woodDarkPbr);
    pole.position.y = 0.725;
    lPost.add(pole);
    setShadow(pole, true, true);

    const shade = new THREE.Mesh(lanternBodyGeo, lanternGlowPbr);
    shade.position.y = 1.48;
    lPost.add(shade);
    setShadow(shade, false, false);

    const roof = new THREE.Mesh(lanternCapGeo, woodDarkPbr);
    roof.position.y = 1.63;
    lPost.add(roof);
    setShadow(roof, false, false);

    stallGroup.add(lPost);
  });

  // 9g. Framing Countryside Low-Poly Trees & Farmstead Edge Details (Option B: no spherical bushes)
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.17, 1.1, 7);
  const canopyGeo = new THREE.DodecahedronGeometry(0.68, 1);
  const treeLeafPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x568244,
      roughness: 0.88,
      metalness: 0.0,
      flatShading: true,
      envMapIntensity: 0.25,
    }),
  );
  geometries.push(trunkGeo, canopyGeo);

  const addTree = (x: number, z: number, scale: number) => {
    const tree = new THREE.Group();
    tree.position.set(x, -0.045, z);
    tree.scale.setScalar(scale);

    const shadowGeo = new THREE.CircleGeometry(0.9, 14);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = registerMat(
      new THREE.MeshBasicMaterial({
        map: textures.contactShadowTexture,
        transparent: true,
        depthWrite: false,
      }),
    );
    geometries.push(shadowGeo);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.01;
    tree.add(shadow);

    const trunk = new THREE.Mesh(trunkGeo, woodDarkPbr);
    trunk.position.y = 0.55;
    tree.add(trunk);
    setShadow(trunk, false, true);

    const puffSpecs = [
      { pos: [0, 1.38, 0], s: [1.05, 0.92, 1.05] },
      { pos: [-0.36, 1.18, 0.16], s: [0.72, 0.68, 0.72] },
      { pos: [0.38, 1.22, -0.14], s: [0.68, 0.64, 0.68] },
    ];
    puffSpecs.forEach(({ pos, s }) => {
      const puff = new THREE.Mesh(canopyGeo, treeLeafPbr);
      puff.position.set(pos[0], pos[1], pos[2]);
      puff.scale.set(s[0], s[1], s[2]);
      tree.add(puff);
      setShadow(puff, false, false);
    });

    stallGroup.add(tree);
  };

  addTree(7.45, -5.55, 1.05);

  // Smooth rounded meadow fieldstone clusters (replaces the faceted green bush balls)
  const pebbleGeo = new THREE.SphereGeometry(0.18, 8, 6);
  const pebblePbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.15,
    }),
  );
  geometries.push(pebbleGeo);

  const pebbleSpecs: {
    x: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    ry: number;
    c: number;
  }[] = [
    { x: -3.2, z: -4.95, sx: 1.1, sy: 0.46, sz: 0.88, ry: -0.25, c: 0x9b9589 },
    { x: -2.9, z: -5.08, sx: 0.72, sy: 0.4, sz: 0.68, ry: 0.5, c: 0xa8a194 },
    { x: 2.35, z: -4.92, sx: 1.18, sy: 0.48, sz: 0.94, ry: 0.42, c: 0x958f83 },
    { x: 2.65, z: -5.06, sx: 0.76, sy: 0.4, sz: 0.72, ry: -0.3, c: 0xa7a093 },
  ];
  const pebblesMesh = new THREE.InstancedMesh(
    pebbleGeo,
    pebblePbr,
    pebbleSpecs.length,
  );
  pebbleSpecs.forEach((p, i) => {
    dummy.position.set(p.x, -0.025, p.z);
    dummy.rotation.set(0, p.ry, 0);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.updateMatrix();
    pebblesMesh.setMatrixAt(i, dummy.matrix);
    tempColor.setHex(p.c);
    pebblesMesh.setColorAt(i, tempColor);
  });
  pebblesMesh.instanceMatrix.needsUpdate = true;
  if (pebblesMesh.instanceColor) pebblesMesh.instanceColor.needsUpdate = true;
  pebblesMesh.computeBoundingSphere();
  stallGroup.add(pebblesMesh);
  setShadow(pebblesMesh, false, true);

  // Rustic low farmyard boundary stakes outside the pen
  const yardStakeGeo = new THREE.CylinderGeometry(0.06, 0.075, 0.36, 7);
  const yardCapGeo = new THREE.CylinderGeometry(0.072, 0.068, 0.04, 7);
  const stakeShadowGeo = new THREE.CircleGeometry(0.22, 10);
  stakeShadowGeo.rotateX(-Math.PI / 2);
  const stakeShadowMat = registerMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadowTexture,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  geometries.push(yardStakeGeo, yardCapGeo, stakeShadowGeo);

  const yardStakes: { x: number; z: number; h: number; tilt: number }[] = [
    { x: -6.05, z: 0.45, h: 1.0, tilt: 0.05 },
    { x: -4.95, z: -5.1, h: 0.92, tilt: -0.04 },
    { x: 4.55, z: -5.05, h: 0.95, tilt: 0.04 },
    { x: 6.1, z: -0.15, h: 0.88, tilt: -0.05 },
  ];
  yardStakes.forEach((st) => {
    const stakeGrp = new THREE.Group();
    stakeGrp.position.set(st.x, -0.045, st.z);

    const sh = new THREE.Mesh(stakeShadowGeo, stakeShadowMat);
    sh.position.y = 0.008;
    stakeGrp.add(sh);

    const post = new THREE.Mesh(yardStakeGeo, woodPbr);
    post.position.y = 0.18 * st.h;
    post.scale.y = st.h;
    post.rotation.z = st.tilt;
    stakeGrp.add(post);
    setShadow(post, true, true);

    const cap = new THREE.Mesh(yardCapGeo, woodDarkPbr);
    cap.position.set(-Math.sin(st.tilt) * 0.35 * st.h, 0.36 * st.h, 0);
    cap.rotation.z = st.tilt;
    stakeGrp.add(cap);
    setShadow(cap, true, true);

    stallGroup.add(stakeGrp);
  });

  // 10. Low Meadow Grass Tufts & Wildflowers
  const tuftGeo = new THREE.ConeGeometry(0.065, 0.16, 4);
  tuftGeo.translate(0, 0.08, 0);
  const tuftPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c8c46,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  geometries.push(tuftGeo);

  const tuftCoords: [number, number, number][] = [
    [-4.35, 0.01, minZ + 0.34],
    [-4.15, 0.01, minZ + 0.48],
    [-3.45, 0.01, minZ + 0.28],
    [4.32, 0.01, minZ + 0.35],
    [4.12, 0.01, minZ + 0.52],
    [3.5, 0.01, minZ + 0.28],
    [-4.38, 0.01, maxZ - 0.34],
    [-4.15, 0.01, maxZ - 0.45],
    [4.35, 0.01, maxZ - 0.36],
    [4.12, 0.01, maxZ - 0.48],
    [-4.45, 0.01, PEN_CENTER_Z - 0.9],
    [-4.42, 0.01, PEN_CENTER_Z + 0.7],
    [4.44, 0.01, PEN_CENTER_Z - 0.7],
    [4.4, 0.01, PEN_CENTER_Z + 0.85],
    [-5.95, -0.04, 1.4],
    [-6.15, -0.04, -0.4],
    [-6.05, -0.04, -2.9],
    [-4.85, -0.04, -5.02],
    [-3.1, -0.04, -4.92],
    [-1.2, -0.04, -4.98],
    [0.6, -0.04, -5.05],
    [2.3, -0.04, -4.9],
    [4.4, -0.04, -4.98],
    [6.1, -0.04, 1.15],
    [6.05, -0.04, -1.05],
    [6.2, -0.04, -3.15],
  ];

  const tuftsMesh = new THREE.InstancedMesh(
    tuftGeo,
    tuftPbr,
    tuftCoords.length * 2,
  );
  let tIdx = 0;
  for (let i = 0; i < tuftCoords.length; i++) {
    const [tx, ty, tz] = tuftCoords[i];
    for (let b = 0; b < 2; b++) {
      dummy.position.set(tx + (b - 0.5) * 0.07, ty, tz + b * 0.04);
      dummy.rotation.set(
        b === 0 ? 0.14 : -0.12,
        i * 1.1 + b,
        b === 0 ? -0.15 : 0.16,
      );
      const s = 0.85 + ((i + b) % 3) * 0.16;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      tuftsMesh.setMatrixAt(tIdx++, dummy.matrix);
    }
  }
  tuftsMesh.instanceMatrix.needsUpdate = true;
  tuftsMesh.computeBoundingSphere();
  stallGroup.add(tuftsMesh);
  setShadow(tuftsMesh, false, true);

  const flowerGeo = new THREE.DodecahedronGeometry(0.045, 0);
  const flowerPbr = registerMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.0,
      flatShading: true,
    }),
  );
  geometries.push(flowerGeo);

  const flowerCoords: [number, number, number][] = [
    [-4.25, 0.09, minZ + 0.42],
    [-3.52, 0.09, minZ + 0.34],
    [4.24, 0.09, minZ + 0.44],
    [3.56, 0.09, minZ + 0.34],
    [-4.28, 0.09, maxZ - 0.4],
    [4.25, 0.09, maxZ - 0.42],
    [-6.1, 0.04, 1.48],
    [-6.05, 0.04, -2.85],
    [-4.75, 0.04, -4.96],
    [-1.25, 0.04, -4.92],
    [0.65, 0.04, -4.98],
    [2.25, 0.04, -4.86],
    [6.15, 0.04, 1.2],
    [6.1, 0.04, -3.1],
  ];
  const flowersMesh = new THREE.InstancedMesh(
    flowerGeo,
    flowerPbr,
    flowerCoords.length,
  );
  const flowerColors = [
    new THREE.Color(0xe6dfd0),
    new THREE.Color(0xdec268),
    new THREE.Color(0xe6dfd0),
    new THREE.Color(0xd99062),
  ];
  flowerCoords.forEach(([fx, fy, fz], i) => {
    dummy.position.set(fx, fy, fz);
    dummy.rotation.set(0, i * 0.7, 0);
    dummy.scale.set(1.1, 0.65, 1.1);
    dummy.updateMatrix();
    flowersMesh.setMatrixAt(i, dummy.matrix);
    flowersMesh.setColorAt(i, flowerColors[i % flowerColors.length]);
  });
  flowersMesh.instanceMatrix.needsUpdate = true;
  if (flowersMesh.instanceColor) flowersMesh.instanceColor.needsUpdate = true;
  flowersMesh.computeBoundingSphere();
  stallGroup.add(flowersMesh);
  setShadow(flowersMesh, false, false);

  return {
    stallGroup,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
