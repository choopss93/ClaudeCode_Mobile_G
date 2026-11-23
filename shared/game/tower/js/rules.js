/*
 * Tower 13 — 판의 규칙만 담는다 (화면 · 접속과 따로). 방장이 이것으로 판을 돌리고,
 * 모두가 같은 결과를 그린다.
 *
 *   각자 숫자 카드 0~6 일곱 장과 칩 일곱 개(빨강 · 초록 · 파랑 둘씩, 무지개 하나).
 *   차례가 되면 카드 한 장 + 칩 하나를 내서 그 색 구역에 박스(카드의 숫자)를 올린다.
 *   무지개 칩은 아무 색에나. 올린 뒤 그 구역의 합이 13 이상이면, 올린 사람이
 *   그 구역의 박스를 **방금 올린 것까지 전부** 가져가고 박스 하나에 −1점. 구역은 빈다.
 *   모두 한 번씩 올리면 한 판, 일곱 판이면 끝. 점수가 높을수록 위.
 */
export const ROUNDS = 7;
export const LIMIT = 13;
export const CARDS = [0, 1, 2, 3, 4, 5, 6];
export const CHIPS = ['r', 'r', 'g', 'g', 'b', 'b', 'w'];   // w = 무지개 (아무 색에나)
export const ZONES = ['r', 'g', 'b'];
export const ZONE_NAME = { r: '빨강', g: '초록', b: '파랑', w: '무지개' };
export const MAX_SEATS = 8;

export const sumOf = boxes => boxes.reduce((s, b) => s + b[0], 0);
export const canPut = (chip, zone) => ZONES.includes(zone) && (CHIPS[chip] === 'w' || CHIPS[chip] === zone);

function shuffle(a){
  const r = new Uint32Array(a.length);
  crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--){ const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 새 게임 — 순서는 카드를 한 장씩 뽑아 정한다 (작은 수부터). */
export function newGame(g, ids, names){
  const draw = shuffle(ids.map((_, i) => i + 1));
  const pairs = ids.map((id, i) => [id, draw[i]]).sort((a, b) => a[1] - b[1]);
  const order = pairs.map(p => p[0]);
  const used = {}, scores = {}, took = {};
  for (const id of order){ used[id] = { c: [], h: [] }; scores[id] = 0; took[id] = 0; }
  return { g, seq: 0, order, names: { ...names }, draw: Object.fromEntries(pairs), round: 1, turn: 0,
           zones: { r: [], g: [], b: [] }, scores, took, used, last: null, over: false };
}

/** 그 사람이 지금 이 수를 둘 수 있는가. */
export function legal(s, id, card, chip, zone){
  if (!s || s.over || s.order[s.turn] !== id) return false;
  const u = s.used[id];
  return CARDS.includes(card) && chip >= 0 && chip < CHIPS.length &&
         !u.c.includes(card) && !u.h.includes(chip) && canPut(chip, zone);
}

/** 수를 둔다 — 새 판 상태를 돌려준다 (원래 것은 건드리지 않는다). */
export function play(s, id, card, chip, zone){
  const n = structuredClone(s);
  n.zones[zone].push([card, id]);
  n.used[id].c.push(card);
  n.used[id].h.push(chip);
  const sum = sumOf(n.zones[zone]);
  let boom = 0;
  if (sum >= LIMIT){
    boom = n.zones[zone].length;          // 방금 올린 것까지 전부
    n.scores[id] -= boom;
    n.took[id] += boom;
    n.zones[zone] = [];
  }
  n.last = { id, card, chip: CHIPS[chip], zone, sum, boom, round: n.round };
  n.seq++;
  n.turn++;
  if (n.turn >= n.order.length){ n.turn = 0; n.round++; }
  if (n.round > ROUNDS){ n.over = true; n.round = ROUNDS; n.turn = 0; }
  return n;
}

/** 시간이 다 됐거나 나간 사람의 차례 — 아무거나 하나 둔다 (덜 위험한 쪽으로). */
export function autoMove(s, id){
  const u = s.used[id];
  const cards = CARDS.filter(c => !u.c.includes(c));
  const chips = CHIPS.map((_, i) => i).filter(i => !u.h.includes(i));
  let best = null;
  for (const card of cards) for (const chip of chips) for (const zone of ZONES){
    if (!canPut(chip, zone)) continue;
    const after = sumOf(s.zones[zone]) + card;
    const risk = after >= LIMIT ? 100 + s.zones[zone].length : after;   // 터지지 않는 쪽 · 낮게 쌓는 쪽
    if (!best || risk < best.risk) best = { card, chip, zone, risk };
  }
  return best;
}

/** 순위 — 점수 높은 순, 같으면 같은 등수. */
export function ranking(s){
  const rows = s.order.map(id => ({ id, score: s.scores[id], took: s.took[id] }))
    .sort((a, b) => b.score - a.score);
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.score !== prev){ rank = i + 1; prev = r.score; } r.rank = rank; });
  return rows;
}
