/*
 * 틀린그림찾기 — 판의 규칙만 담는다 (화면 · 접속과 따로). 방장이 이것으로 판을 돌린다.
 *
 * 규칙 (사용자가 정함)
 *   - 한 라운드: 그림을 **3분** 동안 본다(look) → 그림이 사라지고 바뀐 그림이 나온다 →
 *     **1분** 안에 틀린 곳 **다섯**을 눌러 찾는다(find). 한 곳에 **1점**.
 *   - 틀린 곳은 색상 · 모양 · 사물 · 그림자 · 형태 (scene.js 의 makeDiffs).
 *   - 그림 테마는 산 · 바다 · 정원 · 들판 · 연못 · 하늘 · 물속 — 한 게임 안에서 겹치지 않게 (themedSeeds).
 *   - 라운드는 3 · 5 · 7 중 방장이 시작 전에 고른다. 라운드가 끝날 때마다 모두의 점수를 본다(res).
 *
 * 상태 (방장이 통째로 보낸다)
 *   { g, seq, order, names, rounds, r(지금 라운드, 0부터), seeds:[라운드마다 씨앗], phase:'look'|'find'|'res'|'over',
 *     scores:{id:합}, found:{id:[찾은 틀린 곳 번호]}, history:[{id:그 라운드 점수}], over }
 */
export const LOOK_MS = 180 * 1000;     // 그림을 보는 시간
export const FIND_MS = 60 * 1000;      // 찾는 시간
export const RES_MS = 10 * 1000;       // 라운드 점수를 보고 다음 라운드까지
export const ROUND_CHOICES = [3, 5, 7];
export const MAX_SEATS = 8;
export const SPOTS = 5;

const rand32 = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };
export const THEME_COUNT = 7;            // scene.js 의 THEMES — 테마는 '씨앗 % 7'
/** 라운드마다 씨앗 — 테마가 한 게임 안에서 겹치지 않게 (일곱 라운드면 일곱 테마 모두) */
function themedSeeds(n){
  const th = Array.from({ length: THEME_COUNT }, (_, i) => i);
  for (let i = th.length - 1; i > 0; i--){ const j = rand32() % (i + 1); [th[i], th[j]] = [th[j], th[i]]; }
  return Array.from({ length: n }, (_, k) => { const b = rand32() >>> 1; return b - (b % THEME_COUNT) + th[k % THEME_COUNT] + THEME_COUNT; });
}

export function newGame(g, ids, names, { rounds }){
  rounds = ROUND_CHOICES.includes(rounds) ? rounds : 3;
  const scores = {}, found = {};
  for (const id of ids){ scores[id] = 0; found[id] = []; }
  return { g, seq: 0, order: ids.slice(), names: { ...names }, rounds, r: 0,
           seeds: themedSeeds(rounds), phase: 'look', scores, found, history: [], over: false };
}

/** 찾은 곳 더하기 — 찾는 동안만, 번호는 0~4 */
export function addFound(s, id, list){
  if (s.phase !== 'find' || !s.order.includes(id)) return s;
  const cur = new Set(s.found[id] || []);
  const before = cur.size;
  for (const i of list || []) if (Number.isInteger(i) && i >= 0 && i < SPOTS) cur.add(i);
  if (cur.size === before) return s;
  const n = structuredClone(s);
  n.found[id] = [...cur].sort();
  n.seq++;
  return n;
}
/** 보기 → 찾기 */
export function toFind(s){
  const n = structuredClone(s);
  n.phase = 'find'; n.seq++;
  for (const id of n.order) n.found[id] = [];
  return n;
}
/** 찾기 끝 → 라운드 점수 */
export function toRes(s){
  const n = structuredClone(s);
  const got = {};
  for (const id of n.order){ got[id] = (n.found[id] || []).length; n.scores[id] += got[id]; }
  n.history.push(got);
  n.phase = 'res'; n.seq++;
  return n;
}
/** 다음 라운드 — 마지막이었으면 끝 */
export function nextRound(s){
  const n = structuredClone(s);
  n.seq++;
  if (n.r + 1 >= n.rounds){ n.over = true; n.phase = 'over'; return n; }
  n.r++; n.phase = 'look';
  for (const id of n.order) n.found[id] = [];
  return n;
}
/** 다 찾았나 — 남아 있는 사람이 모두 다섯을 찾으면 일찍 끝낸다 */
export const allDone = (s, alive) => alive.length > 0 && alive.every(id => (s.found[id] || []).length >= SPOTS);

export function ranking(s){
  const rows = s.order.map(id => ({ id, score: s.scores[id] }))
    .sort((a, b) => b.score - a.score);
  let rank = 0, prev = null;
  rows.forEach((r, i) => { if (r.score !== prev){ rank = i + 1; prev = r.score; } r.rank = rank; });
  return rows;
}
