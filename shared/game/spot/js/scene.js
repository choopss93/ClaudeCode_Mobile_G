/*
 * 틀린그림찾기 — 그림 짓기. 씨앗(seed) 하나로 같은 그림이 나온다 (모두의 화면이 같다).
 *
 * 그림은 400 × 300 SVG. 마을 · 들판 풍경을 물건들로 짓는다 — 해 · 구름 · 새 · 풍선 · 연 · 산 · 집 · 나무 ·
 * 꽃 · 고양이 · 강아지 · 자동차 · 우체통. 물건마다 { type, x, y, s, … } 만 들고 있고, 그리기(draw)와
 * 자리(box)는 종류마다 한 곳.
 *
 * 틀린 곳 다섯 (makeDiffs) — 사용자가 말한 다섯 갈래를 하나씩:
 *   색상(color) · 모양(shape) · 사물(object — 없어지거나 생김) · 그림자(shadow — 사라짐) · 형태(form — 크기 · 뒤집기 · 기울기)
 *   틀린 곳끼리는 자리가 겹치지 않게 고른다. 찾았는지는 그 자리(넉넉히 둘러싼 상자) 안을 눌렀는지로 본다.
 */
export const W = 400, HH = 300;

function rng(seed){
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const P = {
  wall: ['#F6C6A8', '#F9E3A3', '#BFE3C8', '#C9D8F5', '#F4B9C4', '#E6D3F5', '#FFFFFF'],
  roof: ['#D9614E', '#5C7ACF', '#4E9E6E', '#9A5BC2', '#D98A2B', '#3E4A5C'],
  door: ['#8A5A3C', '#5C7ACF', '#D9614E', '#4E9E6E', '#F2C14E'],
  leaf: ['#6DBB6A', '#4FA466', '#8CCB5E', '#3F8F5A'],
  bloom: ['#FF7A8A', '#FFD34E', '#7AA8FF', '#C78BFF', '#FF9F4E', '#FFFFFF'],
  pop: ['#FF5D6C', '#FFC93C', '#4E9BFF', '#9B6BFF', '#3CC48A', '#FF8A3C'],
  car: ['#E8574F', '#3F7FD9', '#F2C14E', '#47B08A', '#9B6BFF'],
  fur: ['#F2A65A', '#8C8C8C', '#3B3B3B', '#F5F0E6', '#C98B5A'],
  box: ['#E8574F', '#3F7FD9', '#47B08A', '#F2C14E']
};
const pick = (r, a) => a[Math.floor(r() * a.length)];
/** 색을 바꿀 때 — 같은 묶음에서 멀리 떨어진 색 */
const far = (list, c, r) => { const i = list.indexOf(c); const opts = list.filter((x, j) => x !== c && Math.abs(j - i) >= 2); return opts.length ? pick(r, opts) : list.find(x => x !== c); };
const f1 = n => Math.round(n * 10) / 10;

/* ─────────── 물건 — 그리기와 자리 ─────────── */
const SH = 'rgba(40,30,20,.28)';
const shadowOf = (x, y, w) => `<ellipse cx="${f1(x + w * 0.18)}" cy="${f1(y + 1)}" rx="${f1(w * 0.55)}" ry="${f1(Math.max(3, w * 0.09))}" fill="${SH}"/>`;
const T = {
  sun: {
    box: o => { const R = o.s * (o.shape ? 30 : 22); return [o.x - R, o.y - R, o.x + R, o.y + R]; },
    draw: o => {
      const r = 20 * o.s;
      let rays = '';
      if (o.shape) for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2; rays += `<line x1="${f1(o.x + Math.cos(a) * r * 1.2)}" y1="${f1(o.y + Math.sin(a) * r * 1.2)}" x2="${f1(o.x + Math.cos(a) * r * 1.5)}" y2="${f1(o.y + Math.sin(a) * r * 1.5)}" stroke="${o.c}" stroke-width="${f1(3 * o.s)}" stroke-linecap="round"/>`; }
      return `${rays}<circle cx="${f1(o.x)}" cy="${f1(o.y)}" r="${f1(r)}" fill="${o.c}"/><circle cx="${f1(o.x - r * .3)}" cy="${f1(o.y - r * .3)}" r="${f1(r * .35)}" fill="#fff" opacity=".35"/>`;
    }, shapes: 2, colors: ['#FFC93C', '#FF8A3C', '#FF5D6C', '#FFE680']
  },
  cloud: {
    box: o => [o.x - 34 * o.s, o.y - 18 * o.s, o.x + 34 * o.s, o.y + 12 * o.s],
    draw: o => { const s = o.s; return `<g fill="${o.c}"><ellipse cx="${f1(o.x)}" cy="${f1(o.y)}" rx="${f1(30 * s)}" ry="${f1(11 * s)}"/><circle cx="${f1(o.x - 12 * s)}" cy="${f1(o.y - 6 * s)}" r="${f1(11 * s)}"/><circle cx="${f1(o.x + 8 * s)}" cy="${f1(o.y - 9 * s)}" r="${f1(14 * s)}"/></g>`; },
    colors: ['#FFFFFF', '#FFE3EC', '#DDEBFF']
  },
  bird: {
    box: o => [o.x - 12 * o.s, o.y - 8 * o.s, o.x + 12 * o.s, o.y + 5 * o.s],
    draw: o => `<path d="M${f1(o.x - 11 * o.s)} ${f1(o.y - 4 * o.s)} Q${f1(o.x - 5 * o.s)} ${f1(o.y - 9 * o.s)} ${f1(o.x)} ${f1(o.y)} Q${f1(o.x + 5 * o.s)} ${f1(o.y - 9 * o.s)} ${f1(o.x + 11 * o.s)} ${f1(o.y - 4 * o.s)}" fill="none" stroke="${o.c}" stroke-width="${f1(2.6 * o.s)}" stroke-linecap="round"/>`,
    colors: ['#3E4A5C', '#5C7ACF', '#D9614E']
  },
  balloon: {
    box: o => [o.x - 15 * o.s, o.y - 19 * o.s, o.x + 15 * o.s, o.y + 42 * o.s],
    draw: o => {
      const s = o.s, x = o.x, y = o.y;
      const body = o.shape
        ? `<path d="M${f1(x)} ${f1(y + 16 * s)} C${f1(x - 26 * s)} ${f1(y - 2 * s)} ${f1(x - 12 * s)} ${f1(y - 24 * s)} ${f1(x)} ${f1(y - 10 * s)} C${f1(x + 12 * s)} ${f1(y - 24 * s)} ${f1(x + 26 * s)} ${f1(y - 2 * s)} ${f1(x)} ${f1(y + 16 * s)}Z" fill="${o.c}"/>`
        : `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(13 * s)}" ry="${f1(17 * s)}" fill="${o.c}"/><path d="M${f1(x - 3 * s)} ${f1(y + 18 * s)} h${f1(6 * s)} l${f1(-3 * s)} ${f1(-4 * s)}z" fill="${o.c}"/>`;
      return `<path d="M${f1(x)} ${f1(y + 17 * s)} q${f1(-5 * s)} ${f1(12 * s)} 0 ${f1(24 * s)}" fill="none" stroke="#6b6b6b" stroke-width="1.2"/>${body}<ellipse cx="${f1(x - 5 * s)}" cy="${f1(y - 6 * s)}" rx="${f1(3 * s)}" ry="${f1(5 * s)}" fill="#fff" opacity=".45"/>`;
    }, shapes: 2, colors: P.pop
  },
  kite: {
    box: o => [o.x - 18 * o.s, o.y - 22 * o.s, o.x + 18 * o.s, o.y + 52 * o.s],
    draw: o => {
      const s = o.s, x = o.x, y = o.y, fl = o.flip ? -1 : 1;
      const tail = `<path d="M${f1(x)} ${f1(y + 22 * s)} q${f1(fl * 12 * s)} ${f1(10 * s)} 0 ${f1(18 * s)} q${f1(-fl * 12 * s)} ${f1(8 * s)} 0 ${f1(12 * s)}" fill="none" stroke="#6b6b6b" stroke-width="1.3"/>`
        + `<circle cx="${f1(x + fl * 5 * s)}" cy="${f1(y + 32 * s)}" r="${f1(2.6 * s)}" fill="${o.c2}"/><circle cx="${f1(x - fl * 4 * s)}" cy="${f1(y + 45 * s)}" r="${f1(2.6 * s)}" fill="${o.c2}"/>`;
      return `<g transform="rotate(${o.rot || 0} ${f1(x)} ${f1(y)})">${tail}<path d="M${f1(x)} ${f1(y - 22 * s)} L${f1(x + 16 * s)} ${f1(y)} L${f1(x)} ${f1(y + 22 * s)} L${f1(x - 16 * s)} ${f1(y)}Z" fill="${o.c}"/><path d="M${f1(x)} ${f1(y - 22 * s)} L${f1(x)} ${f1(y + 22 * s)} M${f1(x - 16 * s)} ${f1(y)} L${f1(x + 16 * s)} ${f1(y)}" stroke="#fff" stroke-width="1.2" opacity=".7"/></g>`;
    }, colors: P.pop, flips: true
  },
  house: {
    box: o => { const w = 56 * o.s, h = 44 * o.s; return [o.x - w / 2 - 4 * o.s, o.y - h - 30 * o.s, o.x + w / 2 + 4 * o.s, o.y + 3]; },
    parts: {
      roof: o => { const w = 56 * o.s, h = 44 * o.s; return [o.x - w / 2 - 4 * o.s, o.y - h - 30 * o.s, o.x + w / 2 + 4 * o.s, o.y - h + 2]; },
      wall: o => { const w = 56 * o.s, h = 44 * o.s; return [o.x - w / 2, o.y - h, o.x + w / 2, o.y]; },
      door: o => { const s = o.s; return [o.x - 8 * s, o.y - 24 * s, o.x + 8 * s, o.y]; }
    },
    draw: o => {
      const s = o.s, w = 56 * s, h = 44 * s, x = o.x, y = o.y;
      const win = (cx, cy) => o.shape
        ? `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(7 * s)}" fill="#BFE6FF" stroke="#fff" stroke-width="${f1(2 * s)}"/>`
        : `<rect x="${f1(cx - 7 * s)}" y="${f1(cy - 7 * s)}" width="${f1(14 * s)}" height="${f1(14 * s)}" fill="#BFE6FF" stroke="#fff" stroke-width="${f1(2 * s)}"/>`;
      return (o.shadow ? shadowOf(x, y, w) : '')
        + (o.chim ? `<rect x="${f1(x + w * .18)}" y="${f1(y - h - 26 * s)}" width="${f1(8 * s)}" height="${f1(18 * s)}" fill="${o.roof}"/>` : '')
        + `<rect x="${f1(x - w / 2)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h)}" fill="${o.wall}"/>`
        + `<path d="M${f1(x - w / 2 - 4 * s)} ${f1(y - h + 1)} L${f1(x)} ${f1(y - h - 30 * s)} L${f1(x + w / 2 + 4 * s)} ${f1(y - h + 1)}Z" fill="${o.roof}"/>`
        + `<rect x="${f1(x - 8 * s)}" y="${f1(y - 24 * s)}" width="${f1(16 * s)}" height="${f1(24 * s)}" rx="${f1(3 * s)}" fill="${o.door}"/>`
        + `<circle cx="${f1(x + 4 * s)}" cy="${f1(y - 12 * s)}" r="${f1(1.4 * s)}" fill="#fff"/>`
        + win(x - w * .3, y - h * .58) + win(x + w * .3, y - h * .58);
    }, shapes: 2
  },
  tree: {
    box: o => { const s = o.s * (o.big || 1); return [o.x - 22 * s, o.y - 64 * s, o.x + 22 * s, o.y + 3]; },
    draw: o => {
      const s = o.s * (o.big || 1), x = o.x, y = o.y;
      const crown = o.shape
        ? `<path d="M${f1(x)} ${f1(y - 64 * s)} L${f1(x + 16 * s)} ${f1(y - 38 * s)} L${f1(x + 10 * s)} ${f1(y - 38 * s)} L${f1(x + 21 * s)} ${f1(y - 18 * s)} L${f1(x - 21 * s)} ${f1(y - 18 * s)} L${f1(x - 10 * s)} ${f1(y - 38 * s)} L${f1(x - 16 * s)} ${f1(y - 38 * s)}Z" fill="${o.c}"/>`
        : `<circle cx="${f1(x)}" cy="${f1(y - 42 * s)}" r="${f1(20 * s)}" fill="${o.c}"/><circle cx="${f1(x - 7 * s)}" cy="${f1(y - 48 * s)}" r="${f1(6 * s)}" fill="#fff" opacity=".18"/>`;
      return (o.shadow ? shadowOf(x, y, 30 * s) : '') + `<rect x="${f1(x - 4 * s)}" y="${f1(y - 24 * s)}" width="${f1(8 * s)}" height="${f1(24 * s)}" rx="${f1(2 * s)}" fill="#9A6A45"/>` + crown;
    }, shapes: 2, colors: P.leaf
  },
  flower: {
    box: o => [o.x - 9 * o.s, o.y - 26 * o.s, o.x + 9 * o.s, o.y + 2],
    draw: o => {
      const s = o.s, x = o.x, y = o.y, cy = y - 20 * s;
      const head = o.shape
        ? `<path d="M${f1(x - 7 * s)} ${f1(cy - 6 * s)} L${f1(x - 3.5 * s)} ${f1(cy - 2 * s)} L${f1(x)} ${f1(cy - 7 * s)} L${f1(x + 3.5 * s)} ${f1(cy - 2 * s)} L${f1(x + 7 * s)} ${f1(cy - 6 * s)} L${f1(x + 6 * s)} ${f1(cy + 4 * s)} Q${f1(x)} ${f1(cy + 8 * s)} ${f1(x - 6 * s)} ${f1(cy + 4 * s)}Z" fill="${o.c}"/>`
        : [0, 1, 2, 3, 4].map(i => { const a = i / 5 * Math.PI * 2; return `<circle cx="${f1(x + Math.cos(a) * 5 * s)}" cy="${f1(cy + Math.sin(a) * 5 * s)}" r="${f1(3.6 * s)}" fill="${o.c}"/>`; }).join('') + `<circle cx="${f1(x)}" cy="${f1(cy)}" r="${f1(2.6 * s)}" fill="#FFD34E"/>`;
      return `<path d="M${f1(x)} ${f1(y)} V${f1(cy + 2 * s)}" stroke="#4FA466" stroke-width="${f1(1.8 * s)}"/><ellipse cx="${f1(x + 3 * s)}" cy="${f1(y - 7 * s)}" rx="${f1(3.5 * s)}" ry="${f1(1.6 * s)}" fill="#4FA466"/>` + head;
    }, shapes: 2, colors: P.bloom
  },
  pet: {   // 고양이(shape 0 · 뾰족 귀) · 강아지(shape 1 · 늘어진 귀)
    box: o => [o.x - 22 * o.s, o.y - 34 * o.s, o.x + 22 * o.s, o.y + 3],
    draw: o => {
      const s = o.s, x = o.x, y = o.y, f = o.flip ? -1 : 1;
      const hx = x + f * 12 * s, hy = y - 22 * s;
      const ears = o.shape
        ? `<ellipse cx="${f1(hx - 8 * s)}" cy="${f1(hy + 1 * s)}" rx="${f1(3.6 * s)}" ry="${f1(7 * s)}" fill="${o.c2}"/><ellipse cx="${f1(hx + 8 * s)}" cy="${f1(hy + 1 * s)}" rx="${f1(3.6 * s)}" ry="${f1(7 * s)}" fill="${o.c2}"/>`
        : `<path d="M${f1(hx - 9 * s)} ${f1(hy - 3 * s)} L${f1(hx - 6 * s)} ${f1(hy - 14 * s)} L${f1(hx - 1 * s)} ${f1(hy - 7 * s)}Z M${f1(hx + 9 * s)} ${f1(hy - 3 * s)} L${f1(hx + 6 * s)} ${f1(hy - 14 * s)} L${f1(hx + 1 * s)} ${f1(hy - 7 * s)}Z" fill="${o.c}"/>`;
      return (o.shadow ? shadowOf(x, y, 34 * s) : '')
        + `<path d="M${f1(x - f * 14 * s)} ${f1(y - 12 * s)} q${f1(-f * 12 * s)} ${f1(-6 * s)} ${f1(-f * 8 * s)} ${f1(-20 * s)}" fill="none" stroke="${o.c}" stroke-width="${f1(4 * s)}" stroke-linecap="round"/>`
        + `<ellipse cx="${f1(x)}" cy="${f1(y - 10 * s)}" rx="${f1(16 * s)}" ry="${f1(10 * s)}" fill="${o.c}"/>`
        + `<rect x="${f1(x - 11 * s)}" y="${f1(y - 6 * s)}" width="${f1(4 * s)}" height="${f1(6 * s)}" fill="${o.c}"/><rect x="${f1(x + 7 * s)}" y="${f1(y - 6 * s)}" width="${f1(4 * s)}" height="${f1(6 * s)}" fill="${o.c}"/>`
        + (o.shape ? '' : ears) + `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="${f1(10 * s)}" fill="${o.c}"/>` + (o.shape ? ears : '')
        + `<circle cx="${f1(hx - 3.5 * s)}" cy="${f1(hy - 1 * s)}" r="${f1(1.5 * s)}" fill="#222"/><circle cx="${f1(hx + 3.5 * s)}" cy="${f1(hy - 1 * s)}" r="${f1(1.5 * s)}" fill="#222"/>`
        + `<circle cx="${f1(hx + f * 1 * s)}" cy="${f1(hy + 3 * s)}" r="${f1(1.6 * s)}" fill="#E0707A"/>`;
    }, shapes: 2, flips: true, colors: P.fur
  },
  car: {
    box: o => [o.x - 30 * o.s, o.y - 26 * o.s, o.x + 30 * o.s, o.y + 3],
    draw: o => {
      const s = o.s, x = o.x, y = o.y, f = o.flip ? -1 : 1;
      return (o.shadow ? shadowOf(x, y, 52 * s) : '')
        + `<path d="M${f1(x - 28 * s)} ${f1(y - 6 * s)} V${f1(y - 14 * s)} Q${f1(x - 28 * s)} ${f1(y - 16 * s)} ${f1(x - 24 * s)} ${f1(y - 16 * s)} H${f1(x + 28 * s)} V${f1(y - 6 * s)}Z" fill="${o.c}"/>`
        + `<path d="M${f1(x - f * 16 * s)} ${f1(y - 16 * s)} L${f1(x - f * 9 * s)} ${f1(y - 26 * s)} H${f1(x + f * 10 * s)} L${f1(x + f * 18 * s)} ${f1(y - 16 * s)}Z" fill="${o.c}"/>`
        + `<path d="M${f1(x - f * 12 * s)} ${f1(y - 17 * s)} L${f1(x - f * 7.5 * s)} ${f1(y - 23.5 * s)} H${f1(x + f * 0.5 * s)} V${f1(y - 17 * s)}Z M${f1(x + f * 2.5 * s)} ${f1(y - 17 * s)} V${f1(y - 23.5 * s)} H${f1(x + f * 9 * s)} L${f1(x + f * 13.5 * s)} ${f1(y - 17 * s)}Z" fill="#DFF1FF"/>`
        + `<circle cx="${f1(x + f * 26 * s)}" cy="${f1(y - 12 * s)}" r="${f1(2 * s)}" fill="#FFE680"/>`
        + `<circle cx="${f1(x - 16 * s)}" cy="${f1(y - 5 * s)}" r="${f1(6 * s)}" fill="#333"/><circle cx="${f1(x + 16 * s)}" cy="${f1(y - 5 * s)}" r="${f1(6 * s)}" fill="#333"/>`
        + `<circle cx="${f1(x - 16 * s)}" cy="${f1(y - 5 * s)}" r="${f1(2.4 * s)}" fill="#ccc"/><circle cx="${f1(x + 16 * s)}" cy="${f1(y - 5 * s)}" r="${f1(2.4 * s)}" fill="#ccc"/>`;
    }, flips: true, colors: P.car
  },
  mailbox: {
    box: o => [o.x - 14 * o.s, o.y - 40 * o.s, o.x + 16 * o.s, o.y + 3],
    draw: o => {
      const s = o.s, x = o.x, y = o.y, f = o.flip ? -1 : 1;
      return (o.shadow ? shadowOf(x, y, 20 * s) : '')
        + `<rect x="${f1(x - 2.5 * s)}" y="${f1(y - 24 * s)}" width="${f1(5 * s)}" height="${f1(24 * s)}" fill="#9A6A45"/>`
        + `<path d="M${f1(x - 12 * s)} ${f1(y - 24 * s)} V${f1(y - 34 * s)} A${f1(12 * s)} ${f1(6 * s)} 0 0 1 ${f1(x + 12 * s)} ${f1(y - 34 * s)} V${f1(y - 24 * s)}Z" fill="${o.c}"/>`
        + `<rect x="${f1(x + f * 12 * s - (f < 0 ? 2 * s : 0))}" y="${f1(y - 40 * s)}" width="${f1(2 * s)}" height="${f1(12 * s)}" fill="#555"/><rect x="${f1(f > 0 ? x + 14 * s : x - 20 * s)}" y="${f1(y - 40 * s)}" width="${f1(6 * s)}" height="${f1(5 * s)}" fill="#FF5D6C"/>`;
    }, flips: true, colors: P.box
  }
};

/* ─────────── 그림 짓기 ─────────── */
const overlap = (a, b, pad = 0) => !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);
export const boxOf = o => T[o.type].box(o);

/** 씨앗 → 그림 { sky, ground, hills, objs } */
export function makeScene(seed){
  const r = rng(seed);
  const sunset = r() < 0.3;
  const sc = {
    sky: sunset ? ['#FFC98E', '#FFEBD2'] : pick(r, [['#A9DCFF', '#EAF7FF'], ['#BFD9FF', '#F2F8FF'], ['#B8ECEA', '#F0FBF7']]),
    ground: pick(r, [['#9BD27F', '#7CBF66'], ['#A8D98A', '#86C470'], ['#B5DE8A', '#92C96B']]),
    hills: [], path: r() < 0.6, objs: []
  };
  for (let i = 0; i < 3; i++) sc.hills.push({ x: 40 + i * 150 + r() * 60, w: 130 + r() * 90, h: 40 + r() * 35, c: pick(r, ['#8FC7A0', '#A5CFB0', '#9DB8D9', '#B7C9A5']) });
  const objs = sc.objs;
  const place = (type, n, xr, yr, extra, tries = 40) => {
    for (let k = 0; k < n; k++){
      for (let t = 0; t < tries; t++){
        const o = { type, x: xr[0] + r() * (xr[1] - xr[0]), y: yr[0] + r() * (yr[1] - yr[0]), s: 1, ...extra(r) };
        const b = boxOf(o);
        if (b[0] < 4 || b[2] > W - 4 || b[1] < 4 || b[3] > HH - 2) continue;
        if (objs.some(p => overlap(b, boxOf(p), 2))) continue;
        objs.push(o); break;
      }
    }
  };
  place('sun', 1, [40, 360], [32, 52], r => ({ s: 0.9 + r() * 0.3, c: '#FFC93C', shape: r() < 0.5 ? 1 : 0 }));
  place('cloud', 2 + Math.floor(r() * 2), [40, 360], [30, 95], r => ({ s: 0.8 + r() * 0.5, c: '#FFFFFF' }));
  place('bird', 2 + Math.floor(r() * 2), [30, 370], [30, 110], r => ({ s: 0.9 + r() * 0.4, c: '#3E4A5C' }));
  place('balloon', 1 + Math.floor(r() * 2), [30, 370], [50, 110], r => ({ s: 0.9 + r() * 0.3, c: pick(r, P.pop), shape: r() < 0.3 ? 1 : 0 }));
  place('kite', 1, [40, 360], [45, 95], r => ({ s: 0.9 + r() * 0.2, c: pick(r, P.pop), c2: pick(r, P.pop), rot: Math.round(-15 + r() * 30), flip: r() < 0.5 }));
  place('house', 2 + Math.floor(r() * 2), [45, 355], [190, 222], r => ({ s: 0.95 + r() * 0.25, wall: pick(r, P.wall), roof: pick(r, P.roof), door: pick(r, P.door), shape: r() < 0.4 ? 1 : 0, chim: r() < 0.5, shadow: true }));
  place('tree', 3 + Math.floor(r() * 2), [25, 375], [182, 270], r => ({ s: 0.85 + r() * 0.35, c: pick(r, P.leaf), shape: r() < 0.4 ? 1 : 0, shadow: true }));
  place('pet', 1 + Math.floor(r() * 2), [40, 360], [245, 290], r => ({ s: 0.95 + r() * 0.2, c: pick(r, P.fur), c2: pick(r, ['#8A5A3C', '#5a4a40', '#C98B5A']), shape: r() < 0.5 ? 1 : 0, flip: r() < 0.5, shadow: true }));
  place('car', 1, [50, 350], [262, 292], r => ({ s: 0.95 + r() * 0.15, c: pick(r, P.car), flip: r() < 0.5, shadow: true }));
  place('mailbox', 1, [30, 370], [225, 280], r => ({ s: 1, c: pick(r, P.box), flip: r() < 0.5, shadow: true }));
  place('flower', 5 + Math.floor(r() * 4), [16, 384], [232, 296], r => ({ s: 0.9 + r() * 0.4, c: pick(r, P.bloom), shape: r() < 0.3 ? 1 : 0 }));
  objs.forEach((o, i) => { o.id = i; });
  return sc;
}

const SKY_TYPES = new Set(['sun', 'cloud', 'bird', 'balloon', 'kite']);
/** 그림 → SVG 글 */
export function drawScene(sc, extra = ''){
  const [s0, s1] = sc.sky, [g0, g1] = sc.ground;
  let svg = `<svg viewBox="0 0 ${W} ${HH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`
    + `<defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s0}"/><stop offset="1" stop-color="${s1}"/></linearGradient>`
    + `<linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g0}"/><stop offset="1" stop-color="${g1}"/></linearGradient></defs>`
    + `<rect width="${W}" height="${HH}" fill="url(#sk)"/>`;
  const sky = sc.objs.filter(o => SKY_TYPES.has(o.type));
  const land = sc.objs.filter(o => !SKY_TYPES.has(o.type)).sort((a, b) => a.y - b.y);
  for (const o of sky.filter(o => o.type === 'sun' || o.type === 'cloud')) svg += T[o.type].draw(o);
  for (const h of sc.hills) svg += `<ellipse cx="${f1(h.x)}" cy="168" rx="${f1(h.w / 2)}" ry="${f1(h.h)}" fill="${h.c}"/>`;
  svg += `<rect y="162" width="${W}" height="${HH - 162}" fill="url(#gr)"/>`;
  if (sc.path) svg += `<path d="M150 300 C180 250 230 215 250 162 L262 162 C250 215 215 260 205 300Z" fill="#EBD9B4" opacity=".85"/>`;
  for (const o of sky.filter(o => o.type !== 'sun' && o.type !== 'cloud')) svg += T[o.type].draw(o);
  for (const o of land) svg += T[o.type].draw(o);
  return svg + extra + '</svg>';
}

/* ─────────── 틀린 곳 다섯 ─────────── */
const KINDS = ['color', 'shape', 'object', 'shadow', 'form'];
export const KIND_NAME = { color: '색상', shape: '모양', object: '사물', shadow: '그림자', form: '형태' };
const COLOR_KEY = { sun: 'c', cloud: 'c', bird: 'c', balloon: 'c', kite: 'c', tree: 'c', flower: 'c', pet: 'c', car: 'c', mailbox: 'c' };

/** 그 물건에 이 갈래의 바꿈이 되는가 — 되면 { apply(o), region } */
function tryKind(kind, o, sc, r){
  const t = T[o.type];
  const b0 = boxOf(o);
  if (kind === 'color'){
    if (o.type === 'house'){
      const part = pick(r, ['roof', 'wall', 'door']);
      const list = part === 'roof' ? P.roof : part === 'wall' ? P.wall : P.door;
      const c = far(list, o[part], r);
      return { apply: n => { n[part] = c; }, region: t.parts[part](o), note: part };
    }
    if (!COLOR_KEY[o.type] || o.type === 'cloud' || o.type === 'bird') return null;
    const list = t.colors || P.pop;
    const c = far(list, o.c, r);
    return { apply: n => { n.c = c; }, region: b0 };
  }
  if (kind === 'shape'){
    if (!t.shapes) return null;
    return { apply: n => { n.shape = n.shape ? 0 : 1; }, region: o.type === 'house' ? t.parts.wall(o) : o.type === 'sun' ? T.sun.box({ ...o, shape: 1 }) : b0 };
  }
  if (kind === 'shadow'){
    if (!o.shadow) return null;
    const w = { house: 56, tree: 30, pet: 34, car: 52, mailbox: 20 }[o.type] * o.s * (o.big || 1);
    return { apply: n => { n.shadow = false; }, region: [o.x - w * .4, o.y - 10, o.x + w * .8, o.y + 8] };
  }
  if (kind === 'form'){
    if (t.flips && r() < 0.6) return { apply: n => { n.flip = !n.flip; }, region: b0 };
    if (o.type === 'kite') return { apply: n => { n.rot = (n.rot || 0) + (n.rot > 0 ? -35 : 35); }, region: [b0[0] - 14, b0[1] - 6, b0[2] + 14, b0[3]] };
    if (o.type === 'tree' || o.type === 'balloon' || o.type === 'house' || o.type === 'cloud'){
      const k = 1.4;
      if (o.type === 'tree'){ const n = { ...o, big: k }; const b1 = boxOf(n); if (b1[1] < 4) return null; return { apply: m => { m.big = k; }, region: [Math.min(b0[0], b1[0]), b1[1], Math.max(b0[2], b1[2]), b0[3]] }; }
      const n = { ...o, s: o.s * k }; const b1 = boxOf(n);
      if (b1[0] < 2 || b1[2] > W - 2 || b1[1] < 2) return null;
      return { apply: m => { m.s = o.s * k; }, region: [Math.min(b0[0], b1[0]), Math.min(b0[1], b1[1]), Math.max(b0[2], b1[2]), Math.max(b0[3], b1[3])] };
    }
    return null;
  }
  if (kind === 'object'){
    // 없어지는 물건 — 작고 따로 있는 것
    if (['bird', 'flower', 'balloon', 'mailbox', 'cloud', 'pet', 'kite'].includes(o.type)) return { apply: 'remove', region: b0 };
    return null;
  }
  return null;
}

/**
 * 틀린 곳 다섯 — [{ kind, id, region:[x0,y0,x1,y1] }] 와 바뀐 그림.
 * 갈래마다 하나씩 (안 되면 다른 갈래로 채운다), 자리는 서로 겹치지 않게.
 */
export function makeDiffs(seed){
  const sc = makeScene(seed);
  const r = rng(seed ^ 0x9E3779B9);
  const order = KINDS.slice();
  for (let i = order.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const used = new Set(), diffs = [], regions = [];
  const want = [...order, ...order];   // 모자라면 한 바퀴 더
  for (const kind of want){
    if (diffs.length >= 5) break;
    const cands = sc.objs.filter(o => !used.has(o.id));
    for (let i = cands.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    if (kind === 'form') cands.sort((a, b) => (a.type === 'cloud') - (b.type === 'cloud'));   // 구름 키우기는 마지막에
    for (const o of cands){
      const sameType = diffs.filter(d => sc.objs.find(q => q.id === d.id).type === o.type).length;
      if (sameType >= (o.type === 'flower' ? 1 : 2)) continue;          // 한 종류에 몰리지 않게 (꽃은 작아서 하나만)
      const k = tryKind(kind, o, sc, r);
      if (!k) continue;
      const reg = k.region;
      if (regions.some(q => overlap(reg, q, 8))) continue;
      used.add(o.id); regions.push(reg);
      diffs.push({ kind, id: o.id, region: reg.map(f1), apply: k.apply });
      break;
    }
  }
  // 물건 하나 더하기 — '사물' 이 없어지는 것으로 못 나왔으면 꽃이나 새를 빈자리에 더한다
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
    let [x0, y0, x1, y1] = d.region;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = Math.max((x1 - x0) / 2 + pad, 17), hh = Math.max((y1 - y0) / 2 + pad, 17);
    if (Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh){
      const dd = Math.hypot(x - cx, y - cy);
      if (dd < bd){ bd = dd; best = i; }
    }
  });
  return best;
}
