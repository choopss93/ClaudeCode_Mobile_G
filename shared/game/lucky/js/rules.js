/*
 * Lucky 주사위 — 판의 규칙만 담는다 (화면 · 접속과 따로). 방장이 이것으로 판을 돌리고 모두가 같은 상태를 그린다.
 * 노드에서 바로 돌려 볼 수 있다.
 *
 * 규칙 (사용자가 정함 — 주사위 넷으로 길을 오르는 '한 번만 더' 게임. 이름 · 화면은 새로 지었다)
 *   - 길은 2~12 열한 줄. 길이는 3 · 5 · 7 · 9 · 11 · 13 · 11 · 9 · 7 · 5 · 3 칸.
 *   - 내 차례: 주사위 넷을 굴려 둘씩 짝지은 합 두 개 → 그 길에 **임시 말**을 한 칸씩 올린다.
 *     굴리고 또 굴릴 수 있다. **멈추면** 임시 말 자리가 내 자리로 굳는다.
 *     어떻게 짝지어도 올릴 길이 없으면 **꽝** — 이번 차례에 오른 것을 모두 잃는다.
 *   - 길 꼭대기에 닿은 채로 멈추면 그 길은 내 것. 다른 사람의 말은 그 길에서 치워지고 더는 못 쓴다.
 *   - 길 수 · 임시 말: **4명까지 3 · 3, 5명부터 2 · 2. 팀전은 언제나 3 · 3** (사용자 요청).
 *   - 팀전(짝수 · 넷 이상, 둘씩 한 팀): 말은 각자 따로 오르고, 팀원이 차지한 길을 **합쳐** 센다.
 *
 * 상태 (방장이 통째로 보낸다)
 *   { g, seq, order:[id] (차례), names, teams:[[id,id]…]|null, win, maxTemp,
 *     pos:{id:{길:칸}}, owner:{길:id}, turn, phase:'roll'|'pick'|'bust'|'over',
 *     dice:[4]|null, temp:{길:칸}, rolls, last, over, winner(편) }
 */
export const COLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const H = { 2: 3, 3: 5, 4: 7, 5: 9, 6: 11, 7: 13, 8: 11, 9: 9, 10: 7, 11: 5, 12: 3 };
export const MAX_SEATS = 8;
export const BUST_MS = 2000;            // 꽝을 모두가 보고 넘어가기까지

/** 길 수 · 임시 말 — 4명까지 3 · 3, 5명부터 2 · 2, 팀전은 언제나 3 · 3 */
export function limitsFor(n, team){
  if (team || n <= 4) return { win: 3, maxTemp: 3 };
  return { win: 2, maxTemp: 2 };
}
/** 팀전을 할 수 있는 인원 — 짝수이고 넷 이상 */
export const teamable = n => n >= 4 && n % 2 === 0;

const rnd = n => { const r = new Uint32Array(1); crypto.getRandomValues(r); return r[0] % n; };
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * 새 게임. seats = 자리 차례(들어온 순서). 팀전이면 자리 차례로 둘씩 짝짓고(1·2, 3·4 …),
 * 차례는 팀이 번갈아 오도록 엮는다 (A1 B1 C1 … A2 B2 C2 …). 팀 순서 · 팀 안 순서는 섞는다.
 */
export function newGame(g, seats, names, { team } = {}){
  const n = seats.length;
  team = !!team && teamable(n);
  let order, teams = null;
  if (team){
    teams = [];
    for (let i = 0; i < n; i += 2) teams.push(shuffle([seats[i], seats[i + 1]]));
    const ts = shuffle(teams.slice());
    order = [...ts.map(t => t[0]), ...ts.map(t => t[1])];
  } else order = shuffle(seats.slice());
  const pos = {};
  for (const id of order) pos[id] = {};
  return { g, seq: 0, order, names: { ...names }, teams, ...limitsFor(n, team),
           pos, owner: {}, turn: 0, phase: 'roll', dice: null, temp: {}, rolls: 0, last: null, over: false, winner: null };
}

export const current = s => s.order[s.turn];
/** 편 — 팀전이면 팀 번호, 아니면 그 사람 */
export const sideOf = (s, id) => (s.teams ? s.teams.findIndex(t => t.includes(id)) : id);
export const sides = s => (s.teams ? s.teams.map((t, i) => i) : s.order.slice());
export const membersOf = (s, side) => (s.teams ? s.teams[side] : [side]);
/** 그 편이 차지한 길 */
export const claimedBy = (s, side) => COLS.filter(c => s.owner[c] != null && sideOf(s, s.owner[c]) === side);

/* 임시 말 하나 올리기 — 되면 true (temp 를 고친다) */
function step(s, id, temp, c){
  if (s.owner[c] != null) return false;
  if (c in temp){
    if (temp[c] >= H[c]) return false;
    temp[c]++;
    return true;
  }
  if (Object.keys(temp).length >= s.maxTemp) return false;
  const cur = (s.pos[id] && s.pos[id][c]) || 0;
  if (cur >= H[c]) return false;
  temp[c] = cur + 1;
  return true;
}

/**
 * 주사위 넷으로 고를 수 있는 길 — [[a,b] 또는 [a]] (중복 없이).
 * 짝지은 두 합을 다 쓸 수 있으면 둘 다 써야 하고, 하나만 되면 하나 (둘 다 새 길인데 임시 말이 하나 남았으면
 * 어느 쪽인지 고른다).
 */
export function options(s, dice, id = current(s), temp = s.temp){
  const [a, b, c, d] = dice;
  const pairs = [[a + b, c + d], [a + c, b + d], [a + d, b + c]];
  const out = [], seen = new Set();
  const add = o => { const k = o.slice().sort((x, y) => x - y).join('+'); if (!seen.has(k)){ seen.add(k); out.push(o.slice().sort((x, y) => x - y)); } };
  for (const [x, y] of pairs){
    const t = { ...temp };
    if (step(s, id, t, x) && step(s, id, t, y)){ add([x, y]); continue; }
    if (step(s, id, { ...temp }, x)) add([x]);
    if (step(s, id, { ...temp }, y)) add([y]);
  }
  return out;
}
const DICE_ALL = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) for (let d = 1; d <= 6; d++) DICE_ALL.push([a, b, c, d]);
/** 지금 굴리면 꽝일 확률 (봇이 쓴다 · 화면에도 보일 수 있다) */
export function bustChance(s, id = current(s), temp = s.temp){
  let bad = 0;
  for (const d of DICE_ALL) if (!options(s, d, id, temp).length) bad++;
  return bad / DICE_ALL.length;
}

/** 굴리기 — 고를 길이 없으면 꽝 */
export function roll(s, dice){
  const n = structuredClone(s);
  n.seq++; n.rolls++;
  n.dice = dice;
  if (!options(n, dice).length){
    n.phase = 'bust';
    n.last = { bust: true, id: current(n), dice, lost: Object.keys(n.temp).length };
  } else n.phase = 'pick';
  return n;
}
/** 고르기 — options 의 i 번째 */
export function pick(s, i){
  const opts = options(s, s.dice);
  const o = opts[i];
  if (!o) return s;
  const n = structuredClone(s);
  n.seq++;
  for (const c of o) step(n, current(n), n.temp, c);
  n.phase = 'roll';
  n.last = { pick: o, id: current(n) };
  return n;
}
function nextTurn(n){
  n.temp = {}; n.dice = null; n.rolls = 0; n.phase = 'roll';
  n.turn = (n.turn + 1) % n.order.length;
}
/** 꽝을 보여 준 뒤 — 다음 사람 */
export function afterBust(s){
  const n = structuredClone(s);
  n.seq++;
  nextTurn(n);
  return n;
}
/** 멈춤 — 임시 말을 굳히고, 꼭대기에 닿은 길은 차지한다. 이기면 끝 */
export function stop(s){
  const n = structuredClone(s);
  const id = current(n);
  n.seq++;
  const got = [];
  for (const [k, v] of Object.entries(n.temp)){
    const c = +k;
    n.pos[id][c] = v;
    if (v >= H[c]){
      n.owner[c] = id; got.push(c);
      for (const p of n.order) if (p !== id) delete n.pos[p][c];
    }
  }
  n.last = { stop: true, id, got, moved: Object.keys(n.temp).map(Number) };
  const side = sideOf(n, id);
  if (claimedBy(n, side).length >= n.win){
    n.over = true; n.phase = 'over'; n.winner = side; n.temp = {}; n.dice = null;
    return n;
  }
  nextTurn(n);
  return n;
}
/** 차례 넘기기 (나간 사람) — 멈춘 것과 같지만 아무것도 굳히지 않는다 */
export function skip(s){
  const n = structuredClone(s);
  n.seq++;
  n.last = { skip: true, id: current(n) };
  nextTurn(n);
  return n;
}

/** 편마다 얼마나 올랐나 — 차지한 길 수, 그다음 오른 비율의 합 */
export function progressOf(s, side){
  let p = 0;
  for (const id of membersOf(s, side)) for (const [c, v] of Object.entries(s.pos[id] || {})) if (s.owner[c] == null) p += v / H[c];
  return p;
}
export function ranking(s){
  const rows = sides(s).map(side => ({ side, cols: claimedBy(s, side).length, prog: progressOf(s, side) }))
    .sort((a, b) => (a.side === s.winner ? -1 : b.side === s.winner ? 1 : 0) || b.cols - a.cols || b.prog - a.prog);
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const k = r.side === s.winner ? 'W' : `${r.cols}|${r.prog.toFixed(3)}`; if (k !== prev){ rank = i + 1; prev = k; } r.rank = rank; });
  return rows;
}

/* ─────────── META BOT ─────────── */
/** 봇이 고르는 길 — 짧은 길 · 이미 임시 말이 있는 길 · 꼭대기에 가까워지는 쪽 */
export function botPick(s){
  const opts = options(s, s.dice);
  const id = current(s);
  let best = 0, bestV = -1e9;
  opts.forEach((o, i) => {
    let v = 0;
    const t = { ...s.temp };
    for (const c of o){
      const had = c in t;
      step(s, id, t, c);
      v += 10 / H[c] + (had ? 1.5 : -0.6) + (t[c] >= H[c] ? 4 : 0) + t[c] / H[c];
    }
    v += o.length * 1.2 + Math.random() * 0.6;
    if (v > bestV){ bestV = v; best = i; }
  });
  return best;
}
/** 봇이 멈출까 — 꼭대기에 닿았거나, 임시 말을 다 썼고 꽝이 잦거나 많이 올랐으면 */
export function botStops(s){
  const id = current(s);
  const used = Object.keys(s.temp);
  if (!used.length) return false;
  if (used.some(c => s.temp[c] >= H[c])) return true;
  let gain = 0;
  for (const c of used) gain += (s.temp[c] - ((s.pos[id] && s.pos[id][c]) || 0)) / H[c];
  if (used.length < s.maxTemp) return gain > 1.1 && Math.random() < 0.5;
  const p = bustChance(s);
  return p > 0.3 || gain > 0.9 - p || (p > 0.15 && gain > 0.45 && Math.random() < 0.6);
}
