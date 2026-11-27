/*
 * Pass the Wall — 판의 규칙만 담는다 (화면 · 접속과 따로). 방장이 이것으로 판을 돌린다. 노드에서 바로 돌려 볼 수 있다.
 *
 * 규칙 (사용자가 정함 — 벽으로 길을 막는 길찾기 게임. 원작이 파는 상품이라 이름 · 화면은 새로 지었다)
 *   - 내 말을 **맞은편 변**까지 먼저 보내면 이긴다. 차례마다 **말 한 칸 이동** 또는 **벽 하나 놓기**.
 *   - 말은 상하좌우 한 칸. 바로 앞에 말이 있으면 뛰어넘고, 그 뒤가 막혔으면 그 말의 옆(대각선)으로.
 *   - 벽은 두 칸 길이. **누구의 길도 완전히 막으면 안 된다** — 모든 말에게 목표까지 길이 하나는 남아야 한다.
 *   - 판 · 자리 · 벽: 2명 9×9 (위 · 아래, 벽 10개) · 3~4명 9×9 (네 변, 5개) · 5~8명 13×13 (네 변에 둘씩, 3개).
 *   - **팀전** (사용자 요청) — 2명씩만, 짝수 · 4명부터. 팀원 중 한 명만 도착해도 그 팀이 이긴다.
 *     13×13 에서는 같은 변의 둘이, 9×9 넷이면 마주 보는 둘이 한 팀.
 *   - 시간: **5명 이상은 차례당 1분**, 그 아래는 제한 없음 (사용자 요청). 지나면 가장 짧은 길로 한 칸.
 *
 * 상태 (방장이 통째로 보낸다)
 *   { g, seq, size, order:[id](차례), names, teams:[[id,id]…]|null, side:{id:'S'|'N'|'W'|'E'}, pos:{id:[r,c]},
 *     walls:[[r,c,'h'|'v']], left:{id:벽 남은 수}, turn, limit(ms|0), last, over, winner(id 또는 팀 번호) }
 *
 * 벽 [r,c,'h'] 은 r 행과 r+1 행 사이, c · c+1 열을 막는다. [r,c,'v'] 는 c 열과 c+1 열 사이, r · r+1 행을 막는다.
 */
export const MAX_SEATS = 8;
export const TURN_MS = 60 * 1000;
export const SIDE_NAME = { S: '아래', N: '위', W: '왼쪽', E: '오른쪽' };

const rnd = n => { const r = new Uint32Array(1); crypto.getRandomValues(r); return r[0] % n; };
function shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** 인원에 따른 판 — 크기 · 자리(차례대로 채운다) · 팀 짝 자리 · 벽 수 */
export function layoutFor(n){
  if (n <= 4){
    const S = { side: 'S', r: 8, c: 4 }, N = { side: 'N', r: 0, c: 4 }, Wd = { side: 'W', r: 4, c: 0 }, E = { side: 'E', r: 4, c: 8 };
    return { size: 9, slots: n <= 2 ? [S, N] : [S, N, Wd, E], pairs: [[S, N], [Wd, E]], walls: n <= 2 ? 10 : 5 };
  }
  const s = (side, r, c) => ({ side, r, c });
  const Sa = s('S', 12, 4), Sb = s('S', 12, 8), Na = s('N', 0, 4), Nb = s('N', 0, 8), Wa = s('W', 4, 0), Wb = s('W', 8, 0), Ea = s('E', 4, 12), Eb = s('E', 8, 12);
  return { size: 13, slots: [Sa, Na, Wa, Ea, Sb, Nb, Wb, Eb], pairs: [[Sa, Sb], [Na, Nb], [Wa, Wb], [Ea, Eb]], walls: 3 };
}
export const teamable = n => n >= 4 && n % 2 === 0;

/** 새 게임. 팀은 들어온 순서대로 둘씩 (1·2, 3·4 …), 차례는 팀이 번갈아 오게 엮는다 */
export function newGame(g, seats, names, { team } = {}){
  const n = seats.length;
  team = !!team && teamable(n);
  const L = layoutFor(n);
  const side = {}, pos = {}, left = {};
  let order, teams = null;
  if (team){
    teams = [];
    for (let i = 0; i < n; i += 2) teams.push([seats[i], seats[i + 1]]);
    teams.forEach((t, i) => t.forEach((id, k) => { const sl = L.pairs[i][k]; side[id] = sl.side; pos[id] = [sl.r, sl.c]; }));
    const ts = shuffle(teams.map((t, i) => i));
    order = [...ts.map(i => teams[i][0]), ...ts.map(i => teams[i][1])];
  } else {
    order = shuffle(seats.slice());
    order.forEach((id, i) => { const sl = L.slots[i]; side[id] = sl.side; pos[id] = [sl.r, sl.c]; });
  }
  for (const id of order) left[id] = L.walls;
  return { g, seq: 0, size: L.size, order, names: { ...names }, teams, side, pos, walls: [], left, turn: 0,
           limit: n >= 5 ? TURN_MS : 0, last: null, over: false, winner: null };
}

export const current = s => s.order[s.turn];
export const teamOf = (s, id) => (s.teams ? s.teams.findIndex(t => t.includes(id)) : -1);
export const sideKey = (s, id) => (s.teams ? teamOf(s, id) : id);
export const atGoal = (side, r, c, n) => (side === 'S' ? r === 0 : side === 'N' ? r === n - 1 : side === 'W' ? c === n - 1 : c === 0);

/* 막힌 길 모음 — "r,c>r2,c2" 꼴 (두 방향 다) */
function edges(walls){
  const E = new Set();
  const add = (a, b, c, d) => { E.add(`${a},${b}>${c},${d}`); E.add(`${c},${d}>${a},${b}`); };
  for (const [r, c, o] of walls){
    if (o === 'h'){ add(r, c, r + 1, c); add(r, c + 1, r + 1, c + 1); }
    else { add(r, c, r, c + 1); add(r + 1, c, r + 1, c + 1); }
  }
  return E;
}
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** 목표까지 가장 짧은 길의 칸 수 (말은 무시) — 길이 없으면 Infinity. path:true 면 길까지 */
export function distOf(s, id, walls = s.walls, from = s.pos[id], wantPath = false, E = edges(walls)){
  const n = s.size, side = s.side[id];
  const key = (r, c) => r * n + c;
  const prev = new Int32Array(n * n).fill(-2);
  const q = [from]; prev[key(...from)] = -1;
  for (let h = 0; h < q.length; h++){
    const [r, c] = q[h];
    if (atGoal(side, r, c, n)){
      if (!wantPath) return pathLen(prev, key(r, c));
      const path = []; let k = key(r, c);
      while (k !== -1){ path.unshift([Math.floor(k / n), k % n]); k = prev[k]; }
      return path;
    }
    for (const [dr, dc] of DIRS){
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n || prev[key(nr, nc)] !== -2 || E.has(`${r},${c}>${nr},${nc}`)) continue;
      prev[key(nr, nc)] = key(r, c); q.push([nr, nc]);
    }
  }
  return wantPath ? null : Infinity;
}
function pathLen(prev, k){ let d = 0; while (prev[k] !== -1){ k = prev[k]; d++; } return d; }

/** 갈 수 있는 칸 — 한 칸 · 뛰어넘기 · 옆으로 */
export function legalMoves(s, id = current(s), E = edges(s.walls)){
  const n = s.size, [r, c] = s.pos[id];
  const occ = new Set(Object.entries(s.pos).filter(([p]) => p !== id).map(([, [a, b]]) => `${a},${b}`));
  const free = (a, b) => a >= 0 && b >= 0 && a < n && b < n && !occ.has(`${a},${b}`);
  const open = (a, b, c2, d) => c2 >= 0 && d >= 0 && c2 < n && d < n && !E.has(`${a},${b}>${c2},${d}`);
  const out = [], seen = new Set();
  const add = (a, b) => { const k = `${a},${b}`; if (!seen.has(k)){ seen.add(k); out.push([a, b]); } };
  for (const [dr, dc] of DIRS){
    const nr = r + dr, nc = c + dc;
    if (!open(r, c, nr, nc)) continue;
    if (!occ.has(`${nr},${nc}`)){ add(nr, nc); continue; }
    const jr = nr + dr, jc = nc + dc;
    if (open(nr, nc, jr, jc) && free(jr, jc)){ add(jr, jc); continue; }
    for (const [pr, pc] of dc === 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]){
      const sr = nr + pr, sc = nc + pc;
      if (open(nr, nc, sr, sc) && free(sr, sc)) add(sr, sc);
    }
  }
  return out;
}

/** 이 벽을 놓을 수 있나 — 겹치지 않고, 아무의 길도 막지 않을 때 */
export function wallProblem(s, id, r, c, o){
  if (!s.left[id]) return '벽을 다 썼어요';
  if (r < 0 || c < 0 || r > s.size - 2 || c > s.size - 2) return '판 밖이에요';
  for (const [wr, wc, wo] of s.walls){
    if (wr === r && wc === c) return '다른 벽과 겹쳐요';
    if (o === 'h' && wo === 'h' && wr === r && Math.abs(wc - c) === 1) return '다른 벽과 겹쳐요';
    if (o === 'v' && wo === 'v' && wc === c && Math.abs(wr - r) === 1) return '다른 벽과 겹쳐요';
  }
  const walls = [...s.walls, [r, c, o]], E = edges(walls);
  for (const p of s.order) if (distOf(s, p, walls, s.pos[p], false, E) === Infinity) return '누군가의 길을 다 막아요';
  return '';
}

function nextTurn(n){ n.turn = (n.turn + 1) % n.order.length; }
/** 말 옮기기 — 도착하면 끝 */
export function move(s, r, c){
  const id = current(s);
  if (!legalMoves(s, id).some(([a, b]) => a === r && b === c)) return s;
  const n = structuredClone(s);
  n.seq++;
  n.pos[id] = [r, c];
  n.last = { id, move: [r, c] };
  if (atGoal(n.side[id], r, c, n.size)){ n.over = true; n.winner = sideKey(n, id); return n; }
  nextTurn(n);
  return n;
}
/** 벽 놓기 */
export function wall(s, r, c, o){
  const id = current(s);
  if (wallProblem(s, id, r, c, o)) return s;
  const n = structuredClone(s);
  n.seq++;
  n.walls.push([r, c, o]); n.left[id]--;
  n.last = { id, wall: [r, c, o] };
  nextTurn(n);
  return n;
}
/** 가장 짧은 길로 한 칸 (시간이 지났거나 나간 사람 · 봇) */
export function bestMove(s, id = current(s)){
  const E = edges(s.walls);
  let best = null, bd = Infinity;
  for (const m of legalMoves(s, id, E)){
    const d = distOf(s, id, s.walls, m, false, E) + Math.random() * 0.01;
    if (d < bd){ bd = d; best = m; }
  }
  return best;
}
export function autoAct(s){
  const m = bestMove(s);
  if (m){ const n = move(s, m[0], m[1]); if (n !== s) n.last = { ...n.last, auto: true }; return n; }
  const n = structuredClone(s); n.seq++; n.last = { id: current(s), skip: true }; nextTurn(n); return n;   // 갈 데가 없으면 넘긴다
}

/** 순위 — 이긴 편 먼저, 나머지는 남은 거리가 짧은 순 */
export function ranking(s){
  const keys = s.teams ? s.teams.map((t, i) => i) : s.order.slice();
  const distK = k => Math.min(...(s.teams ? s.teams[k] : [k]).map(id => distOf(s, id)));
  const rows = keys.map(k => ({ key: k, dist: distK(k) })).sort((a, b) => (a.key === s.winner ? -1 : b.key === s.winner ? 1 : a.dist - b.dist));
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const v = r.key === s.winner ? 'W' : r.dist; if (v !== prev){ rank = i + 1; prev = v; } r.rank = rank; });
  return rows;
}

/* ─────────── META BOT ─────────── */
/** 봇 — 앞서는 상대가 있으면 그 길목에 벽, 아니면 가장 짧은 길로 */
export function botAction(s){
  const id = current(s);
  const E = edges(s.walls);
  const myD = distOf(s, id, s.walls, s.pos[id], false, E);
  const mate = s.teams ? s.teams[teamOf(s, id)].find(p => p !== id) : null;
  const foes = s.order.filter(p => p !== id && p !== mate);
  const fd = foes.map(p => ({ p, d: distOf(s, p, s.walls, s.pos[p], false, E) })).sort((a, b) => a.d - b.d);
  const lead = fd[0];
  const ours = mate ? Math.min(myD, distOf(s, mate, s.walls, s.pos[mate], false, E)) : myD;
  if (s.left[id] > 0 && lead && (lead.d < ours || (lead.d <= ours && lead.d <= 3)) && Math.random() < 0.85){
    const path = distOf(s, lead.p, s.walls, s.pos[lead.p], true, E) || [];
    const tried = new Set();
    let best = null, bg = 0.9;
    for (const [r, c] of path.slice(0, 6)){
      for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) for (const o of ['h', 'v']){
        const wr = r + dr, wc = c + dc, k = `${wr},${wc},${o}`;
        if (tried.has(k)) continue; tried.add(k);
        if (wallProblem(s, id, wr, wc, o)) continue;
        const walls = [...s.walls, [wr, wc, o]], E2 = edges(walls);
        const gain = distOf(s, lead.p, walls, s.pos[lead.p], false, E2) - lead.d
          - (distOf(s, id, walls, s.pos[id], false, E2) - myD) * 1.1 + Math.random() * 0.3;
        if (gain > bg){ bg = gain; best = [wr, wc, o]; }
      }
    }
    if (best) return { a: 'wall', r: best[0], c: best[1], o: best[2] };
  }
  const m = bestMove(s, id);
  return m ? { a: 'move', r: m[0], c: m[1] } : { a: 'skip' };
}
