/*
 * Tower 13 — 판의 규칙만 담는다 (화면 · 접속과 따로). 방장이 이것으로 판을 돌리고,
 * 모두가 같은 결과를 그린다. 노드에서 바로 돌려 볼 수 있다.
 *
 *   각자 숫자 카드 0~6 일곱 장과 칩 일곱 개(빨강 · 초록 · 파랑 둘씩, 무지개 하나).
 *   한 판은 세 단계다 (사용자가 정함):
 *     1. 고르기  — 판이 시작하면 **모두가 동시에** 이번 판의 박스(카드 한 장 + 칩 하나,
 *                  무지개면 올릴 색까지)를 몰래 고른다. 다 고르면 다음으로.
 *     2. 차례    — 정해진 순서대로 한 사람씩 **올리기 확정** 또는 **패스**. 이때는 박스를
 *                  공개하지 않는다 — 모두 정하기 전까지 남은 내가 무엇을 골랐는지 모른다.
 *     3. 공개    — 모두 정하면 확정한 박스를 **순서대로** 공개하며 쌓고, 이어서 패스한
 *                  박스를 **역순으로**(마지막에 패스한 사람부터 처음 패스한 사람까지)
 *                  쌓는다. 하나씩 차례로 (`queue`).
 *   박스를 올린 뒤 그 탑이 13 이상이면, 그 박스의 주인이 탑의 박스를 **방금 것까지
 *   전부** 가져오고 하나에 −1점. 탑은 빈다. 일곱 판이면 끝, 점수가 높을수록 위.
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
  return { g, seq: 0, order, names: { ...names }, draw: Object.fromEntries(pairs),
           round: 1, step: 'choose', turn: 0, picks: {}, done: {}, puts: [], passed: [], queue: [],
           zones: { r: [], g: [], b: [] }, scores, took, used, last: null, over: false };
}

/* ── 1. 고르기 ── */
export function canChoose(s, id, card, chip, zone){
  if (!s || s.over || s.step !== 'choose' || !s.order.includes(id) || s.picks[id]) return false;
  const u = s.used[id];
  return CARDS.includes(card) && chip >= 0 && chip < CHIPS.length &&
         !u.c.includes(card) && !u.h.includes(chip) && canPut(chip, zone);
}
export function choose(s, id, card, chip, zone){
  const n = structuredClone(s);
  n.picks[id] = { card, chip, zone };
  n.seq++;
  if (n.order.every(p => n.picks[p])){ n.step = 'turn'; n.turn = 0; }
  return n;
}

/* ── 2. 차례 ── */
export const turnOf = s => (s && !s.over && s.step === 'turn' ? s.order[s.turn] : null);
export function act(s, id, what){
  const n = structuredClone(s);
  const pass = what === 'pass';
  (pass ? n.passed : n.puts).push(id);
  n.done[id] = pass ? 'pass' : 'put';
  n.last = { id, decide: pass ? 'pass' : 'put', round: n.round };   // 박스는 아직 숨긴 채
  n.seq++;
  n.turn++;
  if (n.turn >= n.order.length){
    n.step = 'resolve';
    // 확정한 박스는 순서대로, 그다음 패스한 박스는 마지막에 패스한 사람부터
    n.queue = [...n.puts, ...n.passed.slice().reverse()];
    if (!n.queue.length) endRound(n);
  }
  return n;
}

/* ── 3. 공개 — 한 번에 하나씩 (보는 사람이 따라갈 수 있게) ── */
export function resolveStep(s){
  const n = structuredClone(s);
  const id = n.queue.shift();
  if (id){ place(n, id); n.last.how = n.done[id]; }
  n.seq++;
  if (!n.queue.length) endRound(n);
  return n;
}

/* 고른 박스를 탑에 올린다 — 13 이상이면 주인이 전부 가져온다 */
function place(n, id){
  const { card, chip, zone } = n.picks[id];
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
}
function endRound(n){
  n.round++;
  n.picks = {}; n.done = {}; n.puts = []; n.passed = []; n.queue = [];
  n.turn = 0; n.step = 'choose';
  if (n.round > ROUNDS){ n.over = true; n.round = ROUNDS; n.step = 'over'; }
}

/** 시간이 다 됐거나 나간 사람 — 덜 위험한 박스를 대신 고른다. */
export function autoPick(s, id){
  const u = s.used[id];
  const cards = CARDS.filter(c => !u.c.includes(c));
  const chips = CHIPS.map((_, i) => i).filter(i => !u.h.includes(i));
  let best = null;
  for (const card of cards) for (const chip of chips) for (const zone of ZONES){
    if (!canPut(chip, zone)) continue;
    const after = sumOf(s.zones[zone]) + card;
    const risk = after >= LIMIT ? 100 + s.zones[zone].length : after;
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
