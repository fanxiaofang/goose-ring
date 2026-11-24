// Procedural textures from fanxiaofang/goose-test (source recorded in docs/agent-plan/04).
import * as THREE from 'three';

export interface SceneTextures {
  penTurfTexture: THREE.CanvasTexture;
  outerMeadowTexture: THREE.CanvasTexture;
  courtyardTexture: THREE.CanvasTexture;
  woodTexture: THREE.CanvasTexture;
  throwMatTexture: THREE.CanvasTexture;
  signTexture: THREE.CanvasTexture;
  contactShadowTexture: THREE.CanvasTexture;
}

export function createSimpleTextures(): SceneTextures {
  // 1. Soft stylized meadow turf inside the pen (gentle base + organic trampled earth paths, minimal stripe/speckle noise)
  const turfCanvas = document.createElement('canvas');
  turfCanvas.width = 512;
  turfCanvas.height = 512;
  const tctx = turfCanvas.getContext('2d')!;

  tctx.fillStyle = '#79a662';
  tctx.fillRect(0, 0, 512, 512);

  // Ultra-subtle mowed lawn bands (barely-there tonal shift so geese & rings pop cleanly)
  const stripeCount = 6;
  const stripeW = 512 / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    const x0 = i * stripeW;
    const grad = tctx.createLinearGradient(x0, 0, x0 + stripeW, 0);
    if (i % 2 === 0) {
      grad.addColorStop(0, 'rgba(142, 188, 114, 0.02)');
      grad.addColorStop(0.5, 'rgba(142, 188, 114, 0.08)');
      grad.addColorStop(1, 'rgba(142, 188, 114, 0.02)');
    } else {
      grad.addColorStop(0, 'rgba(90, 134, 68, 0.01)');
      grad.addColorStop(0.5, 'rgba(90, 134, 68, 0.05)');
      grad.addColorStop(1, 'rgba(90, 134, 68, 0.01)');
    }
    tctx.fillStyle = grad;
    tctx.fillRect(x0, 0, stripeW, 512);
  }

  // Organic trampled soil & worn-earth paths where geese waddle (natural earthy wear, not noisy dots)
  const trampledEarthPatches = [
    { x: 256, y: 265, rx: 135, ry: 78, rot: -0.08, inner: 'rgba(156, 128, 86, 0.34)', mid: 'rgba(148, 132, 88, 0.16)' },
    { x: 158, y: 215, rx: 88, ry: 56, rot: 0.25, inner: 'rgba(152, 124, 82, 0.30)', mid: 'rgba(144, 128, 86, 0.14)' },
    { x: 358, y: 230, rx: 94, ry: 60, rot: -0.22, inner: 'rgba(154, 126, 84, 0.30)', mid: 'rgba(146, 130, 86, 0.14)' },
    { x: 205, y: 345, rx: 82, ry: 48, rot: 0.12, inner: 'rgba(150, 122, 80, 0.26)', mid: 'rgba(142, 126, 84, 0.12)' },
    { x: 325, y: 340, rx: 76, ry: 46, rot: -0.18, inner: 'rgba(150, 122, 80, 0.25)', mid: 'rgba(142, 126, 84, 0.11)' },
    { x: 256, y: 150, rx: 96, ry: 44, rot: 0.05, inner: 'rgba(146, 120, 80, 0.22)', mid: 'rgba(138, 124, 84, 0.10)' },
  ];
  for (const p of trampledEarthPatches) {
    tctx.save();
    tctx.translate(p.x, p.y);
    tctx.rotate(p.rot);
    tctx.scale(1, p.ry / p.rx);
    const g = tctx.createRadialGradient(0, 0, p.rx * 0.12, 0, 0, p.rx);
    g.addColorStop(0, p.inner);
    g.addColorStop(0.55, p.mid);
    g.addColorStop(1, 'rgba(121, 166, 98, 0)');
    tctx.fillStyle = g;
    tctx.beginPath();
    tctx.arc(0, 0, p.rx, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();
  }

  // Subtle worn dirt strip along the fence perimeter where geese pace
  tctx.strokeStyle = 'rgba(142, 114, 76, 0.36)';
  tctx.lineWidth = 28;
  tctx.strokeRect(14, 14, 484, 484);

  tctx.strokeStyle = 'rgba(116, 90, 58, 0.22)';
  tctx.lineWidth = 10;
  tctx.strokeRect(4, 4, 504, 504);

  const penTurfTexture = new THREE.CanvasTexture(turfCanvas);
  penTurfTexture.colorSpace = THREE.SRGBColorSpace;

  // 2. Calmer, slightly darker outer meadow grass (draws eye naturally toward center pen)
  const meadowCanvas = document.createElement('canvas');
  meadowCanvas.width = 256;
  meadowCanvas.height = 256;
  const mctx = meadowCanvas.getContext('2d')!;
  mctx.fillStyle = '#6f935a';
  mctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 18; i++) {
    const cx = (i * 73 + 23) % 256;
    const cy = (i * 127 + 41) % 256;
    const r = 28 + (i % 24);
    const g = mctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(
      0,
      i % 2 === 0
        ? 'rgba(126, 164, 102, 0.16)'
        : 'rgba(92, 128, 72, 0.16)',
    );
    g.addColorStop(1, 'rgba(111, 147, 90, 0)');
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(cx, cy, r, 0, Math.PI * 2);
    mctx.fill();
  }
  const outerMeadowTexture = new THREE.CanvasTexture(meadowCanvas);
  outerMeadowTexture.colorSpace = THREE.SRGBColorSpace;
  outerMeadowTexture.wrapS = THREE.RepeatWrapping;
  outerMeadowTexture.wrapT = THREE.RepeatWrapping;
  outerMeadowTexture.repeat.set(12, 12);

  // 3. Calmer, lower-glare warm packed earth/sand path around the pen (reduces OLED bottom glare)
  const courtCanvas = document.createElement('canvas');
  courtCanvas.width = 256;
  courtCanvas.height = 256;
  const cctx = courtCanvas.getContext('2d')!;
  cctx.fillStyle = '#c8b89b';
  cctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 28; i++) {
    const cx = (i * 67 + 19) % 256;
    const cy = (i * 113 + 31) % 256;
    const r = 18 + (i % 20);
    const g = cctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    g.addColorStop(
      0,
      i % 2 === 0 ? 'rgba(178, 160, 130, 0.22)' : 'rgba(214, 200, 174, 0.18)',
    );
    g.addColorStop(1, 'rgba(200, 184, 155, 0)');
    cctx.fillStyle = g;
    cctx.beginPath();
    cctx.arc(cx, cy, r, 0, Math.PI * 2);
    cctx.fill();
  }

  const courtyardTexture = new THREE.CanvasTexture(courtCanvas);
  courtyardTexture.colorSpace = THREE.SRGBColorSpace;
  courtyardTexture.wrapS = THREE.RepeatWrapping;
  courtyardTexture.wrapT = THREE.RepeatWrapping;
  courtyardTexture.repeat.set(5, 4);

  // 4. Clean matte cedar wood finish (smooth warm tone without wavy stripe/spot artifacts)
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 128;
  woodCanvas.height = 128;
  const wctx = woodCanvas.getContext('2d')!;
  const woodBase = wctx.createLinearGradient(0, 0, 0, 128);
  woodBase.addColorStop(0, '#be8150');
  woodBase.addColorStop(0.5, '#b67847');
  woodBase.addColorStop(1, '#be8150');
  wctx.fillStyle = woodBase;
  wctx.fillRect(0, 0, 128, 128);

  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = THREE.RepeatWrapping;
  woodTexture.wrapT = THREE.RepeatWrapping;

  // 5. Crisp radial contact shadow disc for strong grounding contrast
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 64;
  shadowCanvas.height = 64;
  const sctx = shadowCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(20, 32, 16, 0.64)');
  grad.addColorStop(0.55, 'rgba(20, 32, 16, 0.28)');
  grad.addColorStop(1, 'rgba(20, 32, 16, 0.0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 64, 64);
  const contactShadowTexture = new THREE.CanvasTexture(shadowCanvas);
  contactShadowTexture.colorSpace = THREE.SRGBColorSpace;

  // 6. Soft woven oatmeal-linen throw mat texture with subtle launch ring emblem
  const matCanvas = document.createElement('canvas');
  matCanvas.width = 512;
  matCanvas.height = 256;
  const matCtx = matCanvas.getContext('2d')!;

  matCtx.fillStyle = '#cabba0';
  matCtx.fillRect(0, 0, 512, 256);

  // Ultra-soft woven jute tone variation (minimal contrast to avoid eye strain)
  matCtx.fillStyle = 'rgba(116, 92, 62, 0.045)';
  for (let y = 0; y < 256; y += 8) {
    matCtx.fillRect(0, y, 512, 3);
  }
  matCtx.fillStyle = 'rgba(242, 232, 212, 0.045)';
  for (let x = 0; x < 512; x += 12) {
    matCtx.fillRect(x, 0, 4, 256);
  }

  // Soft stitched border inset
  matCtx.strokeStyle = 'rgba(104, 78, 50, 0.34)';
  matCtx.lineWidth = 4;
  matCtx.setLineDash([12, 8]);
  matCtx.strokeRect(16, 16, 480, 224);
  matCtx.setLineDash([]);

  const throwMatTexture = new THREE.CanvasTexture(matCanvas);
  throwMatTexture.colorSpace = THREE.SRGBColorSpace;

  // 7. Hand-painted wooden stall plaque texture (ring + goose icon)
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 256;
  signCanvas.height = 160;
  const sgCtx = signCanvas.getContext('2d')!;

  sgCtx.fillStyle = '#c89a68';
  sgCtx.fillRect(0, 0, 256, 160);
  sgCtx.strokeStyle = '#7e522d';
  sgCtx.lineWidth = 10;
  sgCtx.strokeRect(10, 10, 236, 140);

  // Painted red toss ring
  sgCtx.strokeStyle = '#d4493a';
  sgCtx.lineWidth = 12;
  sgCtx.beginPath();
  sgCtx.ellipse(94, 92, 42, 22, -0.15, 0, Math.PI * 2);
  sgCtx.stroke();

  // Painted stylized white goose silhouette
  sgCtx.fillStyle = '#f5f0e4';
  sgCtx.beginPath();
  sgCtx.ellipse(158, 104, 28, 19, 0, 0, Math.PI * 2);
  sgCtx.fill();
  sgCtx.beginPath();
  sgCtx.roundRect(140, 44, 15, 56, 7);
  sgCtx.fill();
  sgCtx.beginPath();
  sgCtx.arc(150, 44, 12, 0, Math.PI * 2);
  sgCtx.fill();
  sgCtx.fillStyle = '#e07b28';
  sgCtx.beginPath();
  sgCtx.moveTo(160, 40);
  sgCtx.lineTo(178, 45);
  sgCtx.lineTo(160, 50);
  sgCtx.closePath();
  sgCtx.fill();

  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;

  return {
    penTurfTexture,
    outerMeadowTexture,
    courtyardTexture,
    woodTexture,
    throwMatTexture,
    signTexture,
    contactShadowTexture,
  };
}

export function disposeSimpleTextures(textures: SceneTextures): void {
  textures.penTurfTexture.dispose();
  textures.outerMeadowTexture.dispose();
  textures.courtyardTexture.dispose();
  textures.woodTexture.dispose();
  textures.throwMatTexture.dispose();
  textures.signTexture.dispose();
  textures.contactShadowTexture.dispose();
}
