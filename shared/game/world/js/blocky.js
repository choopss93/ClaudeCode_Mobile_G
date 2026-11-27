import * as THREE from 'three';
import { makeBlob } from '#look';

/*
 * 블록 캐릭터 (v4) — 사용자가 준 블렌더 모델(핑크 소녀)의 결을 따른 둥근 상자 캐릭터.
 *
 * - **맨몸 위에 덧입힌다.** 머리 · 목 · 몸통 · 골반 · 팔 · 손 · 다리 · 발이 피부색 맨몸(base)이고, 머리칼 · 상의 · 하의 ·
 *   신발 · 소품이 그 위에 한 겹 더 큰 상자로 얹힌다. 아무것도 고르지 않으면 맨몸 그대로다 (사용자 요청 — 처음엔 아무것도 안 고른 상태).
 * - 모든 조각이 **모서리 · 꼭짓점이 둥근 상자** (사용자 요청). 둥근 자리에만 격자를 몬다 (rbox). 비스듬한 조각(띠 · 깃)은 z 축으로만 돌린다.
 * - **관절은 있되 모양은 없다** (사용자 요청) — 머리 · 두 팔 · 두 다리를 돌쩌귀 그릇(J)에 묶어 돌릴 뿐이다.
 * - 겉면은 **유광 = 색 위에 투명한 유리 코팅**(clearcoat + 비칠 하늘) · **무광** (finish, 사용자 요청). 반투명 몸이 아니다.
 * - 남녀는 체형(몸 · 어깨 폭 · 다리 간격)과 속눈썹이 다르고, 고를 수 있는 종류가 다르다 (character.js 의 OPTIONS).
 * - 같은 무리 · 같은 색 조각은 한 덩어리로 합쳐 그리기 횟수를 줄인다.
 *
 * 앞은 +Z, 단위 m, 키 1.34. 종류 번호는 character.js 의 목록 순서 그대로 — **목록 끝에만** 붙이고, 여기 switch 에 한 칸.
 */
export const HEAD_TOP = 1.34, HEAD_Y = 1.19;   // HEAD_Y — Studio 가 얼굴 · 머리를 고를 때 다가가 볼 높이

/* 색 — 단 · 주머니 · 밑창처럼 한 톤 다른 곳은 같은 색을 조금 밝게/어둡게 */
function tone(hex, k){
  const c = new THREE.Color(hex), l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (k > 0 && l < 0.06){ c.r += 0.025; c.g += 0.017; c.b += 0.016; }   // 아주 짙은 색은 어둡게 할 수 없어 밝힌다
  else c.multiplyScalar(k > 0 ? 0.87 : 0.5);
  return c.getHex();
}
const lum = hex => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

/* 둥근 상자 — 평평한 가운데는 한 칸, 모서리 둥근 자리에만 n 칸씩. rz 만큼 z 축으로 돌릴 수 있다 */
function rbox(P, N, I, cx, cy, cz, w, h, d, r, rz = 0, n = 2){
  const H = [w / 2, h / 2, d / 2];
  r = Math.max(0.0015, Math.min(r, Math.min(...H) * 0.95));
  const cs = Math.cos(rz), sn = Math.sin(rz);
  const samp = hh => {
    const a = hh - r, s = [];
    for (let k = n; k >= 1; k--) s.push(-a - r * Math.tan(k / n * Math.PI / 4));
    s.push(-a, a);
    for (let k = 1; k <= n; k++) s.push(a + r * Math.tan(k / n * Math.PI / 4));
    return s;
  };
  for (const [na, ua, va] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) for (const sg of [1, -1]){
    const su = samp(H[ua]), sv = samp(H[va]), m = su.length, base = P.length / 3;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++){
      const p = [0, 0, 0];
      p[na] = sg * H[na]; p[ua] = su[i]; p[va] = sv[j];
      const q = p.map((x, k) => Math.max(-(H[k] - r), Math.min(H[k] - r, x)));
      let dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
      const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      const x = q[0] + dx * r, y = q[1] + dy * r, z = q[2] + dz * r;
      P.push(cx + x * cs - y * sn, cy + x * sn + y * cs, cz + z);
      N.push(dx * cs - dy * sn, dx * sn + dy * cs, dz);
    }
    for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++){
      const a = base + j * m + i, b = a + 1, c = a + m + 1, e = a + m;
      if (sg > 0) I.push(a, b, c, a, c, e); else I.push(a, c, b, a, e, c);
    }
  }
}

/* 조각 목록 짓기 — [무리, 색, 가운데 x y z, 폭 높이 깊이, 둥글기, z 회전]. 팔 · 다리 조각은 s(-1 왼쪽 · 1 오른쪽)마다 */
function build(c){
  const out = [];
  const C = (g, col, x, y, z, w, h, d, r = 0.01, rz = 0) => out.push([g, col, x, y, z, w, h, d, r, rz]);
  const B = (g, col, x1, y1, z1, x2, y2, z2, r = 0.01, rz = 0) =>
    C(g, col, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1), r, rz);
  const SIDES = [-1, 1], arm = s => s < 0 ? 'armL' : 'armR', leg = s => s < 0 ? 'legL' : 'legR';
  const f = c.gender === 1;
  const TW = f ? 0.32 : 0.36, AX = TW / 2 + 0.06, AW = f ? 0.09 : 0.1, LX = f ? 0.085 : 0.095, LW = f ? 0.13 : 0.145;
  const skin = c.skin;

  /* ── 맨몸 ── */
  C('head', skin, 0, 1.12, 0, 0.32, 0.32, 0.32, 0.07);
  C('body', skin, 0, 0.95, 0, 0.08, 0.08, 0.08, 0.015);                          // 목
  B('body', skin, -TW / 2, 0.58, -0.1, TW / 2, 0.935, 0.1, 0.04);                  // 몸통
  B('body', skin, -TW / 2 + 0.01, 0.48, -0.095, TW / 2 - 0.01, 0.6, 0.095, 0.03); // 골반
  for (const s of SIDES){
    C(arm(s), skin, s * AX, 0.745, 0, AW, 0.37, AW + 0.005, 0.03);                // 팔
    C(arm(s), skin, s * AX, 0.52, 0.005, 0.075, 0.075, 0.075, 0.015);             // 손 — 작은 정육면체 (사용자 요청)
    C(leg(s), skin, s * LX, 0.29, 0, LW, 0.46, LW + 0.01, 0.03);                  // 다리
    B(leg(s), skin, s * LX - 0.06, 0, -0.07, s * LX + 0.06, 0.07, 0.12, 0.025);   // 발
  }
  /* 얼굴 — 눈 · 눈썹 · 입. 여자는 속눈썹 */
  for (const s of SIDES){
    C('head', 0x2A2321, s * 0.062, 1.083, 0.161, 0.036, 0.024, 0.008, 0.004);
    C('head', c.hairColor, s * 0.062, 1.116, 0.161, f ? 0.046 : 0.054, f ? 0.007 : 0.011, 0.006, 0.002);
    if (f) C('head', 0x1A1414, s * 0.064, 1.097, 0.162, 0.046, 0.006, 0.008, 0.002);
  }
  C('head', c.lip, 0, 1.025, 0.161, 0.035, 0.01, 0.006, 0.0025);

  /* ── 머리칼 ── */
  const hc = c.hairColor;
  const H = {
    top: [0, 1.25, -0.002, 0.345, 0.11, 0.345, 0.05], back: [0, 1, -0.15, 0.345, 0.5, 0.07, 0.033],
    bangs: [0, 1.165, 0.157, 0.335, 0.11, 0.04, 0.018], sideL: [-0.168, 1.12, -0.01, 0.05, 0.3, 0.3, 0.024],
    sideR: [0.168, 1.12, -0.01, 0.05, 0.3, 0.3, 0.024], lockL: [-0.16, 0.87, 0.1, 0.119, 0.419, 0.111, 0.052],
    lockR: [0.16, 0.87, 0.1, 0.119, 0.419, 0.111, 0.052]
  };
  const cut = (a, bottom) => { const top = a[1] + a[4] / 2; a[4] = top - bottom; a[1] = (top + bottom) / 2; return a; };
  const put = a => C('head', hc, ...a);
  const tips = () => { for (const s of SIDES) for (let i = 0; i < 3; i++) C('head', hc, s * (0.03 + i * 0.055), 1.105 + i * 0.006, 0.162, 0.053, 0.053, 0.035, 0.015); };
  switch (c.hair){
    case 1: put(H.top); put(H.back); put(H.bangs); put(H.sideL); put(H.sideR); put(H.lockL); put(H.lockR); tips(); break;   // 긴 생머리 (원본)
    case 2: put(H.top); put(cut(H.back, 0.93)); put(H.bangs); put(H.sideL); put(H.sideR); put(cut(H.lockL, 0.93)); put(cut(H.lockR, 0.93)); tips(); break;   // 단발
    case 3: case 4: case 6:                                                                 // 짧은 머리 · 묶은 머리 · 양갈래
      put(H.top); put(cut(H.back, 1.06)); put(H.bangs); put(cut(H.sideL, 1.03)); put(cut(H.sideR, 1.03)); tips();
      if (c.hair === 4){ C('head', hc, 0, 0.93, -0.215, 0.1, 0.3, 0.08, 0.035); C('head', tone(hc, 1), 0, 1.08, -0.2, 0.07, 0.035, 0.07, 0.012); }
      if (c.hair === 6) for (const s of SIDES){ C('head', hc, s * 0.21, 0.95, -0.03, 0.08, 0.28, 0.08, 0.03); C('head', tone(hc, 1), s * 0.21, 1.08, -0.03, 0.085, 0.03, 0.085, 0.01); }
      break;
    case 5: put(H.top); put(cut(H.back, 1.15)); put(cut(H.sideL, 1.18)); put(cut(H.sideR, 1.18)); C('head', hc, 0, 1.215, 0.16, 0.3, 0.03, 0.03, 0.01); break;   // 스포츠
    case 7: C('head', hc, 0, 1.27, 0.005, 0.35, 0.09, 0.35, 0.04); C('head', hc, 0, 1.24, 0.14, 0.3, 0.07, 0.08, 0.03);   // 투블럭 — 윗머리만 두툼히
      put(cut(H.back, 1.12)); put(cut(H.sideL, 1.19)); put(cut(H.sideR, 1.19)); break;
    case 8: put(H.top); put(cut(H.back, 1.06)); put(cut(H.sideL, 1.06)); put(cut(H.sideR, 1.06));   // 댄디 — 옆으로 넘긴 짧은 앞머리
      C('head', hc, -0.02, 1.19, 0.157, 0.3, 0.06, 0.04, 0.018); C('head', hc, -0.09, 1.15, 0.16, 0.13, 0.05, 0.03, 0.015); break;
  }

  /* ── 상의 ── F = 앞면 깊이 (목걸이 · 가방 끈이 그 위에 얹힌다) */
  const tc = c.topColor, t1 = tone(tc, 1);
  let F = 0.1;
  const sleeve = (w, d, y1, cuff) => { for (const s of SIDES){
    B(arm(s), tc, s * AX - w / 2, y1, -d / 2, s * AX + w / 2, 0.94, d / 2, 0.03);
    if (cuff) C(arm(s), t1, s * AX, y1 + 0.015, 0, w + 0.006, 0.035, d + 0.006, 0.01);
  } };
  const sweat = () => {                                                                   // 맨투맨 (원본)
    C('body', tc, 0, 0.77, 0, 0.42, 0.32, 0.24, 0.05); C('body', t1, 0, 0.6, 0, 0.42, 0.04, 0.24, 0.018);
    C('body', t1, 0, 0.935, 0, 0.13, 0.02, 0.1, 0.008);
    for (const s of SIDES){ C(arm(s), tc, s * (AX + 0.03), 0.75, 0.01, 0.166, 0.344, 0.16, 0.045); C(arm(s), t1, s * (AX + 0.045), 0.565, 0.02, 0.15, 0.061, 0.165, 0.02); }
    F = 0.12;
  };
  const tee = (y1 = 0.585) => { B('body', tc, -(TW / 2 + 0.015), y1, -0.112, TW / 2 + 0.015, 0.94, 0.112, 0.035); C('body', t1, 0, 0.935, 0, 0.11, 0.015, 0.09, 0.006); F = 0.112; };
  switch (c.top){
    case 1: sweat(); break;
    case 2: tee(); sleeve(0.13, 0.136, 0.77); break;                                                       // 티셔츠
    case 3: sweat(); C('body', tc, 0, 0.93, -0.15, 0.3, 0.14, 0.1, 0.045); C('body', t1, 0, 0.685, 0.122, 0.22, 0.09, 0.01, 0.006);   // 후디
      for (const s of SIDES) C('body', t1, s * 0.035, 0.85, 0.123, 0.008, 0.1, 0.006, 0.002); break;
    case 4: tee(0.575); for (const s of SIDES) C('body', t1, s * 0.05, 0.93, 0.1, 0.07, 0.04, 0.03, 0.008, s * -0.35);   // 셔츠
      C('body', t1, 0, 0.75, 0.113, 0.014, 0.33, 0.006, 0.002); sleeve(0.124, 0.13, 0.575, true); F = 0.113; break;
    case 5: B('body', tc, -(TW / 2 + 0.01), 0.585, -0.108, TW / 2 + 0.01, 0.93, 0.108, 0.035); C('body', t1, 0, 0.925, 0, 0.12, 0.015, 0.1, 0.006); F = 0.108; break;   // 민소매
    case 6: B('body', tc, -(TW / 2 + 0.035), 0.55, -0.128, TW / 2 + 0.035, 0.945, 0.128, 0.04);   // 재킷
      C('body', t1, 0, 0.75, 0.129, 0.012, 0.38, 0.004, 0.002);
      for (const s of SIDES){ C('body', t1, s * 0.06, 0.93, 0.11, 0.08, 0.06, 0.04, 0.01); C('body', t1, s * 0.1, 0.63, 0.129, 0.08, 0.05, 0.006, 0.004); }
      sleeve(0.136, 0.144, 0.56, true); F = 0.129; break;
    case 7: B('body', tc, -(TW / 2 + 0.06), 0.56, -0.15, TW / 2 + 0.06, 0.95, 0.15, 0.07);   // 패딩 — 누빔 띠 셋 · 높은 깃 · 두툼한 소매
      for (const y of [0.66, 0.76, 0.86]) B('body', t1, -(TW / 2 + 0.062), y, -0.152, TW / 2 + 0.062, y + 0.012, 0.152, 0.005);
      C('body', tc, 0, 0.96, 0, 0.22, 0.08, 0.2, 0.04);
      sleeve(0.17, 0.17, 0.57, true); for (const s of SIDES) C(arm(s), t1, s * AX, 0.76, 0, 0.172, 0.012, 0.172, 0.005); F = 0.15; break;
    case 8: tee(0.72); C('body', t1, 0, 0.725, 0, TW + 0.034, 0.015, 0.228, 0.006); sleeve(0.13, 0.136, 0.77); break;   // 크롭티 — 배가 보인다
    case 9: tee(); C('body', t1, 0, 0.925, 0, 0.16, 0.03, 0.14, 0.012); C('body', t1, 0, 0.75, 0.113, 0.01, 0.3, 0.005, 0.002);   // 블라우스 — 퍼프 소매 · 둥근 깃
      sleeve(0.15, 0.16, 0.75); for (const s of SIDES) C(arm(s), t1, s * AX, 0.755, 0, 0.152, 0.02, 0.162, 0.008); F = 0.113; break;
  }

  /* ── 하의 ── F2 = 허리 앞면 깊이 */
  const bc = c.bottomColor, b1 = tone(bc, 1);
  let F2 = 0.095;
  const hips = (belt = true) => {
    B('body', bc, -(TW / 2 + 0.01), 0.47, -0.105, TW / 2 + 0.01, 0.6, 0.105, 0.035);
    if (belt) B('body', 0x160D0D, -(TW / 2 + 0.013), 0.575, -0.108, TW / 2 + 0.013, 0.6, 0.108, 0.008);
    F2 = 0.105;
  };
  const legs = (hw, y1, hd, hem) => { for (const s of SIDES){
    B(leg(s), bc, s * LX - hw, y1, -hd, s * LX + hw, 0.5, hd, 0.03);
    if (hem) B(leg(s), b1, s * LX - hw - 0.001, y1, -hd - 0.001, s * LX + hw + 0.001, y1 + hem, hd + 0.001, 0.01);
  } };
  switch (c.bottom){
    case 1: C('body', bc, 0, 0.52, 0, TW + 0.04, 0.12, 0.2, 0.04); C('body', 0x160D0D, 0, 0.565, 0, TW + 0.045, 0.03, 0.205, 0.01);   // 카고 (원본)
      C('body', 0x806769, 0, 0.565, 0.106, 0.05, 0.035, 0.012, 0.003); C('body', 0xD37277, 0.06, 0.44, 0.106, 0.035, 0.25, 0.008, 0.003);
      C('body', 0x322A2B, -0.13, 0.45, 0.103, 0.023, 0.22, 0.008, 0.0025); F2 = 0.1;
      for (const s of SIDES){
        C(leg(s), bc, s * LX, 0.34, 0, 0.18, 0.3, 0.19, 0.035); C(leg(s), b1, s * LX, 0.17, 0, 0.19, 0.07, 0.2, 0.03);
        C(leg(s), b1, s * (LX + 0.098), 0.31, 0, 0.03, 0.11, 0.12, 0.012); C(leg(s), bc, s * (LX + 0.1), 0.375, 0, 0.036, 0.025, 0.13, 0.008);
      }
      break;
    case 2: hips(); legs(0.08, 0.1, 0.085, 0.035); break;                                 // 청바지
    case 3: hips(); legs(0.085, 0.32, 0.09, 0.02); break;                                 // 반바지
    case 4: B('body', bc, -(TW / 2 + 0.035), 0.33, -0.135, TW / 2 + 0.035, 0.6, 0.135, 0.04);   // 치마
      B('body', b1, -(TW / 2 + 0.037), 0.57, -0.137, TW / 2 + 0.037, 0.6, 0.137, 0.01); F2 = 0.135; break;
    case 5: hips(false); legs(0.08, 0.15, 0.085);                                          // 조거 — 발목 고무단 · 옆줄
      for (const s of SIDES){ B(leg(s), b1, s * LX - 0.07, 0.1, -0.075, s * LX + 0.07, 0.16, 0.075, 0.02); C(leg(s), b1, s * (LX + 0.081), 0.33, 0, 0.006, 0.34, 0.02, 0.002); }
      break;
    case 6: hips(); legs(0.1, 0.05, 0.105); break;                                        // 와이드
    case 7: B('body', bc, -(TW / 2 + 0.03), 0.36, -0.13, TW / 2 + 0.03, 0.6, 0.13, 0.04);   // 롱스커트
      B('body', bc, -(TW / 2 + 0.05), 0.12, -0.15, TW / 2 + 0.05, 0.37, 0.15, 0.045);
      B('body', b1, -(TW / 2 + 0.032), 0.57, -0.132, TW / 2 + 0.032, 0.6, 0.132, 0.01); F2 = 0.13; break;
  }

  /* ── 신발 ── */
  const sc = c.shoesColor, s1 = tone(sc, 1), dark = tone(sc, -1), SOLE = lum(sc) > 0.7 ? 0xC9CBD0 : 0xF4F4F2;
  for (const s of SIDES){
    const x = s * LX, g = leg(s);
    const sole = (col, h = 0.03) => B(g, col, x - 0.075, 0, -0.1, x + 0.075, h, 0.15, 0.012);
    switch (c.shoes){
      case 1: C(g, dark, x, 0.02, 0.025, 0.17, 0.04, 0.27, 0.012); C(g, sc, x, 0.09, 0.02, 0.155, 0.11, 0.23, 0.035);   // 부츠 (원본)
        for (let i = 0; i < 3; i++) C(g, s1, x, 0.08 + i * 0.026, 0.135 - i * 0.018, 0.08, 0.008, 0.012, 0.0025); break;
      case 2: case 3: sole(SOLE, 0.035);                                                      // 운동화 · 하이탑
        B(g, sc, x - 0.07, 0.03, -0.095, x + 0.07, c.shoes === 3 ? 0.17 : 0.1, 0.13, 0.03);
        C(g, s1, x, 0.05, 0.125, 0.12, 0.04, 0.03, 0.012);
        if (c.shoes === 3){ C(g, s1, x, 0.155, -0.0, 0.146, 0.03, 0.23, 0.01); for (let i = 0; i < 3; i++) C(g, SOLE, x, 0.07 + i * 0.03, 0.131, 0.06, 0.006, 0.006, 0.002); }
        else for (let i = 0; i < 2; i++) C(g, SOLE, x, 0.101, 0.04 + i * 0.035, 0.07, 0.006, 0.012, 0.002);
        break;
      case 4: B(g, dark, x - 0.068, 0, -0.085, x + 0.068, 0.025, 0.135, 0.01);               // 샌들 — 발이 보인다
        B(g, sc, x - 0.068, 0.02, 0.06, x + 0.068, 0.05, 0.085, 0.008); B(g, sc, x - 0.068, 0.02, -0.02, x + 0.068, 0.05, 0.005, 0.008); break;
      case 5: case 6: B(g, dark, x - 0.07, 0, -0.09, x + 0.07, 0.025, 0.14, 0.01);           // 로퍼 · 메리제인
        B(g, sc, x - 0.067, 0.02, -0.085, x + 0.067, c.shoes === 5 ? 0.085 : 0.075, 0.135, 0.03);
        if (c.shoes === 5) C(g, s1, x, 0.085, 0.07, 0.11, 0.01, 0.03, 0.004);
        else { B(g, sc, x - 0.069, 0.07, 0.03, x + 0.069, 0.085, 0.05, 0.005); C(g, dark, x, 0.02, -0.07, 0.08, 0.04, 0.04, 0.008); }
        break;
    }
  }

  /* ── 소품 · 모자 ── */
  const ha = c.hatColor, h1 = tone(ha, 1);
  switch (c.hat){
    case 1: for (const s of SIDES){ C('head', ha, s * 0.2, 1.13, 0, 0.055, 0.13, 0.13, 0.026); C('head', tone(ha, -1), s * 0.231, 1.13, 0, 0.012, 0.09, 0.09, 0.005);   // 헤드폰 (원본)
        C('head', ha, s * 0.193, 1.255, 0, 0.035, 0.15, 0.05, 0.014); }
      C('head', ha, 0, 1.32, 0, 0.42, 0.04, 0.05, 0.018); break;
    case 2: B('head', ha, -0.178, 1.19, -0.178, 0.178, 1.335, 0.178, 0.06); B('head', h1, -0.15, 1.19, 0.12, 0.15, 1.215, 0.31, 0.012);   // 캡
      C('head', h1, 0, 1.338, 0, 0.03, 0.01, 0.03, 0.004); break;
    case 3: B('head', ha, -0.18, 1.17, -0.18, 0.18, 1.355, 0.18, 0.08); B('head', h1, -0.186, 1.15, -0.186, 0.186, 1.21, 0.186, 0.03); break;   // 비니
    case 4: B('head', ha, -0.17, 1.2, -0.17, 0.17, 1.345, 0.17, 0.05); B('head', ha, -0.25, 1.19, -0.25, 0.25, 1.215, 0.25, 0.02);   // 버킷햇
      B('head', h1, -0.172, 1.21, -0.172, 0.172, 1.235, 0.172, 0.01); break;
    case 5: C('head', ha, 0.1, 1.318, 0.02, 0.04, 0.04, 0.03, 0.01);                             // 리본
      C('head', ha, 0.058, 1.325, 0.02, 0.06, 0.05, 0.025, 0.015, 0.4); C('head', ha, 0.142, 1.325, 0.02, 0.06, 0.05, 0.025, 0.015, -0.4); break;
    case 6: B('head', ha, -0.19, 1.305, -0.03, 0.19, 1.33, 0.03, 0.01);                          // 머리띠
      for (const s of SIDES) C('head', ha, s * 0.2, 1.2, 0, 0.02, 0.22, 0.04, 0.008); break;
  }
  /* 얼굴 */
  const fc = c.faceColor;
  if (c.face === 1 || c.face === 2){                                                             // 안경 · 선글라스
    for (const s of SIDES){
      const cx = s * 0.065, cy = 1.083, w = 0.085, h = 0.06, z = 0.168;
      if (c.face === 2) C('head', fc, cx, cy, z, w, h - 0.005, 0.01, 0.012);
      else { C('head', fc, cx, cy + h / 2, z, w, 0.008, 0.008, 0.002); C('head', fc, cx, cy - h / 2, z, w, 0.008, 0.008, 0.002);
        C('head', fc, cx - w / 2, cy, z, 0.008, h, 0.008, 0.002); C('head', fc, cx + w / 2, cy, z, 0.008, h, 0.008, 0.002); }
      C('head', fc, s * 0.163, cy + 0.02, 0.09, 0.008, 0.008, 0.15, 0.002);
    }
    C('head', fc, 0, 1.093, 0.168, 0.045, 0.008, 0.008, 0.002);
  } else if (c.face === 3){                                                                     // 마스크
    B('head', fc, -0.125, 0.985, 0.155, 0.125, 1.07, 0.172, 0.012);
    for (const s of SIDES) C('head', fc, s * 0.162, 1.03, 0.09, 0.006, 0.01, 0.13, 0.002);
  }
  /* 목 */
  const nc = c.neckColor;
  switch (c.neck){
    case 1: for (const s of SIDES) C('body', nc, s * 0.03, 0.9, F + 0.002, 0.038, 0.074, 0.006, 0.002);   // 목걸이 (원본)
      C('body', tone(nc, 1), 0, 0.855, F + 0.004, 0.02, 0.024, 0.01, 0.004); break;
    case 2: for (const [x, y] of [[-0.05, 0.9], [-0.03, 0.866], [0, 0.852], [0.03, 0.866], [0.05, 0.9]]) C('body', nc, x, y, F + 0.004, 0.026, 0.016, 0.01, 0.004); break;   // 체인
    case 3: B('body', nc, -0.13, 0.89, -0.12, 0.13, 0.985, 0.12, 0.045); C('body', tone(nc, 1), 0.07, 0.78, Math.max(F, 0.12) + 0.012, 0.08, 0.2, 0.025, 0.012); break;   // 목도리
    case 4: C('body', nc, 0, 0.915, F + 0.006, 0.035, 0.03, 0.012, 0.005); B('body', nc, -0.024, 0.68, F + 0.002, 0.024, 0.9, F + 0.011, 0.005); break;   // 넥타이
    case 5: B('body', nc, -0.046, 0.935, -0.046, 0.046, 0.965, 0.046, 0.01); C('body', nc, 0, 0.928, 0.048, 0.016, 0.016, 0.006, 0.004); break;   // 초커
  }
  /* 가방 */
  const kc = c.backColor, k1 = tone(kc, 1);
  switch (c.back){
    case 1: B('body', kc, -0.15, 0.6, -(F + 0.13), 0.15, 0.9, -F, 0.045); C('body', k1, 0, 0.67, -(F + 0.135), 0.2, 0.1, 0.02, 0.01);   // 백팩
      for (const s of SIDES) C('body', k1, s * 0.1, 0.78, F + 0.004, 0.04, 0.31, 0.01, 0.004); break;
    case 2: C('body', k1, 0, 0.76, F + 0.006, 0.03, 0.56, 0.01, 0.004, -0.62); C('body', kc, 0.13, 0.56, F2 + 0.03, 0.13, 0.1, 0.05, 0.02); break;   // 크로스백
    case 3: C('body', kc, 0, 0.55, F2 + 0.03, 0.2, 0.08, 0.06, 0.03); B('body', k1, -(TW / 2 + 0.02), 0.535, -(F2 + 0.005), TW / 2 + 0.02, 0.555, F2 + 0.005, 0.005); break;   // 허리가방
    case 4: C('armL', kc, -AX, 0.37, 0, 0.06, 0.15, 0.2, 0.025); B('armL', k1, -AX - 0.006, 0.44, -0.05, -AX + 0.006, 0.52, 0.05, 0.004); break;   // 숄더백 — 왼손에 든다
  }
  return { out, AX, LX };
}

/* 유광 — 색 위에 투명 유리 코팅(clearcoat)과 하늘 비침. 무광 — 코팅 없이 거친 겉면 */
let envTex = null;
function env(){
  if (envTex) return envTex;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#BFD9F2'); g.addColorStop(0.47, '#FFFFFF'); g.addColorStop(0.53, '#E9F2DE'); g.addColorStop(1, '#8FB880');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#FFFFFF';
  for (const [px, py, pw, ph] of [[40, 22, 34, 18], [150, 16, 46, 22], [214, 30, 22, 14]]) x.fillRect(px, py, pw, ph);
  envTex = new THREE.CanvasTexture(cv);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  return envTex;
}
const mats = new Map();
let gloss = 1;
const ENV = [0.55, 0.22];
const coated = (hex, matte = 0) => {
  const key = hex + '|' + matte;
  if (!mats.has(key)) mats.set(key, Object.assign(new THREE.MeshPhysicalMaterial(matte
    ? { color: hex, roughness: 0.9, metalness: 0, envMap: env(), envMapIntensity: ENV[1] * gloss }
    : { color: hex, roughness: 0.62, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env(), envMapIntensity: ENV[0] * gloss }),
    { userData: { env: ENV[matte] } }));
  return mats.get(key);
};
const glowMat = new THREE.MeshBasicMaterial({ color: 0xFFE089 });
const LAMP = 5, LAMP_REACH = 16, LAMP_DECAY = 1, LAMP_COLOR = 0xFFECC4;

export function createBlocky(c, { lamp = false } = {}){
  const own = [];
  const group = new THREE.Group();
  group.add(makeBlob(0.3));
  const { out, AX, LX } = build(c);
  const PIVOT = { body: [0, 0, 0], head: [0, 0.95, 0], armL: [-AX, 0.9, 0], armR: [AX, 0.9, 0], legL: [-LX, 0.5, 0], legR: [LX, 0.5, 0] };
  const J = {};
  for (const k in PIVOT){ const p = new THREE.Group(); p.position.fromArray(PIVOT[k]); group.add(p); J[k] = p; }
  const bins = new Map();
  for (const [g, col, x, y, z, w, h, d, r, rz] of out){
    const key = g + '|' + col;
    if (!bins.has(key)) bins.set(key, { g, col, P: [], N: [], I: [] });
    const b = bins.get(key), pv = PIVOT[g];
    rbox(b.P, b.N, b.I, x - pv[0], y - pv[1], z - pv[2], w, h, d, r, rz);
  }
  for (const b of bins.values()){
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.N, 3));
    geo.setIndex(b.I);
    own.push(geo);
    J[b.g].add(new THREE.Mesh(geo, coated(b.col, c.finish)));
  }

  /* 밤의 등불 — 오른손에. 빛은 내 캐릭터에만, group 에 늘 달아 두고 세기만 바꾼다 (actor.js 와 같은 까닭) */
  const lantern = new THREE.Group();
  lantern.position.set(0, -0.39, 0.03);
  J.armR.add(lantern);
  const rodG = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), bulbG = new THREE.SphereGeometry(1, 12, 9);
  own.push(rodG, bulbG);
  const rod = new THREE.Mesh(rodG, coated(0xB08A62, c.finish)); rod.position.y = 0.22; lantern.add(rod);
  const bulb = new THREE.Mesh(bulbG, glowMat); bulb.position.set(0, 0.5, 0.04); bulb.scale.set(0.055, 0.066, 0.055); lantern.add(bulb);
  lantern.visible = false;
  let glow = null;
  if (lamp){ glow = new THREE.PointLight(LAMP_COLOR, 0, LAMP_REACH, LAMP_DECAY); glow.position.set(0.15, 2.4, 0); group.add(glow); }

  let phase = 0, idle = Math.random() * 6, reachLeft = 0, tossLeft = 0, holding = false;
  const TOSS_TIME = 0.55;
  const ease = (o, k, v, t) => { o[k] += (v - o[k]) * t; };
  return {
    group, headTop: HEAD_TOP, headY: HEAD_Y, nearZ: 1.9,
    setHand(dark){
      holding = !!dark;
      lantern.visible = holding;
      if (glow) glow.intensity = dark ? LAMP : 0;
      const g = dark ? 0.15 : 1;                    // 밤에는 하늘이 비치지 않는다
      if (g !== gloss){ gloss = g; for (const m of mats.values()) m.envMapIntensity = m.userData.env * g; }
    },
    reach(sec){ reachLeft = Math.max(reachLeft, sec || 2); },
    reaching(){ return reachLeft > 0; },
    toss(){ tossLeft = TOSS_TIME; },
    setPose(){}, poseCount: 0,
    update(dt, speed){
      idle += dt;
      const t = Math.min(1, dt * (speed > 0.05 ? 14 : 6));
      let sw = 0, bob = 0;
      if (speed > 0.05){
        phase += dt * (5.5 + speed * 1.9);
        sw = Math.sin(phase); bob = Math.abs(Math.cos(phase)) * 0.02;
      } else phase = 0;
      ease(J.legL.rotation, 'x', -sw * 0.55, t);
      ease(J.legR.rotation, 'x', sw * 0.55, t);
      ease(J.armL.rotation, 'x', sw * 0.5, t);
      ease(J.armR.rotation, 'x', holding ? -0.45 : -sw * 0.5, t);
      ease(J.armL.rotation, 'z', -0.06, t); ease(J.armR.rotation, 'z', 0.06, t);
      ease(J.head.rotation, 'y', speed > 0.05 ? sw * 0.06 : Math.sin(idle * 0.4) * 0.25, t * 0.5);
      ease(J.head.rotation, 'x', speed > 0.05 ? 0 : Math.sin(idle * 1.5) * 0.02, t);
      for (const k in J) if (k !== 'legL' && k !== 'legR') J[k].position.y = PIVOT[k][1] + bob;
      if (tossLeft > 0){
        tossLeft -= dt;
        const k = 1 - tossLeft / TOSS_TIME;
        J.armL.rotation.x = k < 0.3 ? (k / 0.3) * 1.5 - 0.1 : 1.4 - ((k - 0.3) / 0.7) * 3.3;
        J.armL.rotation.z = -0.8;
      } else if (reachLeft > 0){
        reachLeft -= dt;
        const k = Math.min(1, reachLeft / 0.3);
        J.armL.rotation.set(-1.1 * k, 0, -0.5 * k);
      }
    },
    dispose(){ for (const o of own) o.dispose(); }
  };
}
