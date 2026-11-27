import * as THREE from 'three';
import { toon, toonUnique, makeBlob } from '#look';
import { SLIDER, PALETTE, SKINS, HAIR_COLORS, EYE_COLORS, GLOWS, LIPS, STYLES } from '../../../js/character.js?v=c4';

/*
 * 새 캐릭터 (v2) — shared/js/character.js 의 번호를 받아 짓는다.
 * 스타일 넷이 바탕 비율(머리 · 몸통 · 다리 · 팔)을 정하고, 밀대(근육 · 몸길이 · 팔길이 · 다리길이 ·
 * 얼굴 크기)가 그 위에서 늘이고 줄인다. 움직이는 법(걷기 · 던지기 · 손 내밀기 · 손에 든 것)은
 * actor.js 의 예전 캐릭터와 같은 모양으로 돌려준다 — main.js 는 둘을 가리지 않는다.
 *
 * 앞은 +Z. 얼굴 앞으로 지나가는 것은 눈을 가리므로 앞머리는 눈썹 위에서 끝낸다.
 * 서른 명이 모여도 버티게 조각은 성기게(구 20×14) — 한 명에 삼각형 2만 개 안쪽.
 */

const ball = new THREE.SphereGeometry(1, 20, 14);
const halfBall = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
const capGeo = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);   // 머리칼 덮개
const hoodGeo = new THREE.SphereGeometry(1, 22, 16, Math.PI / 2 + 0.78, Math.PI * 2 - 1.56, 0, Math.PI * 0.8);
const cone = new THREE.ConeGeometry(1, 1, 10);
const rod = new THREE.CylinderGeometry(1, 1, 1, 10);
const disc = new THREE.CylinderGeometry(1, 1, 1, 18);
const ring = new THREE.TorusGeometry(1, 0.18, 8, 28);
const arc = new THREE.TorusGeometry(1, 0.24, 6, 16, Math.PI);          // ∩ — 돌리면 ∪
const band = new THREE.TorusGeometry(1, 0.07, 6, 24, Math.PI);         // 헤드폰 머리띠
const box = new THREE.BoxGeometry(1, 1, 1);
const starGeo = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++){
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
})();
const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-1.3, 0, -0.9, 1.05, 0, 0.45);
  s.bezierCurveTo(0.9, 1.05, 1.3, 0, 0, -0.9);
  return new THREE.ShapeGeometry(s);
})();

const METAL = 0x7A808A, DARKM = 0x3A3D44, MOUTH = 0x7A3A46, WHITE = 0xFFFFFF;
const glowCache = new Map();
const glowMat = c => {
  if (!glowCache.has(c)) glowCache.set(c, new THREE.MeshBasicMaterial({ color: c }));
  return glowCache.get(c);
};
const shade = (c, k) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
};
const lum = c => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;

function put(parent, geo, mat, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/* 스타일 바탕 비율 (m) */
const BASE = [
  // 스트리트 치비 — 머리가 크고 몸이 짧다
  { headR: 0.25, torsoH: 0.27, torsoW: 0.15, torsoD: 0.12, legH: 0.27, legR: 0.05, armLen: 0.25, armR: 0.042, neck: 0.02, eye: 1.2, shoe: 1.15 },
  // 미니멀 후드 — 매끈하고 고른
  { headR: 0.19, torsoH: 0.33, torsoW: 0.15, torsoD: 0.11, legH: 0.40, legR: 0.055, armLen: 0.33, armR: 0.046, neck: 0.03, eye: 1, shoe: 1 },
  // 어반 후디 — 조금 더 크고 묵직한
  { headR: 0.18, torsoH: 0.35, torsoW: 0.165, torsoD: 0.115, legH: 0.42, legR: 0.06, armLen: 0.35, armR: 0.05, neck: 0.03, eye: 1, shoe: 1.1 },
  // 롱레그 패션 — 작은 머리 · 긴 다리
  { headR: 0.14, torsoH: 0.33, torsoW: 0.125, torsoD: 0.092, legH: 0.62, legR: 0.044, armLen: 0.38, armR: 0.034, neck: 0.05, eye: 0.85, shoe: 1 }
];

export function createAvatar(c, { lamp = false } = {}){
  const own = [];                                   // 이 캐릭터만의 조각 · 재질 — 치울 때 버린다
  const g = geo => (own.push(geo), geo);
  const uniq = (color, opts) => { const m = toonUnique(color, opts); own.push(m); return m; };
  const sl = (v, lo, hi) => lo + (hi - lo) * (v / SLIDER);

  const B = BASE[c.style] || BASE[0];
  const faced = STYLES[c.style].face;
  const G = c.gender;                               // 0 남 · 1 여 · 2 무지
  const mech = G === 2;
  const thick = sl(c.muscle, 0.78, 1.45);
  const R = B.headR * sl(c.head, 0.85, 1.18);
  const torsoH = B.torsoH * sl(c.torso, 0.8, 1.22);
  const torsoW = B.torsoW * sl(c.muscle, 0.9, 1.2) * (G === 1 ? 0.92 : G === 0 ? 1.04 : 1);
  const torsoD = B.torsoD * sl(c.muscle, 0.92, 1.15);
  const legH = B.legH * sl(c.leg, 0.72, 1.32);
  const legR = B.legR * thick * (G === 1 ? 0.95 : 1);
  const armLen = B.armLen * sl(c.arm, 0.75, 1.3);
  const armR = B.armR * thick * (G === 1 ? 0.9 : 1);

  const skinC = faced ? SKINS[c.skin] : PALETTE[c.faceColor];
  const skin = toon(skinC);
  const top = PALETTE[c.topColor], bot = PALETTE[c.bottomColor], shoeC = PALETTE[c.shoesColor];
  const hatC = PALETTE[c.hatColor ?? c.topColor], accC = PALETTE[c.accColor ?? 4];
  const hairC = HAIR_COLORS[c.hairColor];
  const metal = toon(METAL), dmetal = toon(DARKM);
  const glowC = GLOWS[c.glow];

  const group = new THREE.Group();
  group.add(makeBlob(Math.max(0.22, torsoW * 1.9)));

  /* ── 다리 — 엉덩이에서 돌고(hip) 무릎에서 접힌다(knee) ── */
  const shoeH = 0.055 * B.shoe;
  const thighL = legH * 0.5, shinL = legH * 0.5 - shoeH;
  const hipX = torsoW * (G === 1 ? 0.5 : 0.46);
  const limb = (parent, r, len, mat, y0 = 0, x = 0, z = 0) =>
    put(parent, g(new THREE.CapsuleGeometry(r, Math.max(0.002, len), 4, 12)), mat, x, y0 - len / 2, z, 1);
  const tube = (parent, r1, r2, len, mat, y0 = 0) =>
    put(parent, g(new THREE.CylinderGeometry(r1, r2, len, 14)), mat, 0, y0 - len / 2, 0, 1);

  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group();
    hip.position.set(s * hipX, legH, 0);
    group.add(hip);
    limb(hip, legR, thighL, skin);
    const knee = new THREE.Group();
    knee.position.y = -thighL;
    hip.add(knee);
    limb(knee, legR * 0.92, shinL, skin);
    if (mech) put(knee, ball, metal, 0, 0, 0, legR * 1.15);
    return { s, hip, knee };
  });

  /* 하의 */
  const bm = toon(bot);
  const bk = c.bottom;
  if (bk !== 4) put(group, ball, bm, 0, legH + 0.015, 0, torsoW * 1.03, Math.max(0.05, torsoW * 0.45), torsoD * 1.06);
  for (const { s, hip, knee } of legs){
    switch (bk){
      case 0: limb(hip, legR * 1.38, thighL * 0.72, bm); break;                                     // 반바지
      case 1: limb(hip, legR * 1.32, thighL, bm); tube(knee, legR * 1.28, legR * 1.1, shinL * 0.86, bm);
              put(knee, ring, toon(shade(bot, 0.8)), 0, -shinL * 0.88, 0, legR * 1.12, legR * 1.12, legR * 1.5, Math.PI / 2); break;
      case 2: limb(hip, legR * 1.3, thighL, bm); limb(knee, legR * 1.26, shinL * 0.92, bm); break;   // 청바지
      case 3: limb(hip, legR * 1.32, thighL, bm); limb(knee, legR * 1.28, shinL * 0.92, bm);         // 카고
              put(hip, box, toon(shade(bot, 0.85)), s * legR * 1.3, -thighL * 0.55, 0.004, legR * 0.5, thighL * 0.38, legR * 1.3); break;
      case 5: limb(hip, legR * 1.1, thighL, bm); limb(knee, legR * 1.06, shinL * 0.95, bm);          // 레깅스 + 워머
              for (let i = 0; i < 3; i++)
                put(knee, ring, toon(0xF2F2F0), 0, -shinL * (0.42 + i * 0.17), 0, legR * 1.55, legR * 1.55, legR * 2.4, Math.PI / 2);
              put(knee, ball, toon(0xF2F2F0), 0, -shinL * 0.6, 0, legR * 1.55, shinL * 0.3, legR * 1.55); break;
      case 6: tube(hip, legR * 1.55, legR * 1.7, thighL + legR, bm, legR); tube(knee, legR * 1.7, legR * 2.0, shinL * 0.95, bm); break;
      case 7: limb(hip, legR * 1.42, thighL, bm); tube(knee, legR * 1.38, legR * 1.2, shinL * 0.86, bm);  // 트레이닝
              put(knee, ring, toon(shade(bot, 0.8)), 0, -shinL * 0.88, 0, legR * 1.22, legR * 1.22, legR * 1.6, Math.PI / 2);
              put(hip, box, toon(WHITE), s * legR * 1.4, -thighL * 0.5, 0, legR * 0.12, thighL * 1.0, legR * 0.3); break;
    }
  }
  if (bk === 4){                                                                                    // 치마
    const skirtH = thighL * 0.85;
    put(group, g(new THREE.CylinderGeometry(torsoW * 1.02, torsoW * 1.55, skirtH, 24, 1, true)),
        uniq(bot, { side: THREE.DoubleSide }), 0, legH + 0.03 - skirtH / 2, 0, 1, 1, torsoD / torsoW * 1.1);
  }

  /* 신발 — 발끝은 앞(+Z) */
  const footL = Math.max(0.1, legR * 2.5) * B.shoe;
  const sc = toon(shoeC);
  for (const { knee } of legs){
    const fy = -shinL - shoeH / 2, fz = footL * 0.22;
    switch (c.shoes){
      case 0: case 1: case 3:
        put(knee, ball, sc, 0, fy + shoeH * 0.1, fz, legR * 1.35, shoeH * (c.shoes === 3 ? 0.45 : 0.62), footL * 0.55);
        put(knee, ball, toon(c.shoes === 3 ? shade(shoeC, 0.75) : WHITE), 0, fy - shoeH * 0.28, fz, legR * 1.42, shoeH * 0.24, footL * 0.58);
        if (c.shoes === 1) tube(knee, legR * 1.3, legR * 1.35, shoeH * 1.6, sc, -shinL + shoeH * 1.3);
        break;
      case 2:
        tube(knee, legR * 1.32, legR * 1.4, shinL * 0.38, sc, -shinL * 0.62);
        put(knee, ball, sc, 0, fy + shoeH * 0.1, fz, legR * 1.42, shoeH * 0.62, footL * 0.55);
        put(knee, ball, toon(shade(shoeC, 0.6)), 0, fy - shoeH * 0.3, fz, legR * 1.46, shoeH * 0.2, footL * 0.57);
        break;
      default:
        put(knee, ball, skin, 0, fy, fz, legR * 1.1, shoeH * 0.5, footL * 0.5);
    }
  }

  /* ── 몸통 ── */
  const hipY = legH, torsoY = hipY + torsoH / 2;
  const tr = Math.min(torsoW, torsoH * 0.45);
  const puffer = c.top === 3;
  const tm = toon(top);
  put(group, g(new THREE.CapsuleGeometry(tr, Math.max(0.01, torsoH - 2 * tr), 5, 16)), tm,
    0, torsoY, 0, torsoW / tr * (puffer ? 1.12 : 1), 1, torsoD / tr * (puffer ? 1.15 : 1));
  const frontZ = torsoD * (puffer ? 1.15 : 1);
  const neckY = hipY + torsoH;

  /* 목 · 어깨 */
  limb(group, armR * 0.85 * (mech ? 0.9 : 1), B.neck + 0.03, mech ? dmetal : skin, neckY + B.neck + 0.03);
  if (mech) put(group, ring, metal, 0, neckY + B.neck * 0.6, 0, armR * 1.05, armR * 1.05, armR * 1.4, Math.PI / 2);

  /* 팔 — 어깨에서 돈다. 손은 팔 끝(-y) */
  const shY = neckY - armR * 1.3, shX = torsoW * (puffer ? 1.1 : 1) + armR * 0.55;
  const sleeve = { 0: 0.42, 5: 0 }[c.top] ?? 0.93;
  const sleeveR = armR * (puffer ? 1.65 : 1.28);
  const arms = [-1, 1].map(s => {
    const a = new THREE.Group();
    a.position.set(s * shX, shY, 0);
    group.add(a);
    limb(a, armR, armLen - armR, skin);
    put(a, ball, skin, 0, -armLen + armR * 0.2, 0, armR * 1.25);                                 // 손
    if (sleeve) limb(a, sleeveR, (armLen - armR) * sleeve, tm, armR * 0.4);
    if (puffer) for (const k of [0.35, 0.7]) put(a, ring, toon(shade(top, 0.88)), 0, -armLen * k, 0, sleeveR * 0.98, sleeveR * 0.98, sleeveR * 1.6, Math.PI / 2);
    if (c.top === 4 || c.top === 1) put(a, ring, toon(shade(top, 0.82)), 0, -(armLen - armR) * sleeve, 0, sleeveR * 0.9, sleeveR * 0.9, sleeveR * 1.4, Math.PI / 2);
    if (mech) put(a, ball, metal, 0, 0, 0, armR * 1.35);
    return a;
  });
  const [armL, armR_] = arms;
  armR_.rotation.z = -0.34;              // 든 팔은 바깥으로 벌린다 (예전 캐릭터와 같다)

  /* 상의 장식 */
  const midY = torsoY;
  switch (c.top){
    case 1:                                                                                       // 후디 — 주머니 · 끈 · 내린 후드
      put(group, ball, toon(shade(top, 0.92)), 0, hipY + torsoH * 0.26, frontZ * 0.9, torsoW * 0.5, torsoH * 0.12, torsoD * 0.22);
      for (const s of [-1, 1]) put(group, rod, toon(shade(top, 0.75)), s * torsoW * 0.18, neckY - torsoH * 0.18, frontZ * 0.97, 0.006, torsoH * 0.28, 0.006);
      if (c.hat !== 3) put(group, ball, toon(shade(top, 0.92)), 0, neckY + 0.01, -torsoD * 0.7, torsoW * 0.85, torsoH * 0.18, torsoD * 0.55);
      put(group, ring, toon(shade(top, 0.85)), 0, hipY + 0.02, 0, torsoW * 1.0, torsoD * 1.0, 0.6, Math.PI / 2);
      break;
    case 2:                                                                                       // 재킷 — 안의 셔츠 · 깃
      put(group, ball, toon(lum(top) > 0.8 ? 0x2A2B2F : WHITE), 0, midY + torsoH * 0.08, frontZ * 0.9, torsoW * 0.3, torsoH * 0.42, torsoD * 0.2);
      put(group, ring, toon(shade(top, 0.85)), 0, neckY - 0.005, 0, torsoW * 0.62, torsoD * 0.75, 1.1, Math.PI / 2);
      for (const s of [-1, 1]) put(group, box, toon(shade(top, 0.8)), s * torsoW * 0.36, midY - torsoH * 0.1, frontZ * 0.93, torsoW * 0.22, 0.012, 0.02);
      break;
    case 3:                                                                                       // 패딩 — 누빔 띠 · 높은 깃
      for (const k of [0.3, 0.62]) put(group, ring, toon(shade(top, 0.88)), 0, hipY + torsoH * k, 0, torsoW * 1.13, torsoD * 1.16, 0.7, Math.PI / 2);
      put(group, ring, toon(shade(top, 0.9)), 0, neckY + 0.005, 0, torsoW * 0.7, torsoD * 0.85, 1.6, Math.PI / 2);
      break;
    case 4:                                                                                       // 맨투맨 — 밑단 고무
      put(group, ring, toon(shade(top, 0.82)), 0, hipY + 0.02, 0, torsoW * 1.0, torsoD * 1.0, 0.7, Math.PI / 2);
      break;
    case 6:                                                                                       // 바람막이 — 가슴 띠 · 깃
      put(group, ring, toon(lum(top) > 0.7 ? 0x3D8BF2 : WHITE), 0, midY + torsoH * 0.12, 0, torsoW * 1.0, torsoD * 1.0, 0.9, Math.PI / 2);
      put(group, ring, toon(shade(top, 0.85)), 0, neckY - 0.005, 0, torsoW * 0.62, torsoD * 0.75, 1.1, Math.PI / 2);
      break;
    case 7:                                                                                       // 셔츠 — 깃 · 단추
      for (const s of [-1, 1]) put(group, cone, toon(shade(top, 0.92)), s * torsoW * 0.22, neckY - 0.012, frontZ * 0.72, torsoW * 0.2, 0.05, 0.02, 0, 0, s * 2.2);
      for (let i = 0; i < 3; i++) put(group, ball, toon(shade(top, 0.7)), 0, neckY - torsoH * (0.22 + i * 0.22), frontZ * 0.99, 0.009);
      break;
  }
  if (mech) put(group, ball, glowMat(glowC), 0, midY + torsoH * 0.15, frontZ * 0.98, torsoW * 0.14, torsoW * 0.14, 0.012);  // 가슴 불빛

  /* 소품 */
  const am = toon(accC);
  switch (c.acc){
    case 1:                                                                                       // 체인
      put(group, ring, am, 0, neckY - 0.03, frontZ * 0.25, torsoW * 0.62, torsoD * 1.0, 0.25, Math.PI / 2 + 0.5);
      put(group, ball, am, 0, neckY - torsoH * 0.32, frontZ * 0.98, 0.018, 0.022, 0.01);
      break;
    case 2:                                                                                       // 크로스백
      put(group, box, am, 0, midY, frontZ * 1.0, 0.016, torsoH * 1.15, 0.008, 0, 0, 0.75);
      put(group, ball, am, torsoW * 0.75, hipY + torsoH * 0.12, frontZ * 0.75, torsoW * 0.42, torsoH * 0.18, torsoD * 0.35);
      break;
    case 3:                                                                                       // 백팩
      put(group, ball, am, 0, midY + torsoH * 0.05, -torsoD - torsoD * 0.35, torsoW * 0.85, torsoH * 0.42, torsoD * 0.55);
      for (const s of [-1, 1]) put(group, box, am, s * torsoW * 0.5, midY + torsoH * 0.1, frontZ * 0.92, 0.02, torsoH * 0.7, 0.01);
      break;
    case 4:                                                                                       // 목도리
      put(group, ring, am, 0, neckY + 0.01, 0, torsoW * 0.7, torsoD * 0.85, 2.0, Math.PI / 2);
      put(group, ball, am, torsoW * 0.35, neckY - torsoH * 0.25, frontZ * 0.95, torsoW * 0.18, torsoH * 0.28, 0.025);
      break;
  }

  /* ── 머리 ── */
  const headY = neckY + B.neck + R * 0.92;
  const head = new THREE.Group();
  head.position.y = headY;
  group.add(head);
  const HX = R, HY = R * (faced ? 0.96 : 1.02), HZ = R * 0.94;
  put(head, ball, skin, 0, 0, 0, HX, HY, HZ);
  const fz = (x, y) => HZ * Math.sqrt(Math.max(0, 1 - (x / HX) ** 2 - (y / HY) ** 2));
  /* 얼굴 겉면에 붙인다 — 겉면 쪽으로 돌려 놓는다 */
  const onFace = (geo, mat, x, y, sx, sy, sz, rz = 0, lift = 0) => {
    const m = put(head, geo, mat, x, y, fz(x, y) - sz * 0.35 + lift, sx, sy, sz);
    m.rotation.set(-Math.asin(Math.max(-1, Math.min(1, y / HY))) * 0.85, Math.asin(Math.max(-1, Math.min(1, x / HX))) * 0.85, rz);
    return m;
  };

  const hatOn = c.hat >= 1 && c.hat <= 4;
  const eyeY = R * sl(c.forehead, 0.06, -0.14) * (faced ? 1 : 0.4);
  const gx = R * sl(c.glabella, 0.26, 0.46);
  const browY = eyeY + R * 0.3 * B.eye;

  if (faced){
    /* 턱 */
    switch (c.chin){
      case 1: put(head, ball, skin, 0, -R * 0.5, R * 0.22, R * 0.5, R * 0.52, R * 0.58); break;
      case 2: for (const s of [-1, 1]) put(head, ball, skin, s * R * 0.5, -R * 0.46, R * 0.12, R * 0.42, R * 0.42, R * 0.5); break;
      case 3: put(head, ball, skin, 0, -R * 0.32, R * 0.04, R * 0.94, R * 0.62, R * 0.8); break;
      case 4: put(head, ball, skin, 0, -R * 0.55, R * 0.3, R * 0.32, R * 0.36, R * 0.42); break;
    }
    /* 귀 */
    if (!mech) for (const s of [-1, 1]) put(head, ball, skin, s * HX * 0.96, -R * 0.06, 0, R * 0.12, R * 0.18, R * 0.1);

    /* 눈 */
    const eR = R * 0.12 * B.eye;
    const ec = EYE_COLORS[c.eyeColor];
    const em = toon(ec), wm = toon(WHITE), dm = toon(0x1E1A1C);
    for (const s of [-1, 1]){
      const x = s * gx, y = eyeY;
      const hl = (dx, dy, r) => onFace(ball, wm, x + dx * eR, y + dy * eR, eR * r, eR * r, eR * 0.2, 0, eR * 0.3);
      switch (c.eye){
        case 0: onFace(ball, em, x, y, eR * 0.85, eR * 1.05, eR * 0.45); hl(0.3, 0.35, 0.26); break;
        case 1: onFace(ball, wm, x, y, eR * 1.05, eR * 1.25, eR * 0.42);
                onFace(ball, em, x, y - eR * 0.1, eR * 0.8, eR * 1.0, eR * 0.45, 0, eR * 0.06);
                onFace(ball, dm, x, y - eR * 0.1, eR * 0.4, eR * 0.5, eR * 0.4, 0, eR * 0.1);
                hl(0.28, 0.3, 0.26); hl(-0.25, -0.35, 0.13); break;
        case 2: onFace(ball, em, x, y, eR * 1.0, eR * 0.3, eR * 0.4); break;
        case 3: onFace(ball, em, x, y, eR * 0.95, eR * 0.72, eR * 0.45, -s * 0.38); hl(0.25, 0.2, 0.22); break;
        case 4: onFace(ball, em, x, y, eR * 1.0, eR * 0.6, eR * 0.45, s * 0.38); hl(0.25, 0.2, 0.2); break;
        case 5: onFace(arc, em, x, y - eR * 0.3, eR * 0.75, eR * 0.75, eR * 0.6); break;
        case 6: onFace(ball, em, x, y - eR * 0.15, eR * 0.9, eR * 0.42, eR * 0.42);
                onFace(box, toon(shade(skinC, 0.7)), x, y + eR * 0.2, eR * 2.0, eR * 0.12, eR * 0.2); break;
        case 7: onFace(ball, em, x, y, eR * 1.05, eR * 0.68, eR * 0.42, s * 0.3);
                onFace(ball, dm, x, y, eR * 0.16, eR * 0.6, eR * 0.42, 0, eR * 0.05); break;
      }
      if (G === 1 && c.eye !== 5) onFace(ball, dm, x + s * eR * 0.95, y + eR * 0.6, eR * 0.36, eR * 0.1, eR * 0.12, s * 0.6, eR * 0.05);   // 속눈썹
    }

    /* 눈썹 — [길이, 두께, 기울기] */
    const BR = [[0.13, 0.026, 0.1], [0.14, 0.046, 0.05], [0.13, 0.015, 0.1], [0.13, 0.03, 0.35],
                [0.13, 0.03, -0.35], [0.075, 0.032, 0.05], [0.15, 0.03, 0], null][c.brow];
    if (BR) for (const s of [-1, 1])
      onFace(ball, toon(shade(hairC, lum(hairC) > 0.7 ? 0.6 : 0.9)), s * gx, browY, R * BR[0], R * BR[1], R * 0.03, s * BR[2]);

    /* 코 · 입 */
    const noseY = eyeY - R * 0.22;
    const nm = toon(shade(skinC, 0.86));
    const NO = [[0.035, 0.03, 0.03], [0.06, 0.05, 0.05], [0.04, 0.08, 0.06], [0.025, 0.02, 0.02], [0.08, 0.045, 0.045], null][c.nose];
    if (NO) onFace(ball, nm, 0, noseY, R * NO[0], R * NO[1], R * NO[2], 0, R * NO[2] * 0.5);
    const mY = noseY - R * sl(c.philtrum, 0.08, 0.2);
    const lip = LIPS[c.lip];
    const mc = toon(lip ?? MOUTH);
    switch (c.mouth){
      case 0: onFace(arc, mc, 0, mY, R * 0.11, R * 0.1, R * 0.08, Math.PI); break;
      case 1: onFace(halfBall, toon(MOUTH), 0, mY + R * 0.03, R * 0.12, R * 0.1, R * 0.04, 0).rotation.x += Math.PI;
              onFace(box, toon(WHITE), 0, mY + R * 0.015, R * 0.17, R * 0.025, R * 0.03, 0, R * 0.02);
              if (lip) onFace(arc, mc, 0, mY + R * 0.03, R * 0.125, R * 0.11, R * 0.06, Math.PI, R * 0.01); break;
      case 2: onFace(ball, mc, 0, mY, R * 0.09, R * 0.016, R * 0.03); break;
      case 3: onFace(ring, mc, 0, mY, R * 0.045, R * 0.055, R * 0.06); break;
      case 4: onFace(arc, mc, 0, mY - R * 0.04, R * 0.09, R * 0.08, R * 0.08); break;
      case 5: onFace(arc, mc, 0, mY, R * 0.11, R * 0.1, R * 0.08, Math.PI);
              onFace(ball, toon(0xF2849A), R * 0.03, mY - R * 0.1, R * 0.045, R * 0.05, R * 0.04, 0, R * 0.02); break;
      case 6: for (const s of [-1, 1]) onFace(arc, mc, s * R * 0.045, mY, R * 0.045, R * 0.045, R * 0.08, Math.PI); break;
      case 7: onFace(ball, toon(MOUTH), 0, mY, R * 0.1, R * 0.05, R * 0.03);
              onFace(box, toon(WHITE), 0, mY + R * 0.018, R * 0.14, R * 0.025, R * 0.03, 0, R * 0.02); break;
    }
    if (c.style === 0 || G === 1) for (const s of [-1, 1])                                   // 볼
      onFace(ball, toon(0xFFB4C0), s * (gx + R * 0.08), eyeY - R * 0.22, R * 0.1, R * 0.055, R * 0.03, 0, R * 0.005);
  } else if (c.eyesOn){
    /* 얼굴 없는 스타일 — 빛나는 눈 */
    const gm = glowMat(glowC);
    const eR = R * 0.13;
    const y = eyeY + R * 0.02;
    if (c.eyeShape === 2){
      onFace(ball, gm, 0, y, R * 0.42, R * 0.045, R * 0.05);                                    // 가로 슬릿 하나
    } else for (const s of [-1, 1]){
      const x = s * R * 0.3;
      switch (c.eyeShape){
        case 0: onFace(ball, gm, x, y, eR * 0.8, eR * 0.8, eR * 0.3); break;
        case 1: onFace(ball, gm, x, y, eR * 0.45, eR * 1.05, eR * 0.3); break;
        case 3: onFace(arc, gm, x, y - eR * 0.3, eR * 0.7, eR * 0.7, eR * 0.6); break;
        case 4: onFace(box, gm, x, y, eR * 1.2, eR * 1.0, eR * 0.3); break;
        case 5: for (const r of [0.78, -0.78]) onFace(box, gm, x, y, eR * 1.4, eR * 0.3, eR * 0.3, r); break;
        case 6: onFace(heartGeo, gm, x, y, eR * 0.75, eR * 0.75, 0.001, 0, eR * 0.06); break;
        case 7: onFace(starGeo, gm, x, y, eR * 0.85, eR * 0.85, 0.001, 0, eR * 0.06); break;
      }
    }
  }

  /* 무지 — 귀 자리에 기계 귀 · 이음매 */
  if (mech){
    for (const s of [-1, 1]){
      put(head, disc, metal, s * HX * 0.97, -R * 0.02, 0, R * 0.24, R * 0.12, R * 0.24, 0, 0, Math.PI / 2);
      put(head, ring, glowMat(glowC), s * HX * 1.03, -R * 0.02, 0, R * 0.15, R * 0.15, R * 0.15, 0, Math.PI / 2, 0);
    }
    if (!hatOn && c.hat !== 5) put(head, rod, metal, R * 0.35, HY * 1.05, -R * 0.1, R * 0.03, R * 0.5, R * 0.03, 0, 0, -0.3);
  }

  /* ── 헤어 ── 모자를 쓰면 위로 솟는 머리(뾰족 · 곱슬 · 똥머리 · 모히칸)는 짧은 머리로 */
  let hk = c.hair;
  if (hatOn && [2, 8, 9, 11].includes(hk)) hk = 1;
  if (c.hat === 3 && [4, 5, 6, 7, 10].includes(hk)) hk = hk === 5 || hk === 10 ? hk : 1;
  const hm = toon(hairC);
  const tilt = -sl(c.forehead, 0.34, 0.56) * (faced ? 1 : 0.8);
  const capS = hk === 0 ? 1.015 : 1.06;
  const hcap = () => put(head, capGeo, hm, 0, R * 0.02, -R * 0.02, R * capS, R * 1.03 * (HY / R), R * capS, tilt);
  const frontEdge = Math.PI * 0.56 + tilt;                                                      // 앞 가장자리의 각
  const edgeY = R * 1.03 * Math.cos(frontEdge) + R * 0.02;
  const fringeY = Math.max(edgeY - R * 0.04, browY + R * 0.16);
  const fringe = n => {
    for (let i = 0; i < n; i++){
      const x = (i - (n - 1) / 2) * R * 0.32;
      onFace(ball, hm, x, fringeY, R * 0.2, R * 0.13, R * 0.12, (i - (n - 1) / 2) * 0.25, R * 0.03);
    }
  };
  const spikeAt = (theta, phi, len, rr) => {                                                    // theta 위에서의 각, phi 둘레 각(0 = 앞)
    const d = new THREE.Vector3(Math.sin(theta) * Math.sin(phi), Math.cos(theta), Math.sin(theta) * Math.cos(phi));
    const m = put(head, cone, hm, d.x * R * 0.9, d.y * R * 0.95 + R * 0.05, d.z * R * 0.9, rr, len, rr);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    m.position.addScaledVector(d, len * 0.42);
  };
  const lock = (x, y, z, sx, sy, sz, rx = 0) => put(head, ball, hm, x, y, z, sx, sy, sz, rx);
  switch (hk){
    case 0: if (faced) hcap(); break;
    case 1: hcap(); fringe(3); break;
    case 2: hcap();
      for (let i = 0; i < 7; i++) spikeAt(0.55 + (i % 2) * 0.35, Math.PI * 0.35 + i * (Math.PI * 1.3 / 6), R * 0.5, R * 0.17);
      for (let i = 0; i < 4; i++) spikeAt(0.15 + (i % 2) * 0.2, (i - 1.5) * 0.9, R * 0.45, R * 0.18);
      for (let i = 0; i < 3; i++) spikeAt(0.95, (i - 1) * 0.45, R * 0.38, R * 0.15);
      break;
    case 3: put(head, capGeo, hm, 0, R * 0.08, -R * 0.02, R * 1.08, R * 1.0, R * 1.08, tilt - 0.08);
      onFace(ball, hm, -R * 0.1, fringeY + R * 0.04, R * 0.42, R * 0.12, R * 0.12, -0.25, R * 0.04); break;
    case 4: hcap(); fringe(4); lock(0, -R * 0.18, -R * 0.14, R * 1.12, R * 0.82, R * 0.98); break;
    case 5: hcap(); fringe(3);
      lock(0, -R * 0.62, -R * 0.45, R * 0.95, R * 1.15, R * 0.42);
      for (const s of [-1, 1]) lock(s * R * 0.86, -R * 0.5, R * 0.06, R * 0.2, R * 0.62, R * 0.26); break;
    case 6: hcap(); fringe(3);
      lock(0, -R * 0.25, -R * 1.05, R * 0.25, R * 0.62, R * 0.27, 0.45);
      put(head, ring, toon(0xFF5A5F), 0, R * 0.2, -R * 0.95, R * 0.12, R * 0.12, R * 0.2, Math.PI / 2 - 0.6); break;
    case 7: hcap(); fringe(3);
      for (const s of [-1, 1]){ lock(s * R * 1.02, -R * 0.35, -R * 0.2, R * 0.24, R * 0.58, R * 0.24); put(head, ball, toon(0xFF5A5F), s * R * 0.96, R * 0.15, -R * 0.2, R * 0.08); }
      break;
    case 8: for (let i = 0; i < 18; i++){
        const t = 0.15 + (i % 3) * 0.42, p = (i / 18) * Math.PI * 2 + (i % 3) * 0.4;
        const d = [Math.sin(t) * Math.sin(p), Math.cos(t), Math.sin(t) * Math.cos(p)];
        if (d[2] > 0.45 && d[1] < 0.6) continue;                                               // 얼굴 앞은 비운다
        lock(d[0] * R * 0.95, d[1] * R * 0.95 + R * 0.05, d[2] * R * 0.95, R * 0.33, R * 0.33, R * 0.33);
      }
      hcap(); break;
    case 9: hcap(); fringe(3); lock(0, R * 1.08, -R * 0.2, R * 0.36, R * 0.33, R * 0.36); break;
    case 10: hcap(); fringe(4);
      for (let i = 0; i < 6; i++) lock((i % 2 ? 1 : -1) * R * 0.45, -R * (0.2 + Math.floor(i / 2) * 0.38), -R * 0.55, R * 0.42, R * 0.36, R * 0.32);
      for (const s of [-1, 1]) lock(s * R * 0.88, -R * 0.45, R * 0.05, R * 0.22, R * 0.55, R * 0.26); break;
    case 11: put(head, capGeo, hm, 0, R * 0.02, -R * 0.02, R * 1.015, R * 1.03, R * 1.015, tilt);
      for (let i = 0; i < 6; i++) spikeAt(0.05 + i * 0.32 - 0.5, 0, R * 0.42, R * 0.12);
      break;
  }

  /* ── 모자 ── */
  let hatTop = R;
  if (c.hat){
    const hm2 = toon(hatC);
    switch (c.hat){
      case 1:                                                                                     // 비니
        put(head, halfBall, hm2, 0, R * 0.12, -R * 0.03, R * 1.1, R * 1.02, R * 1.08, -0.22);
        put(head, ring, toon(shade(hatC, 0.85)), 0, R * 0.2, -R * 0.06, R * 1.08, R * 1.06, R * 1.0, Math.PI / 2 - 0.22);
        hatTop = R * 1.15; break;
      case 2:                                                                                     // 캡
        put(head, halfBall, hm2, 0, R * 0.16, -R * 0.02, R * 1.07, R * 0.88, R * 1.05, -0.15);
        put(head, ball, toon(shade(hatC, 0.85)), 0, R * 0.25, R * 0.88, R * 0.72, R * 0.05, R * 0.55, 0.12);
        hatTop = R * 1.05; break;
      case 3:                                                                                     // 후드 쓰기
        put(head, hoodGeo, uniq(hatC, { side: THREE.DoubleSide }), 0, R * 0.05, -R * 0.1, R * 1.16, R * 1.16, R * 1.12);
        hatTop = R * 1.2; break;
      case 4:                                                                                     // 버킷햇
        put(head, halfBall, hm2, 0, R * 0.12, 0, R * 1.08, R * 0.95, R * 1.06, -0.05);
        put(head, g(new THREE.CylinderGeometry(R * 1.06, R * 1.5, R * 0.2, 24, 1, true)), uniq(hatC, { side: THREE.DoubleSide }), 0, R * 0.1, 0, 1);
        hatTop = R * 1.08; break;
      case 5:                                                                                     // 헤드폰
        put(head, band, toon(0x2A2B2F), 0, R * 0.02, 0, R * 1.06, R * 1.06, R * 1.0);
        for (const s of [-1, 1]) put(head, disc, hm2, s * R * 1.02, 0, 0, R * 0.32, R * 0.18, R * 0.32, 0, 0, Math.PI / 2);
        break;
    }
  }

  /* ── 오른손에 든 것 — 밝으면 바람개비, 어두우면 등불 (예전 캐릭터와 같다) ── */
  const hand = new THREE.Group();
  hand.position.set(0.02, -armLen, 0.02);
  armR_.add(hand);
  const pinwheel = new THREE.Group();
  pinwheel.rotation.z = -0.26;
  hand.add(pinwheel);
  put(pinwheel, rod, toon(0xC9A77E), 0, 0.33, 0, 0.011, 0.66, 0.011);
  const vanes = new THREE.Group();
  vanes.position.set(0, 0.68, 0.02);
  pinwheel.add(vanes);
  [0xFF9CA0, 0xFFE783, 0x94E799, 0x7DDDF4].forEach((col, i, all) => {
    const v = new THREE.Group();
    v.rotation.z = (i / all.length) * Math.PI * 2;
    vanes.add(v);
    put(v, ball, toon(col), 0, 0.075, 0, 0.034, 0.075, 0.014);
  });
  put(vanes, ball, toon(0xFFFBF2), 0, 0, 0.012, 0.022, 0.022, 0.014);
  const lantern = new THREE.Group();
  lantern.rotation.set(-0.22, 0, -0.3);
  hand.add(lantern);
  put(lantern, rod, toon(0xB08A62), 0, 0.27, 0, 0.012, 0.54, 0.012);
  put(lantern, rod, toon(0x8A7258), 0.035, 0.545, 0, 0.055, 0.012, 0.012);
  put(lantern, rod, toon(0x8A7258), 0.07, 0.505, 0, 0.006, 0.08, 0.006);
  put(lantern, ball, glowMat(0xFFE089), 0.07, 0.425, 0, 0.058, 0.07, 0.058);
  const halo = put(lantern, ball, uniqBasic(), 0.07, 0.425, 0, 0.14, 0.15, 0.14);
  halo.renderOrder = 1;
  function uniqBasic(){
    const m = new THREE.MeshBasicMaterial({ color: 0xFFEFB4, transparent: true, opacity: 0.32, depthWrite: false });
    own.push(m); return m;
  }
  lantern.visible = false;
  let glow = null;
  if (lamp){
    glow = new THREE.PointLight(0xFFECC4, 0, 16, 1);
    glow.position.set(0.15, 2.4, 0);
    group.add(glow);
  }

  const headTop = headY + Math.max(hatTop, R * (hk === 2 || hk === 11 ? 1.35 : hk === 9 ? 1.4 : 1.05));
  let phase = 0, idle = Math.random() * 6, reachLeft = 0, tossLeft = 0;
  const TOSS_TIME = 0.55;
  const swingK = Math.min(1, 0.3 / legH + 0.25);                                                // 긴 다리는 덜 벌린다

  return {
    group, headTop, headY,
    setHand(dark){
      pinwheel.visible = !dark;
      lantern.visible = !!dark;
      if (glow) glow.intensity = dark ? 5 : 0;
    },
    reach(sec){ reachLeft = Math.max(reachLeft, sec || 2); },
    reaching(){ return reachLeft > 0; },
    toss(){ tossLeft = TOSS_TIME; },
    update(dt, speed){
      idle += dt;
      if (pinwheel.visible) vanes.rotation.z += dt * (0.5 + speed * 2.9);
      const [L, Rg] = legs;
      if (speed > 0.05){
        phase += dt * (5.5 + speed * 1.9) * Math.min(1.25, 0.4 / legH + 0.35);
        const sw = Math.sin(phase);
        L.hip.rotation.x = -sw * 0.65 * swingK;
        Rg.hip.rotation.x = sw * 0.65 * swingK;
        L.knee.rotation.x = Math.max(0, sw) * 0.9 * swingK;
        Rg.knee.rotation.x = Math.max(0, -sw) * 0.9 * swingK;
        armL.rotation.x = sw * 0.5;
        armR_.rotation.x = -sw * 0.35;
        group.position.y = Math.abs(Math.cos(phase)) * 0.02;
        head.position.y = headY - Math.sin(phase * 2 - 0.6) * 0.008;
        group.scale.set(1, 1, 1);
      } else {
        phase = 0;
        const breathe = Math.sin(idle * 1.5) * 0.01;
        group.position.y = 0;
        group.scale.set(1 - breathe, 1 + breathe, 1 - breathe);
        for (const l of legs){ l.hip.rotation.x = 0; l.knee.rotation.x = 0; }
        armL.rotation.x = armR_.rotation.x = 0;
        head.position.y = headY + breathe * 0.4;
      }
      group.rotation.x = 0;
      if (tossLeft > 0){
        tossLeft -= dt;
        const t = 1 - tossLeft / TOSS_TIME;
        armL.rotation.x = t < 0.3 ? (t / 0.3) * 1.5 - 0.1 : 1.4 - ((t - 0.3) / 0.7) * 3.3;
        group.rotation.x = t < 0.3 ? -0.12 * (t / 0.3) : -0.12 + 0.34 * ((t - 0.3) / 0.7);
        armL.rotation.z = -0.8;
        armL.scale.y = 1 + 0.6 * Math.sin(t * Math.PI);
      } else if (reachLeft > 0){
        reachLeft -= dt;
        const k = Math.min(1, reachLeft / 0.3);
        armL.rotation.x = -0.45 * k;
        armL.rotation.z = -1.0 * k;
        armL.scale.y = 1 + 0.3 * k;
      } else {
        armL.rotation.z = 0;
        armL.scale.y = 1;
      }
    },
    dispose(){ for (const o of own) o.dispose(); }
  };
}
