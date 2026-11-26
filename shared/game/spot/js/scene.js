/*
 * 틀린그림찾기 — 그림 짓기. 씨앗(seed) 하나로 같은 그림이 나온다 (모두의 화면이 같다).
 *
 * 그림은 400 × 300 SVG. **테마 일곱** (사용자 요청) — 산 · 바다 · 정원 · 들판 · 연못 · 하늘 · 물속.
 * 테마는 `씨앗 % 7` (rules.js 가 한 게임 안에서 겹치지 않게 씨앗을 고른다). 테마마다 바탕 그림과
 * 놓을 물건 목록이 다르고, 같은 테마도 씨앗마다 물건 · 자리 · 색이 달라진다.
 *
 * 물건은 **제 자리를 원점으로 한 작은 그림**(art)과 그 상자(lb)만 갖는다. 놓을 때 translate · scale 로 옮기므로
 * 뒤집기 · 키우기가 모든 종류에 똑같이 된다. 그림자는 바닥에 서는 물건만 (`sw` = 그림자 폭).
 *
 * 틀린 곳 다섯 (makeDiffs) — 색상 · 모양 · 사물(없어짐) · 그림자(사라짐) · 형태(뒤집기 · 키우기 · 기울기) 를 하나씩.
 * 자리끼리 겹치지 않게 고르고, 찾았는지는 그 자리(넉넉히 둘러싼 상자) 안을 눌렀는지로 본다.
 */
export const W = 400, HH = 300;
export const THEMES = ['mountain', 'sea', 'garden', 'field', 'pond', 'sky', 'under'];
export const THEME_NAME = { mountain: '⛰ 산', sea: '🌊 바다', garden: '🌷 정원', field: '🌾 들판', pond: '🪷 연못', sky: '☁ 하늘', under: '🐠 물속' };
export const themeOf = seed => THEMES[(seed >>> 0) % THEMES.length];

function rng(seed){
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const f1 = n => Math.round(n * 10) / 10;
const far = (list, c, r) => { const i = list.indexOf(c); const o = list.filter((x, j) => x !== c && (i < 0 || Math.abs(j - i) >= 2)); return o.length ? pick(r, o) : list.find(x => x !== c) || c; };

const P = {
  wall: ['#F6C6A8', '#F9E3A3', '#BFE3C8', '#C9D8F5', '#F4B9C4', '#E6D3F5', '#FFFFFF'],
  roof: ['#D9614E', '#5C7ACF', '#4E9E6E', '#9A5BC2', '#D98A2B', '#3E4A5C'],
  door: ['#8A5A3C', '#5C7ACF', '#D9614E', '#4E9E6E', '#F2C14E'],
  leaf: ['#6DBB6A', '#4FA466', '#8CCB5E', '#3F8F5A'],
  bloom: ['#FF7A8A', '#FFD34E', '#7AA8FF', '#C78BFF', '#FF9F4E', '#FFFFFF'],
  pop: ['#FF5D6C', '#FFC93C', '#4E9BFF', '#9B6BFF', '#3CC48A', '#FF8A3C'],
  fur: ['#F2A65A', '#8C8C8C', '#3B3B3B', '#F5F0E6', '#C98B5A'],
  stone: ['#9AA3AD', '#B8B2A6', '#7F8790', '#C9C2B4'],
  wood: ['#B07A4E', '#8A5A3C', '#C99566', '#6E4A33'],
  fish: ['#FF8A3C', '#FFC93C', '#4E9BFF', '#FF5D6C', '#9B6BFF', '#3CC48A', '#FFFFFF'],
  coral: ['#FF7A8A', '#FF9F4E', '#C78BFF', '#FFD34E', '#5EC2F0'],
  green: ['#5DBB63', '#8CCB5E', '#3F8F5A', '#A6D96A']
};

/* SVG 조각 — 원점 기준 작은 그림을 짓는 도우미 */
const C = (x, y, r, f, ex = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${f}"${ex}/>`;
const E = (x, y, rx, ry, f, ex = '') => `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${f}"${ex}/>`;
const R = (x, y, w, h, f, rx = 0, ex = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}"${rx ? ` rx="${rx}"` : ''} fill="${f}"${ex}/>`;
const Pa = (d, f, ex = '') => `<path d="${d}" fill="${f}"${ex}/>`;
const L = (d, s, w = 2, ex = '') => `<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${ex}/>`;
const HL = (x, y, rx, ry) => E(x, y, rx, ry, '#fff', ' opacity=".35"');

/*
 * 물건 — lb: 원점 기준 상자 [x0,y0,x1,y1] · art(o): 원점 기준 그림 · layer: 0 산 뒤 하늘 · 1 하늘/물 위 · 2 땅(아래일수록 앞)
 * colors(바꿀 색) · shapes(모양 가짓수) · flips · rots · scales · rm(없어져도 되는가) · sw(그림자 폭) · parts(부분 상자)
 */
const T = {
  sun: { layer: 0, lb: o => o.shape ? [-31, -31, 31, 31] : [-21, -21, 21, 21], colors: ['#FFC93C', '#FF8A3C', '#FF5D6C', '#FFE680'], shapes: 2,
    art: o => { let s = ''; if (o.shape) for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2; s += L(`M${f1(Math.cos(a) * 24)} ${f1(Math.sin(a) * 24)}L${f1(Math.cos(a) * 30)} ${f1(Math.sin(a) * 30)}`, o.c, 3); } return s + C(0, 0, 20, o.c) + HL(-6, -6, 7, 7); } },
  cloud: { layer: 0, lb: () => [-34, -21, 34, 12], colors: ['#FFFFFF', '#FFE3EC', '#DDEBFF'], scales: true, rm: true,
    art: o => `<g fill="${o.c}">${E(0, 0, 30, 11, o.c)}${C(-12, -6, 11, o.c)}${C(8, -9, 14, o.c)}</g>` },
  rainbow: { layer: 0, lb: () => [-62, -62, 62, 2], shapes: 2, rm: true, scales: true,
    art: o => { const cs = o.shape ? ['#FF5D6C', '#FFC93C', '#3CC48A', '#4E9BFF'] : ['#FF5D6C', '#FF9F4E', '#FFE15C', '#5DD38A', '#5EA8F5', '#A884F0']; const w = 34 / cs.length;
      return cs.map((c, i) => { const rr = 60 - i * w - w / 2; return L(`M${f1(-rr)} 0A${f1(rr)} ${f1(rr)} 0 0 1 ${f1(rr)} 0`, c, f1(w), ' opacity=".85" stroke-linecap="butt"'); }).join(''); } },
  bird: { layer: 1, lb: () => [-12, -9, 12, 4], colors: ['#3E4A5C', '#5C7ACF', '#D9614E'], rm: true,
    art: o => L('M-11 -4Q-5 -9 0 0Q5 -9 11 -4', o.c, 2.6) },
  balloon: { layer: 1, lb: () => [-15, -20, 15, 42], colors: P.pop, shapes: 2, rm: true, scales: true,
    art: o => L('M0 17q-5 12 0 24', '#6b6b6b', 1.2) + (o.shape ? Pa('M0 16C-26 -2 -12 -24 0 -10C12 -24 26 -2 0 16Z', o.c) : E(0, 0, 13, 17, o.c) + Pa('M-3 18h6l-3 -4z', o.c)) + HL(-5, -6, 3, 5) },
  kite: { layer: 1, lb: () => [-18, -23, 18, 53], colors: P.pop, flips: true, rots: true, rm: true,
    art: o => L('M0 22q12 10 0 18q-12 8 0 12', '#6b6b6b', 1.3) + C(5, 32, 2.6, o.c2) + C(-4, 45, 2.6, o.c2) + Pa('M0 -22L16 0L0 22L-16 0Z', o.c) + L('M0 -22L0 22M-16 0L16 0', '#fff', 1.2, ' opacity=".7"') },
  plane: { layer: 1, lb: () => [-32, -16, 32, 12], colors: ['#FFFFFF', '#FF5D6C', '#4E9BFF', '#FFC93C'], flips: true, rm: true,
    art: o => Pa('M-30 0Q-30 -7 -20 -7H22Q32 -6 32 0Q32 6 22 6H-20Q-30 6 -30 0Z', o.c, ' stroke="#9AA3AD" stroke-width="1"') + Pa('M-2 -2L-14 -16H-6L10 -2Z', o.c2) + Pa('M-2 3L-12 12H-5L8 3Z', o.c2) + Pa('M-26 -6L-30 -15H-23L-18 -6Z', o.c2)
      + [0, 7, 14].map(x => C(x, -2, 2, '#BFE6FF')).join('') },
  hab: { layer: 1, lb: () => [-24, -30, 24, 38], colors: P.pop, shapes: 2, rm: true, scales: true,
    art: o => { const env = `<clipPath id="hc${o.id}"><circle cx="0" cy="-6" r="22"/></clipPath>` + C(0, -6, 22, o.c)
      + `<g clip-path="url(#hc${o.id})">` + (o.shape ? R(-24, -12, 48, 10, o.c2) : R(-6, -30, 12, 50, o.c2)) + '</g>';
      return env + Pa('M-15 10L-7 26H7L15 10Z', o.c, ' opacity=".9"') + L('M-9 22L-7 28M9 22L7 28', '#6b4a33', 1.2) + R(-8, 28, 16, 9, '#B07A4E', 2) + HL(-8, -14, 5, 8); } },
  house: { layer: 2, lb: () => [-32, -74, 32, 2], shapes: 2, sw: 56,
    parts: { roof: [-32, -74, 32, -43], wall: [-28, -44, 28, 0], door: [-8, -24, 8, 0] }, dets: { pot: [-26, -21, -8, -13], lamp: [10, -34, 16, -24] },
    art: o => { const win = (x, y) => o.shape ? C(x, y, 7, '#BFE6FF', ' stroke="#fff" stroke-width="2"') : R(x - 7, y - 7, 14, 14, '#BFE6FF', 0, ' stroke="#fff" stroke-width="2"');
      return (o.chim ? R(10, -70, 8, 18, o.roof) : '') + R(-28, -44, 56, 44, o.wall) + Pa('M-32 -43L0 -74L32 -43Z', o.roof)
        + L('M-26 -50H26M-20 -56H20M-13 -63H13', '#00000018', 1.2) + R(-8, -24, 16, 24, o.door, 3) + C(4, -12, 1.4, '#fff') + R(-5, -21, 10, 6, '#ffffff55', 2) + win(-17, -26) + win(17, -26)
        + R(-28, -2, 56, 2, '#00000014')
        + (o.pot ? R(-25, -18, 16, 5, '#B07A4E', 1) + C(-22, -19, 2.4, '#FF7A8A') + C(-17, -20, 2.4, '#FFD34E') + C(-12, -19, 2.4, '#FF7A8A') : '')
        + (o.lamp ? R(12, -31, 3, 6, '#3E4A5C') + C(13.5, -26, 2.6, '#FFE680') : ''); } },
  cabin: { layer: 2, lb: () => [-30, -56, 34, 2], colors: P.wood, shapes: 2, sw: 54, parts: { roof: [-30, -56, 30, -30] }, dets: { wood: [20, -10, 34, 1], smoke: [8, -74, 22, -54] },
    art: o => R(-26, -32, 52, 32, o.c) + [0, 1, 2, 3].map(i => L(`M-26 ${-26 + i * 7}H26`, '#00000022', 1.2)).join('') + Pa('M-30 -30L0 -56L30 -30Z', o.roof)
      + R(-6, -20, 12, 20, '#5a3b26', 2) + (o.shape ? C(15, -18, 6, '#FFE9A8', ' stroke="#6E4A33" stroke-width="2"') : R(9, -24, 12, 11, '#FFE9A8', 0, ' stroke="#6E4A33" stroke-width="2"'))
      + R(10, -52, 7, 12, '#6E4A33') + (o.smoke ? C(14, -58, 3.5, '#E8E8E8') + C(17, -65, 4.5, '#EFEFEF') + C(15, -72, 3, '#F5F5F5') : '')
      + (o.wood ? [[22, -2.5], [29, -2.5], [25.5, -7.5]].map(([x, y]) => C(x, y, 3, '#B07A4E') + C(x, y, 1.4, '#E8C99A')).join('') : '') },
  tent: { layer: 2, lb: o => o.shape ? [-26, -30, 26, 2] : [-26, -40, 26, 2], colors: P.pop, shapes: 2, sw: 48, rm: true, dets: { flag: [-1, -42, 10, -33] },
    art: o => o.shape ? Pa('M-26 0Q-26 -30 0 -30Q26 -30 26 0Z', o.c) + Pa('M-7 0Q0 -18 7 0Z', '#3E4A5C')
      : Pa('M-26 0L0 -34L26 0Z', o.c) + Pa('M-8 0L0 -24L8 0Z', '#3E4A5C') + (o.flag ? L('M0 -34V-40', '#555', 1.5) + Pa('M0 -40L8 -37L0 -34Z', '#FFC93C') : '') },
  tree: { layer: 2, lb: () => [-22, -64, 22, 2], colors: P.leaf, shapes: 2, sw: 30, scales: true, dets: { fruit: [-16, -58, 16, -28] },
    art: o => R(-4, -24, 8, 24, '#9A6A45', 2) + L('M-2 -10L-5 -14M2 -16L5 -19', '#00000022', 1)
      + (o.shape ? Pa('M0 -64L16 -38H10L21 -18H-21L-10 -38H-16Z', o.c) + L('M-8 -40L0 -37L8 -40M-12 -22L0 -19L12 -22', '#00000018', 1.4)
        : C(0, -42, 20, o.c) + C(-11, -36, 9, o.c) + C(11, -36, 9, o.c) + HL(-7, -48, 6, 6) + (o.fruit ? [[-9, -46], [7, -50], [10, -38], [-4, -34], [1, -44]].map(([x, y]) => C(x, y, 2.6, o.fc || '#FF5D6C')).join('') : '')) },
  palm: { layer: 2, lb: () => [-28, -66, 28, 2], colors: P.leaf, flips: true, sw: 30, scales: true, dets: { nuts: [-1, -57, 13, -47] },
    art: o => L('M0 0Q-2 -30 6 -56', '#B07A4E', 6) + [[-26, -50], [-20, -66], [10, -68], [28, -54], [24, -42], [-14, -40]].map(([x, y]) => Pa(`M6 -56Q${f1((x + 6) / 2)} ${f1(y - 8)} ${x} ${y}Q${f1((x + 6) / 2)} ${f1(y + 2)} 6 -56Z`, o.c)).join('')
      + (o.nuts ? C(3, -52, 3.2, '#8A5A3C') + C(9, -52, 3.2, '#8A5A3C') : '') },
  flower: { layer: 2, lb: () => [-9, -27, 9, 2], colors: P.bloom, shapes: 2, rm: true,
    art: o => L('M0 0V-18', '#4FA466', 1.8) + E(3, -7, 3.5, 1.6, '#4FA466')
      + (o.shape ? Pa('M-7 -26L-3.5 -22L0 -27L3.5 -22L7 -26L6 -16Q0 -12 -6 -16Z', o.c)
        : [0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2; return C(Math.cos(a) * 5, -20 + Math.sin(a) * 5, 3.6, o.c); }).join('') + C(0, -20, 2.6, '#FFD34E')) },
  mushroom: { layer: 2, lb: o => o.shape ? [-12, -24, 12, 2] : [-13, -20, 13, 2], colors: ['#FF5D6C', '#FF8A3C', '#C98B5A', '#9B6BFF'], shapes: 2, sw: 18, rm: true,
    art: o => R(-4, -10, 8, 10, '#F5EBDD', 3) + (o.shape ? Pa('M-12 -9Q0 -34 12 -9Z', o.c) : Pa('M-13 -9Q-13 -21 0 -21Q13 -21 13 -9Z', o.c)) + C(-5, -14, 2, '#fff') + C(4, -16, 2.4, '#fff') },
  rock: { layer: 2, lb: () => [-18, -16, 18, 2], colors: P.stone, nocolor: true, sw: 32, scales: true, rm: true,
    art: o => Pa('M-18 0L-14 -10L-5 -16L8 -14L17 -6L18 0Z', o.c) + Pa('M-5 -16L8 -14L4 -8L-8 -9Z', '#fff', ' opacity=".22"') },
  pet: { layer: 2, lb: () => [-22, -35, 22, 2], colors: P.fur, shapes: 2, flips: true, sw: 34, rm: true, dets: { collar: [4, -17, 20, -10] },
    art: o => { const ears = o.shape ? E(4, -21, 3.6, 7, o.c2) + E(20, -21, 3.6, 7, o.c2) : Pa('M3 -25L6 -36L11 -29Z M21 -25L18 -36L13 -29Z', o.c);
      return L('M-14 -12q-12 -6 -8 -20', o.c, 4) + E(0, -10, 16, 10, o.c) + R(-11, -6, 4, 6, o.c) + R(7, -6, 4, 6, o.c) + (o.shape ? '' : ears) + C(12, -22, 10, o.c) + (o.shape ? ears : '')
        + C(8.5, -23, 1.5, '#222') + C(15.5, -23, 1.5, '#222') + C(13, -19, 1.6, '#E0707A') + (o.collar ? R(5, -14.5, 14, 3, '#FF5D6C', 1.5) + C(12, -11.5, 1.8, '#FFC93C') : ''); } },
  car: { layer: 2, lb: () => [-30, -27, 30, 2], colors: ['#E8574F', '#3F7FD9', '#F2C14E', '#47B08A', '#9B6BFF'], flips: true, sw: 52,
    art: o => Pa('M-28 -6V-14Q-28 -16 -24 -16H28V-6Z', o.c) + Pa('M-16 -16L-9 -26H10L18 -16Z', o.c) + Pa('M-12 -17L-7.5 -23.5H0.5V-17Z M2.5 -17V-23.5H9L13.5 -17Z', '#DFF1FF')
      + C(26, -12, 2, '#FFE680') + C(-16, -5, 6, '#333') + C(16, -5, 6, '#333') + C(-16, -5, 2.4, '#ccc') + C(16, -5, 2.4, '#ccc') },
  mailbox: { layer: 2, lb: () => [-14, -41, 22, 2], colors: ['#E8574F', '#3F7FD9', '#47B08A', '#F2C14E'], flips: true, sw: 20, rm: true, dets: { flag: [11, -42, 21, -27] },
    art: o => R(-2.5, -24, 5, 24, '#9A6A45') + Pa('M-12 -24V-34A12 6 0 0 1 12 -34V-24Z', o.c) + L('M-12 -30H12', '#00000022', 1) + (o.flag ? R(12, -40, 2, 12, '#555') + R(14, -40, 6, 5, '#FF5D6C') : '') },
  bench: { layer: 2, lb: () => [-24, -24, 24, 2], colors: P.wood, sw: 46, scales: true, rm: true,
    art: o => R(-22, -14, 44, 5, o.c, 1) + R(-22, -24, 44, 4, o.c, 1) + R(-22, -19, 44, 3, o.c, 1) + R(-20, -9, 3, 9, '#555') + R(17, -9, 3, 9, '#555') },
  can: { layer: 2, lb: () => [-18, -22, 20, 2], colors: ['#4E9BFF', '#3CC48A', '#FF8A3C', '#9AA3AD'], flips: true, sw: 26, rm: true,
    art: o => Pa('M-11 0V-16H9V0Z', o.c) + L('M9 -10L19 -20', o.c, 3.5) + E(19, -20, 2.5, 1.5, o.c) + L('M-9 -16Q-1 -26 7 -16', o.c, 2.5) },
  butterfly: { layer: 1, lb: () => [-13, -11, 13, 11], colors: P.bloom.slice(0, 5), shapes: 2, rm: true, rots: true,
    art: o => (o.shape ? Pa('M0 0L-12 -9L-10 2Z M0 0L12 -9L10 2Z', o.c) + Pa('M0 1L-8 9L-4 1Z M0 1L8 9L4 1Z', o.c2)
      : E(-6, -4, 6, 6, o.c) + E(6, -4, 6, 6, o.c) + E(-4.5, 5, 4, 4, o.c2) + E(4.5, 5, 4, 4, o.c2)) + R(-1, -7, 2, 15, '#3E4A5C', 1) },
  boat: { layer: 2, lb: o => [-28, -50, 28, 6], colors: ['#E8574F', '#3F7FD9', '#F2C14E', '#3E4A5C'], shapes: 2, flips: true, rm: true, dets: { flag: [-14, -50, 0, -39] },
    art: o => Pa('M-28 -6H28L20 6H-20Z', o.c) + L('M-24 -1H24', '#ffffff66', 1.4) + C(-12, 0, 1.8, '#DFF1FF') + C(-4, 0, 1.8, '#DFF1FF') + R(-1, -48, 2, 42, '#6E4A33') + Pa('M1 -46L22 -10H1Z', '#fff')
      + (o.shape ? Pa('M-1 -40L-18 -10H-1Z', o.c2) : '') + (o.flag ? Pa('M-1 -48L-12 -44L-1 -41Z', '#FF5D6C') : '') },
  umbrella: { layer: 2, lb: () => [-25, -48, 25, 2], colors: P.pop, sw: 44, rm: true,
    art: o => L('M0 0V-36', '#777', 2) + Pa('M-25 -34Q0 -60 25 -34Z', o.c) + Pa('M-9 -34Q0 -58 9 -34Z', o.c2) },
  ball: { layer: 2, lb: () => [-10, -21, 10, 2], colors: P.pop, sw: 18, rm: true,
    art: o => C(0, -10, 10, '#fff') + Pa('M0 -20A10 10 0 0 1 9 -14L0 -10Z', o.c) + Pa('M9 -6A10 10 0 0 1 -3 0L0 -10Z', o.c2) + Pa('M-9 -6A10 10 0 0 1 -6 -18L0 -10Z', o.c) },
  castle: { layer: 2, lb: o => [-24, -38, 24, 2], colors: ['#E8C98A', '#F0D9A8', '#D9B676'], shapes: 2, sw: 42, rm: true, dets: { flag: [15, -40, 25, -30] },
    art: o => { const tw = x => R(x - 6, -26, 12, 26, o.c) + R(x - 7, -30, 4, 4, o.c) + R(x - 2, -30, 4, 4, o.c) + R(x + 3, -30, 4, 4, o.c);
      return R(-18, -16, 36, 16, o.c) + tw(-16) + tw(16) + (o.shape ? tw(0) : '') + R(-4, -9, 8, 9, '#B08A55', 3) + C(-10, -8, 1.6, '#F4B9C4') + C(10, -6, 1.6, '#fff')
        + (o.flag ? L('M16 -30V-38', '#777', 1.2) + Pa('M16 -38L23 -35L16 -32Z', o.c2 || '#FF5D6C') : ''); } },
  crab: { layer: 2, lb: () => [-19, -20, 19, 2], colors: ['#FF5D6C', '#FF8A3C', '#C78BFF'], sw: 30, rm: true,
    art: o => L('M-10 -6L-16 0M-6 -5L-10 1M10 -6L16 0M6 -5L10 1', o.c, 2) + L('M-10 -10L-15 -16M10 -10L15 -16', o.c, 2.5) + C(-15, -17, 4, o.c) + C(15, -17, 4, o.c)
      + E(0, -8, 12, 8, o.c) + L('M-3 -14V-18M3 -14V-18', '#333', 1.2) + C(-3, -19, 1.6, '#222') + C(3, -19, 1.6, '#222') },
  star: { layer: 2, lb: () => [-12, -23, 12, 1], colors: ['#FF8A3C', '#FF5D6C', '#FFC93C', '#C78BFF'], rots: true, rm: true,
    art: o => Pa(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 5 : 12; return `${i ? 'L' : 'M'}${f1(Math.cos(a) * rr)} ${f1(-11 + Math.sin(a) * rr)}`; }).join('') + 'Z', o.c) + C(0, -11, 2, '#fff', ' opacity=".5"') },
  shell: { layer: 2, lb: () => [-11, -17, 11, 2], colors: ['#FFD9C2', '#F4B9C4', '#F9E3A3', '#E6D3F5'], shapes: 2, sw: 18, rm: true,
    art: o => o.shape ? C(0, -8, 9, o.c) + L('M0 -8m-6 0a6 6 0 1 1 6 6a3.5 3.5 0 1 1 -3.5 -3.5', '#00000033', 1.4)
      : Pa('M0 0L-11 -10Q0 -22 11 -10Z', o.c) + L('M0 0L-6 -13M0 0L0 -16M0 0L6 -13', '#00000033', 1.2) },
  lighthouse: { layer: 2, lb: () => [-14, -74, 14, 2], shapes: 2, colors: ['#E8574F', '#3F7FD9', '#3CC48A'], sw: 26,
    art: o => Pa('M-11 0L-7 -56H7L11 0Z', '#fff') + (o.shape ? [1, 3].map(i => Pa(`M${f1(-11 + i * 1)} ${-i * 14}L${f1(-10 + i * 1)} ${-i * 14 - 14}H${f1(10 - i * 1)}L${f1(11 - i * 1)} ${-i * 14}Z`, o.c)).join('')
      : [0, 2].map(i => Pa(`M${f1(-11 + i * 1.5)} ${-i * 18}L${f1(-10 + i * 1.5)} ${-i * 18 - 10}H${f1(10 - i * 1.5)}L${f1(11 - i * 1.5)} ${-i * 18}Z`, o.c)).join(''))
      + R(-8, -66, 16, 10, '#FFE680') + Pa('M-10 -66L0 -74L10 -66Z', o.c) + R(-3, -10, 6, 10, '#6E4A33', 2) },
  lily: { layer: 2, lb: () => [-19, -7, 19, 7], colors: P.green, shapes: 2, rm: true, scales: true,
    art: o => Pa('M0 0L18 -2A18 7 0 1 1 18 2Z', o.c) + L('M0 0L-12 -3M0 0L-10 4', '#00000022', 1) + (o.shape ? C(-2, -3, 4, '#FFB3C7') + C(-2, -3, 1.6, '#FFD34E') : '') },
  lotus: { layer: 2, lb: () => [-13, -17, 13, 4], colors: ['#FF9DB8', '#FFFFFF', '#C78BFF', '#FFD34E'], rm: true,
    art: o => E(0, 1, 13, 3.5, '#4FA466') + Pa('M0 -16Q-6 -8 0 0Q6 -8 0 -16Z', o.c) + Pa('M-11 -9Q-8 -2 0 0Q-4 -8 -11 -9Z', o.c) + Pa('M11 -9Q8 -2 0 0Q4 -8 11 -9Z', o.c) },
  duck: { layer: 2, lb: () => [-20, -26, 20, 4], colors: ['#FFE15C', '#FFFFFF', '#C98B5A'], flips: true, rm: true,
    art: o => E(-2, -6, 16, 9, o.c) + Pa('M-18 -9L-24 -14L-16 -3Z', o.c) + C(10, -17, 8, o.c) + Pa('M17 -18L24 -16L17 -14Z', '#FF8A3C') + C(12, -19, 1.5, '#222') + E(-4, -8, 7, 4, '#00000014') + E(0, 3, 18, 2.5, '#ffffff66') },
  frog: { layer: 2, lb: () => [-13, -18, 13, 2], colors: P.green, sw: 22, rm: true,
    art: o => E(0, -6, 11, 7, o.c) + C(-6, -13, 4.5, o.c) + C(6, -13, 4.5, o.c) + C(-6, -13, 2, '#fff') + C(6, -13, 2, '#fff') + C(-6, -13, 1, '#222') + C(6, -13, 1, '#222') + L('M-4 -6Q0 -3 4 -6', '#2d5a2d', 1.2) + E(-10, -1, 4, 2, o.c) + E(10, -1, 4, 2, o.c) },
  reed: { layer: 2, lb: () => [-11, -48, 11, 2], shapes: 2, rm: true,
    art: o => (o.shape ? [-7, 0, 7] : [-5, 5]).map((x, i) => L(`M${x} 0Q${x + 2} -20 ${x} ${-34 - i * 4}`, '#4FA466', 2) + R(x - 2.5, -46 + i * 3, 5, 12, '#8A5A3C', 2.5)).join('') },
  dragonfly: { layer: 1, lb: () => [-15, -9, 15, 9], colors: ['#4E9BFF', '#3CC48A', '#FF5D6C'], rots: true, rm: true,
    art: o => E(-6, -3, 7, 2.5, '#DDF2FF', ' opacity=".9"') + E(-6, 3, 7, 2.5, '#DDF2FF', ' opacity=".9"') + E(4, -3, 7, 2.5, '#DDF2FF', ' opacity=".9"') + E(4, 3, 7, 2.5, '#DDF2FF', ' opacity=".9"') + L('M-14 0H12', o.c, 2.6) + C(12, 0, 2.6, o.c) },
  fish: { layer: 1, lb: () => [-21, -12, 19, 12], colors: P.fish, shapes: 2, flips: true, scales: true, rm: true,
    art: o => Pa('M-12 0L-21 -9V9Z', o.c) + E(2, 0, 16, 10, o.c) + (o.shape ? L('M-2 -9V9M6 -9V9', o.c2, 3, ' opacity=".8"') : '') + Pa('M-2 -9Q4 -16 9 -8Z', o.c2) + C(10, -2, 2.4, '#fff') + C(10.6, -2, 1.2, '#222') },
  jelly: { layer: 1, lb: () => [-15, -15, 15, 31], colors: ['#F4B9C4', '#C9D8F5', '#E6D3F5', '#FFE3A8'], shapes: 2, rm: true, scales: true,
    art: o => [-8, -3, 3, 8].map(x => L(`M${x} 0q-4 8 0 15q4 8 0 15`, o.c, 1.6, ' opacity=".9"')).join('')
      + (o.shape ? Pa('M-14 0Q0 -32 14 0Z', o.c, ' opacity=".9"') : Pa('M-14 0Q-14 -15 0 -15Q14 -15 14 0Z', o.c, ' opacity=".9"')) + HL(-5, -8, 4, 3) },
  bubbles: { layer: 1, lb: () => [-10, -32, 10, 4], rm: true, scales: true,
    art: () => [[0, 0, 4], [4, -10, 3], [-3, -19, 5], [3, -28, 2.6]].map(([x, y, r]) => C(x, y, r, 'none', ' stroke="#E8F7FF" stroke-width="1.4" opacity=".9"')).join('') },
  weed: { layer: 2, lb: () => [-13, -62, 13, 2], colors: P.green, shapes: 2, flips: true, rm: true,
    art: o => (o.shape ? [-7, 0, 7] : [-4, 5]).map((x, i) => L(`M${x} 0q-8 -12 0 -24q8 -12 0 -24q-6 -6 ${i % 2 ? 4 : -4} ${-12 + i * 4}`, o.c, 4)).join('') },
  coral: { layer: 2, lb: () => [-22, -40, 22, 2], colors: P.coral, shapes: 2, sw: 38, rm: true,
    art: o => o.shape ? Pa('M-20 0Q-24 -30 0 -40Q24 -30 20 0Z', o.c) + L('M0 0V-36M0 -20L-12 -32M0 -14L13 -30', '#00000022', 1.4)
      : L('M0 0V-22M0 -12L-12 -26M-12 -26L-14 -36M-12 -26L-4 -34M0 -16L12 -28M12 -28L16 -38M12 -28L6 -36M0 -22L2 -34', o.c, 5) },
  chest: { layer: 2, lb: o => o.shape ? [-19, -32, 19, 2] : [-19, -26, 19, 2], shapes: 2, sw: 38, rm: true,
    art: o => R(-18, -16, 36, 16, '#8A5A3C', 2) + (o.shape ? Pa('M-18 -16L-20 -30H20L18 -16Z', '#6E4A33') + C(-6, -19, 3.5, '#FFD34E') + C(4, -18, 3, '#FFD34E') + C(10, -20, 2.5, '#FFE680')
      : Pa('M-18 -16Q0 -32 18 -16Z', '#6E4A33')) + R(-18, -9, 36, 3, '#FFC93C') + R(-3, -14, 6, 8, '#FFC93C', 1) },
  turtle: { layer: 1, lb: () => [-25, -16, 25, 9], colors: ['#5DBB63', '#3F8F5A', '#C9A35A'], flips: true, rm: true,
    art: o => E(-14, 5, 6, 3, '#9BD27F') + E(10, 6, 7, 3, '#9BD27F') + C(20, -3, 6, '#9BD27F') + C(22, -4, 1.2, '#222') + Pa('M-18 2Q-16 -16 0 -16Q16 -16 18 2Z', o.c)
      + L('M-8 -12L0 -6L8 -12M0 -6V2', '#00000033', 1.4) },
  bush: { layer: 2, lb: () => [-21, -25, 21, 2], colors: P.green, sw: 38, scales: true, rm: true, dets: { berry: [-15, -21, 15, -5] },
    art: o => C(-10, -9, 10, o.c) + C(10, -9, 10, o.c) + C(0, -15, 12, o.c) + HL(-4, -20, 5, 3)
      + (o.berry ? [[-11, -12], [-3, -18], [6, -13], [11, -6], [-6, -6]].map(([x, y]) => C(x, y, 2.2, o.fc || '#FF5D6C')).join('') : '') },
  fence: { layer: 2, lb: () => [-25, -24, 25, 2], colors: ['#FFFFFF', '#C99566', '#F4B9C4', '#BFD9FF'], shapes: 2, rm: true,
    art: o => R(-24, -16, 48, 3, o.c) + R(-24, -8, 48, 3, o.c) + [-20, -8, 4, 16].map(x => o.shape ? R(x - 3, -20, 6, 20, o.c, 3) : Pa(`M${x - 3} 0V-18L${x} -23L${x + 3} -18V0Z`, o.c)).join('') + L('M-24 0H24', '#00000022', 1) },
  sign: { layer: 2, lb: () => [-16, -38, 20, 2], colors: P.wood, flips: true, sw: 16, rm: true,
    art: o => R(-2, -28, 4, 28, '#8A5A3C') + Pa('M-14 -36H12L19 -30L12 -24H-14Z', o.c) + L('M-10 -30H8', '#ffffff99', 1.6) },
  lamp: { layer: 2, lb: () => [-9, -60, 9, 2], colors: ['#3E4A5C', '#2E5E3E', '#8A5A3C'], shapes: 2, sw: 12, rm: true,
    art: o => R(-1.6, -46, 3.2, 46, o.c) + R(-4, -3, 8, 3, o.c) + (o.shape ? R(-6, -56, 12, 11, '#FFE680', 2, ` stroke="${o.c}" stroke-width="2"`) + Pa('M-8 -56L0 -61L8 -56Z', o.c) : C(0, -52, 7, '#FFE680') + R(-3, -46, 6, 2, o.c)) },
  tuft: { layer: 2, lb: () => [-9, -11, 9, 1],     // 꾸밈만 — 너무 작아 틀린 곳으로는 쓰지 않는다
    art: o => L('M-6 0Q-7 -6 -9 -9M-2 0Q-2 -8 -1 -11M2 0Q3 -6 6 -9M5 0Q7 -4 9 -5', o.g || '#4FA466', 1.6) },
  snail: { layer: 2, lb: () => [-13, -15, 13, 1], colors: ['#C98B5A', '#F4B9C4', '#FFC93C', '#9B6BFF'], flips: true, rm: true,
    art: o => Pa('M-12 0Q-12 -3 -6 -3H10Q13 -3 13 0Z', '#E8D29C') + L('M9 -3L11 -10M11 -3L13 -9', '#C9B06E', 1.2) + C(0, -8, 7, o.c) + L('M0 -8m-4 0a4 4 0 1 1 4 4a2 2 0 1 1 -2 -2', '#00000033', 1.2) },
  bee: { layer: 1, lb: () => [-10, -9, 10, 7], rots: true, rm: true,
    art: () => E(-2, -6, 4, 3, '#E8F6FF', ' opacity=".9"') + E(3, -6, 4, 3, '#E8F6FF', ' opacity=".9"') + E(0, 0, 8, 5, '#FFC93C') + L('M-3 -4.5V4.5M1 -5V5', '#3E4A5C', 1.8) + C(7, -1, 1, '#222') },
  surfboard: { layer: 2, lb: () => [-8, -42, 8, 2], colors: P.pop, rots: true, sw: 14, rm: true,
    art: o => Pa('M0 -42Q8 -28 6 -6Q4 2 0 2Q-4 2 -6 -6Q-8 -28 0 -42Z', o.c) + L('M0 -38V-2', o.c2, 2) },
  anchor: { layer: 2, lb: () => [-14, -32, 14, 2], rots: true, rm: true, colors: ['#7F8790', '#B07A4E', '#5C7ACF'],
    art: o => C(0, -27, 3.5, 'none', ` stroke="${o.c}" stroke-width="2.4"`) + L('M0 -23V-2M-7 -17H7M-12 -8Q-10 1 0 -1Q10 1 12 -8', o.c, 3) },
  seahorse: { layer: 1, lb: () => [-10, -22, 10, 20], colors: ['#FFC93C', '#FF8A3C', '#C78BFF', '#FF7A8A'], flips: true, rm: true,
    art: o => Pa('M2 -20Q10 -20 9 -13L4 -12Q7 -4 4 4Q2 10 4 14Q6 18 2 19Q-3 18 0 12Q-2 4 -4 -2Q-6 -10 -2 -16Q0 -20 2 -20Z', o.c) + Pa('M9 -16L13 -15L9 -13Z', o.c) + C(4, -16, 1.2, '#222') + L('M-4 -6L-8 -4M-4 0L-8 2', o.c, 2) },
  parachute: { layer: 1, lb: () => [-23, -24, 23, 30], colors: P.pop, shapes: 2, rm: true,
    art: o => Pa('M-22 -6Q-22 -24 0 -24Q22 -24 22 -6Z', o.c) + (o.shape ? Pa('M-8 -6Q-7 -24 0 -24Q7 -24 8 -6Z', o.c2) : Pa('M-22 -6Q-15 -10 -8 -6Q0 -10 8 -6Q15 -10 22 -6Z', '#00000020'))
      + L('M-22 -6L-3 18M22 -6L3 18M-8 -6L-1 18M8 -6L1 18', '#6b6b6b', 0.8) + C(0, 20, 3, '#F2C7A5') + R(-3, 22, 6, 7, o.c2, 2) },
  campfire: { layer: 2, lb: o => [-14, o.shape ? -32 : -22, 14, 2], shapes: 2, sw: 26, rm: true, colors: ['#FF8A3C', '#FF5D6C', '#FFC93C'],
    art: o => L('M-12 -2L10 -6M-10 -6L12 -2', '#8A5A3C', 4) + (o.shape ? Pa('M0 -32Q10 -18 7 -8Q4 -2 0 -2Q-4 -2 -7 -8Q-10 -18 0 -32Z', o.c) + Pa('M0 -20Q5 -12 3 -6H-3Q-5 -12 0 -20Z', '#FFE680')
      : Pa('M0 -22Q7 -12 5 -6Q3 -2 0 -2Q-3 -2 -5 -6Q-7 -12 0 -22Z', o.c) + Pa('M0 -13Q3 -8 2 -5H-2Q-3 -8 0 -13Z', '#FFE680')) },
  pebbles: { layer: 2, lb: () => [-13, -7, 13, 1], colors: P.stone, nocolor: true, rm: true,
    art: o => E(-7, -3, 5, 3.5, o.c) + E(3, -2.5, 4, 3, o.c) + E(9, -4, 3.5, 3, '#ffffff', ' opacity=".55"') + E(-2, -5, 3, 2, '#00000014') }
};

/* ─────────── 자리 ─────────── */
export function boxOf(o, lb = T[o.type].lb(o)){
  const s = o.s;
  const [x0, y0, x1, y1] = o.flip ? [-lb[2], lb[1], -lb[0], lb[3]] : lb;
  return [o.x + x0 * s, o.y + y0 * s, o.x + x1 * s, o.y + y1 * s];
}
const overlap = (a, b, pad = 0) => !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);
const shadowOf = o => { const w = T[o.type].sw * o.s; return E(o.x + w * 0.18, o.y + 1, w * 0.55, Math.max(3, w * 0.09), 'rgba(40,30,20,.28)'); };
function drawObj(o){
  const t = T[o.type];
  const sh = o.shadow && t.sw ? shadowOf(o) : '';
  const rot = o.rot ? ` rotate(${o.rot})` : '';
  return sh + `<g transform="translate(${f1(o.x)} ${f1(o.y)}) scale(${o.flip ? -o.s : o.s} ${o.s})${rot}">${t.art(o)}</g>`;
}

/* ─────────── 테마 — 바탕(뒤 · 앞)과 놓을 물건 ─────────── */
const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const SKIES = [['#A9DCFF', '#EAF7FF'], ['#BFD9FF', '#F2F8FF'], ['#B8ECEA', '#F0FBF7'], ['#FFC98E', '#FFEBD2'], ['#D7C6FF', '#FBEFFF']];
const TH = {
  field: {
    bg(r){ const sky = pick(r, SKIES), g = pick(r, [['#9BD27F', '#7CBF66'], ['#A8D98A', '#86C470'], ['#B5DE8A', '#92C96B']]); const path = r() < 0.6;
      const hills = Array.from({ length: 3 }, (_, i) => E(40 + i * 150 + r() * 60, 168, 65 + r() * 45, 40 + r() * 35, pick(r, ['#8FC7A0', '#A5CFB0', '#9DB8D9', '#B7C9A5']))).join('');
      return { back: grad('sk', ...sky) + R(0, 0, W, HH, 'url(#sk)'), front: hills + grad('gr', ...g) + R(0, 162, W, 138, 'url(#gr)') + (path ? Pa('M150 300C180 250 230 215 250 162L262 162C250 215 215 260 205 300Z', '#EBD9B4', ' opacity=".85"') : '') }; },
    items: [['sun', 1, [40, 360], [32, 52]], ['cloud', [2, 4], [30, 370], [25, 95]], ['bird', [3, 5], [25, 375], [25, 115]], ['balloon', [1, 2], [30, 370], [50, 110]], ['kite', 1, [40, 360], [45, 95]], ['butterfly', [1, 2], [30, 370], [130, 200]],
      ['house', [2, 3], [45, 355], [190, 222]], ['tree', [3, 5], [20, 380], [182, 272]], ['bush', [2, 3], [20, 380], [200, 285]], ['fence', [1, 2], [30, 370], [205, 270]], ['sign', [0, 1], [20, 380], [215, 280]], ['lamp', [0, 1], [20, 380], [210, 275]],
      ['pet', [1, 2], [40, 360], [245, 290]], ['car', 1, [50, 350], [262, 292]], ['mailbox', 1, [30, 370], [225, 280]], ['flower', [6, 9], [12, 388], [228, 298]], ['tuft', [5, 8], [10, 390], [175, 298]], ['pebbles', [1, 2], [16, 384], [240, 298]]]
  },
  mountain: {
    bg(r){ const sky = pick(r, SKIES.slice(0, 3)); let m = '';
      for (let i = 0; i < 4; i++){ const x = -40 + i * 130 + r() * 40, h = 90 + r() * 60, w = 110 + r() * 50; const c = pick(r, ['#8FA7C9', '#9DB3CF', '#A3A8C9']);
        m += Pa(`M${f1(x - w)} 200L${f1(x)} ${f1(200 - h)}L${f1(x + w)} 200Z`, c) + Pa(`M${f1(x - w * .24)} ${f1(200 - h * .76)}L${f1(x)} ${f1(200 - h)}L${f1(x + w * .24)} ${f1(200 - h * .76)}L${f1(x + w * .1)} ${f1(200 - h * .7)}L${f1(x)} ${f1(200 - h * .78)}L${f1(x - w * .1)} ${f1(200 - h * .7)}Z`, '#fff'); }
      const hill = Pa(`M0 210Q100 ${f1(170 + r() * 20)} 200 200T400 ${f1(190 + r() * 15)}V300H0Z`, '#7FBF6A');
      return { back: grad('sk', ...sky) + R(0, 0, W, HH, 'url(#sk)'), front: m + Pa('M0 200H400V300H0Z', '#8CC976') + hill }; },
    items: [['sun', 1, [40, 360], [30, 48]], ['cloud', [2, 4], [30, 370], [22, 85]], ['bird', [3, 5], [25, 375], [25, 105]],
      ['cabin', 1, [60, 340], [225, 255]], ['tent', [1, 2], [40, 360], [235, 285]], ['campfire', [0, 1], [30, 370], [255, 292]], ['tree', [5, 8], [15, 385], [205, 292], () => ({ shape: 1 })], ['bush', [1, 3], [20, 380], [215, 292]],
      ['rock', [2, 4], [18, 382], [235, 297]], ['sign', [0, 1], [20, 380], [230, 290]], ['mushroom', [2, 4], [15, 385], [250, 297]], ['flower', [3, 5], [14, 386], [248, 298]], ['pet', [0, 1], [40, 360], [255, 292]],
      ['tuft', [5, 8], [10, 390], [212, 298]], ['pebbles', [1, 3], [14, 386], [245, 298]], ['snail', [0, 1], [20, 380], [270, 298]]]
  },
  sea: {
    bg(r){ const sky = pick(r, SKIES); const hz = 125 + Math.floor(r() * 15); let waves = '';
      for (let i = 0; i < 14; i++){ const x = 15 + ((i * 53) % 380), y = hz + 12 + ((i * 29) % 60); waves += L(`M${x} ${y}q5 -4 10 0q5 4 10 0`, '#fff', 1.6, ' opacity=".55"'); }
      return { back: grad('sk', ...sky) + R(0, 0, W, HH, 'url(#sk)'),
        front: grad('se', '#5AB6E8', '#2E86C9') + R(0, hz, W, 300 - hz, 'url(#se)') + waves + Pa(`M0 ${hz + 85}Q120 ${hz + 70} 220 ${hz + 82}T400 ${hz + 76}V300H0Z`, '#F2DDA9') + Pa(`M0 ${hz + 85}Q120 ${hz + 70} 220 ${hz + 82}T400 ${hz + 76}`, 'none', ' stroke="#fff" stroke-width="3" opacity=".8"') }; },
    items: [['sun', 1, [40, 360], [30, 50]], ['cloud', [2, 4], [30, 370], [22, 85]], ['bird', [3, 5], [25, 375], [25, 105], () => ({ c: '#5a6472' })],
      ['boat', [1, 3], [35, 365], [156, 192]], ['lighthouse', [0, 1], [20, 60], [218, 222]], ['palm', [1, 3], [18, 382], [235, 262]], ['umbrella', [1, 2], [40, 360], [242, 278]], ['surfboard', [1, 2], [20, 380], [248, 290]],
      ['ball', 1, [30, 370], [255, 292]], ['castle', 1, [50, 350], [262, 292]], ['crab', [1, 3], [25, 375], [258, 297]], ['star', [2, 3], [16, 384], [258, 298]], ['shell', [3, 5], [14, 386], [252, 298]], ['pebbles', [1, 3], [14, 386], [250, 298]]]
  },
  garden: {
    bg(r){ const sky = pick(r, SKIES); let fence = '';
      for (let x = 4; x < 400; x += 16) fence += Pa(`M${x} 182V166L${x + 5} 160L${x + 10} 166V182Z`, '#FFFFFF', ' opacity=".95"');
      return { back: grad('sk', ...sky) + R(0, 0, W, HH, 'url(#sk)'),
        front: Pa('M0 172Q40 140 80 168Q120 138 160 166Q200 136 240 166Q280 140 320 168Q360 142 400 166V185H0Z', '#4E9E5E') + R(0, 170, W, 130, '#9DD27F') + fence + R(0, 172, W, 3, '#FFFFFF')
          + Pa('M170 300Q200 240 205 185H215Q222 240 250 300Z', '#E7D3B0', ' opacity=".9"') }; },
    items: [['sun', 1, [40, 360], [30, 50]], ['cloud', [2, 3], [30, 370], [22, 80]], ['butterfly', [2, 4], [25, 375], [80, 200]], ['bee', [1, 3], [25, 375], [90, 210]], ['bird', [1, 3], [25, 375], [25, 100]],
      ['house', 1, [60, 340], [180, 186]], ['tree', [2, 4], [18, 382], [195, 262]], ['bush', [2, 4], [20, 380], [195, 290]], ['bench', 1, [40, 360], [215, 262]], ['lamp', [1, 2], [18, 382], [210, 280]], ['can', 1, [30, 370], [240, 290]],
      ['mushroom', [1, 3], [18, 382], [248, 297]], ['snail', [1, 2], [18, 382], [258, 298]], ['pet', [1, 2], [40, 360], [245, 292]], ['flower', [8, 12], [12, 388], [200, 298]], ['mailbox', [0, 1], [30, 370], [215, 262]], ['tuft', [3, 6], [10, 390], [195, 298]]]
  },
  pond: {
    bg(r){ const sky = pick(r, SKIES); const cx = 175 + r() * 50, cy = 208, rx = 140 + r() * 20, ry = 56 + r() * 10;
      const far = Array.from({ length: 9 }, (_, i) => C(i * 50 + r() * 20, 112, 22 + r() * 12, pick(r, ['#6DAE6E', '#5E9E64', '#7DBB72']))).join('');
      return { back: grad('sk', ...sky) + R(0, 0, W, HH, 'url(#sk)'), pond: [cx, cy, rx, ry],
        front: far + R(0, 112, W, 188, '#93CD7A') + E(cx, cy + 4, rx + 6, ry + 5, '#C9B98F') + grad('pw', '#6EC1E4', '#3E95CF') + E(cx, cy, rx, ry, 'url(#pw)')
          + L(`M${f1(cx - rx * .5)} ${f1(cy - ry * .3)}h40M${f1(cx + rx * .1)} ${f1(cy + ry * .2)}h50`, '#fff', 2, ' opacity=".45"') }; },
    items: [['sun', 1, [40, 360], [26, 46]], ['cloud', [1, 3], [30, 370], [20, 70]], ['bird', [2, 3], [25, 375], [25, 85]], ['dragonfly', [1, 3], [25, 375], [118, 175]], ['bee', [0, 1], [25, 375], [120, 170]],
      ['lily', [4, 7], [55, 345], [172, 258], null, 'pond'], ['lotus', [1, 3], [65, 335], [178, 252], null, 'pond'], ['duck', [1, 3], [75, 325], [188, 252], null, 'pond'],
      ['frog', [1, 2], [25, 375], [268, 297], null, 'land'], ['reed', [2, 4], [8, 392], [148, 297], null, 'land'], ['tree', [1, 3], [18, 382], [138, 166], null, 'land'], ['bush', [1, 2], [18, 382], [140, 170], null, 'land'],
      ['rock', [1, 3], [18, 382], [258, 297], null, 'land'], ['flower', [3, 5], [14, 386], [262, 298], null, 'land'], ['snail', [0, 1], [18, 382], [272, 298], null, 'land'], ['lamp', [0, 1], [18, 382], [150, 170], null, 'land'],
      ['tuft', [4, 7], [8, 392], [128, 298], null, 'land'], ['pebbles', [1, 2], [14, 386], [262, 298], null, 'land']]
  },
  sky: {
    bg(r){ const sky = pick(r, [['#6FB8F2', '#DDF0FF'], ['#8FC4FF', '#F3F8FF'], ['#FFB38A', '#FFE9D2'], ['#B49CF0', '#FBE7FF']]);
      return { back: grad('sk', ...sky) + R(0, 0, W, HH, 'url(#sk)'), front: Pa(`M0 262Q100 ${f1(236 + r() * 14)} 200 258T400 ${f1(250 + r() * 10)}V300H0Z`, '#8CCB72') + Pa('M0 282Q140 266 260 280T400 276V300H0Z', '#77BD60') }; },
    items: [['sun', 1, [40, 360], [30, 55]], ['rainbow', [0, 1], [90, 310], [175, 185]], ['cloud', [5, 7], [18, 382], [25, 215]], ['hab', [2, 3], [28, 372], [45, 205]], ['plane', 1, [40, 360], [28, 125]], ['parachute', [1, 2], [28, 372], [40, 200]],
      ['bird', [3, 6], [18, 382], [25, 225]], ['balloon', [2, 3], [18, 382], [55, 215]], ['kite', [0, 1], [40, 360], [60, 170]], ['bee', [0, 1], [25, 375], [200, 240]],
      ['tree', [2, 4], [18, 382], [268, 294]], ['bush', [1, 2], [18, 382], [272, 296]], ['house', [0, 1], [50, 350], [278, 286], () => ({ s: 0.8 })], ['tuft', [2, 4], [10, 390], [270, 298]]]
  },
  under: {
    bg(r){ const top = pick(r, ['#5CC6EE', '#4FB8E8', '#62D0E0']); let rays = '';
      for (let i = 0; i < 4; i++){ const x = 30 + i * 100 + r() * 40; rays += Pa(`M${f1(x)} 0L${f1(x + 26)} 0L${f1(x + 90)} 240L${f1(x + 40)} 240Z`, '#ffffff', ' opacity=".09"'); }
      return { back: grad('uw', top, '#1F5FA8') + R(0, 0, W, HH, 'url(#uw)') + rays,
        front: Pa(`M0 245Q70 ${f1(228 + r() * 10)} 150 242T300 ${f1(236 + r() * 8)}T400 240V300H0Z`, '#E8D29C') + Pa('M0 268Q120 258 240 270T400 264V300H0Z', '#DCC28A') }; },
    items: [['fish', [6, 9], [22, 378], [28, 215]], ['jelly', [1, 3], [25, 375], [28, 155]], ['turtle', [0, 1], [50, 350], [60, 170]], ['seahorse', [1, 2], [20, 380], [60, 220]], ['bubbles', [2, 4], [18, 382], [50, 225]],
      ['weed', [3, 5], [10, 390], [252, 298]], ['coral', [2, 4], [22, 378], [256, 298]], ['crab', [1, 2], [25, 375], [266, 298]], ['star', [1, 3], [18, 382], [262, 298]], ['anchor', [0, 1], [30, 370], [262, 296]],
      ['shell', [2, 3], [14, 386], [266, 298]], ['chest', [0, 1], [50, 350], [268, 296]], ['rock', [1, 3], [18, 382], [258, 298]], ['pebbles', [2, 3], [14, 386], [262, 298]]]
  }
};
const SHADOW_FREE = new Set(['bee', 'seahorse', 'parachute', 'fish', 'jelly', 'turtle', 'bubbles', 'bird', 'balloon', 'kite', 'plane', 'hab', 'butterfly', 'dragonfly', 'cloud', 'sun', 'rainbow', 'lily', 'lotus', 'duck', 'boat']);

/** 기본 색 · 덧붙일 값 — 종류마다 */
function defaults(type, r){
  const t = T[type], o = {};
  if (t.colors) o.c = pick(r, t.colors);
  o.c2 = pick(r, P.pop);
  if (t.shapes) o.shape = r() < 0.45 ? 1 : 0;
  if (t.flips) o.flip = r() < 0.5;
  if (t.rots) o.rot = Math.round(-15 + r() * 30);
  if (type === 'house'){ o.wall = pick(r, P.wall); o.roof = pick(r, P.roof); o.door = pick(r, P.door); o.chim = r() < 0.5; }
  if (type === 'cabin') o.roof = pick(r, ['#D9614E', '#3E4A5C', '#4E9E6E']);
  if (type === 'pet') o.c2 = pick(r, ['#8A5A3C', '#5a4a40', '#C98B5A']);
  // 작은 디테일 — 있기도 하고 없기도 하다. 없어지는 것도 '사물' 틀린 곳이 된다 (dets)
  if (type === 'house'){ o.pot = r() < 0.65; o.lamp = r() < 0.55; }
  if (type === 'tree'){ o.fruit = r() < 0.5; o.fc = pick(r, ['#FF5D6C', '#FF8A3C', '#FFC93C']); }
  if (type === 'bush'){ o.berry = r() < 0.5; o.fc = pick(r, ['#FF5D6C', '#9B6BFF', '#FFFFFF']); }
  if (type === 'cabin'){ o.wood = r() < 0.7; o.smoke = r() < 0.6; }
  if (['tent', 'mailbox', 'castle', 'boat'].includes(type)) o.flag = r() < 0.75;
  if (type === 'palm') o.nuts = r() < 0.75;
  if (type === 'pet') o.collar = r() < 0.55;
  if (type === 'tuft') o.g = pick(r, ['#4FA466', '#3F8F5A', '#6DBB6A']);
  return o;
}

/** 씨앗 → 그림 { theme, bg, objs } */
export function makeScene(seed){
  const theme = themeOf(seed);
  const r = rng(seed);
  const th = TH[theme];
  const bg = th.bg(r);
  const objs = [];
  const inPond = (x, y, pad) => { if (!bg.pond) return true; const [cx, cy, rx, ry] = bg.pond; return ((x - cx) / (rx - pad)) ** 2 + ((y - cy) / (ry - pad * 0.5)) ** 2 < 1; };
  for (const [type, cnt, xr, yr, extra, zone] of th.items){
    const n = Array.isArray(cnt) ? cnt[0] + Math.floor(r() * (cnt[1] - cnt[0] + 1)) : cnt;
    for (let k = 0; k < n; k++){
      for (let t = 0; t < 90; t++){
        const o = { type, x: xr[0] + r() * (xr[1] - xr[0]), y: yr[0] + r() * (yr[1] - yr[0]), s: 0.72 + r() * 0.6, ...defaults(type, r), ...(extra ? extra(r) : {}) };
        o.shadow = !!T[type].sw && !SHADOW_FREE.has(type);
        const b = boxOf(o);
        if (b[0] < 3 || b[2] > W - 3 || b[1] < 3 || b[3] > HH - 1) continue;
        if (zone === 'pond' && !(inPond(b[0], o.y, 4) && inPond(b[2], o.y, 4))) continue;
        if (zone === 'land' && bg.pond && (inPond(b[0], b[3], -10) || inPond(b[2], b[3], -10) || inPond(o.x, b[3], -10))) continue;
        if (objs.some(p => overlap(b, boxOf(p), 2))) continue;
        objs.push(o); break;
      }
    }
  }
  objs.forEach((o, i) => { o.id = i; });
  return { theme, seed, objs };
}

/** 그림 → SVG 글 (바탕은 씨앗에서 다시 짓는다 — 바뀐 그림도 같은 바탕) */
export function drawScene(sc, extra = ''){
  const bg = TH[sc.theme].bg(rng(sc.seed));
  const by = l => sc.objs.filter(o => T[o.type].layer === l);
  let svg = `<svg viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><defs></defs>` + bg.back;
  for (const o of by(0)) svg += drawObj(o);
  svg += bg.front;
  for (const o of by(1)) svg += drawObj(o);
  for (const o of by(2).sort((a, b) => a.y - b.y)) svg += drawObj(o);
  return svg + extra + '</svg>';
}

/* ─────────── 틀린 곳 다섯 ─────────── */
const KINDS = ['color', 'shape', 'object', 'shadow', 'form'];
export const KIND_NAME = { color: '색상', shape: '모양', object: '사물', shadow: '그림자', form: '형태' };
const unite = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const inside = b => b[0] >= 2 && b[2] <= W - 2 && b[1] >= 2 && b[3] <= HH;

/** 그 물건에 이 갈래의 바꿈이 되는가 — 되면 { apply, region } */
function tryKind(kind, o, r){
  const t = T[o.type];
  const b0 = boxOf(o);
  if (kind === 'color'){
    if (o.type === 'house'){
      const part = pick(r, ['roof', 'wall', 'door']);
      const list = part === 'roof' ? P.roof : part === 'wall' ? P.wall : P.door;
      const c = far(list, o[part], r);
      return { apply: n => { n[part] = c; }, region: boxOf(o, t.parts[part]) };
    }
    if (!t.colors || t.colors.length < 2 || t.nocolor || o.type === 'cloud' || o.type === 'bird') return null;   // 비슷한 잿빛끼리는 바꿔도 안 보인다
    const c = far(t.colors, o.c, r);
    return { apply: n => { n.c = c; }, region: b0 };
  }
  if (kind === 'shape'){
    if (!t.shapes) return null;
    const b1 = boxOf({ ...o, shape: o.shape ? 0 : 1 });
    if (!inside(b1)) return null;
    return { apply: n => { n.shape = n.shape ? 0 : 1; }, region: o.type === 'house' ? boxOf(o, t.parts.wall) : unite(b0, b1) };
  }
  if (kind === 'shadow'){
    if (!o.shadow || !t.sw) return null;
    const w = t.sw * o.s;
    return { apply: n => { n.shadow = false; }, region: [o.x - w * .4, o.y - 10, o.x + w * .8, o.y + 8] };
  }
  if (kind === 'form'){
    if (t.flips && r() < 0.55) return { apply: n => { n.flip = !n.flip; }, region: unite(b0, boxOf({ ...o, flip: !o.flip })) };
    if (t.rots) return { apply: n => { n.rot = (n.rot || 0) + (n.rot > 0 ? -40 : 40); }, region: [b0[0] - 10, b0[1] - 8, b0[2] + 10, b0[3] + 6] };
    if (t.scales){
      for (const k of [1.45, 0.62]){
        const b1 = boxOf({ ...o, s: o.s * k });
        if (inside(b1)) return { apply: n => { n.s = o.s * k; }, region: unite(b0, b1) };
      }
    }
    if (t.flips) return { apply: n => { n.flip = !n.flip; }, region: unite(b0, boxOf({ ...o, flip: !o.flip })) };
    return null;
  }
  if (kind === 'object'){
    // 작은 디테일이 없어지기도 한다 (화분 · 사과 · 깃발 · 목걸이 …) — 물건이 통째로 없어지는 것과 반쯤씩
    const on = t.dets ? Object.keys(t.dets).filter(k => o[k] && !(k === 'fruit' && o.shape) && !(o.type === 'tent' && o.shape)) : [];
    if (on.length && (!t.rm || r() < 0.55)){ const k = pick(r, on); return { apply: n => { n[k] = false; }, region: boxOf(o, t.dets[k]) }; }
    if (t.rm) return { apply: 'remove', region: b0 };
    return null;
  }
  return null;
}

/**
 * 틀린 곳 다섯 — [{ kind, id, region:[x0,y0,x1,y1] }] 와 바뀐 그림.
 * 갈래마다 하나씩 (안 되면 다른 갈래로 채운다), 자리는 서로 겹치지 않게, 한 종류에 몰리지 않게.
 */
export function makeDiffs(seed){
  const sc = makeScene(seed);
  const r = rng(seed ^ 0x9E3779B9);
  const order = KINDS.slice();
  for (let i = order.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const used = new Set(), diffs = [], regions = [];
  const SMALL = new Set(['flower', 'bird', 'shell', 'star', 'bubbles', 'butterfly', 'dragonfly', 'tuft', 'pebbles', 'bee', 'snail']);
  for (const kind of [...order, ...order, ...order]){
    if (diffs.length >= 5) break;
    const cands = sc.objs.filter(o => !used.has(o.id));
    for (let i = cands.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    if (kind === 'form') cands.sort((a, b) => (a.type === 'cloud') - (b.type === 'cloud'));
    for (const o of cands){
      const same = diffs.filter(d => sc.objs[d.id].type === o.type).length;
      if (same >= (SMALL.has(o.type) ? 1 : 2)) continue;
      const k = tryKind(kind, o, r);
      if (!k) continue;
      const reg = k.region;
      if (regions.some(q => overlap(reg, q, 8))) continue;
      used.add(o.id); regions.push(reg);
      diffs.push({ kind, id: o.id, region: reg.map(f1), apply: k.apply });
      break;
    }
  }
  const changed = structuredClone(sc);
  for (const d of diffs){
    const i = changed.objs.findIndex(o => o.id === d.id);
    if (d.apply === 'remove') changed.objs.splice(i, 1);
    else d.apply(changed.objs[i]);
  }
  return { scene: sc, changed, diffs: diffs.map(({ kind, id, region }) => ({ kind, id, region })) };
}

/** 누른 자리(400 × 300 좌표)가 어느 틀린 곳인가 — 넉넉히 둘러싼다 (작은 것도 손가락으로 맞게) */
export function hitDiff(diffs, x, y, pad = 9){
  let best = -1, bd = 1e9;
  diffs.forEach((d, i) => {
    const [x0, y0, x1, y1] = d.region;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = Math.max((x1 - x0) / 2 + pad, 17), hh = Math.max((y1 - y0) / 2 + pad, 17);
    if (Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh){
      const dd = Math.hypot(x - cx, y - cy);
      if (dd < bd){ bd = dd; best = i; }
    }
  });
  return best;
}
