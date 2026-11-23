import { ROUNDS, LIMIT, CARDS, CHIPS, ZONES, ZONE_NAME, MAX_SEATS, sumOf, canPut, newGame,
         canChoose, choose, turnOf, act, resolveStep, autoPick, ranking } from './rules.js?v=3';
import { joinRoom, makeId } from '../../poker/js/room.js?v=11';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';
import { isBot, botName, withBots } from '../../../js/bots.js?v=b1';

/*
 * Tower 13 — 접속과 화면.
 *
 * 서버가 없으므로 Memory Poker 처럼 **방장**이 판을 돌린다. 방장만 판 상태를 바꾸고
 * (rules.js), 바뀔 때마다 · 그리고 1.5초마다 모두에게 통째로 보낸다 ('gs'). 각자는
 * 자기 고르기('ch')와 올리기/패스('ac')를 방장에게 보낸다. 방장이 나가면 다음 사람이
 * 마지막 상태로 이어 간다.
 *
 * 한 판 = 고르기(모두 동시에, 몰래) → 차례(올리기 확정 · 패스, 박스는 숨긴 채) → 공개
 * (확정한 박스는 순서대로, 패스한 박스는 역순으로 자동).
 * 고른 박스는 판 상태에 들어 있지만 **화면에는 내 것만** 그린다. 공개 브로커라 마음먹고
 * 들여다보면 보이므로, 정말 숨겨야 할 내용은 아니라는 것을 기억할 것.
 *
 * 꾸러미
 *   {t:'hi', id, name, at, ready}                         들어왔음 · 3초마다 (room.js)
 *   {t:'gs', id, s, el, st}                               판 상태 (el = 이번 단계가 시작된 뒤 · st = 게임이 시작된 뒤)
 *   {t:'ch', id, g, round, card, chip, zone}              이번 판 내 박스 → 방장
 *   {t:'ac', id, g, seq, what:'put'|'pass'}               내 차례 → 방장
 */
const CHOOSE_T = 30000;      // 고르기 30초 — 못 고른 사람은 방장이 덜 위험한 박스로
const TURN = 30000;          // 한 차례 30초 — 넘기면 올리기로
const AWAY = 2500;           // 나가 있는 사람은 이만큼 기다렸다 대신
const RESOLVE_MS = 1400;     // 공개하며 하나씩 쌓는 간격 (보는 사람이 따라가게)
const DRAW_SHOW = 4000;      // 순서 뽑기를 보여 주는 시간
const RESEND = 1500;

const $ = s => document.querySelector(s);
const now = () => performance.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let store = {};
try { store = JSON.parse(localStorage.getItem('tower13') || '{}') || {}; } catch (_){}
const save = () => { try { localStorage.setItem('tower13', JSON.stringify(store)); } catch (_){} };

/* 확대 막기 — Memory Poker 와 같다 */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ─────────── 상태 ─────────── */
const me = { id: makeId(), name: '', at: 0, ready: -1 };
let net = null, roomId = null;
let S = null;            // 판 상태 (rules.js 모양)
let stepKey = '';        // 단계가 바뀌었는지 (고르기 · 차례 · 정리 · 판)
let stepAt = 0;          // 이번 단계가 시작된 때 (내 시계)
let startedAt = 0;       // 이번 게임이 시작된 때
let lastSent = 0, lastResolve = 0;
let pick = { card: null, chip: null, zone: null };
let sentAc = -1;         // 올리기/패스를 보낸 seq
let seenSeq = -1;
let shownOver = 0, shownDraw = 0;
let sheetFor = null;
let boomZone = null;

const isHost = () => net && net.order()[0].id === me.id;
const roomSeats = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (id === me.id ? me.name : isBot(id) ? botName(id) : (net && net.peers.get(id)?.name) || (S && S.names[id]) || '나간 사람');
/* 판에 남아 있는가 — 봇은 방장 기기 안에 늘 있다 */
const here = id => isBot(id) || net.present(id);
const inGame = () => S && !S.over && S.order.includes(me.id);
const drawing = () => S && !S.over && now() - startedAt < DRAW_SHOW;
const keyOf = s => s ? `${s.g}|${s.round}|${s.step}|${s.turn}|${s.queue.length}` : '';
const myPick = () => (S && S.picks[me.id]) || null;
const choosing = () => S && !S.over && !drawing() && S.step === 'choose' && inGame() && !myPick();
const myTurn = () => S && !drawing() && turnOf(S) === me.id;

/* 준비 — Memory Poker 와 같은 방식. '몇 번째 게임 다음' 을 위한 준비인지 숫자로 적는다 */
const readyBase = () => (S ? S.g : 0);
function isReady(id){
  if (id === net.order()[0].id) return true;
  const r = id === me.id ? me.ready : net.peers.get(id)?.ready;
  return r === readyBase();
}
const allReady = () => roomSeats().every(s => isReady(s.id));
const readyCount = () => roomSeats().filter(s => isReady(s.id)).length;

/* ─────────── 첫 화면 ─────────── */
const nameIn = $('#name'), codeIn = $('#code');
const ACCOUNT = readAccount();
nameIn.value = store.name || (ACCOUNT && ACCOUNT.user.id) || '';
const fromLink = channelFromHash();
if (fromLink && fromLink !== 'OPEN') codeIn.value = showChannel(fromLink);

function enter(id){
  const name = nameIn.value.trim().slice(0, 12);
  if (!name){ nameIn.focus(); $('#lobbyMsg').textContent = '이름을 먼저 적어 주세요.'; return; }
  store.name = name; save();
  me.name = name; me.at = serverNow();     // 들어온 순서(방장)는 서버 시각으로
  roomId = id;
  writeChannelToHash(id);
  $('#lobby').hidden = true; $('#room').hidden = false;
  $('#roomCode').textContent = showChannel(id);
  net = joinRoom({
    room: id, me, topicBase: 'tower13/', keep: [],
    onMessage, onPeers: render,
    onStatus(kind, text){ $('#netDot').className = 'dot ' + kind; $('#netText').textContent = text; }
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
    if (navigator.share) await navigator.share({ title: 'Tower 13', text: '같이 Tower 13 해요', url: link });
    else { await navigator.clipboard.writeText(link); flash('링크를 복사했어요'); }
  } catch (_){
    try { await navigator.clipboard.writeText(link); flash('링크를 복사했어요'); } catch (_){ prompt('이 링크를 보내 주세요', link); }
  }
};
function flash(text, ms = 1800){
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(flash.h); flash.h = setTimeout(() => { t.hidden = true; }, ms);
}

/* ─────────── 방장: 판 돌리기 ─────────── */
function sendState(){
  if (!S) return;
  lastSent = now();
  net.send({ t: 'gs', id: me.id, s: S, el: Math.round(now() - stepAt), st: Math.round(now() - startedAt) });
}
function commit(next){ adopt(next, 0, now() - startedAt); sendState(); }
function startGame(){
  if (!isHost() || !allReady()) return;
  const seats = withBots(roomSeats().map(s => s.id));     // 혼자면 META BOT 셋이 함께 (사용자 요청)
  const names = {};
  for (const id of seats) names[id] = nameOf(id);
  adopt(newGame((S ? S.g : 0) + 1, seats, names), 0, 0);
  sendState();
}
function hostChoose(id, card, chip, zone){
  if (!canChoose(S, id, card, chip, zone)) return false;
  commit(choose(S, id, card, chip, zone));
  return true;
}
function hostAct(id, what){
  if (turnOf(S) !== id || (what !== 'put' && what !== 'pass')) return false;
  commit(act(S, id, what));
  return true;
}
setInterval(() => {
  if (!net || !isHost() || !S) return;
  if (!S.over && !drawing()){
    const t = now() - stepAt;
    if (S.step === 'choose'){
      // 못 고른 사람 — 시간이 다 됐거나 나가 있으면 대신 고른다. 봇은 1~3초 뒤 스스로 고른다
      for (const id of S.order){
        if (S.picks[id]) continue;
        if (isBot(id) && t > botDelay(id)){
          const p = botChoose(S, id);
          if (p && hostChoose(id, p.card, p.chip, p.zone)) return;
          continue;
        }
        if (t > CHOOSE_T + 600 || (!here(id) && t > AWAY)){
          const p = autoPick(S, id);
          if (p && hostChoose(id, p.card, p.chip, p.zone)) return;
        }
      }
    } else if (S.step === 'turn'){
      const id = turnOf(S);
      if (isBot(id) && t > botDelay(id)){ if (hostAct(id, botAct(S, id))) return; }
      if (t > TURN + 600 || (!here(id) && t > AWAY)){ if (hostAct(id, 'put')) return; }
    } else if (S.step === 'resolve'){
      if (now() - lastResolve > RESOLVE_MS && t > RESOLVE_MS * 0.6){ lastResolve = now(); commit(resolveStep(S)); return; }
    }
  }
  if (now() - lastSent > RESEND) sendState();
}, 250);

/* ── META BOT 이 두는 법 ──
   고르기: 지금 보이는 탑의 합에 견주어, 13을 넘기지 않는 박스를 주로 고른다 (조금씩 흔들어
   사람처럼). 차례: 보이는 합 + 내 박스가 13을 넘으면 대개 패스, 아니면 대개 확정. */
const botWait = new Map();
function botDelay(id){
  const k = stepKey + '|' + id;
  if (!botWait.has(k)) botWait.set(k, 1000 + Math.random() * 2000);
  return botWait.get(k);
}
function botChoose(s, id){
  const u = s.used[id];
  let best = null;
  for (const card of CARDS) for (let chip = 0; chip < CHIPS.length; chip++) for (const zone of ZONES){
    if (u.c.includes(card) || u.h.includes(chip) || !canPut(chip, zone)) continue;
    const after = sumOf(s.zones[zone]) + card;
    const risk = (after >= LIMIT ? 20 + s.zones[zone].length : after) + Math.random() * 5
      + (CHIPS[chip] === 'w' ? 2 : 0);                        // 무지개는 아껴 둔다
    if (!best || risk < best.risk) best = { card, chip, zone, risk };
  }
  return best;
}
function botAct(s, id){
  const p = s.picks[id];
  if (!p) return 'put';
  const after = sumOf(s.zones[p.zone]) + p.card;
  const ahead = s.order.filter(o => s.done[o] === 'put').length;   // 앞에서 확정한 수만큼 더 쌓일 수 있다
  const danger = after >= LIMIT ? 0.8 : after + ahead * 2 >= LIMIT ? 0.5 : 0.2;
  return Math.random() < danger ? 'pass' : 'put';
}

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'gs' && m.s && Array.isArray(m.s.order)){
    if (S && (m.s.g < S.g || (m.s.g === S.g && m.s.seq <= S.seq))) return;   // 더 나중 것만
    adopt(m.s, +m.el || 0, +m.st || 0);
  } else if (m.t === 'ch' && isHost() && S && m.g === S.g && m.round === S.round){
    hostChoose(m.id, m.card | 0, m.chip | 0, m.zone);
  } else if (m.t === 'ac' && isHost() && S && m.g === S.g && m.seq === S.seq){
    hostAct(m.id, m.what);
  }
}

function adopt(s, el, st){
  const fresh = !S || s.g !== S.g;
  const prevRound = S && S.round;
  S = s;
  const k = keyOf(s);
  if (k !== stepKey){ stepKey = k; stepAt = now() - el; }
  if (fresh){ startedAt = now() - st; seenSeq = s.seq; closeSheet(); }
  if (fresh || prevRound !== s.round) pick = { card: null, chip: null, zone: null };
  // 새로 올라온 박스 · 무너짐을 한 번 알린다
  if (s.seq !== seenSeq && s.last){
    seenSeq = s.seq;
    const L = s.last;
    if (L.boom){
      flash(`💥 ${nameOf(L.id)} 님 ${ZONE_NAME[L.zone]} 탑 와르르 · −${L.boom}점`, 2600);
      boomZone = { z: L.zone, n: L.boom, at: now() };
      if (navigator.vibrate) navigator.vibrate(L.id === me.id ? [60, 40, 120] : 30);
    }
  }
  render();
}

/* ─────────── 내 고르기 · 차례 ─────────── */
function pickPart(kind, v){
  if (!choosing()) return;
  pick[kind] = pick[kind] === v ? null : v;
  if (kind === 'chip'){
    const c = pick.chip == null ? null : CHIPS[pick.chip];
    pick.zone = c && c !== 'w' ? c : (c === 'w' && pick.zone ? pick.zone : null);
  }
  if (navigator.vibrate) navigator.vibrate(6);
  render();
}
function chooseZone(z){
  if (!choosing() || pick.chip == null || !canPut(pick.chip, z)) return;
  pick.zone = z;
  render();
}
function sendChoice(){
  if (!choosing() || pick.card == null || pick.chip == null || !pick.zone) return;
  if (!canChoose(S, me.id, pick.card, pick.chip, pick.zone)) return;
  pick.sent = S.round;
  if (isHost()) hostChoose(me.id, pick.card, pick.chip, pick.zone);
  else net.send({ t: 'ch', id: me.id, g: S.g, round: S.round, card: pick.card, chip: pick.chip, zone: pick.zone });
  render();
}
function sendAct(what){
  if (!myTurn()) return;
  sentAc = S.seq; lastAc = what;
  if (isHost()) hostAct(me.id, what);
  else net.send({ t: 'ac', id: me.id, g: S.g, seq: S.seq, what });
  render();
}
let lastAc = 'put';
// 보낸 것이 방장에게 닿지 않았을 수 있다 (QoS 0) — 그대로면 1초마다 다시 보낸다
setInterval(() => {
  if (!net || !S || isHost()) return;
  if (S.step === 'choose' && pick.sent === S.round && !myPick() && pick.card != null)
    net.send({ t: 'ch', id: me.id, g: S.g, round: S.round, card: pick.card, chip: pick.chip, zone: pick.zone });
  if (myTurn() && sentAc === S.seq)
    net.send({ t: 'ac', id: me.id, g: S.g, seq: S.seq, what: lastAc });
}, 1000);

function toggleReady(){
  if (isHost() || !roomSeats().some(s => s.id === me.id)) return;
  me.ready = me.ready === readyBase() ? -1 : readyBase();
  net.hi(); render();
}
function readyButton(){
  const n = roomSeats().length;
  if (isHost()){
    const ok = allReady();
    return `<button class="btn primary" data-act="start" type="button" ${ok ? '' : 'disabled'}>${ok ? '게임 시작' : `준비 기다리는 중 ${readyCount()}/${n}`}</button>`;
  }
  if (!roomSeats().some(s => s.id === me.id)) return '<span class="wait">관전 중 · 자리가 나면 앉아요</span>';
  return me.ready === readyBase()
    ? '<button class="btn on" data-act="ready" type="button">✓ 준비 완료 <small>· 취소</small></button>'
    : '<button class="btn primary" data-act="ready" type="button">게임 준비</button>';
}

$('#cards').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) pickPart('card', +b.dataset.v); });
$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) pickPart('chip', +b.dataset.i); });
$('#board').addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (z) chooseZone(z.dataset.z); });
$('#actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'choose') sendChoice();
  else if (a === 'put' || a === 'pass') sendAct(a);
  else if (a === 'start') startGame();
  else if (a === 'ready') toggleReady();
  else if (a === 'result') openSheet('result');
});

/* ─────────── 올라오는 창 ─────────── */
const sheet = $('#sheet');
function openSheet(what){ sheetFor = what; sheet.hidden = false; drawSheet(); }
function closeSheet(){ sheetFor = null; sheet.hidden = true; }
$('#sheetClose').onclick = () => { closeSheet(); render(); };
sheet.addEventListener('click', e => {
  if (e.target === sheet) return void (closeSheet(), render());
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'close'){ closeSheet(); render(); }
  else if (b.dataset.act === 'ready') toggleReady();
  else if (b.dataset.act === 'start') startGame();
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden){ closeSheet(); render(); } });

const HOW = `<ol class="how">
  <li>각자 <b>숫자 카드 0~6</b> 일곱 장과 <b>칩 일곱 개</b>(빨강 · 초록 · 파랑 둘씩, 무지개 하나). 시작할 때 카드를 뽑아 <b>순서</b>를 정해요.</li>
  <li>판이 시작하면 <b>모두 동시에</b> 이번 판의 박스(카드 + 칩)를 몰래 골라요. <b>무지개</b>는 올릴 색까지.</li>
  <li>순서대로 한 사람씩 <b>올리기 확정</b> 또는 <b>패스</b>. 모두 정하기 전까지 내 박스는 남에게 안 보여요.</li>
  <li>모두 정하면 공개 — 확정한 박스는 <b>순서대로</b>, 패스한 박스는 <b>거꾸로</b>(마지막에 패스한 사람부터) 쌓여요.</li>
  <li>쌓은 뒤 그 탑이 <b>13 이상</b>이면 와르르 — 그 박스 주인이 탑의 박스를 <b>전부</b> 가져오고 <b>하나에 −1점</b>. 탑은 비어요.</li>
  <li><b>7판</b>이면 끝. 점수가 높을수록 위. 고르기 · 차례는 <b>30초</b>, 넘기면 대신 정해져요.</li>
</ol>`;
$('#howBtn').onclick = () => {
  sheetFor = 'how';
  $('#sheetTitle').textContent = '게임 방법';
  $('#sheetSub').textContent = '';
  $('#sheetBody').innerHTML = HOW;
  $('#sheetBtns').innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
  sheet.hidden = false;
};

function drawSheet(){
  if (!sheetFor || sheetFor === 'how' || !S) return;
  const T = $('#sheetTitle'), Sub = $('#sheetSub'), B = $('#sheetBody'), F = $('#sheetBtns');
  if (sheetFor === 'draw'){
    T.textContent = '순서 뽑기';
    Sub.textContent = '뽑은 카드가 작은 사람부터 해요. 일곱 판 내내 이 순서예요.';
    B.innerHTML = '<ul class="order">' + S.order.map(id => `<li><span class="card">${S.draw[id]}</span><span class="nm">${esc(nameOf(id))}${id === me.id ? ' (나)' : ''}</span></li>`).join('') + '</ul>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">확인</button>';
    return;
  }
  if (sheetFor === 'result'){
    const rows = ranking(S);
    const top = rows[0];
    const solo = S.order.length === 1;
    T.textContent = solo ? '연습 끝' : rows.filter(r => r.rank === 1).length > 1 ? '공동 1등!' : top.id === me.id ? '이겼어요!' : `${nameOf(top.id)} 님 승리`;
    Sub.textContent = '박스를 적게 가져온 사람이 이겨요.';
    B.innerHTML = `<ol id="rank" class="${rows.length > 5 ? 'tight' : ''}">` + rows.map(r =>
      `<li class="${r.rank === 1 ? 'win' : ''}"><span class="no">${r.rank}</span><span class="nm">${esc(nameOf(r.id))}${r.id === me.id ? ' (나)' : ''}</span>
       <span class="tk">박스 ${r.took}</span><span class="sc ${r.score < 0 ? 'down' : ''}">${r.score}</span></li>`).join('') + '</ol>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">판 보기</button>' + readyButton();
  }
}

/* ─────────── 그리기 ─────────── */
function phaseNow(){
  if (!S) return 'idle';
  if (S.over) return 'over';
  if (drawing()) return 'draw';
  return S.step;                 // choose · turn · resolve
}
const boxText = p => `${ZONE_NAME[p.zone]} ${p.card}${CHIPS[p.chip] === 'w' ? ' (무지개)' : ''}`;

function render(){
  if (!net) return;
  const ph = phaseNow();
  const host = net.order()[0].id;
  const between = ph === 'idle' || ph === 'over';
  const cur = S && ph === 'turn' ? turnOf(S) : null;
  const pending = S && ph === 'resolve' ? S.queue : [];

  // 자리 — 이름 · 점수 · 지금 무엇을 하는지
  // 게임이 끝난 뒤에도 그 게임의 사람(봇 포함)은 자리에 남겨 점수를 보여 준다
  const showIds = ph === 'idle' ? roomSeats().map(s => s.id)
    : ph === 'over' ? [...new Set([...S.order, ...roomSeats().map(s => s.id)])].slice(0, MAX_SEATS) : S.order;
  $('#seats').innerHTML = showIds.map(id => {
    const has = S && S.scores[id] != null;
    const sc = has ? S.scores[id] : 0;
    const rd = between && (isBot(id) || isReady(id));
    let right = '';
    if (between) right = id === host ? '방장' : isBot(id) ? 'BOT' : rd ? '✓ 준비' : '대기';
    else if (ph === 'draw') right = `${S.order.indexOf(id) + 1}번`;
    else if (ph === 'choose') right = S.picks[id] ? '✓ 고름' : '고르는 중';
    else if (ph === 'turn'){
      const d = S.done[id];
      right = id === cur ? '▶ 차례' : d === 'pass' ? '패스' : d === 'put' ? '✓ 확정' : `${S.order.indexOf(id) + 1}번`;
    } else if (ph === 'resolve') right = (S.done[id] === 'pass' ? '패스' : '확정') + (pending.includes(id) ? ' · 대기' : ' · 쌓임');
    return `<li class="${id === me.id ? 'me' : ''} ${id === cur || pending[0] === id ? 'turn' : ''} ${rd ? 'rd' : ''} ${!between && !here(id) ? 'out' : ''}">
      <span class="nm">${id === host ? '<em>★</em>' : ''}${esc(nameOf(id))}</span>
      <span class="sc ${sc < 0 ? 'down' : ''}">${has ? sc : ''}</span><span class="pk ${rd ? 'up' : ''}">${right}</span></li>`;
  }).join('') + Array.from({ length: Math.max(0, MAX_SEATS - showIds.length) }, () => '<li class="empty">빈자리</li>').join('');

  // 판 — 세 탑. 박스는 정사각형, 한 줄에 두 개씩 아래부터
  const zones = S ? S.zones : { r: [], g: [], b: [] };
  const mineP = myPick();
  const target = choosing() ? pick.zone : (myTurn() && mineP ? mineP.zone : null);
  const canZ = z => choosing() && pick.chip != null && CHIPS[pick.chip] === 'w' && canPut(pick.chip, z);
  $('#board').innerHTML = ZONES.map(z => {
    const boxes = zones[z];
    const sum = sumOf(boxes);
    const newest = S && S.last && S.last.card != null && S.last.zone === z && !S.last.boom && boxes.length ? boxes.length - 1 : -1;
    const bang = boomZone && boomZone.z === z && now() - boomZone.at < 1600 ? `<div class="bang">💥 −${boomZone.n}</div>` : '';
    return `<button class="zone ${canZ(z) ? 'can' : ''} ${target === z ? 'pick' : ''} ${bang ? 'boom' : ''}" data-z="${z}" type="button" aria-label="${ZONE_NAME[z]} 탑 합 ${sum}">
      <div class="head"><span class="nmz">${ZONE_NAME[z]}</span><span class="sum">${sum}<small>/${LIMIT}</small></span></div>
      <div class="meter"><i style="transform:scaleX(${Math.min(1, sum / LIMIT)})"></i></div>
      <div class="pile">${boxes.length ? boxes.map(([n, by], i) => `<div class="box ${i === newest ? 'new' : ''}"><b>${n}</b><small>${esc(nameOf(by))}</small></div>`).join('') : '<span class="none">비어 있어요</span>'}</div>
      ${bang}</button>`;
  }).join('');
  fitBoxes();

  // 내 손 — 고르는 동안만 누를 수 있다. 고른 뒤에는 고른 것을 표시해 둔다
  const used = S && S.used[me.id];
  const showSel = choosing() ? pick : (mineP || {});
  $('#hand').classList.toggle('off', !choosing());
  $('#cards').innerHTML = CARDS.map(c => {
    const u = used ? used.c.includes(c) : false;
    return `<button type="button" data-v="${c}" ${u || !choosing() ? 'disabled' : ''} class="${showSel.card === c ? 'sel' : ''}" aria-label="숫자 ${c}${u ? ' (냄)' : ''}">${c}</button>`;
  }).join('');
  $('#chips').innerHTML = CHIPS.map((c, i) => {
    const u = used ? used.h.includes(i) : false;
    return `<button type="button" data-i="${i}" data-c="${c}" ${u || !choosing() ? 'disabled' : ''} class="${showSel.chip === i ? 'sel' : ''}" aria-label="${ZONE_NAME[c]} 칩${u ? ' (냄)' : ''}"><i></i></button>`;
  }).join('');

  // 안내 두 줄
  let head = '', sub = '';
  if (ph === 'idle'){
    const n = roomSeats().length;
    head = allReady() ? (isHost() ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${n}`;
    sub = isHost() ? (n === 1 ? '혼자 시작하면 META BOT 셋이 함께 해요' : allReady() ? '게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : roomSeats().some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 시작하길 기다려요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요';
  } else if (ph === 'draw'){
    head = '순서를 뽑는 중';
    sub = S.order.map(id => nameOf(id)).join(' → ');
  } else if (ph === 'choose'){
    const n = S.order.filter(id => S.picks[id]).length;
    head = `${S.round}/${ROUNDS}판 · 박스 고르기`;
    if (choosing()){
      sub = pick.card == null ? '이번 판에 낼 숫자 카드를 골라요 (몰래)' : pick.chip == null ? '색 칩을 골라요'
        : !pick.zone ? '무지개 칩 — 올릴 탑을 눌러요' : `${boxText(pick)} · 정하기를 눌러요`;
    } else sub = mineP ? `내 박스 ${boxText(mineP)} · 다른 사람 기다리는 중 ${n}/${S.order.length}` : `고르는 중 ${n}/${S.order.length}`;
  } else if (ph === 'turn'){
    head = `${S.round}/${ROUNDS}판 · ` + (cur === me.id ? '내 차례 — 확정할까, 패스할까' : `${nameOf(cur)} 님 차례`);
    if (cur === me.id && mineP){
      const puts = S.order.filter(id => S.done[id] === 'put').length;
      sub = `내 박스 ${boxText(mineP)} · 지금 보이는 합 ${sumOf(S.zones[mineP.zone])}` + (puts ? ` · 앞에서 ${puts}명 확정` : '');
    } else sub = lastLine();
  } else if (ph === 'resolve'){
    head = `${S.round}/${ROUNDS}판 · 공개하며 쌓는 중`;
    sub = (pending.length ? `다음 ${nameOf(pending[0])} 님 (${S.done[pending[0]] === 'pass' ? '패스 · 거꾸로' : '확정'}) · ${pending.length} 남음 · ` : '') + lastLine();
  } else if (ph === 'over'){
    const r = ranking(S).find(x => x.id === me.id);
    head = '7판 끝!';
    sub = (r ? `나는 ${r.rank}등 · ${r.score}점 · ` : '') + `다음 게임 준비 ${readyCount()}/${roomSeats().length}`;
  }
  $('#phase').textContent = head;
  $('#hint').textContent = sub;

  // 단추 한 줄
  let act = '';
  if (ph === 'idle') act = readyButton();
  else if (ph === 'draw') act = '<span class="wait">곧 시작해요</span>';
  else if (ph === 'choose'){
    if (choosing()){
      const ok = pick.card != null && pick.chip != null && pick.zone && pick.sent !== S.round;
      act = `<button class="btn primary" data-act="choose" type="button" ${ok ? '' : 'disabled'}>${pick.sent === S.round ? '보내는 중…' : '이 박스로 정하기'}</button>`;
    } else act = `<span class="wait">${inGame() ? '정했어요 · 모두 고르면 시작' : '고르는 중 · 지켜보는 중'}</span>`;
  } else if (ph === 'turn'){
    if (cur === me.id){
      const busy = sentAc === S.seq;
      act = `<button class="btn" data-act="pass" type="button" ${busy ? 'disabled' : ''}>패스</button><button class="btn primary" data-act="put" type="button" ${busy ? 'disabled' : ''}>${busy ? '보내는 중…' : '올리기 확정'}</button>`;
    } else act = `<span class="wait">${inGame() ? `${esc(nameOf(cur))} 님이 정하는 중` : '지켜보는 중'}</span>`;
  } else if (ph === 'resolve') act = '<span class="wait">확정은 순서대로 · 패스는 거꾸로 쌓는 중</span>';
  else if (ph === 'over') act = '<button class="btn" data-act="result" type="button">결과 보기</button>' + readyButton();
  const A = $('#actions');
  if (A.dataset.html !== act){ A.innerHTML = act; A.dataset.html = act; }

  if (ph === 'draw' && shownDraw !== S.g){ shownDraw = S.g; openSheet('draw'); return; }
  if (ph !== 'draw' && sheetFor === 'draw') closeSheet();
  if (ph === 'over' && shownOver !== S.g){ shownOver = S.g; openSheet('result'); return; }
  if (sheetFor) drawSheet();
}
function lastLine(){
  const L = S && S.last;
  if (!L) return '첫 박스를 기다려요';
  const who = L.id === me.id ? '내가' : `${nameOf(L.id)} 님이`;
  if (L.decide) return `${who} ${L.decide === 'pass' ? '패스' : '올리기 확정'} — 박스는 모두 정한 뒤 공개돼요`;
  const how = L.how === 'pass' ? '(패스) ' : '';
  return L.boom ? `${how}${who} ${ZONE_NAME[L.zone]}에 ${L.card} → ${L.sum} 💥 −${L.boom}점`
                : `${how}${who} ${ZONE_NAME[L.zone]}에 ${L.card}${L.chip === 'w' ? ' (무지개)' : ''} → 합 ${L.sum}`;
}

/* 박스 크기 — 정사각형, 한 줄에 두 개. 탑의 폭과 높이 안에 다 들어가는 가장 큰 크기 */
function fitBoxes(){
  for (const st of document.querySelectorAll('#board .pile')){
    const n = st.querySelectorAll('.box').length;
    if (!n) continue;
    const W = st.clientWidth, H = st.clientHeight, gap = 3;
    const rows = Math.ceil(n / 2);
    // 소수점 반올림으로 1px 모자라 둘째 칸이 아래로 밀리지 않게 1px 덜어 둔다
    const s = Math.max(10, Math.floor(Math.min((W - gap - 1) / 2, (H - (rows - 1) * gap - 1) / rows, 56)));
    st.style.setProperty('--s', s + 'px');
    st.classList.toggle('small', s < 34);
  }
}
new ResizeObserver(fitBoxes).observe($('#board'));

/* 시간 띠 · 남은 초는 따로 자주 그린다 */
let lastPh = null;
function clock(){
  requestAnimationFrame(clock);
  const ph = phaseNow();
  if (ph !== lastPh){ lastPh = ph; render(); }
  const bar = $('#bar'), num = $('#count');
  const whole = ph === 'choose' ? CHOOSE_T : ph === 'turn' ? TURN : 0;
  if (!whole){ bar.style.transform = 'scaleX(0)'; num.textContent = ''; }
  else {
    const left = Math.max(0, whole - (now() - stepAt));
    bar.style.transform = `scaleX(${left / whole})`;
    const s = Math.ceil(left / 1000);
    if (num.textContent !== String(s)) num.textContent = s;
  }
  if (boomZone && now() - boomZone.at > 1700){ boomZone = null; render(); }
}
requestAnimationFrame(clock);
