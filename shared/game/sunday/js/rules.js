/*
 * 어메이징 선데이 — 판의 규칙만 담는다 (화면 · 접속과 따로). 방장이 이것으로 판을 돌리고 모두가
 * 같은 상태를 그린다. 노드에서 바로 돌려 볼 수 있다.
 *
 * 규칙 (사용자가 정함)
 *   - 영화 · 웹툰 중 하나, 초성 · 줄임말 중 하나를 **게임 시작 전에** 고른다. 판 수는 5 · 10 · 15 · 20 · 30.
 *   - 한 판 = 문제 하나. 가장 먼저 [손] 을 누른 한 사람만 답을 적는다 (20초). 적는 글자는 모두에게
 *     실시간으로 보이고, 제출한 답도 모두가 본다.
 *   - 맞히면 +1 점, 다음 판. 틀리면 −1 점이고 그 판에서는 다시 손을 들 수 없다 — 다만 **남은 사람이
 *     모두 틀리면** 모두 다시 살아난다.
 *   - 한 판은 최대 3분. 아무도 못 맞히면 정답을 보여 주고 넘어간다.
 *
 * 상태 (방장이 통째로 보낸다)
 *   { g, seq, cat, mode, total, qs:[문제 번호], n(지금 판, 0부터), phase:'q'|'buzz'|'reveal'|'over',
 *     order:[id], names, scores, right, wrong, dead:{id:1}, buzzer, k(손 든 차례 번호), guesses:[{id,text,ok}],
 *     last:{…}, over }
 */
import { BANK } from './data.js?v=1';

export const ROUND_MS = 180 * 1000;     // 한 판 최대 3분
export const ANSWER_MS = 20 * 1000;     // 손 든 사람이 적는 시간
export const REVEAL_MS = 4000;          // 정답을 보여 주고 넘어가기까지
export const HINT_MS = 60 * 1000;      // 1분 · 2분에 힌트 하나씩 (모두 두 번)
export const HINT_MAX = 2;
export const BUZZ_WINDOW = 350;         // 손이 거의 같이 올라오면 이만큼 모아 서버 시각이 이른 사람을 고른다
export const ROUND_CHOICES = [5, 10, 15, 20, 30];
export const MAX_SEATS = 8;

/* 초성 — 한글 음절은 첫소리로, 나머지(숫자 · 띄어쓰기 · 문장부호)는 그대로 */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(text){
  let out = '';
  for (const ch of text){
    const c = ch.charCodeAt(0);
    out += c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch;
  }
  return out;
}
/* 맞춰 볼 때 — 띄어쓰기 · 문장부호 · 대소문자를 모두 지운다 */
export const norm = t => String(t || '').normalize('NFC').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');

export const itemOf = (s, i = s.n) => BANK[s.cat][s.qs[i]];
export const titleOf = (s, i) => itemOf(s, i)[0];
/** 지금 판의 문제 글 — 초성 또는 줄임말 */
export function questionOf(s, i = s.n){
  const it = itemOf(s, i);
  return s.mode === 'abbr' ? it[1] : chosung(it[0]);
}
/* 초성에 몇 글자를 드러낸다 — 드러낼 자리(한글 음절의 몇 번째)를 받는다 */
function reveal(title, show){
  let i = -1, out = '';
  for (const ch of title){
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3){ i++; out += show.has(i) ? ch : chosung(ch); }
    else out += ch;
  }
  return out;
}
/**
 * 힌트 — level 1 (1분), 2 (2분). 늘 정답을 다 보여 주지는 않는다.
 *   초성: 1 = 첫 글자, 2 = 한 글자 건너 하나씩(첫 글자부터) · 두 글자면 둘째 글자의 받침 뺀 모양
 *   줄임말: 1 = 원래 제목의 초성, 2 = 거기에 첫 글자
 */
export function hintOf(s, level, i = s.n){
  if (!level) return '';
  const t = titleOf(s, i);
  const n = [...t].filter(ch => ch >= '가' && ch <= '힣').length;
  if (!n) return '';
  const first = new Set([0]);
  if (s.mode === 'abbr') return level === 1 ? chosung(t) : reveal(t, first);
  if (n < 2) return '';
  if (level === 1) return reveal(t, first);
  if (n === 2){                                   // 두 글자 — 둘째 글자는 받침만 빼고 보인다
    let i = -1, out = '';
    for (const ch of t){
      const c = ch.charCodeAt(0);
      if (c >= 0xAC00 && c <= 0xD7A3){ i++; out += i === 0 ? ch : (c - 0xAC00) % 28 ? String.fromCharCode(c - (c - 0xAC00) % 28) : chosung(ch); }
      else out += ch;
    }
    return out;
  }
  const show = new Set();
  for (let k = 0; k < n; k += 2) show.add(k);
  if (show.size >= n) show.delete(n - 1);
  return reveal(t, show);
}
export function isRight(s, text){
  const it = itemOf(s);
  const t = norm(text);
  return !!t && [it[0], ...it.slice(2)].some(a => norm(a) === t);
}
/** 고른 갈래 · 방식으로 낼 수 있는 문제 수 */
export const poolSize = (cat, mode) => BANK[cat].filter(it => mode !== 'abbr' || it[1]).length;

function shuffle(a){
  const r = new Uint32Array(a.length);
  crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--){ const j = r[i] % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 새 게임 — 문제를 섞어 판 수만큼 뽑는다 (모자라면 있는 만큼) */
export function newGame(g, ids, names, { cat, mode, rounds }){
  cat = BANK[cat] ? cat : 'movie';
  mode = mode === 'abbr' ? 'abbr' : 'cho';
  const pool = shuffle(BANK[cat].map((it, i) => i).filter(i => mode !== 'abbr' || BANK[cat][i][1]));
  const total = Math.min(ROUND_CHOICES.includes(rounds) ? rounds : 10, pool.length);
  const scores = {}, right = {}, wrong = {};
  for (const id of ids){ scores[id] = 0; right[id] = 0; wrong[id] = 0; }
  return { g, seq: 0, cat, mode, total, qs: pool.slice(0, total), n: 0, phase: 'q', order: ids.slice(), names: { ...names },
           scores, right, wrong, dead: {}, buzzer: null, k: 0, guesses: [], last: null, over: false };
}

/** 손을 들 수 있는가 */
export const canBuzz = (s, id) => !!s && !s.over && s.phase === 'q' && s.order.includes(id) && !s.dead[id];

/** 손 — 방장이 가장 먼저 든 사람으로 정한 뒤 부른다 */
export function buzz(s, id){
  const n = structuredClone(s);
  n.phase = 'buzz'; n.buzzer = id; n.seq++; n.k = n.seq;
  return n;
}

/**
 * 답 제출 — 맞으면 +1 · 정답 공개, 틀리면 −1 · 그 판 쉬기.
 * alive: 지금 방에 남아 있는 사람들 — 이들이 모두 틀렸으면 모두 되살린다.
 */
export function submit(s, id, text, alive = s.order){
  const n = structuredClone(s);
  const t = String(text || '').trim().slice(0, 40);
  const ok = isRight(s, t);
  n.guesses.push({ id, text: t, ok });
  n.seq++;
  n.buzzer = null;
  if (ok){
    n.scores[id] += 1; n.right[id] += 1;
    n.phase = 'reveal';
    n.last = { n: n.n, id, text: t, ok: true };
  } else {
    n.scores[id] -= 1; n.wrong[id] += 1;
    n.dead[id] = 1;
    n.phase = 'q';
    const left = n.order.filter(p => alive.includes(p) && !n.dead[p]);
    const revive = left.length === 0;
    if (revive) n.dead = {};                     // 남은 사람이 모두 틀렸다 — 다 같이 다시
    n.last = { n: n.n, id, text: t, ok: false, revive };
  }
  return n;
}

/** 3분이 다 됐다 — 아무도 못 맞혔다. 정답만 보여 준다 */
export function timeUp(s){
  const n = structuredClone(s);
  n.phase = 'reveal'; n.buzzer = null; n.seq++;
  n.last = { n: n.n, timeout: true };
  return n;
}

/** 다음 판 — 마지막 판이었으면 게임 끝 */
export function next(s){
  const n = structuredClone(s);
  n.seq++;
  if (n.n + 1 >= n.total){ n.over = true; n.phase = 'over'; return n; }
  n.n++; n.phase = 'q'; n.dead = {}; n.buzzer = null; n.guesses = []; n.last = null;
  return n;
}

/** 순위 — 점수 높은 순, 같으면 같은 등수 */
export function ranking(s){
  const rows = s.order.map(id => ({ id, score: s.scores[id], right: s.right[id], wrong: s.wrong[id] }))
    .sort((a, b) => b.score - a.score || b.right - a.right);
  let rank = 0, prev = null;
  rows.forEach((r, i) => { const key = r.score; if (key !== prev){ rank = i + 1; prev = key; } r.rank = rank; });
  return rows;
}
