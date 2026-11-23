import { shuffled, evaluate, compare, label, isRed, SUITS, suitOf, cellName } from './cards.js?v=8';
import { joinRoom, makeId, MAX_SEATS } from './room.js?v=10';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';
import { isBot, botName, withBots } from '../../../js/bots.js?v=b1';

/*
 * Memory Poker (기억 포커).
 *
 *   1. 4×4 로 깔린 16장을 20초 동안 외운다.
 *   2. 카드가 뒤집히고 가운데에 2장이 놓인다.
 *   3. 10초 안에 A~P 칸 중 두 칸을 고른다 (자리는 그대로다).
 *   4. 고른 두 장 + 가운데 두 장, 네 장으로 족보를 낸다.
 *      이긴 한 명 +1, 나머지 −1. 동점이면 공동 1등끼리 다시 한다.
 *
 * 16장은 모두에게 똑같이 보이고, 같은 칸을 여럿이 골라도 된다.
 */

/* 가운데에 놓이는 장수 — 첫 화면에서 2장 · 3장 중 고른다.
   방의 규칙이므로 **방장의 것**을 쓰고, 판 꾸러미(rd)의 comm 길이로 모두에게
   퍼진다. 방장이 바뀌어도 지난 판의 장수를 이어 쓴다 (roomComm). */
const COMMS = [2, 3];
const SHOW = 20000;          // 외우는 시간
const PICK = 10000;          // 고르는 시간
const GRACE = 1500;          // 고른 칸이 방장에게 닿을 여유
const TIE_PAUSE = 4500;      // 동점을 보여 주고 결승을 시작하기까지
const RESEND = 2000;

const $ = s => document.querySelector(s);
const now = () => performance.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let store = {};
try { store = JSON.parse(localStorage.getItem('memPoker') || '{}') || {}; } catch (_){}
const save = () => { try { localStorage.setItem('memPoker', JSON.stringify(store)); } catch (_){} };
if (!COMMS.includes(store.comm)) store.comm = 2;
let roomComm = store.comm;   // 이 방에서 쓰는 가운데 장수

/* 확대 막기 — 사파리는 viewport 의 user-scalable 을 듣지 않는다.
   두 손가락 오므리기(gesturestart · 두 손가락 touchmove)를 막는다. */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
/* 두 번 톡 확대는 CSS 의 touch-action:manipulation 이 막는다. touchend 를 막는
   식으로 하면 두 칸을 빨리 고를 때 두 번째 톡이 먹힌다. */

/* ─────────── 상태 ─────────── */
const me = { id: makeId(), name: '', at: 0, ready: -1 };
let net = null, roomId = null;
let round = null;      // { n, seats, grid, comm, start, tie }
let picks = new Map(); // id → [칸, 칸]  (지금 판)
let mine = [];         // 내가 고른 칸
let result = null;     // { n, rows, tie, at }
let scores = {}, names = {};
let lastSent = 0, lastPick = 0;
const stats = {};      // id → { w: 이긴 판, l: 진 판, last: { hand, cards } }  (이 방에 있는 동안)
let sheetFor = null;   // 열린 창: 'result' | 사람 id | null
let shownResult = 0;   // 결과 창을 저절로 띄운 마지막 판

/* 이 방의 가운데 장수 — 방장의 것. 방장이 나면 내 것, 남이면 그 사람이 인사에 실어 보낸 것 */
function commNow(){
  if (round) return round.comm.length;
  const h = net && net.order()[0];
  if (!h || h.id === me.id) return roomComm;
  const c = net.peers.get(h.id)?.comm;
  return COMMS.includes(c) ? c : roomComm;
}
const isHost = () => net && net.order()[0].id === me.id;
const seatsNow = () => net.order().slice(0, MAX_SEATS);

/* 준비 — 판을 시작하기 전에 자리에 앉은 사람이 모두 '게임 준비' 를 누르고,
   다 되면 방장이 '게임 시작' 을 누른다. 방장은 시작 단추가 곧 준비다.
   준비는 '몇 번째 판 다음' 을 위한 것인지 숫자로 적는다 (readyBase).
   그래야 판이 시작되면 저절로 풀리고, 늦게 닿은 옛 인사가 다음 판의
   준비로 잘못 읽히지 않는다. 결승은 이어서 저절로 시작한다. */
const readyBase = () => Math.max(round ? round.n : 0, result ? result.n : 0);
function isReady(id){
  if (id === net.order()[0].id) return true;
  const r = id === me.id ? me.ready : net.peers.get(id)?.ready;
  return r === readyBase();
}
const readyCount = () => seatsNow().filter(s => isReady(s.id)).length;
const allReady = () => seatsNow().every(s => isReady(s.id));
function toggleReady(){
  if (isHost() || !seatsNow().some(s => s.id === me.id)) return;
  me.ready = me.ready === readyBase() ? -1 : readyBase();
  if (navigator.vibrate) navigator.vibrate(8);
  net.hi(); render();
}
/* 단추 한 칸 — 판 아래 줄과 결과 창이 같이 쓴다 */
function readyButton(){
  const seated = seatsNow(), n = seated.length;
  if (isHost()){
    const ok = allReady();
    return `<button class="btn primary" data-act="start" type="button" ${ok ? '' : 'disabled'}>${ok ? '게임 시작' : `준비 기다리는 중 ${readyCount()}/${n}`}</button>`;
  }
  if (!seated.some(s => s.id === me.id)) return '<span class="wait">관전 중 · 자리가 나면 앉아요</span>';
  return me.ready === readyBase()
    ? '<button class="btn on" data-act="ready" type="button">✓ 준비 완료 <small>· 취소</small></button>'
    : '<button class="btn primary" data-act="ready" type="button">게임 준비</button>';
}
const nameOf = id => (id === me.id ? me.name : isBot(id) ? botName(id) : (net.peers.get(id)?.name || names[id] || '나간 사람'));
/* 판에 남아 있는가 — 봇은 방장 기기 안에 늘 있다 */
const here = id => isBot(id) || net.present(id);

/* ─────────── 첫 화면 ─────────── */
const nameIn = $('#name'), codeIn = $('#code');
/* 캐릭터는 Metaversal Studio(무지개 정원)에서만 쓴다 — 여기(Meta Project)는 따로다.
   이름 칸에는 포커에서 쓰던 이름, 처음이면 로그인한 아이디를 넣어 둔다. */
const ACCOUNT = readAccount();
nameIn.value = store.name || (ACCOUNT && ACCOUNT.user.id) || '';
const fromLink = channelFromHash();
if (fromLink && fromLink !== 'OPEN') codeIn.value = showChannel(fromLink);

function enter(id){
  const name = nameIn.value.trim().slice(0, 12);
  if (!name){ nameIn.focus(); $('#lobbyMsg').textContent = '이름을 먼저 적어 주세요.'; return; }
  store.name = name; save();
  me.name = name; me.at = serverNow();   // 들어온 순서(방장)는 서버 시각으로 — 폰 시계가 틀려도 같은 순서
  roomComm = me.comm = store.comm;   // 내가 방장이면 이 장수로 판을 돌린다
  roomId = id;
  writeChannelToHash(id);
  $('#lobby').hidden = true; $('#room').hidden = false;
  $('#roomCode').textContent = showChannel(id);
  net = joinRoom({
    room: id, me,
    onMessage, onPeers: render,
    onStatus(kind, text){
      $('#netDot').className = 'dot ' + kind;
      $('#netText').textContent = text;
    }
  });
  render();
}

$('#make').onclick = () => enter(makeChannel());
$('#joinForm').onsubmit = e => {
  e.preventDefault();
  const id = readChannel(codeIn.value);
  if (!id || id === 'OPEN'){ $('#lobbyMsg').textContent = '방 코드 여섯 글자를 확인해 주세요.'; codeIn.focus(); return; }
  enter(id);
};

$('#roomBtn').onclick = async () => {
  const link = inviteLink(roomId);
  try {
    if (navigator.share) await navigator.share({ title: 'Memory Poker', text: '같이 Memory Poker 해요', url: link });
    else { await navigator.clipboard.writeText(link); flash('링크를 복사했어요'); }
  } catch (_){
    try { await navigator.clipboard.writeText(link); flash('링크를 복사했어요'); } catch (_){ prompt('이 링크를 보내 주세요', link); }
  }
};

function flash(text){
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(flash.h); flash.h = setTimeout(() => { t.hidden = true; }, 1800);
}

/* ─────────── 방장: 판 돌리기 ─────────── */
function startRound(seats, tie){
  const deck = shuffled();
  const n = Math.max(round ? round.n : 0, result ? result.n : 0) + 1;
  applyRound({ n, seats, grid: deck.slice(0, 16), comm: deck.slice(16, 16 + roomComm), el: 0, tie, scores, names: namesFor(seats) });
  sendRound();
}

function namesFor(ids){
  const o = { ...names };
  for (const id of ids) o[id] = nameOf(id);
  return o;
}

function sendRound(){
  if (!round) return;
  lastSent = now();
  net.send({ t: 'rd', n: round.n, seats: round.seats, grid: round.grid, comm: round.comm,
             el: Math.round(now() - round.start), tie: round.tie, scores, names: namesFor(round.seats) });
}

function finish(){
  const n = round.n;
  const playing = round.seats.filter(here);
  const rows = playing.map(id => {
    const p = (picks.get(id) || []).filter(i => i >= 0 && i < 16);
    const cards = [...p.map(i => round.grid[i]), ...round.comm];
    const h = evaluate(cards);
    return { id, p, key: h.key, hand: h.name };
  });
  let best = null;
  for (const r of rows) if (!best || compare(r.key, best) > 0) best = r.key;
  const top = rows.filter(r => compare(r.key, best) === 0).map(r => r.id);
  const solo = round.seats.length === 1;
  const tie = !solo && top.length > 1;

  for (const r of rows){
    r.win = top.includes(r.id);
    if (solo) r.pt = 0;
    else if (tie) r.pt = r.win ? 0 : -1;       // 공동 1등은 결승에서 가린다
    else r.pt = r.win ? 1 : -1;
    scores[r.id] = (scores[r.id] || 0) + r.pt;
  }
  applyResult({ n, rows, tie: tie ? top : null, scores, names: namesFor(playing) });
  sendResult();
}

function sendResult(){
  lastSent = now();
  net.send({ t: 'rs', n: result.n, rows: result.rows, tie: result.tie, scores, names: { ...names } });
}

/* ── META BOT 이 두는 법 ──
   고르는 시간에 2~7초 사이 아무 때나 두 칸을 고른다. 다 외우는 건 아니라서
   절반쯤은 가장 좋은 두 칸, 나머지는 괜찮은 쪽 · 아무 칸이나. */
function botPick(){
  const pairs = [];
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++)
    pairs.push({ p: [a, b], key: evaluate([round.grid[a], round.grid[b], ...round.comm]).key });
  pairs.sort((x, y) => compare(y.key, x.key));
  const r = Math.random();
  const at = r < 0.5 ? 0 : r < 0.8 ? 1 + Math.floor(Math.random() * 12) : Math.floor(Math.random() * pairs.length);
  return pairs[at].p;
}
const botWhen = new Map();     // 봇 id → 이번 판에 고를 때 (판 시작부터 밀리초)
function runBots(t){
  if (!round || (result && result.n >= round.n)) return;
  for (const id of round.seats){
    if (!isBot(id)) continue;
    const key = round.n + ':' + id;
    if (!botWhen.has(key)) botWhen.set(key, SHOW + 2000 + Math.random() * 5000);
    if (!picks.has(id) && t - round.start > botWhen.get(key) && t - round.start < SHOW + PICK){
      picks.set(id, botPick());
      render();
    }
    // 남들 화면의 '고른 수' 가 맞게 — 1초쯤마다 알려 준다
    if (picks.has(id) && (!runBots.sent || t - runBots.sent > 1000)) net.send({ t: 'pk', id, n: round.n, p: picks.get(id) });
  }
  if (t - (runBots.sent || 0) > 1000) runBots.sent = t;
}

setInterval(() => {
  if (!net || !isHost()) return;
  const t = now();
  runBots(t);
  if (round && (!result || result.n < round.n)){
    if (t - round.start > SHOW + PICK + GRACE) finish();
    else if (t - lastSent > RESEND) sendRound();
  } else if (result){
    if (result.tie && t - result.at > TIE_PAUSE){
      const left = result.tie.filter(here);
      if (left.length > 1) startRound(left, true);
      else { result.tie = null; render(); }
    } else if (t - lastSent > RESEND) sendResult();
  }
}, 250);

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'rd' && Array.isArray(m.grid) && m.grid.length === 16 && Array.isArray(m.comm) && COMMS.includes(m.comm.length)){
    if (round && m.n <= round.n) return;
    applyRound(m);
  } else if (m.t === 'rs' && Array.isArray(m.rows)){
    if (result && m.n <= result.n) return;
    applyResult(m);
  } else if (m.t === 'pk' && round && m.n === round.n && round.seats.includes(m.id) && Array.isArray(m.p)){
    if (now() - round.start < SHOW + PICK + 400) picks.set(m.id, m.p.slice(0, 2).map(Number));
    render();
  }
}

function applyRound(m){
  round = { n: m.n, seats: m.seats, grid: m.grid, comm: m.comm, tie: !!m.tie, start: now() - (+m.el || 0) };
  roomComm = me.comm = m.comm.length;
  picks = new Map(); mine = [];
  if (sheetFor === 'result') closeSheet();
  if (m.scores) scores = { ...m.scores };
  if (m.names) Object.assign(names, m.names);
  render();
}

function applyResult(m){
  result = { n: m.n, rows: m.rows, tie: m.tie, at: now() };
  if (round && round.n === m.n) for (const r of m.rows){
    const st = stats[r.id] || (stats[r.id] = { w: 0, l: 0, last: null });
    if (r.pt > 0) st.w++; else if (r.pt < 0) st.l++;
    st.last = { hand: r.hand, cards: [...r.p.map(i => round.grid[i]), ...round.comm], own: r.p.length, n: m.n };
  }
  if (m.scores) scores = { ...m.scores };
  if (m.names) Object.assign(names, m.names);
  if (round && round.n === m.n){
    // 내 화면이 결과를 늦게 받았어도 고르기는 여기서 닫는다
    round.closed = true;
  }
  render();
}

/* ─────────── 고르기 ─────────── */
function phase(){
  if (!round) return 'idle';
  if (result && result.n === round.n) return 'result';
  const e = now() - round.start;
  if (e < SHOW) return 'show';
  if (e < SHOW + PICK) return 'pick';
  return 'wait';
}
const amIn = () => round && round.seats.includes(me.id);

function tap(i){
  if (phase() !== 'pick' || !amIn()) return;
  const at = mine.indexOf(i);
  if (at >= 0) mine.splice(at, 1);
  else { mine.push(i); if (mine.length > 2) mine.shift(); }
  if (navigator.vibrate) navigator.vibrate(8);
  sendPick();
  render();
}
function sendPick(){
  lastPick = now();
  picks.set(me.id, mine.slice());
  net.send({ t: 'pk', id: me.id, n: round.n, p: mine });
}

$('#grid').addEventListener('click', e => {
  const b = e.target.closest('[data-i]');
  if (b) tap(+b.dataset.i);
});
/* 혼자 시작하면 META BOT 셋이 함께 한다 (사용자 요청) */
function startNext(){ if (isHost() && allReady()) { result = null; closeSheet(); startRound(withBots(seatsNow().map(s => s.id)), false); } }

/* ─────────── 올라오는 창 ───────────
   화면에 늘어놓으면 판이 밀리므로, 결과와 사람별 자세한 내용은 여기에 띄운다. */
const sheet = $('#sheet');
/* 넘겨 보는 것은 족보 창뿐이다 (사용자가 허락함). 나머지 창은 안에 맞춰 넣는다. */
function openSheet(what){ sheetFor = what; $('#sheetBody').classList.remove('scroll'); sheet.hidden = false; drawSheet(); }
function closeSheet(){ sheetFor = null; sheet.hidden = true; render(); }
$('#sheetClose').onclick = closeSheet;
sheet.addEventListener('click', e => {
  if (e.target === sheet) return closeSheet();
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'next' || b.dataset.act === 'start') startNext();
  else if (b.dataset.act === 'ready') toggleReady();
  else if (b.dataset.act === 'close') closeSheet();
  else if (b.dataset.act === 'result') openSheet('result');
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });

$('#seats').addEventListener('click', e => {
  const b = e.target.closest('[data-id]');
  if (b) openSheet(b.dataset.id);
});
$('#actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'start' || b.dataset.act === 'next') startNext();
  else if (b.dataset.act === 'ready') toggleReady();
  else if (b.dataset.act === 'result') openSheet('result');
});

const ptText = r => r.pt > 0 ? '+1' : r.pt < 0 ? '−1' : r.win && result.tie ? '결승' : '·';
const ptCls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';

function resultTitle(){
  if (result.tie) return '동점!';
  if (round.seats.length === 1) return '연습 끝';
  const w = result.rows.find(r => r.win);
  return w ? (w.id === me.id ? '이겼어요!' : `${nameOf(w.id)} 님 승리`) : '끝';
}

/* ─────────── 족보 창 ───────────
   예시 카드는 숫자로 적는다: 무늬(0 ♠ 1 ♥ 2 ♦ 3 ♣) × 13 + (숫자 − 1).
   dim 은 족보에 들지 않는 남는 카드(키커) 자리다. */
const C = (n, s) => s * 13 + n - 1;
const HAND_GUIDE = [
  ['로열 스트레이트 플러시', '같은 무늬로 10 · J · Q · K · A', [[1,0],[13,0],[12,0],[11,0],[10,0]], 0, false],
  ['스트레이트 플러시', '같은 무늬로 숫자 다섯 장이 이어짐', [[9,1],[8,1],[7,1],[6,1],[5,1]], 0, false],
  ['포카드', '같은 숫자 네 장', [[7,0],[7,1],[7,2],[7,3],[13,0]], 1, true],
  ['풀하우스', '같은 숫자 세 장 + 같은 숫자 두 장', [[12,0],[12,1],[12,2],[4,3],[4,1]], 0, false],
  ['플러시', '무늬가 같은 다섯 장 (숫자는 아무거나)', [[13,2],[10,2],[7,2],[4,2],[2,2]], 0, false],
  ['스트레이트', '숫자 다섯 장이 이어짐 (무늬는 아무거나)', [[8,0],[7,1],[6,3],[5,2],[4,0]], 0, false],
  ['트리플', '같은 숫자 세 장', [[9,0],[9,2],[9,3],[13,1],[3,0]], 2, true],
  ['투페어', '같은 숫자 두 장이 두 쌍', [[11,0],[11,1],[5,2],[5,3],[1,0]], 1, true],
  ['원페어', '같은 숫자 두 장', [[10,1],[10,3],[13,0],[7,2],[3,1]], 3, true],
  ['하이카드', '아무것도 안 맞으면 가장 높은 카드로', [[1,3],[11,1],[8,0],[4,2],[2,3]], 4, true]
];

function openHands(){
  sheetFor = 'hands';
  $('#sheetTitle').textContent = '포커 족보';
  const total = 2 + (net ? commNow() : store.comm);
  $('#sheetSub').textContent = total >= 5 ? '위에 있을수록 높아요. 가운데 3장 판이라 열 가지 모두 나와요.'
    : '위에 있을수록 높아요. 가운데 2장 판은 4장이라 ‘나와요’ 표시만 나와요.';
  $('#sheetBody').innerHTML = '<ol id="handList">' + HAND_GUIDE.map(([nm, ds, ex, kick, four], i) => { const ok = four || total >= 5; return `
    <li class="${ok ? '' : 'off'}">
      <span class="no">${i + 1}</span>
      <span class="nm">${nm}</span>
      <span class="ok">${ok ? '나와요' : '5장 필요'}</span>
      <span class="ds">${ds}</span>
      <span class="ex">${ex.map(([n, s], k) => `<span class="mini up ${k >= ex.length - kick ? 'dim' : ''}">${face(C(n, s))}</span>`).join('')}</span>
    </li>`; }).join('') + `</ol>
    <div class="tips">
      <p><b>같은 족보끼리는</b> 숫자가 높은 쪽이 이겨요. 투페어는 높은 쌍부터, 그다음 낮은 쌍, 그다음 남은 카드 순서로 견줘요.</p>
      <p><b>A</b> 는 가장 높은 카드예요. A-2-3-4-5 스트레이트에서만 가장 낮게 쳐요.</p>
      <p><b>무늬</b>로는 순서를 가리지 않아요. 끝까지 똑같으면 동점 — 공동 1등끼리 결승을 해요.</p>
      <p><b>흐린 카드</b>는 족보에 들지 않은 남는 카드예요. 족보가 같을 때 견주는 데 써요.</p>
    </div>`;
  $('#sheetBtns').innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
  $('#sheetBody').classList.add('scroll');   // 이 창만은 넘겨 본다
  sheet.hidden = false;
  $('#sheetBody').scrollTop = 0;
}
$('#handsBtn').onclick = openHands;

/* 첫 화면 — 가운데 카드 2장 · 3장 */
function showComm(){
  for (const r of document.querySelectorAll('input[name="comm"]')) r.checked = +r.value === store.comm;
  for (const el of document.querySelectorAll('[data-comm]')) el.textContent = store.comm;
  const t = document.querySelector('[data-total]'); if (t) t.textContent = 2 + store.comm;
}
document.querySelectorAll('input[name="comm"]').forEach(r => r.addEventListener('change', () => {
  store.comm = +r.value; save();
  if (!net) roomComm = store.comm;   // 방에 들어간 뒤에는 방의 규칙을 따른다
  showComm();
}));
showComm();

function drawSheet(){
  if (!sheetFor || sheetFor === 'hands' || !net) return;
  const T = $('#sheetTitle'), S = $('#sheetSub'), B = $('#sheetBody'), F = $('#sheetBtns');
  const host = net.order()[0].id;

  if (sheetFor === 'result'){
    if (!result || !round){ closeSheet(); return; }
    T.textContent = resultTitle();
    S.textContent = result.tie ? `${result.tie.map(nameOf).join(' · ')} 님이 곧 결승을 해요.` : '흰 테두리가 고른 카드예요.';
    B.innerHTML = '<ul id="results">' + [...result.rows].sort((a, b) => compare(b.key, a.key)).map(r => {
      const cards = [...r.p.map(i => round.grid[i]), ...round.comm];
      return `<li class="${r.win ? 'win' : ''}">
        <div class="who"><b>${esc(nameOf(r.id))}${r.id === me.id ? ' <small>나</small>' : ''}</b>
          <span>${esc(r.hand)} · ${r.p.length ? r.p.map(cellName).join(' ') : '못 골랐어요'}</span></div>
        <div class="row4">${cards.map((c, k) => `<span class="mini up ${k < r.p.length ? 'own' : ''}">${face(c)}</span>`).join('')}</div>
        <span class="pt ${ptCls(r.pt)}">${ptText(r)}</span>
      </li>`;
    }).join('') + '</ul>';
    F.innerHTML = `<button class="btn" data-act="close" type="button">판 보기</button>` + (result.tie ? '' : readyButton());
    fitResults();
    return;
  }

  // 사람 창
  const id = sheetFor;
  if (!here(id)){ closeSheet(); return; }
  const st = stats[id] || { w: 0, l: 0, last: null };
  const sc = scores[id] || 0;
  const order = net.order();
  const seat = order.findIndex(o => o.id === id);
  T.textContent = nameOf(id);
  S.textContent = '';
  const tags = isBot(id) ? ['META BOT · 혼자일 때 함께 해요'] : [id === host ? '★ 방장' : '', id === me.id ? '나' : '', seat >= MAX_SEATS ? '관전 중' : `${seat + 1}번 자리`].filter(Boolean);
  const ph = phase();
  let cur = '';
  if (round && round.seats.includes(id) && (ph === 'pick' || ph === 'wait')){
    const n = (picks.get(id) || []).length;
    cur = `<p>${n === 2 ? '두 칸을 다 골랐어요' : n === 1 ? '한 칸 골랐어요' : '아직 고르는 중'} · ${n}/2</p>`;
  } else if (ph === 'show' && round && round.seats.includes(id)){
    cur = '<p>카드를 외우는 중</p>';
  } else if (st.last){
    cur = `<div class="row4">${st.last.cards.map((c, k) => `<span class="mini up ${k < st.last.own ? 'own' : ''}">${face(c)}</span>`).join('')}</div><p><b>${esc(st.last.hand)}</b></p>`;
  } else cur = '<p style="color:var(--muted)">아직 한 판도 안 했어요</p>';
  const watchers = order.slice(MAX_SEATS);
  B.innerHTML = `<div class="person">
    <div class="tags">${tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>
    <div class="stats">
      <div><b class="${ptCls(sc)}">${sc > 0 ? '+' : ''}${sc}</b><span>점수</span></div>
      <div><b>${st.w}</b><span>이긴 판</span></div>
      <div><b>${st.l}</b><span>진 판</span></div>
    </div>
    <h3>${st.last && !(round && (ph === 'pick' || ph === 'wait' || ph === 'show')) ? '지난 판' : '지금'}</h3>
    <div class="now">${cur}</div>
    ${watchers.length ? `<h3 style="margin-top:12px">관전 ${watchers.length}명</h3><p style="margin:0;font-size:13px">${watchers.map(w => esc(w.name)).join(' · ')}</p>` : ''}
  </div>`;
  F.innerHTML = `<button class="btn" data-act="close" type="button">닫기</button>`;
}

/* 결과 창은 넘겨 보지 않는다 — 넘치면 한 단계씩 줄인다: 보통 → 얇게 → 두 칸 */
function fitResults(){
  const B = $('#sheetBody'), ul = $('#results');
  if (!ul) return;
  for (const cls of ['', 'tight', 'tight g2']){
    ul.className = cls;
    if (B.scrollHeight <= B.clientHeight + 1) return;
  }
}
addEventListener('resize', () => { if (sheetFor === 'result') fitResults(); });

/* ─────────── 그리기 ─────────── */
function face(c, extra = ''){
  return `<span class="face ${isRed(c) ? 'red' : ''} ${extra}"><b>${label(c)}</b><i>${SUITS[suitOf(c)]}</i></span>`;
}

function render(){
  if (!net) return;
  const ph = phase();
  const order = net.order();
  // 이번 판에 META BOT 이 있으면 자리에 함께 보인다
  const bots = round ? round.seats.filter(isBot).map(id => ({ id, name: botName(id) })) : [];
  const seated = [...order.slice(0, MAX_SEATS), ...bots].slice(0, MAX_SEATS);
  const host = order[0].id;
  const iHost = host === me.id;

  // 자리 — 이름 · 점수 · 고른 수만. 자세한 것은 눌러서 본다
  $('#seats').innerHTML = seated.map(s => {
    const sc = scores[s.id] || 0;
    const out = round && ph !== 'result' && ph !== 'idle' && !round.seats.includes(s.id);
    const n = (ph === 'pick' || ph === 'wait') && !out ? (picks.get(s.id) || []).length : -1;
    const res = ph === 'result' && result.rows.find(r => r.id === s.id);
    // 판 사이(기다리는 중 · 결과)에는 준비했는지를 보여 준다. 결과의 ±1 은 점수와 결과 창에 있다
    const between = ph === 'idle' || (ph === 'result' && !result.tie);
    const rd = between && (isBot(s.id) || isReady(s.id));
    const right = between ? (s.id === host ? '방장' : isBot(s.id) ? 'BOT' : rd ? '✓ 준비' : '대기') : n >= 0 ? `${n}/2` : res ? ptText(res) : '';
    return `<li class="${s.id === me.id ? 'me' : ''} ${out ? 'out' : ''} ${rd ? 'rd' : ''}"><button type="button" data-id="${s.id}" aria-label="${esc(s.name)} 자세히">
      <span class="nm">${s.id === host ? '<em>★</em>' : ''}${esc(s.name)}</span>
      <span class="sc ${ptCls(sc)}">${sc > 0 ? '+' : ''}${sc}</span>
      <span class="pk ${between ? (rd ? 'up' : '') : res ? ptCls(res.pt) : ''}">${right}</span>
    </button></li>`;
  }).join('') + Array.from({ length: MAX_SEATS - seated.length }, () => '<li class="emptyseat">빈자리</li>').join('');

  // 판 — 늘 같은 자리, 같은 크기
  const showCards = ph === 'show' || ph === 'result';
  const g = round ? round.grid : null;
  const myRes = ph === 'result' && result.rows.find(r => r.id === me.id);
  $('#grid').innerHTML = Array.from({ length: 16 }, (_, i) => {
    if (!g) return `<button class="cell back" disabled><span class="ltr">${cellName(i)}</span></button>`;
    if (showCards) return `<button class="cell up ${myRes && myRes.p.includes(i) ? 'chosen' : ''}" disabled>${face(g[i])}<span class="tag">${cellName(i)}</span></button>`;
    const sel = mine.includes(i);
    return `<button class="cell back ${sel ? 'sel' : ''}" data-i="${i}" ${ph === 'pick' && amIn() ? '' : 'disabled'} aria-pressed="${sel}"><span class="ltr">${cellName(i)}</span></button>`;
  }).join('');

  // 가운데 카드 — 나오기 전에는 빈 자리로 남겨 둔다 (자리가 바뀌지 않게)
  const commUp = round && (ph === 'pick' || ph === 'wait' || ph === 'result');
  $('#comm').innerHTML = Array.from({ length: commNow() }, (_, k) =>
    commUp ? `<span class="mini up">${face(round.comm[k])}</span>` : '<span class="mini back"></span>').join('');

  // 안내 두 줄 — 줄 수가 늘 같다
  let head = '', sub = '';
  if (ph === 'idle'){
    head = allReady() ? (iHost ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${seated.length}`;
    sub = `가운데 ${commNow()}장 · ` + (iHost
      ? (seated.length === 1 ? '혼자 시작하면 META BOT 셋이 함께 해요' : allReady() ? '게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : seated.some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 시작하길 기다려요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요');
  } else if (ph === 'show'){
    head = round.tie ? '결승 · 외우세요' : '외우세요';
    sub = '16장의 자리를 기억해 두세요';
  } else if (ph === 'pick'){
    head = round.tie ? '결승 · 두 칸을 고르세요' : '두 칸을 고르세요';
    sub = amIn() ? (mine.length ? `고른 칸 ${mine.map(cellName).join(' · ')}` : `가운데 ${round.comm.length}장과 함께 족보를 만들 칸 둘`) : '이번 판은 지켜봐요';
  } else if (ph === 'wait'){
    head = '결과를 모으는 중…';
  } else if (ph === 'result'){
    head = resultTitle();
    const mineR = result.rows.find(r => r.id === me.id);
    sub = (mineR ? `내 족보 ${mineR.hand}` : '') + (result.tie ? '' : `${mineR ? ' · ' : ''}다음 판 준비 ${readyCount()}/${seated.length}`);
  }
  $('#phase').textContent = head;
  $('#hint').textContent = sub;

  // 단추 한 줄 — 무엇이 오든 같은 자리, 같은 높이
  let act = '';
  if (ph === 'idle') act = readyButton();
  else if (ph === 'show' || ph === 'pick') act = `<span class="wait">${ph === 'show' ? '외우는 중' : amIn() ? `${mine.length}/2 골랐어요` : '지켜보는 중'}</span>`;
  else if (ph === 'wait') act = '<span class="wait">잠깐만요…</span>';
  else if (ph === 'result'){
    act = '<button class="btn" data-act="result" type="button">결과 보기</button>';
    if (result.tie) act += '<span class="wait">곧 결승</span>';
    else act += readyButton();
  }
  const A = $('#actions');
  if (A.dataset.html !== act){ A.innerHTML = act; A.dataset.html = act; }

  document.body.dataset.phase = ph;

  // 결과가 나오면 창을 한 번 저절로 띄운다
  if (ph === 'result' && shownResult !== result.n){ shownResult = result.n; openSheet('result'); return; }
  if (sheetFor) drawSheet();
}

/* 시간 띠는 따로 자주 그린다 */
function clock(){
  requestAnimationFrame(clock);
  const ph = phase();
  const bar = $('#bar'), num = $('#count');
  if (!round || (ph !== 'show' && ph !== 'pick')){ bar.style.transform = 'scaleX(0)'; num.textContent = ''; return; }
  const e = now() - round.start;
  const left = ph === 'show' ? SHOW - e : SHOW + PICK - e;
  const whole = ph === 'show' ? SHOW : PICK;
  bar.style.transform = `scaleX(${Math.max(0, left / whole)})`;
  const s = Math.ceil(left / 1000);
  if (num.textContent !== String(s)) num.textContent = s;
  // 고른 칸은 고르는 동안 1초마다 다시 보낸다 (꾸러미가 빠질 수 있다)
  if (ph === 'pick' && amIn() && now() - lastPick > 1000) sendPick();
}
clock.ph = null;
requestAnimationFrame(clock);
setInterval(() => {
  const ph = phase();
  if (ph === clock.ph) return;
  // 고르는 시간이 끝나는 순간 한 번 더 보낸다 — 마지막에 바꾼 칸이 빠지지 않게
  if (clock.ph === 'pick' && amIn()) sendPick();
  clock.ph = ph; render();
}, 300);
