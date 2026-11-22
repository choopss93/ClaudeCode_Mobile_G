import * as THREE from 'three';
import { toon, toonUnique } from '#look';

/*
 * 옷 입히기 — Metaversal Studio 에서 고른 얼굴 · 헤어 · 상의 · 하의를 짓는다.
 * 무엇을 고를 수 있는지는 shared/js/character.js 가 알고, 여기는 모양만 안다.
 *
 * 캐릭터는 머리가 크고 몸이 작다. 몸에서 보이는 자리는 높이 30cm 남짓뿐이라
 * 작은 장식은 묻힌다 — **모양과 색이 뚜렷이 달라야** 알아본다. 그래서 덧붙이는
 * 것은 몸 겉면에 바짝 붙이고(`front`), 색은 몸과 확실히 다르게 둔다.
 *
 * 머리 앞(+Z)이 얼굴이다. 얼굴 앞으로 지나가는 것은 무엇이든 눈을 가리므로
 * 앞머리는 **눈썹 위**에서 끝낸다.
 */

// 잘게 쪼갠다 — 성기면 테두리가 각져 보인다 (actor.js 와 같은 결)
const ball = new THREE.SphereGeometry(1, 28, 20);
const cone = new THREE.ConeGeometry(1, 1, 16);
const ring = new THREE.TorusGeometry(1, 0.16, 10, 48);         // 몸에 두르는 띠
const arcHalf = new THREE.TorusGeometry(1, 0.26, 10, 24, Math.PI);  // 눈 · 입의 반달
const ringThin = new THREE.TorusGeometry(1, 0.36, 10, 28);      // 동그란 입
const DARK = 0x5C5560, MOUTH = 0x8A4A50, WHITE = 0xFFFFFF;

function put(parent, geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

/** 이 캐릭터의 기본 재질 — 몸 · 팔 · 다리. actor.js 가 몸을 지을 때 쓴다. */
export function baseMats(r){
  const skin = toon(r.skin);
  return {
    skin,
    body: toon(r.top.color),
    arm: r.top.sleeve == null ? skin : toon(r.top.sleeve),
    leg: toon(r.bottom.leg)
  };
}

/* ─────────── 몸 — 하의와 상의 장식 ─────────── */
/**
 * ctx: { group, armL, armR, BODY_Y, BODY_H }
 * 몸은 가로 0.19 · 세로 BODY_H/2 ·앞뒤 0.165 의 타원체다.
 */
export function dressBody(ctx, r){
  const { group, BODY_Y, BODY_H } = ctx;
  const HY = BODY_H / 2;
  const k = y => Math.sqrt(Math.max(0, 1 - ((y - BODY_Y) / HY) ** 2));
  const front = y => 0.165 * k(y) + 0.004;                 // 그 높이에서 몸 앞면
  const band = (y, mat, thick = 1) =>                     // 몸에 두르는 띠
    put(group, ring, mat, 0, y, 0, 0.19 * k(y) + 0.006, 0.19 * k(y) + 0.006, (0.165 * k(y) + 0.006) * thick, Math.PI / 2);

  const b = r.bottom, t = r.top;
  const bm = toon(b.color);
  const hip = () => put(group, ball, bm, 0, BODY_Y - 0.075, 0, 0.197, 0.095, 0.172);
  const skirt = (top, bottom, h, y) => {
    const mat = toonUnique(b.color, { side: THREE.DoubleSide });
    put(group, new THREE.CylinderGeometry(top, bottom, h, 40, 1, true), mat, 0, y, 0, 1, 1, 0.9);
    if (b.accent) put(group, ring, toon(b.accent), 0, y - h / 2 + 0.008, 0, bottom, bottom, bottom * 0.9 * 0.6, Math.PI / 2);
  };
  const bib = () => {                                     // 멜빵 — 가슴판과 끈
    put(group, ball, bm, 0, BODY_Y + 0.05, front(BODY_Y + 0.05) - 0.03, 0.09, 0.075, 0.04);
    for (const s of [-1, 1]){
      put(group, ball, bm, s * 0.075, BODY_Y + 0.105, front(BODY_Y + 0.1) - 0.02, 0.016, 0.05, 0.02, 0, 0, s * 0.25);
      put(group, ball, toon(0xF2D27A), s * 0.06, BODY_Y + 0.085, front(BODY_Y + 0.085) + 0.004, 0.011);
    }
  };

  switch (b.kind){
    case 'shorts': case 'pants': hip(); break;
    case 'cargo':
      hip();
      for (const s of [-1, 1]) put(group, ball, toon(0xA8956C), s * 0.19, BODY_Y - 0.1, 0.03, 0.02, 0.04, 0.05);
      break;
    case 'track':
      hip();
      for (const s of [-1, 1]) put(group, ball, toon(b.accent), s * 0.197, BODY_Y - 0.075, 0, 0.012, 0.085, 0.035);
      break;
    case 'overall': hip(); bib(); break;
    case 'skirt': skirt(0.178, 0.245, 0.13, BODY_Y - 0.085); break;
    case 'flare': skirt(0.178, 0.30, 0.13, BODY_Y - 0.09); break;
    case 'long':  skirt(0.178, 0.27, 0.22, BODY_Y - 0.13); break;
    case 'overall-skirt': skirt(0.178, 0.25, 0.13, BODY_Y - 0.085); bib(); break;
  }

  const am = t.accent != null ? toon(t.accent) : null;
  const white = toon(WHITE);
  const neckY = BODY_Y + HY - 0.06;          // 머리에 가리지 않고 보이는 목둘레 높이
  switch (t.kind){
    case 'hood':
      put(group, ball, am, 0, neckY + 0.02, -0.12, 0.16, 0.085, 0.1);
      for (const s of [-1, 1]) put(group, ball, white, s * 0.035, neckY - 0.05, front(neckY - 0.05), 0.008, 0.04, 0.008);
      break;
    case 'shirt':
      for (const s of [-1, 1]) put(group, ball, am, s * 0.055, neckY, front(neckY) - 0.01, 0.06, 0.028, 0.02, 0, 0, s * 0.55);
      for (const y of [neckY - 0.05, neckY - 0.1, neckY - 0.15]) put(group, ball, am, 0, y, front(y), 0.012);
      break;
    case 'stripe': case 'knit':
      if (t.kind === 'stripe') for (const y of [BODY_Y - 0.02, BODY_Y + 0.04, BODY_Y + 0.1]) band(y, am, 0.98);
      else { band(neckY, am, 1.1); band(BODY_Y - 0.11, am, 1.1); }
      break;
    case 'vest': case 'cardigan': {
      // 앞이 트인 덧옷 — 몸을 한 겹 더 덮고, 앞가운데로 속옷이 보이게
      const over = t.kind === 'vest' ? am : toon(t.color);
      put(group, ball, over, 0, BODY_Y + 0.01, 0.003, 0.196, HY * 0.93, 0.17);
      put(group, ball, t.kind === 'vest' ? toon(t.color) : am, 0, BODY_Y + 0.03, front(BODY_Y + 0.03) - 0.012, 0.035, 0.12, 0.025);
      if (t.kind === 'cardigan') for (const y of [BODY_Y + 0.08, BODY_Y + 0.02, BODY_Y - 0.04]) put(group, ball, toon(0xE8C46A), 0.045, y, front(y) - 0.002, 0.011);
      break;
    }
    case 'zip':
      band(neckY, am, 1.1);
      put(group, ball, am, 0, BODY_Y, front(BODY_Y) - 0.004, 0.007, 0.13, 0.01);
      break;
    case 'ribbon':
      for (const s of [-1, 1]) put(group, ball, am, s * 0.034, neckY - 0.01, front(neckY) + 0.005, 0.034, 0.024, 0.018, 0, 0, s * 0.3);
      put(group, ball, am, 0, neckY - 0.01, front(neckY) + 0.012, 0.014);
      break;
    case 'puff':
      for (const arm of [ctx.armL, ctx.armR]) put(arm, ball, toon(t.color), 0, -0.025, 0, 0.088, 0.072, 0.088);
      break;
    case 'sailor':
      put(group, ball, am, 0, neckY + 0.005, -0.03, 0.2, 0.03, 0.15);
      for (const s of [-1, 1]) put(group, ball, am, s * 0.05, neckY - 0.03, front(neckY - 0.03) - 0.01, 0.05, 0.022, 0.015, 0, 0, s * 0.8);
      put(group, ball, toon(0xFF9CA8), 0, neckY - 0.06, front(neckY - 0.06) + 0.004, 0.022, 0.016, 0.014);
      break;
  }
}

/* ─────────── 머리 — 헤어와 얼굴 ─────────── */
/** ctx: { head, R } — R 은 머리 반지름, head 의 가운데가 머리 가운데다. */
export function dressHead(ctx, r){
  const { head, R } = ctx;
  hair(head, R, r.hair);
  face(head, R, r.face, r.expr, r.gender);
  put(head, ball, toon(r.skin), 0, -0.04, R * 0.84 * 1.02, 0.034, 0.03, 0.03);   // 코
}

function hair(head, R, h){
  const m = toon(h.color);
  // 덮개 — 머리보다 조금 크게 덮어야 모자처럼 보인다. 얼굴은 드러나게 뒤로 민다.
  const cap = () => put(head, ball, m, 0, R * 0.22, -R * 0.16, R * 1.04, R * 0.88, R * 0.92);
  // 앞머리 — 정수리 덮개와 겹치게 두툼히 (얇으면 사이로 이마가 줄처럼 비친다). 아래 끝은 눈썹 위.
  const fringe = (y = 0.54, depth = 0.42, w = 0.84) => put(head, ball, m, 0, R * y, R * depth, R * w, R * 0.26, R * 0.42);
  const longSides = () => {
    for (const s of [-1, 1]) put(head, ball, m, s * R * 0.84, -R * 0.42, -R * 0.04, R * 0.3, R * 0.62, R * 0.34);
    put(head, ball, m, 0, -R * 0.46, -R * 0.6, R * 0.74, R * 0.58, R * 0.44);
  };
  const tie = (x, y, z, c = 0xFF9CA8) => put(head, ball, toon(c), x, y, z, R * 0.085);

  switch (h.kind){
    case 'short': cap(); break;
    case 'part': cap(); put(head, ball, m, R * 0.26, R * 0.6, R * 0.38, R * 0.52, R * 0.2, R * 0.34, 0, 0, -0.35); break;
    case 'spiky':
      cap();
      for (let i = 0; i < 7; i++){
        const a = (i / 7) * Math.PI * 2;
        const x = Math.sin(a) * R * 0.5, z = Math.cos(a) * R * 0.45 - R * 0.2;
        put(head, cone, m, x, R * 0.8, z, R * 0.16, R * 0.38, R * 0.16, Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      }
      break;
    case 'curly':
      cap();
      for (let i = 0; i < 18; i++){
        const yy = 0.25 + 0.7 * (i / 18);                  // 위쪽 반구에 고르게
        const a = i * 2.39996;
        const rr = Math.sqrt(1 - yy * yy);
        put(head, ball, m, Math.cos(a) * rr * R * 1.0, R * 0.22 + yy * R * 0.86, Math.sin(a) * rr * R * 0.9 - R * 0.16, R * 0.19);
      }
      break;
    case 'bowl': cap(); fringe(0.54, 0.44, 0.9); for (const s of [-1, 1]) put(head, ball, m, s * R * 0.86, R * 0.05, R * 0.05, R * 0.24, R * 0.4, R * 0.36); break;
    case 'back': put(head, ball, m, 0, R * 0.34, -R * 0.26, R * 1.02, R * 0.78, R * 0.86); break;
    case 'ahoge':
      cap();
      put(head, new THREE.TorusGeometry(1, 0.2, 10, 24, Math.PI * 1.3), m, 0, R * 1.08, -R * 0.02, R * 0.16, R * 0.16, R * 0.16, 0, Math.PI / 2, 0.4);
      break;
    case 'bun': cap(); put(head, ball, m, 0, R * 0.62, -R * 0.84, R * 0.25); break;

    case 'long': cap(); longSides(); break;
    case 'bob':
      cap(); fringe(0.54, 0.42, 0.86);
      for (const s of [-1, 1]) put(head, ball, m, s * R * 0.82, -R * 0.14, -R * 0.06, R * 0.3, R * 0.46, R * 0.42);
      put(head, ball, m, 0, -R * 0.12, -R * 0.58, R * 0.86, R * 0.5, R * 0.44);
      break;
    case 'pony':
      cap(); tie(0, R * 0.28, -R * 0.98);
      put(head, ball, m, 0, -R * 0.24, -R * 1.1, R * 0.21, R * 0.56, R * 0.21, 0.28, 0, 0);
      break;
    case 'twin':
      cap();
      for (const s of [-1, 1]){
        tie(s * R * 0.88, R * 0.26, -R * 0.34);
        put(head, ball, m, s * R * 1.04, -R * 0.28, -R * 0.4, R * 0.19, R * 0.56, R * 0.19, 0, 0, s * 0.22);
      }
      break;
    case 'topbun': cap(); put(head, ball, m, 0, R * 1.02, -R * 0.16, R * 0.3); break;
    case 'braid':
      cap();
      for (const s of [-1, 1]){
        for (let i = 0; i < 4; i++) put(head, ball, m, s * R * (0.8 - i * 0.03), -R * (0.2 + i * 0.26), -R * (0.14 - i * 0.02), R * (0.16 - i * 0.015));
        tie(s * R * 0.7, -R * 1.2, -R * 0.08, 0xFFCD88);
      }
      break;
    case 'wave':
      cap(); longSides();
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) put(head, ball, m, s * R * (0.92 + (i % 2) * 0.06), -R * (0.15 + i * 0.3), -R * 0.1, R * 0.17);
      break;
    case 'pin':
      cap();
      put(head, ball, toon(h.accent || 0xFFB6D9), R * 0.55, R * 0.5, R * 0.56, R * 0.17, R * 0.065, R * 0.07, 0, 0, 0.35);
      break;
    default: cap();
  }
}

function face(head, R, f, x, gender){
  const fz = R * 0.84;
  const dark = toon(DARK), white = toon(WHITE), mouthMat = toon(MOUTH);
  const blush = toon(0xFFB4C0);
  const EX = 0.105, EY = 0.015;
  const surfZ = y => R * 0.92 * Math.sqrt(Math.max(0, 1 - (y / (R * 0.96)) ** 2));   // 그 높이의 얼굴 앞면

  const dot = (ex, s = 1, sy = 1.15, sx = 1) => put(head, ball, dark, ex, EY, fz, 0.042 * s * sx, 0.042 * s * sy, 0.03);
  const shine = (ex, k = 1) => put(head, ball, white, ex + 0.016 * k, EY + 0.024 * k, surfZ(EY) + 0.004, 0.013 * k);
  const arc = ex => put(head, arcHalf, dark, ex, EY - 0.005, surfZ(EY) - 0.004, 0.034, 0.034, 0.03);   // ∩ — 웃는 눈

  // 눈 — 표정이 눈을 바꾸면 그쪽이 먼저다 (활짝 · 윙크 · 졸림 · 놀람)
  const shape = x.eyes || f.eyes;
  const eye = (ex, sh) => {
    switch (sh){
      case 'sparkle': dot(ex, 1.2, 1.2); shine(ex); break;
      case 'big': dot(ex, 1.38, 1.1); shine(ex, 1.25); break;
      case 'small': dot(ex, 0.72, 1.05); break;
      case 'tall': dot(ex, 0.85, 1.75); break;
      case 'calm': put(head, ball, dark, ex, EY - 0.004, fz, 0.05, 0.03, 0.03); break;
      case 'happy': arc(ex); break;
      case 'sleepy': put(head, ball, dark, ex, EY - 0.01, fz, 0.046, 0.016, 0.03); break;
      case 'surprised': dot(ex, 1.3, 1); shine(ex); break;
      default: dot(ex);
    }
  };
  if (shape === 'wink'){ eye(-EX, f.eyes); arc(EX); }   // 윙크 — 한쪽은 얼굴 본래의 눈, 한쪽은 감은 눈
  else { eye(-EX, shape); eye(EX, shape); }

  // 속눈썹 (여자) · 눈썹 (남자, 표정에 따라 기운다)
  const tilt = x.brow || 0;
  for (const s of [-1, 1]){
    if (f.lash) put(head, ball, dark, s * (EX + 0.04), EY + 0.04, surfZ(EY + 0.04) - 0.006, 0.022, 0.007, 0.01, 0, 0, s * 0.6);
    if (f.brow || tilt) put(head, ball, toon(f.brow ? 0x6B5A55 : 0x8A7570), s * EX, EY + 0.075 + (tilt > 0 ? 0.012 : 0), surfZ(EY + 0.075) - 0.004,
                           0.034, f.brow ? 0.008 : 0.006, 0.01, 0, 0, -s * (0.12 - tilt));
  }

  // 입
  const MY = -0.095, mz = surfZ(MY) - 0.004;
  switch (x.mouth){
    case 'grin': put(head, arcHalf, mouthMat, 0, MY + 0.012, mz, 0.04, 0.04, 0.03, 0, 0, Math.PI); break;
    case 'flat': put(head, ball, mouthMat, 0, MY, mz, 0.024, 0.006, 0.008); break;
    case 'cat': for (const s of [-1, 1]) put(head, arcHalf, mouthMat, s * 0.02, MY + 0.008, mz, 0.02, 0.02, 0.02, 0, 0, Math.PI); break;
    case 'o': put(head, ringThin, mouthMat, 0, MY - 0.004, mz, 0.017, 0.02, 0.02); break;
    case 'tongue':
      put(head, arcHalf, mouthMat, 0, MY + 0.01, mz, 0.03, 0.03, 0.03, 0, 0, Math.PI);
      put(head, ball, toon(0xFF8E9E), 0.006, MY - 0.022, mz + 0.002, 0.016, 0.02, 0.012);
      break;
    case 'frown': put(head, arcHalf, mouthMat, 0, MY - 0.018, mz, 0.026, 0.022, 0.03); break;   // ∩ — 시무룩
    default: put(head, arcHalf, mouthMat, 0, MY + 0.01, mz, 0.03, 0.03, 0.03, 0, 0, Math.PI);
  }

  // 볼 — 주근깨 · 점이 있는 얼굴도 볼터치는 둔다
  for (const s of [-1, 1]) put(head, ball, blush, s * 0.175, -0.07, fz * 0.86, 0.055, 0.035, 0.03);
  if (f.mark === 'freckle'){
    const fr = toon(0xC9906E);
    for (const s of [-1, 1]) for (const [dx, dy] of [[-0.03, 0.02], [-0.008, 0.03], [-0.02, 0.0]])
      put(head, ball, fr, s * (0.165 + dx), -0.045 + dy, surfZ(-0.045) - 0.004, 0.008);
  } else if (f.mark === 'mole'){
    put(head, ball, toon(0x6B4F48), 0.12, -0.105, surfZ(-0.105) - 0.004, 0.009);
  }
}
