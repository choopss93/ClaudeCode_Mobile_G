import { shuffled, evaluate, compare, label, isRed, SUITS, suitOf, cellName } from './cards.js?v=5';
import { joinRoom, makeId, MAX_SEATS } from './room.js?v=1';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';

/*
 * 기억 포커.
 *
 *   1. 4×4 로 깔린 16장을 20초 동안 외운다.
 *   2. 카드가 뒤집히고 가운데에 2장이 놓인다.
 *   3. 10초 안에 A~P 칸 중 두 칸을 고른다 (자리는 그대로다).
 *   4. 고른 두 장 + 가운데 두 장, 네 장으로 족보를 낸다.
 *      이긴 한 명 +1, 나머지 −1. 동점이면 공동 1등끼리 다시 한다.
 *
 * 16장은 모두에게 똑같이 보이고, 같은 칸을 여럿이 골라도 된다.
 */

const COMM = 2;              // 가운데에 놓이는 장수 (사용자 요청으로 3 → 2)
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

/* 확대 막기 — 사파리는 viewport 의 user-scalable 을 듣지 않는다.
   두 손가락 오므리기(gesturestart · 두 손가락 touchmove)를 막는다. */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
/* 두 번 톡 확대는 CSS 의 touch-action:manipulation 이 막는다. touchend 를 막는
   식으로 하면 두 칸을 빨리 고를 때 두 번째 톡이 먹힌다. */

/* ─────────── 상태 ─────────── */
const me = { id: makeId(), name: '', at: 0 };
let net = null, roomId = null;
let round = null;      // { n, seats, grid, comm, start, tie }
let picks = new Map(); // id → [칸, 칸]  (지금 판)
let mine = [];         // 내가 고른 칸
let result = null;     // { n, rows, tie, at }
let scores = {}, names = {};
let lastSent = 0, lastPick = 0;

const isHost = () => net && net.order()[0].id === me.id;
const seatsNow = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (id === me.id ? me.name : (net.peers.get(id)?.name || names[id] || '나간 사람'));

/* ─────────── 첫 화면 ─────────── */
const nameIn = $('#name'), codeIn = $('#code');
nameIn.value = store.name || '';
const fromLink = channelFromHash();
if (fromLink && fromLink !== 'OPEN') codeIn.value = showChannel(fromLink);

function enter(id){
  const name = nameIn.value.trim().slice(0, 12);
  if (!name){ nameIn.focus(); $('#lobbyMsg').textContent = '이름을 먼저 적어 주세요.'; return; }
  store.name = name; save();
  me.name = name; me.at = Date.now();
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

$('#copy').onclick = async () => {
  const link = inviteLink(roomId);
  try {
    if (navigator.share) await navigator.share({ title: '기억 포커', text: '같이 기억 포커 해요', url: link });
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
  applyRound({ n, seats, grid: deck.slice(0, 16), comm: deck.slice(16, 16 + COMM), el: 0, tie, scores, names: namesFor(seats) });
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
  const playing = round.seats.filter(id => net.present(id));
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

setInterval(() => {
  if (!net || !isHost()) return;
  const t = now();
  if (round && (!result || result.n < round.n)){
    if (t - round.start > SHOW + PICK + GRACE) finish();
    else if (t - lastSent > RESEND) sendRound();
  } else if (result){
    if (result.tie && t - result.at > TIE_PAUSE){
      const left = result.tie.filter(id => net.present(id));
      if (left.length > 1) startRound(left, true);
      else { result.tie = null; render(); }
    } else if (t - lastSent > RESEND) sendResult();
  }
}, 250);

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'rd' && Array.isArray(m.grid) && m.grid.length === 16){
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
  picks = new Map(); mine = [];
  if (m.scores) scores = { ...m.scores };
  if (m.names) Object.assign(names, m.names);
  render();
}

function applyResult(m){
  result = { n: m.n, rows: m.rows, tie: m.tie, at: now() };
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
$('#start').onclick = () => { if (isHost()) { result = null; startRound(seatsNow().map(s => s.id), false); } };

/* ─────────── 그리기 ─────────── */
function face(c, extra = ''){
  return `<span class="face ${isRed(c) ? 'red' : ''} ${extra}"><b>${label(c)}</b><i>${SUITS[suitOf(c)]}</i></span>`;
}

function render(){
  if (!net) return;
  const ph = phase();
  const order = net.order();
  const seated = order.slice(0, MAX_SEATS);
  const host = order[0].id;

  // 자리
  const inRound = round && ph !== 'idle' ? round.seats : seated.map(s => s.id);
  $('#seats').innerHTML = seated.map(s => {
    const sc = scores[s.id] || 0;
    const picked = round && ph === 'pick' || ph === 'wait' ? (picks.get(s.id) || []).length : -1;
    const out = round && ph !== 'result' && !round.seats.includes(s.id);
    return `<li class="${s.id === me.id ? 'me' : ''} ${out ? 'out' : ''}">
      <span class="nm">${s.id === host ? '<em title="방장">★</em>' : ''}${esc(s.name)}${s.id === me.id ? ' <small>나</small>' : ''}</span>
      <span class="sc ${sc > 0 ? 'up' : sc < 0 ? 'down' : ''}">${sc > 0 ? '+' : ''}${sc}</span>
      ${picked >= 0 && !out ? `<span class="pk">${picked}/2</span>` : ''}
    </li>`;
  }).join('') + Array.from({ length: MAX_SEATS - seated.length }, () => '<li class="emptyseat">빈자리</li>').join('');
  const watchers = order.length - seated.length;
  $('#watch').textContent = watchers > 0 ? `관전 ${watchers}명` : '';
  $('#watch').hidden = watchers <= 0;

  // 판
  const showCards = ph === 'show' || ph === 'result';
  const g = round ? round.grid : null;
  $('#grid').innerHTML = Array.from({ length: 16 }, (_, i) => {
    const sel = mine.includes(i);
    const res = ph === 'result' && result.rows.find(r => r.id === me.id);
    const chosen = res && res.p.includes(i);
    if (!g) return `<button class="cell back" disabled><span class="ltr">${cellName(i)}</span></button>`;
    if (showCards) return `<button class="cell up ${chosen ? 'chosen' : ''}" disabled>${face(g[i])}<span class="tag">${cellName(i)}</span></button>`;
    return `<button class="cell back ${sel ? 'sel' : ''}" data-i="${i}" ${ph === 'pick' && amIn() ? '' : 'disabled'} aria-pressed="${sel}"><span class="ltr">${cellName(i)}</span></button>`;
  }).join('');

  // 가운데 카드
  const commUp = round && (ph === 'pick' || ph === 'wait' || ph === 'result');
  $('#comm').innerHTML = Array.from({ length: COMM }, (_, k) =>
    commUp ? `<span class="mini up">${face(round.comm[k])}</span>` : '<span class="mini back"></span>').join('');

  // 안내
  const head = $('#phase'), sub = $('#hint');
  $('#start').hidden = true;
  if (ph === 'idle'){
    head.textContent = '기다리는 중';
    if (host === me.id){
      $('#start').hidden = false;
      sub.textContent = seated.length > 1 ? `${seated.length}명이 모였어요. 시작을 누르세요.` : '혼자서도 연습할 수 있어요. 친구를 부르려면 링크를 보내세요.';
    } else sub.textContent = `방장 ${esc(nameOf(host))} 님이 시작하길 기다려요.`;
  } else if (ph === 'show'){
    head.textContent = round.tie ? '결승 · 외우세요' : '외우세요';
    sub.textContent = '16장의 자리를 기억해 두세요.';
  } else if (ph === 'pick'){
    head.textContent = round.tie ? '결승 · 두 칸을 고르세요' : '두 칸을 고르세요';
    sub.textContent = amIn()
      ? (mine.length ? `고른 칸 ${mine.map(cellName).join(' · ')}` : '가운데 두 장과 함께 족보를 만들 칸 둘')
      : '이번 판은 지켜봐요.';
  } else if (ph === 'wait'){
    head.textContent = '결과를 모으는 중…';
    sub.textContent = '';
  } else if (ph === 'result'){
    if (result.tie){
      head.textContent = '동점!';
      sub.textContent = `${result.tie.map(nameOf).map(esc).join(' · ')} 님이 결승을 해요.`;
    } else if (round.seats.length === 1){
      head.textContent = '연습 끝';
      sub.textContent = '';
    } else {
      const w = result.rows.find(r => r.win);
      head.textContent = w ? (w.id === me.id ? '이겼어요!' : `${nameOf(w.id)} 님 승리`) : '끝';
      sub.textContent = '';
    }
    if (!result.tie && host === me.id){ $('#start').hidden = false; $('#start').textContent = '다음 판'; }
    else if (!result.tie) sub.textContent = '방장이 다음 판을 시작해요.';
  }
  if (ph === 'idle') $('#start').textContent = '시작';

  // 결과 목록
  const box = $('#results');
  if (ph === 'result'){
    box.hidden = false;
    box.innerHTML = [...result.rows].sort((a, b) => compare(b.key, a.key)).map(r => {
      const cards = [...r.p.map(i => round.grid[i]), ...round.comm];
      const pt = r.pt > 0 ? '+1' : r.pt < 0 ? '−1' : r.win && result.tie ? '결승' : '·';
      return `<li class="${r.win ? 'win' : ''}">
        <div class="who"><b>${esc(nameOf(r.id))}${r.id === me.id ? ' <small>나</small>' : ''}</b>
          <span>${esc(r.hand)} · ${r.p.length ? r.p.map(cellName).join(' ') : '못 골랐어요'}</span></div>
        <div class="row5">${cards.map((c, k) => `<span class="mini up ${k < r.p.length ? 'own' : ''}">${face(c)}</span>`).join('')}</div>
        <span class="pt ${r.pt > 0 ? 'up' : r.pt < 0 ? 'down' : ''}">${pt}</span>
      </li>`;
    }).join('');
  } else box.hidden = true;

  document.body.dataset.phase = ph;
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
