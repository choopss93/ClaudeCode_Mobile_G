import * as THREE from 'three';
import { toon, toonUnique, makeBlob } from '#look';
import { serverNow } from '../../../js/clock.js';
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
const ballS = new THREE.SphereGeometry(1, 12, 9);                      // 관절 · 손 · 단추처럼 작은 것
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

/* 겉면을 직접 짓는다 — fn(v 0~1, 각 0~2π) → [x, y, z]. 둘레가 동그랗지 않은 몸통(가슴 · 엉덩이 · 날개뼈),
   누빔(패딩), 고무단(골)처럼 회전체로는 안 되는 모양을 짓는 데 쓴다. 이음매(각 0 = 2π)의 법선은 맞춰 둔다. */
function surface(fn, U, V, down = false){
  const pos = [], idx = [];
  for (let j = 0; j <= V; j++) for (let i = 0; i <= U; i++){ const q = fn(j / V, (i / U) * Math.PI * 2); pos.push(q[0], q[1], q[2]); }
  for (let j = 0; j < V; j++) for (let i = 0; i < U; i++){
    const a = j * (U + 1) + i, b = a + 1, c = a + U + 1, d = c + 1;
    if (down) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let j = 0; j <= V; j++){
    const a = j * (U + 1), b = a + U;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}
/* 모서리가 둥근 상자 — 신발 바닥 · 몸통 · 찍찍이 끈처럼 단단한 부품 */
function rbox(w, h, d, r, n = 6){
  const geo = new THREE.BoxGeometry(1, 1, 1, n, n, n);        // n=2 는 작은 부품 — 모서리만 깎인다
  const p = geo.attributes.position, v = new THREE.Vector3(), q = new THREE.Vector3();
  const hw = w / 2, hh = h / 2, hd = d / 2;
  r = Math.min(r, hw, hh, hd) * 0.999;
  /* 격자를 가장자리로 몰아 둔다 — 고르게 나뉜 채로 굴리면 모서리 띠 안에 점이 없어 각이 그대로 남는다 */
  const remap = (u, half) => {
    const a = Math.abs(u) * 2, s = Math.sign(u);
    return s * (a > 2 / 3 + 1e-6 ? (half - r) + (a - 2 / 3) * 3 * r : a * 1.5 * (half - r));
  };
  for (let i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i);
    v.set(remap(v.x, hw), remap(v.y, hh), remap(v.z, hd));
    q.set(Math.max(-hw + r, Math.min(hw - r, v.x)), Math.max(-hh + r, Math.min(hh - r, v.y)), Math.max(-hd + r, Math.min(hd - r, v.z)));
    v.sub(q);
    if (v.lengthSq() > 1e-12) v.setLength(r);
    v.add(q);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
const fingerGeo = new THREE.CapsuleGeometry(1, 2.4, 3, 7);           // 손가락 하나 (지름 2 · 길이 4.4)

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

/* 스타일 바탕 비율 (m) — 머리 몇 개 키인지로 잡았다 (design/refs/character 의 비율표):
   치비 2.5등신 · 미니멀 4등신 · 어반 4.5등신 · 롱레그 6.5등신(다리가 머리 셋). torsoH 는 가랑이~목, legH 는 엉덩이 관절~바닥,
   armLen 은 어깨~손끝. 팔꿈치는 허리, 손목은 가랑이 높이쯤에 온다. */
const BASE = [
  { headR: 0.22, torsoH: 0.27, torsoW: 0.13, torsoD: 0.1, legH: 0.26, legR: 0.05, armLen: 0.27, armR: 0.041, neck: 0.012, eye: 1.2, shoe: 1.15 },
  { headR: 0.16, torsoH: 0.38, torsoW: 0.14, torsoD: 0.1, legH: 0.5, legR: 0.054, armLen: 0.41, armR: 0.042, neck: 0.03, eye: 1, shoe: 1 },
  { headR: 0.155, torsoH: 0.41, torsoW: 0.155, torsoD: 0.11, legH: 0.54, legR: 0.06, armLen: 0.44, armR: 0.047, neck: 0.03, eye: 1, shoe: 1.1 },
  { headR: 0.12, torsoH: 0.4, torsoW: 0.115, torsoD: 0.085, legH: 0.74, legR: 0.044, armLen: 0.5, armR: 0.031, neck: 0.045, eye: 0.85, shoe: 1.3 }
];

/* 몸통 옆모습 — [높이 0(가랑이)~1(목), 너비]. 여자는 허리가 들어가고 골반이 넓다 */
const PROF = {
  m: [[0, 0], [0.02, 0.55], [0.08, 0.86], [0.2, 0.9], [0.36, 0.82], [0.46, 0.8], [0.6, 0.9], [0.76, 1.0], [0.88, 0.96], [0.95, 0.68], [0.985, 0.4], [1, 0]],
  f: [[0, 0], [0.02, 0.58], [0.08, 0.95], [0.2, 1.0], [0.36, 0.8], [0.46, 0.7], [0.6, 0.78], [0.74, 0.88], [0.86, 0.85], [0.94, 0.62], [0.985, 0.36], [1, 0]]
};

const HOLD = 0.9;                         // 바람개비 든 오른팔의 팔꿈치 굽힘

export function createAvatar(c, { lamp = false, poses = true } = {}){
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
  const torsoW = B.torsoW * sl(c.muscle, 0.9, 1.2) * (G === 1 ? 0.94 : G === 0 ? 1.04 : 1);
  const torsoD = B.torsoD * sl(c.muscle, 0.92, 1.15);
  const legH = B.legH * sl(c.leg, 0.72, 1.32);
  const legR = B.legR * thick * (G === 1 ? 0.95 : 1);
  const armLen = B.armLen * sl(c.arm, 0.75, 1.3);
  const armR = B.armR * thick * (G === 1 ? 0.88 : 1);

  const skinC = faced ? SKINS[c.skin] : PALETTE[c.faceColor];
  const skin = toon(skinC);
  const top = PALETTE[c.topColor], bot = PALETTE[c.bottomColor], shoeC = PALETTE[c.shoesColor];
  const hatC = PALETTE[c.hatColor ?? c.topColor], accC = PALETTE[c.accColor ?? 4];
  const hairC = HAIR_COLORS[c.hairColor];
  const metal = toon(METAL), dmetal = toon(DARKM);
  const glowC = GLOWS[c.glow];
  /* 관절 구 — 살갗보다 아주 조금 짙게 해 '관절 인형' 처럼 읽히게. 무지는 쇠 */
  const jointMat = mech ? metal : skin;                 // 관절 구는 피부색 그대로 (사용자 요청) — 무지만 쇠
  const limbMat = mech ? toon(shade(skinC, 1.0)) : skin;

  const group = new THREE.Group();
  const blob = makeBlob(Math.max(0.22, torsoW * 2));
  blob.userData.blob = true;
  group.add(blob);

  /* ── 마디 · 관절 ── 마디는 위아래 굵기가 다르고 가운데가 살짝 부푼 회전체(근육 · 종아리). */
  /* o.N — 누빔 칸 수(패딩) · o.puff 누빔 부풂 · o.rib 고무단 골 · o.back 종아리처럼 뒤로 불룩 */
  const seg = (parent, rA, rB, len, mat, k = 1, t0 = 0, t1 = 1, bulge = 0, flare = 0, o = {}) => {
    const fn = (v, th) => {
      const t = t0 + (t1 - t0) * v;
      let r = (rA + (rB - rA) * t + bulge * Math.sin(Math.PI * t)) * k + flare * t;
      if (o.N) r *= 1 + (o.puff ?? 0.13) * Math.sqrt(Math.abs(Math.sin(Math.PI * o.N * v)));
      if (o.rib) r *= 1 + o.rib * Math.sin(th * 22);
      const sn = Math.sin(th);
      let z = r * sn;
      if (o.back && sn < 0) z += o.back * r * sn * sn * sn * Math.sin(Math.PI * Math.min(1, t * 1.4)) ;
      return [r * Math.cos(th), -t * len, z];
    };
    return put(parent, g(surface(fn, 12, o.N ? 4 + o.N * 4 : 6, true)), mat, 0, 0, 0, 1);
  };
  const ballAt = (parent, r, mat, y = 0) => put(parent, ballS, mat, 0, y, 0, r);
  /* 관절 셋(위 · 가운데 · 끝)과 마디 둘. 가운데 · 끝은 그 관절에서 도는 무리다 */
  function limb(root, r, l, b, back = 0){
    ballAt(root, r[0] * 1.06, jointMat);
    seg(root, r[0], r[1], l[0], limbMat, 1, 0, 1, b[0]);
    const mid = new THREE.Group(); mid.position.y = -l[0]; root.add(mid);
    ballAt(mid, r[1] * 1.16, jointMat);
    seg(mid, r[1], r[2], l[1], limbMat, 1, 0, 1, b[1], 0, { back });
    const end = new THREE.Group(); end.position.y = -l[1]; mid.add(end);
    ballAt(end, r[2] * 1.16, jointMat);
    return { root, mid, end, r, l, b, back };
  }
  /* 옷 — 마디 위에 조금 굵게 씌운다. a · b 는 0(위 관절) ~ 1(가운데) ~ 2(끝) */
  function cover(L, mat, a, b, k, flare = 0, o = {}){
    const o1 = o.N ? { ...o, N: Math.max(1, Math.round(o.N * 0.6)) } : o, o2 = { ...(o.N ? { ...o, N: Math.max(1, o.N - o1.N) } : o), back: L.back };   // 종아리 불룩을 옷도 따라야 살이 안 비친다
    if (a < 1){
      seg(L.root, L.r[0], L.r[1], L.l[0], mat, k, a, Math.min(1, b), L.b[0], 0, o1);
      if (a === 0) ballAt(L.root, L.r[0] * Math.max(k * 0.98, 1.1), mat);    // 관절 구보다 조금만 크게 — 많이 키우면 어깨가 공처럼 부푼다
    }
    if (a < 1 && b > 1) ballAt(L.mid, L.r[1] * Math.max(k * 1.05, 1.2), mat);
    if (b > 1) seg(L.mid, L.r[1], L.r[2], L.l[1], mat, k, Math.max(0, a - 1), b - 1, L.b[1], flare, o2);
  }
  const cuff = (L, mat, k, t = 1.92) =>                                       // 띠 하나 (누빔 경계 · 멜빵 같은 것)
    put(t > 1 ? L.mid : L.root, ring, mat, 0, -(t > 1 ? t - 1 : t) * L.l[t > 1 ? 1 : 0], 0,
        L.r[2] * k * 1.05, L.r[2] * k * 1.05, 0.06, Math.PI / 2);
  /* 고무단 — 골이 진 짧은 마디 (소맷부리 · 바짓단). 끝 관절 바로 위 */
  const rib = (L, mat, k, len = 0.14) => seg(L.mid, L.r[1], L.r[2], L.l[1], mat, k * 1.02, 1 - len, 1.02, L.b[1], 0, { rib: 0.05 });

  /* ── 몸통 — 회전체(가슴 · 허리 · 골반) ── */
  const prof = PROF[G === 1 ? 'f' : 'm'];
  const at = t => {
    for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]){
      const [t0, r0] = prof[i - 1], [t1, r1] = prof[i];
      return r0 + (r1 - r0) * (t - t0) / (t1 - t0);
    }
    return 0;
  };
  /* 몸통 겉면 — 단면이 둥근 네모(초타원)라 앞뒤가 납작하고 옆이 선다. 앞에 가슴, 뒤에 엉덩이 · 날개뼈.
     o.N 누빔 칸(o.from~o.to 사이에서 센다) · o.rib 고무단 골 */
  const bump = (t, m, w) => Math.exp(-(((t - m) / w) ** 2));
  const torsoGeo = (k, t0 = 0, t1 = 1, o = {}) => {
    const fn = (v, th) => {
      const t = t0 + (t1 - t0) * v;
      const cth = Math.cos(th), sth = Math.sin(th);
      const ex = Math.sign(cth) * Math.abs(cth) ** 0.8, ez = Math.sign(sth) * Math.abs(sth) ** 0.8;
      let q = k;
      if (o.N) q *= 1 + (o.puff ?? 0.07) * Math.sqrt(Math.abs(Math.sin(Math.PI * o.N * (t - o.from) / (o.to - o.from))));
      if (o.rib) q *= 1 + o.rib * Math.sin(th * 40);
      const w = at(t);
      let z = torsoD * w * ez * q;
      if (sth > 0) z += torsoD * sth * sth * (G === 1 ? 0.05 : 0.11) * bump(t, 0.73, 0.1) * q * w;          // 가슴
      else z -= torsoD * sth * sth * ((G === 1 ? 0.3 : 0.17) * bump(t, 0.13, 0.09) + 0.07 * bump(t, 0.8, 0.07)) * q * w;   // 엉덩이 · 날개뼈
      return [torsoW * w * ex * q, t * torsoH, z];
    };
    return g(surface(fn, 24, Math.max(6, Math.round(22 * (t1 - t0))) + (o.N || 0) * 3));
  };
  const hipJ = torsoH * 0.07;
  const hipY = legH - hipJ;                       // 가랑이 높이 — 몸통 밑
  const neckY = hipY + torsoH;
  const midY = hipY + torsoH * 0.55;
  const puffer = c.top === 3;
  const frontZ = torsoD * (puffer ? 1.16 : 1.04);
  const WAIST = 0.44;                             // 허리 관절 — 여기서 위(가슴)와 아래(골반)가 갈린다
  const waistY = hipY + torsoH * WAIST;
  const bodyAt = (geo, mat, zone = 'body') => { const m = put(group, geo, mat, 0, hipY, 0, 1); m.userData.zone = zone; return m; };
  const bodySplit = (k, t0, t1, mat, o = {}) => {         // 몸통 한 겹을 허리에서 둘로 — 허리가 굽고 돌아도 이어져 보이게 조금 겹친다
    o = { from: t0, to: t1, ...o };
    if (t0 < WAIST) bodyAt(torsoGeo(k, t0, Math.min(t1, WAIST + 0.03), o), mat, 'body');
    if (t1 > WAIST) bodyAt(torsoGeo(k, Math.max(t0, WAIST - 0.03), t1, o), mat, 'chest');
  };
  const band = (t, k, mat, h = 0.014) =>
    put(group, ring, mat, 0, hipY + t * torsoH, 0, torsoW * at(t) * k, torsoD * at(t) * k, h / 0.36, Math.PI / 2);
  bodySplit(1, 0, 1, mech ? dmetal : skin);
  put(group, ballS, mech ? metal : jointMat, 0, waistY, 0, torsoW * at(WAIST) * 0.96, torsoH * 0.09, torsoD * at(WAIST) * 0.96).userData.zone = 'body';   // 허리 관절
  if (mech) band(0.46, 1.01, metal, 0.01);                                     // 허리 이음매

  /* 목 */
  const nr = armR * (G === 1 ? 0.95 : 1.12) * (c.style === 0 ? 0.9 : 1);
  const neckLen = B.neck + R * 0.35;
  put(group, g(new THREE.CylinderGeometry(nr * 0.92, nr * 1.05, neckLen, 14)), mech ? dmetal : skin, 0, neckY - torsoH * 0.02 + neckLen / 2, 0, 1);
  ballAt(group, nr * 1.15, jointMat, neckY - torsoH * 0.02);
  if (mech) put(group, ring, metal, 0, neckY + B.neck * 0.5, 0, nr * 1.15, nr * 1.15, 0.03, Math.PI / 2);

  /* ── 다리 — 엉덩이 · 무릎 · 발목 관절. 무릎 아래가 조금 더 길다 ── */
  const shoeH = 0.05 * B.shoe;
  const thighL = (legH - shoeH) * 0.48, shinL = (legH - shoeH) * 0.52;
  const hipX = torsoW * (G === 1 ? 0.5 : 0.45);
  const legs = [-1, 1].map(s => {
    const hip = new THREE.Group();
    hip.position.set(s * hipX, legH, 0);
    group.add(hip);
    const L = limb(hip, [legR * 1.18, legR * 0.8, legR * 0.52], [thighL, shinL], [legR * 0.06, legR * 0.12], 0.35);   // 종아리는 뒤로 불룩
    return { s, hip, knee: L.mid, ankle: L.end, L };
  });

  /* 하의 */
  const bm = toon(bot), bk = c.bottom;
  if (bk !== 4) bodyAt(torsoGeo(1.07, 0, 0.27), bm);
  for (const { s, L } of legs){
    switch (bk){
      case 0: cover(L, bm, 0, 0.62, 1.32); break;                                                  // 반바지
      case 1: cover(L, bm, 0, 1.9, 1.3); cuff(L, toon(shade(bot, 0.8)), 1.3, 1.9); break;          // 조거
      case 2: cover(L, bm, 0, 1.96, 1.22, legR * 0.12); break;                                    // 청바지
      case 3: cover(L, bm, 0, 1.94, 1.3);                                                          // 카고
              put(L.root, box, toon(shade(bot, 0.85)), s * legR * 1.35, -thighL * 0.55, 0.005, legR * 0.45, thighL * 0.36, legR * 1.2); break;
      case 5: cover(L, bm, 0, 1.97, 1.07);                                                         // 레깅스 + 워머
              cover(L, toon(0xF2F2F0), 1.42, 1.98, 1.85);
              for (let i = 0; i < 3; i++) cuff(L, toon(0xE4E4E0), 1.85, 1.5 + i * 0.16); break;
      case 6: cover(L, bm, 0, 1.98, 1.45, legR * 0.55); break;                                     // 와이드
      case 7: cover(L, bm, 0, 1.9, 1.38); cuff(L, toon(shade(bot, 0.8)), 1.38, 1.9);               // 트레이닝
              put(L.root, box, toon(WHITE), s * legR * 1.4, -thighL * 0.5, 0, legR * 0.1, thighL * 1.0, legR * 0.3);
              put(L.mid, box, toon(WHITE), s * legR * 1.0, -shinL * 0.45, 0, legR * 0.1, shinL * 0.9, legR * 0.25); break;
    }
  }
  if (bk === 4){                                                                                    // 치마
    const skirtH = thighL * 0.8, top0 = hipY + torsoH * 0.27;
    bodyAt(torsoGeo(1.06, 0.14, 0.27), bm);
    put(group, g(new THREE.CylinderGeometry(torsoW * at(0.15) * 1.06, torsoW * 1.5, skirtH, 26, 1, true)),
        uniq(bot, { side: THREE.DoubleSide }), 0, top0 - torsoH * 0.12 - skirtH / 2, 0, 1, 1, torsoD / torsoW * 1.1);
  }

  /* 발 · 신발 — 발목 관절 밑. 발끝은 앞(+Z) */
  const footL = Math.max(0.1, legR * 2.4) * B.shoe;
  const shoeW = legR * 1.15 * B.shoe;
  const sc = toon(shoeC);
  const part = (parent, w, h, d, r, mat, x, y, z, rx = 0, n = 6) => put(parent, g(rbox(w, h, d, r, n)), mat, x, y, z, 1, 1, 1, rx);
  for (const { ankle } of legs){
    /* 통통한 운동화 — 높이가 길이의 절반쯤. 발목 관절보다 위로 올라와 발목을 감싼다 */
    const L2 = footL * 1.1, W = Math.min(shoeW * 2.3, L2 * 0.66), up = L2 * 0.46, sole = L2 * 0.2;
    const base = -shoeH, fz = L2 * 0.2;                                    // 바닥은 땅(발목 아래 shoeH)
    const dark = toon(shade(shoeC, 0.72)), mid = toon(shade(shoeC, 0.86));
    switch (c.shoes){
      case 0: case 1: case 3: {                                                                   // 운동화 — 통굽 · 앞코 · 찍찍이 · 뒤축
        const low = c.shoes === 3, uh = low ? up * 0.6 : up, y0 = base + sole * 0.75;
        /* 참고 그림의 통통한 운동화 — 둥근 통굽 위에 불룩한 몸통 · 앞코 · 뒤꿈치, 옆 덧댐, 찍찍이 */
        part(ankle, W * 1.1, sole, L2, sole * 0.48, toon(low ? shade(shoeC, 0.7) : WHITE), 0, base + sole / 2, fz);                 // 통굽
        part(ankle, W * 1.08, sole * 0.32, L2 * 0.98, sole * 0.15, toon(0x3A3D44), 0, base + sole * 0.16, fz, 0, 3);                       // 바닥 고무
        put(ankle, ballS, sc, 0, y0 + uh * 0.42, fz - L2 * 0.04, W * 0.5, uh * 0.55, L2 * 0.44);                                     // 몸통
        put(ankle, ballS, mid, 0, y0 + uh * 0.28, fz + L2 * 0.26, W * 0.47, uh * 0.4, L2 * 0.24);                                    // 앞코
        put(ankle, ballS, mid, 0, y0 + uh * 0.45, fz - L2 * 0.33, W * 0.44, uh * 0.5, L2 * 0.16);                                    // 뒤꿈치
        for (const sd of [-1, 1]) part(ankle, W * 0.08, uh * 0.55, L2 * 0.62, uh * 0.04, dark, sd * W * 0.47, y0 + uh * 0.3, fz - L2 * 0.08, 0, 2);   // 옆 덧댐
        if (!low){
          part(ankle, W * 1.04, uh * 0.32, L2 * 0.3, uh * 0.14, dark, 0, y0 + uh * 0.8, fz + L2 * 0.02, -0.4, 3);                     // 찍찍이 끈
          part(ankle, W * 0.55, uh * 0.42, L2 * 0.32, uh * 0.12, toon(shade(shoeC, 0.95)), 0, y0 + uh * 0.95, fz - L2 * 0.12, 0.3, 3);   // 혀
          part(ankle, W * 0.36, uh * 0.7, L2 * 0.1, W * 0.1, dark, 0, y0 + uh * 0.95, fz - L2 * 0.44, 0, 2);                              // 뒤축 고리
        }
        if (c.shoes === 1){                                                                       // 하이탑 — 발목을 감싼다
          part(ankle, W * 0.9, up * 1.1, L2 * 0.5, W * 0.3, sc, 0, base + sole + up * 1.1, -L2 * 0.08);
          part(ankle, W * 0.96, up * 0.2, L2 * 0.54, up * 0.09, toon(WHITE), 0, base + sole + up * 1.62, -L2 * 0.08);
        }
        break;
      }
      case 2:                                                                                     // 부츠 — 긴 목 · 두꺼운 굽
        part(ankle, W * 0.92, shinL * 0.45, L2 * 0.48, W * 0.3, sc, 0, base + sole + shinL * 0.22, -L2 * 0.06);
        part(ankle, W * 1.08, sole, L2, sole * 0.3, toon(shade(shoeC, 0.5)), 0, base + sole / 2, fz);
        part(ankle, W, up, L2 * 0.9, Math.min(W, up) * 0.45, sc, 0, base + sole * 0.8 + up / 2, fz - L2 * 0.04);
        part(ankle, W * 0.98, up * 0.25, L2 * 0.5, up * 0.1, dark, 0, base + sole + shinL * 0.4, -L2 * 0.06);
        break;
      default:
        put(ankle, ball, skin, 0, base + shoeH * 0.4, fz, shoeW * 0.8, shoeH * 0.45, footL * 0.5);
        for (let i = 0; i < 4; i++) put(ankle, ballS, skin, (i - 1.5) * shoeW * 0.36, base + shoeH * 0.25, fz + footL * 0.48, shoeW * 0.2);   // 발가락
    }
  }

  /* ── 팔 — 어깨 · 팔꿈치 · 손목 관절, 그 밑에 손 (손바닥 · 네 손가락 · 엄지) ── */
  const handLen = armR * 2.5;
  const upL = (armLen - handLen) * 0.52, foreL = (armLen - handLen) * 0.48;
  const shY = neckY - torsoH * 0.07, shX = torsoW * 0.8 * (puffer ? 1.08 : 1) + armR * 0.2;   // 어깨 관절은 몸통 비탈에 반쯤 묻는다
  const sleeveB = { 0: 0.6, 5: 0 }[c.top] ?? 1.94;
  const sleeveK = puffer ? 1.42 : 1.18;
  const tm = toon(top);
  const arms = [-1, 1].map(s => {
    const a = new THREE.Group();
    a.position.set(s * shX, shY, 0);
    group.add(a);
    const L = limb(a, [armR * 0.98, armR * 0.82, armR * 0.6], [upL, foreL], [armR * 0.18, armR * 0.12]);
    const w = L.end;
    put(w, ballS, skin, 0, -armR * 0.95, 0, armR * 0.64, armR * 0.9, armR * 0.34);                        // 손바닥
    const fr = armR * 0.16;
    for (let i = 0; i < 4; i++){                                                                   // 네 손가락 — 가운데가 길고 살짝 굽었다
      const len = [0.82, 1, 0.95, 0.75][i];
      put(w, fingerGeo, skin, (i - 1.5) * armR * 0.3 * -s, -armR * (1.55 + 0.35 * len), armR * 0.06, fr, fr * len, fr, 0.28);
    }
    put(w, fingerGeo, skin, -s * armR * 0.55, -armR * 0.95, armR * 0.28, fr * 1.15, fr * 0.85, fr * 1.15, -0.6, 0, s * 0.7);   // 엄지
    if (sleeveB) cover(L, tm, 0, sleeveB, sleeveK, 0, puffer ? { N: 5, puff: 0.12 } : {});
    if ([1, 3, 4, 6].includes(c.top)) rib(L, toon(shade(top, 0.82)), puffer ? 1.25 : 1.15);
    return { a, elbow: L.mid, wrist: L.end };
  });
  const armL = arms[0].a, armR_ = arms[1].a;

  /* 상의 — 몸통 위에 한 겹 */
  if (puffer){                                                                                    // 패딩 — 짧게 끊어 입고, 안에 받쳐 입은 옷이 보인다
    bodySplit(1.055, 0.16, 0.42, toon(shade(top, 0.62)));
    bodySplit(1.17, 0.36, 0.985, tm, { N: 4, puff: 0.08 });
  } else bodySplit(1.055, 0.16, 0.985, tm);
  if (G === 1) for (const s of [-1, 1])                                                           // 가슴
    put(group, ball, tm, s * torsoW * 0.36, hipY + torsoH * 0.72, torsoD * (puffer ? 0.75 : 0.62), torsoW * 0.3, torsoH * 0.1, torsoD * 0.42);
  if ([1, 4].includes(c.top)) bodySplit(1.075, 0.15, 0.22, toon(shade(top, 0.84)), { rib: 0.03 });   // 고무 밑단
  else band(puffer ? 0.37 : 0.165, puffer ? 1.2 : 1.07, toon(shade(top, 0.86)), 0.016);           // 밑단
  switch (c.top){
    case 1:                                                                                       // 후디 — 주머니 · 끈 · 내린 후드
      put(group, ball, toon(shade(top, 0.92)), 0, hipY + torsoH * 0.3, frontZ * 0.86, torsoW * 0.5, torsoH * 0.11, torsoD * 0.2);
      for (const s of [-1, 1]){
        put(group, rod, toon(shade(top, 0.75)), s * torsoW * 0.16, neckY - torsoH * 0.17, frontZ * 0.94, 0.005, torsoH * 0.22, 0.005);
        put(group, ballS, toon(shade(top, 0.7)), s * torsoW * 0.16, neckY - torsoH * 0.29, frontZ * 0.95, 0.009);
      }
      if (c.hat !== 3) put(group, ball, toon(shade(top, 0.92)), 0, neckY + 0.005, -torsoD * 0.72, torsoW * 0.8, torsoH * 0.13, torsoD * 0.5);
      break;
    case 2:                                                                                       // 재킷 — 안의 셔츠 · 지퍼 · 깃 · 주머니
      put(group, ball, toon(lum(top) > 0.8 ? 0x2A2B2F : WHITE), 0, neckY - torsoH * 0.22, frontZ * 0.86, torsoW * 0.22, torsoH * 0.22, torsoD * 0.2);
      put(group, box, toon(shade(top, 0.7)), 0, hipY + torsoH * 0.45, frontZ * 0.98, 0.006, torsoH * 0.55, 0.006);
      band(0.96, 1.25, toon(shade(top, 0.85)), 0.03);
      for (const s of [-1, 1]) put(group, box, toon(shade(top, 0.8)), s * torsoW * 0.42, hipY + torsoH * 0.32, frontZ * 0.88, torsoW * 0.24, 0.01, 0.02, 0, s * 0.3, 0);
      break;
    case 3:                                                                                       // 패딩 — 누빔 · 높은 깃
      band(0.97, 1.55, tm, 0.07);                                                                   // 높이 세운 깃
      band(1.0, 1.35, toon(shade(top, 0.8)), 0.02);
      put(group, box, toon(shade(top, 0.7)), 0, hipY + torsoH * 0.55, frontZ * 1.0, 0.006, torsoH * 0.75, 0.008);
      break;
    case 4: break;                                                                                // 맨투맨 — 밑단 · 소맷부리만
    case 6:                                                                                       // 바람막이 — 가슴 띠 · 깃 · 지퍼
      band(0.66, 1.07, toon(lum(top) > 0.7 ? 0x3D8BF2 : WHITE), 0.03);
      band(0.96, 1.25, toon(shade(top, 0.85)), 0.03);
      put(group, box, toon(shade(top, 0.7)), 0, hipY + torsoH * 0.55, frontZ * 0.99, 0.005, torsoH * 0.7, 0.006);
      break;
    case 7:                                                                                       // 셔츠 — 깃 · 단추 · 주머니
      for (const s of [-1, 1]) put(group, cone, toon(shade(top, 0.92)), s * torsoW * 0.2, neckY - 0.01, frontZ * 0.66, torsoW * 0.18, 0.045, 0.02, 0, 0, s * 2.2);
      for (let i = 0; i < 4; i++) put(group, ballS, toon(shade(top, 0.65)), 0, neckY - torsoH * (0.16 + i * 0.18), frontZ * 0.97, 0.007);
      put(group, box, toon(shade(top, 0.88)), -torsoW * 0.42, hipY + torsoH * 0.72, frontZ * 0.92, torsoW * 0.26, torsoH * 0.12, 0.01);
      break;
  }
  if (mech) put(group, ball, glowMat(glowC), 0, hipY + torsoH * 0.7, frontZ * 0.98, torsoW * 0.14, torsoW * 0.14, 0.012);  // 가슴 불빛

  /* 소품 */
  const am = toon(accC);
  switch (c.acc){
    case 1:                                                                                       // 체인
      put(group, ring, am, 0, neckY - torsoH * 0.06, frontZ * 0.2, torsoW * 0.55, torsoD * 1.0, 0.04, Math.PI / 2 + 0.55);
      put(group, ball, am, 0, neckY - torsoH * 0.3, frontZ * 0.98, 0.016, 0.02, 0.008);
      break;
    case 2:                                                                                       // 크로스백
      put(group, box, am, 0, midY, frontZ * 1.02, 0.014, torsoH * 1.1, 0.008, 0, 0, 0.72);
      put(group, ball, am, torsoW * 0.8, hipY + torsoH * 0.18, frontZ * 0.72, torsoW * 0.4, torsoH * 0.15, torsoD * 0.34);
      break;
    case 3:                                                                                       // 백팩
      put(group, ball, am, 0, midY + torsoH * 0.08, -torsoD * 1.35, torsoW * 0.8, torsoH * 0.36, torsoD * 0.5);
      put(group, ball, toon(shade(accC, 0.85)), 0, midY - torsoH * 0.06, -torsoD * 1.8, torsoW * 0.5, torsoH * 0.14, torsoD * 0.2);
      for (const s of [-1, 1]) put(group, box, am, s * torsoW * 0.45, midY + torsoH * 0.12, frontZ * 0.9, 0.018, torsoH * 0.62, 0.01);
      break;
    case 4:                                                                                       // 목도리
      put(group, ring, am, 0, neckY + 0.005, 0, torsoW * 0.62, torsoD * 0.8, 0.06, Math.PI / 2);
      put(group, ball, am, torsoW * 0.32, neckY - torsoH * 0.22, frontZ * 0.95, torsoW * 0.17, torsoH * 0.25, 0.022);
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
  hand.position.set(0, -armR * 1.3, armR * 0.2);
  hand.rotation.x = HOLD;                 // 팔꿈치를 굽혀 들었으니 자루는 도로 세운다
  arms[1].wrist.add(hand);
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

  /* ── 뼈대 — 마네킹처럼 골반 · 허리(가슴) · 목에서 돈다 ──
     지금까지 지은 것은 모두 `group` 좌표로 적혀 있다. 관절마다 `pivot` 을 두되 그 안의 그릇을 관절 높이만큼
     도로 내려 두면, 옮겨 단 조각이 좌표를 고칠 필요 없이 제자리에 있고 관절에서 돈다. */
  const pivot = (parent, y) => {
    const p = new THREE.Group(); p.position.y = y; parent.add(p);
    const inner = new THREE.Group(); inner.position.y = -y; p.add(inner);
    return { p, inner };
  };
  armL.rotation.order = 'ZYX';                    // 왼팔: 먼저 앞뒤로 흔들고(x) · 팔을 비틀고(y) · 벌린다(z) — 허리에 손을 얹으려면 이 차례라야 팔꿈치가 몸 쪽으로 접힌다
  const pelvis = pivot(group, hipY);              // 골반 — 앉거나 숙일 때 통째로
  const chest = pivot(pelvis.inner, waistY);      // 허리 위 — 비틀고 굽힌다
  const neck = pivot(chest.inner, neckY);         // 목 — 고개
  for (const o of [...group.children]){
    if (o === pelvis.p || o.isLight || o.userData.blob) continue;
    if (o === head) neck.inner.add(o);
    else if (arms.some(a => a.a === o)) chest.inner.add(o);
    else if (legs.some(l => l.hip === o)) pelvis.inner.add(o);
    else if (o.userData.zone === 'body') pelvis.inner.add(o);
    else if (o.userData.zone === 'chest' || o.position.y > waistY) chest.inner.add(o);
    else pelvis.inner.add(o);
  }

  /* ── 자세 ── 관절마다 목표 각도를 정하고, 지금 각도를 그쪽으로 부드럽게 옮긴다.
     걷기도 서기도 쉬는 자세도 모두 같은 목표표(`T`)를 채울 뿐이다. 오른팔은 늘 바람개비를 든다. */
  const J = {
    drop: () => pelvis.p.position, pel: pelvis.p.rotation, ch: chest.p.rotation, nk: neck.p.rotation,
    shL: armL.rotation, elL: arms[0].elbow.rotation, wrL: arms[0].wrist.rotation,
    shR: armR_.rotation, elR: arms[1].elbow.rotation,
    hipL: legs[0].hip.rotation, knL: legs[0].knee.rotation, anL: legs[0].ankle.rotation,
    hipR: legs[1].hip.rotation, knR: legs[1].knee.rotation, anR: legs[1].ankle.rotation
  };
  const blank = () => ({ y: 0, pel: [0, 0, 0], ch: [0, 0, 0], nk: [0, 0, 0], shL: [0, 0, 0], elL: -0.12, wrL: 0,
    shR: [0, 0, -0.3], elR: -HOLD, hipL: [0, 0, 0], knL: 0.03, anL: -0.02, hipR: [0, 0, 0], knR: 0.03, anR: -0.02 });
  /* 바닥에 앉아 무릎을 끌어안는 자세 — 엉덩이 관절이 땅 가까이(legR) 오도록 허벅지 각을 거꾸로 푼다 */
  const sitH = legR * 1.4, sitTh = Math.acos(Math.max(-1, Math.min(1, -(shinL + shoeH * 0.5 - sitH) / thighL)));
  /* 쉬는 자세 — design/refs/character/poses 의 마네킹 자세에서 몇 개 골랐다 */
  const POSES = [
    t => { t.nk[1] = 0.7; t.ch[1] = 0.18; },                                                          // 오른쪽 둘러보기
    t => { t.nk[1] = -0.7; t.ch[1] = -0.18; t.nk[0] = 0.1; },                                         // 왼쪽 둘러보기
    t => { t.shL = [0.2, 1.4, -0.65]; t.elL = -1.7; t.wrL = 0.3; t.ch[2] = -0.05; t.hipR[2] = 0.08; t.pel[2] = 0.04; },   // 허리에 손
    (t, k) => { t.shL = [0, 0, -2.75]; t.elL = -0.45 - 0.35 * Math.sin(k * 7); t.nk[2] = 0.08; },     // 손 흔들기
    t => { t.shL = [-0.2, 0, -2.9]; t.elL = -0.2; t.ch[0] = -0.12; t.nk[0] = -0.25; },                // 기지개 · 하늘 보기
    t => { t.nk[0] = 0.35; t.ch[0] = 0.08; t.shL = [-0.15, 0.4, 0.25]; t.elL = -0.9; t.hipL[1] = -0.15; t.anL = 0.05; },   // 수줍게
    t => {                                                                                             // 앉아서 무릎 끌어안기
      t.y = -(legH - sitH); t.ch[0] = 0.35; t.nk[0] = -0.15;
      t.hipL = [-sitTh, 0, -0.08]; t.hipR = [-sitTh, 0, 0.08];
      t.knL = t.knR = sitTh - 0.12; t.anL = t.anR = 0.12;
      t.shL = [-0.7, 0, 0.1]; t.elL = -1.45;
    }
  ];
  const seedOf = String(c.nick || '').split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
  let still = 0, forced = null;              // forced — 검사 · 화면에서 자세 하나를 정해 둘 때
  const lerpTo = (k) => {
    const T = target;
    const mix = (a, b) => a + (b - a) * k;
    J.drop().y = mix(J.drop().y - hipY, T.y) + hipY;
    for (const key of ['pel', 'ch', 'nk', 'shL', 'shR', 'hipL', 'hipR']){
      const r = J[key]; r.x = mix(r.x, T[key][0]); r.y = mix(r.y, T[key][1]); r.z = mix(r.z, T[key][2]);
    }
    for (const key of ['elL', 'wrL', 'elR', 'knL', 'anL', 'knR', 'anR']) J[key].x = mix(J[key].x, T[key]);
  };
  let target = blank();
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
    setPose(i){ forced = i; },
    poseCount: POSES.length,
    update(dt, speed){
      idle += dt;
      if (pinwheel.visible) vanes.rotation.z += dt * (0.5 + speed * 2.9);
      const t = blank();
      let rate = 5;
      if (speed > 0.05){
        still = 0; rate = 14;
        phase += dt * (5.5 + speed * 1.9) * Math.min(1.25, 0.4 / legH + 0.35);
        const sw = Math.sin(phase);
        /* 엉덩이가 앞뒤로 돌고, 뒤에서 앞으로 나오는 다리의 무릎이 접히고, 발목은 발바닥을 땅과 나란히.
           골반은 내딛는 쪽으로 조금 돌고 가슴은 그 반대로 — 사람이 걸을 때처럼 몸이 꼬인다 */
        for (const [hip, kn, an, off] of [['hipL', 'knL', 'anL', 0], ['hipR', 'knR', 'anR', Math.PI]]){
          const p = phase + off;
          const h = -Math.sin(p) * 0.6 * swingK;
          const k = (0.08 + Math.max(0, -Math.sin(p + 0.6)) * 0.95) * swingK;
          t[hip] = [h, 0, 0]; t[kn] = k; t[an] = -(h + k) * 0.7;
        }
        t.pel[1] = sw * 0.12; t.ch[1] = -sw * 0.2; t.nk[1] = sw * 0.08; t.ch[0] = 0.04 + Math.min(0.08, speed * 0.02);
        t.shL = [sw * 0.5, 0, 0]; t.elL = -(0.2 + Math.max(0, -sw) * 0.55);
        t.shR = [-sw * 0.2, 0, -0.3];
        t.y = Math.abs(Math.cos(phase)) * 0.018;
      } else {
        phase = 0;
        still += dt;
        t.ch[0] = Math.sin(idle * 1.5) * 0.02;                                              // 숨 — 가슴이 오르내린다
        /* 가만히 4초 넘게 서 있으면 쉬는 자세. 무엇을 할지는 서버 시각과 이름으로 정한다 — 남의 화면에서도 같은 자세 */
        if (forced != null) POSES[forced % POSES.length](t, idle);
        else if (poses && still > 4){
          const slot = Math.floor(serverNow() / 7000);
          const i = Math.abs((slot * 2654435761 ^ seedOf) | 0) % (POSES.length + 2);
          if (i < POSES.length) POSES[i](t, idle);
        }
      }
      target = t;
      lerpTo(Math.min(1, dt * rate));
      group.position.y = 0;
      group.rotation.x = 0;
      if (tossLeft > 0){
        tossLeft -= dt;
        const k = 1 - tossLeft / TOSS_TIME;
        armL.rotation.x = k < 0.3 ? (k / 0.3) * 1.5 - 0.1 : 1.4 - ((k - 0.3) / 0.7) * 3.3;
        arms[0].elbow.rotation.x = k < 0.3 ? -1.2 * (k / 0.3) : -1.2 + 1.2 * ((k - 0.3) / 0.7);   // 젖힐 때 굽혔다 뿌리며 편다
        chest.p.rotation.y = k < 0.3 ? 0.35 * (k / 0.3) : 0.35 - 0.7 * ((k - 0.3) / 0.7);           // 허리를 비틀어 뿌린다
        chest.p.rotation.x = k < 0.3 ? -0.15 * (k / 0.3) : -0.15 + 0.4 * ((k - 0.3) / 0.7);
        armL.rotation.z = -0.8;
      } else if (reachLeft > 0){
        reachLeft -= dt;
        const k = Math.min(1, reachLeft / 0.3);
        armL.rotation.set(-0.55 * k, 0, -1.0 * k);
        arms[0].elbow.rotation.x = -0.15 * k;
        chest.p.rotation.x = 0.12 * k;                                                     // 손을 내밀며 조금 숙인다
      }
    },
    dispose(){ for (const o of own) o.dispose(); }
  };
}
