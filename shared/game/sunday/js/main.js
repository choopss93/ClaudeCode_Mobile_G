import { ROUND_MS, ANSWER_MS, REVEAL_MS, BUZZ_WINDOW, ROUND_CHOICES, MAX_SEATS, newGame, canBuzz, buzz, submit, timeUp, next,
         ranking, questionOf, titleOf, poolSize } from './rules.js?v=1';
import { CAT_NAME, MODE_NAME } from './data.js?v=1';
import { joinRoom, makeId } from '../../poker/js/room.js?v=12';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';
import { trackPresence } from '../../../js/presence.js?v=p2';

/*
 * 어메이징 선데이 — 접속과 화면.
 *
 * Tower 13 처럼 **방장**이 판을 돌린다 (rules.js). 방장만 상태를 바꾸고, 바뀔 때마다 · 1.5초마다 통째로
 * 보낸다 ('gs'). 방장이 나가면 다음 사람이 마지막 상태로 잇는다.
 *
 * 꾸러미
 *   {t:'hi', id, name, at, ready, comm, games}   들어왔음 (room.js) — comm = 설정(갈래 · 방식), games = 판 수
 *   {t:'gs', id, s, el, rel}                     판 상태 (el = 이번 단계가 시작된 뒤 · rel = 이번 판이 시작된 뒤)
 *   {t:'bz', id, g, n, at}                       손 — at 은 서버 시각. 거의 같이 들면 이른 사람
 *   {t:'ty', id, g, k, text}                     손 든 사람이 적는 글자 — 모두에게 실시간으로
 *   {t:'sb', id, g, k, text}                     제출 → 방장
 *
 * 설정(영화 · 웹툰, 초성 · 줄임말, 판 수)은 **게임 시작 전에** 방장이 고른다 (사용자 요청).
 */
const AWAY = 2500;
const RESEND = 1500;
const $ = s => document.querySelector(s);
const now = () => performance.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let store = {};
try { store = JSON.parse(localStorage.getItem('amazingSunday') || '{}') || {}; } catch (_){}
const save = () => { try { localStorage.setItem('amazingSunday', JSON.stringify(store)); } catch (_){} };

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ─────────── 설정 — 인사(hi)의 comm(갈래 · 방식) · games(판 수)로 방장 것을 모두가 본다 ─────────── */
const CATS = ['movie', 'webtoon'], MODES = ['cho', 'abbr'];
const opt = {
  cat: CATS.includes(store.cat) ? store.cat : 'movie',
  mode: MODES.includes(store.mode) ? store.mode : 'cho',
  rounds: ROUND_CHOICES.includes(store.rounds) ? store.rounds : 10
};
const packOpt = o => 1 + CATS.indexOf(o.cat) * 2 + MODES.indexOf(o.mode);
const unpackOpt = (c, r) => (c >= 1 && c <= 4 ? { cat: CATS[(c - 1) >> 1], mode: MODES[(c - 1) & 1], rounds: ROUND_CHOICES.includes(r) ? r : 10 } : null);

/* ─────────── 상태 ─────────── */
const me = { id: makeId(), name: '', at: 0, ready: -1, comm: packOpt(opt), games: opt.rounds };
let net = null, roomId = null;
let S = null;
let stepKey = '', stepAt = 0;      // 단계(손 기다림 · 적는 중 · 정답)가 바뀐 때
let roundKey = '', roundAt = 0;    // 판이 바뀐 때 — 3분을 잰다
let lastSent = 0;
let buzzReq = [];                  // 방장 — 이번에 모인 손 [{id, at}]
let buzzFirst = 0;
let liveText = '', liveK = -1;     // 손 든 사람이 적는 글자 (모두가 받아 둔다)
let sentBz = '', sentSb = -1, mySb = '';
let lastTy = 0;
let sheetFor = null, shownOver = 0;
let seenSeq = -1;

const isHost = () => net && net.order()[0].id === me.id;
const roomSeats = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (id === me.id ? me.name : (net && net.peers.get(id)?.name) || (S && S.names[id]) || '나간 사람');
const here = id => net.present(id);
const inGame = () => S && !S.over && S.order.includes(me.id);
const keyOf = s => s ? `${s.g}|${s.n}|${s.phase}|${s.k}` : '';
const rKeyOf = s => s ? `${s.g}|${s.n}` : '';
const left = () => Math.max(0, ROUND_MS - (now() - roundAt));
const ansLeft = () => Math.max(0, ANSWER_MS - (now() - stepAt));
const fmt = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/* 지금 방의 설정 — 방장 것. 방장이 아니면 받아 둔다 */
function roomOpt(){
  if (!net) return opt;
  const h = net.order()[0];
  if (h.id !== me.id){
    const p = net.peers.get(h.id);
    const o = p && unpackOpt(p.comm, p.games);
    if (o) Object.assign(opt, o);
  }
  return opt;
}
function setOpt(k, v){
  if (net && !isHost()) return;
  opt[k] = v;
  store.cat = opt.cat; store.mode = opt.mode; store.rounds = opt.rounds; save();
  me.comm = packOpt(opt); me.games = opt.rounds;
  if (net) net.hi();
  render();
}

/* 준비 — Tower 13 과 같다. '몇 번째 게임 다음' 을 위한 준비인지 숫자로 */
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
nameIn.value = store.name || '';
/* 로그인했으면 이름은 아이디로 고정 (Memory Poker · Tower 13 과 같다) */
if (ACCOUNT){
  nameIn.value = ACCOUNT.user.id;
  nameIn.readOnly = true;
  nameIn.classList.add('locked');
  const lbl = document.querySelector('label[for="name"]');
  if (lbl) lbl.innerHTML = '내 아이디 <small class="lockNote">· 바꾸기는 Studio 메뉴에서</small>';
}
const fromLink = channelFromHash();
if (fromLink && fromLink !== 'OPEN') codeIn.value = showChannel(fromLink);

function enter(id){
  const name = nameIn.value.trim().slice(0, 12);
  if (!name){ nameIn.focus(); $('#lobbyMsg').textContent = '이름을 먼저 적어 주세요.'; return; }
  if (!ACCOUNT){ store.name = name; save(); }
  me.name = name; me.at = serverNow();
  roomId = id;
  writeChannelToHash(id);
  $('#lobby').hidden = true; $('#room').hidden = false;
  $('#roomCode').textContent = showChannel(id);
  net = joinRoom({
    room: id, me, topicBase: 'amazingsunday/', keep: [],
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
    if (navigator.share) await navigator.share({ title: '어메이징 선데이', text: '같이 어메이징 선데이 해요', url: link });
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
  net.send({ t: 'gs', id: me.id, s: S, el: Math.round(now() - stepAt), rel: Math.round(now() - roundAt) });
}
function commit(nextS){ adopt(nextS, 0, nextS.n === S.n && nextS.g === S.g ? now() - roundAt : 0); sendState(); }
function startGame(){
  if (!isHost() || !allReady()) return;
  const seats = roomSeats().map(s => s.id);
  const names = {};
  for (const id of seats) names[id] = nameOf(id);
  adopt(newGame((S ? S.g : 0) + 1, seats, names, roomOpt()), 0, 0);
  sendState();
}
const alive = () => S.order.filter(here);
function hostSubmit(id, text){
  if (!S || S.phase !== 'buzz' || S.buzzer !== id) return;
  commit(submit(S, id, text, alive()));
}
function hostBuzz(id, at){
  if (!canBuzz(S, id)) return;
  if (!buzzReq.length) buzzFirst = now();
  if (!buzzReq.some(b => b.id === id)) buzzReq.push({ id, at: +at || serverNow() });
}
setInterval(() => {
  if (!net || !isHost() || !S || S.over) return;
  const t = now() - stepAt;
  if (S.phase === 'q'){
    if (buzzReq.length && now() - buzzFirst >= BUZZ_WINDOW){
      const pick = buzzReq.filter(b => canBuzz(S, b.id)).sort((a, b) => a.at - b.at)[0];
      buzzReq = [];
      if (pick){ liveText = ''; commit(buzz(S, pick.id)); return; }
    }
    if (left() <= 0){ buzzReq = []; commit(timeUp(S)); return; }
  } else if (S.phase === 'buzz'){
    // 20초 — 제출하지 않았으면 적어 둔 글자로 대신 낸다 (손 든 사람이 나갔어도)
    if (t > ANSWER_MS + 1200 || (!here(S.buzzer) && S.buzzer !== me.id && t > AWAY)){
      hostSubmit(S.buzzer, liveK === S.k ? liveText : ''); return;
    }
  } else if (S.phase === 'reveal'){
    if (t > REVEAL_MS){ commit(next(S)); return; }
  }
  if (now() - lastSent > RESEND) sendState();
}, 200);

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'gs' && m.s && Array.isArray(m.s.order)){
    if (S && (m.s.g < S.g || (m.s.g === S.g && m.s.seq <= S.seq))) return;
    adopt(m.s, +m.el || 0, +m.rel || 0);
  } else if (m.t === 'bz' && isHost() && S && m.g === S.g && m.n === S.n){
    hostBuzz(m.id, m.at);
  } else if (m.t === 'ty' && S && m.g === S.g && m.k === S.k && m.id === S.buzzer){
    liveText = String(m.text || '').slice(0, 40); liveK = m.k;
    paintLive();
  } else if (m.t === 'sb' && isHost() && S && m.g === S.g && m.k === S.k){
    hostSubmit(m.id, m.text);
  }
}

function adopt(s, el, rel){
  const fresh = !S || s.g !== S.g;
  const prev = S;
  S = s;
  const k = keyOf(s);
  if (k !== stepKey){ stepKey = k; stepAt = now() - el; }
  const rk = rKeyOf(s);
  if (rk !== roundKey){ roundKey = rk; roundAt = now() - rel; }
  if (fresh){ seenSeq = s.seq; closeSheet(); }
  if (s.phase === 'buzz' && liveK !== s.k){ liveText = ''; liveK = s.k; }
  if (s.phase !== 'buzz') mySb = '';
  // 알림 — 맞힘 · 틀림 · 되살아남 · 시간 끝
  if (!fresh && prev && s.seq !== seenSeq && s.last && s.last !== prev.last && JSON.stringify(s.last) !== JSON.stringify(prev.last)){
    const L = s.last;
    if (L.timeout) flash(`시간 끝! 정답은 「${titleOf(s, s.n)}」`, 2600);
    else if (L.ok) flash(`${L.id === me.id ? '정답! +1점' : `${nameOf(L.id)} 님 정답! +1점`}`, 2200);
    else flash(L.revive ? '모두 틀렸어요 — 다시 손을 들 수 있어요!' : `${L.id === me.id ? '오답 −1점 · 이번 판은 쉬어요' : `${nameOf(L.id)} 님 오답 −1점`}`, 2200);
  }
  seenSeq = s.seq;
  render();
  // 내가 손을 들게 됐다 — 바로 적을 수 있게
  if (s.phase === 'buzz' && s.buzzer === me.id && (!prev || prev.phase !== 'buzz' || prev.k !== s.k)){
    requestAnimationFrame(() => { const i = $('#ansIn'); if (i){ i.value = ''; i.focus(); } });
  }
}

/* ─────────── 내 손 · 내 답 ─────────── */
function pressBuzz(){
  if (!canBuzz(S, me.id)) return;
  const key = `${S.g}|${S.n}|${S.seq}`;
  if (sentBz === key) return;
  sentBz = key;
  const at = serverNow();
  if (isHost()) hostBuzz(me.id, at);
  else net.send({ t: 'bz', id: me.id, g: S.g, n: S.n, at });
  render();
}
function sendTyping(text){
  if (!S || S.phase !== 'buzz' || S.buzzer !== me.id) return;
  liveText = text; liveK = S.k;
  paintLive();
  const t = now();
  if (t - lastTy < 120){ clearTimeout(sendTyping.h); sendTyping.h = setTimeout(() => sendTyping($('#ansIn') ? $('#ansIn').value : text), 130); return; }
  lastTy = t;
  net.send({ t: 'ty', id: me.id, g: S.g, k: S.k, text: text.slice(0, 40) });
}
function sendAnswer(){
  if (!S || S.phase !== 'buzz' || S.buzzer !== me.id) return;
  const text = ($('#ansIn') ? $('#ansIn').value : '').trim();
  if (!text){ $('#ansIn') && $('#ansIn').focus(); return; }
  sentSb = S.k; mySb = text;
  if (isHost()) hostSubmit(me.id, text);
  else net.send({ t: 'sb', id: me.id, g: S.g, k: S.k, text });
  render();
}
// QoS 0 — 손 · 답이 방장에게 닿지 않았을 수 있다. 그대로면 다시 보낸다
setInterval(() => {
  if (!net || !S || isHost()) return;
  if (S.phase === 'buzz' && S.buzzer === me.id && sentSb === S.k && mySb) net.send({ t: 'sb', id: me.id, g: S.g, k: S.k, text: mySb });
  if (S.phase === 'buzz' && S.buzzer === me.id && liveK === S.k) net.send({ t: 'ty', id: me.id, g: S.g, k: S.k, text: liveText });
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

$('#actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'buzz') pressBuzz();
  else if (a === 'send') sendAnswer();
  else if (a === 'start') startGame();
  else if (a === 'ready') toggleReady();
  else if (a === 'result') openSheet('result');
});
$('#actions').addEventListener('input', e => { if (e.target.id === 'ansIn') sendTyping(e.target.value); });
$('#actions').addEventListener('submit', e => { e.preventDefault(); sendAnswer(); });
$('#board').addEventListener('click', e => {
  const b = e.target.closest('[data-opt]');
  if (!b) return;
  const [k, v] = b.dataset.opt.split(':');
  setOpt(k, k === 'rounds' ? +v : v);
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
  <li>게임을 시작하기 전에 방장이 <b>영화 · 웹툰</b>, <b>초성 · 줄임말</b>, <b>판 수</b>(5 · 10 · 15 · 20 · 30)를 골라요.</li>
  <li>문제가 나오면 <b>[✋ 손]</b>을 가장 먼저 누른 <b>한 사람만</b> 답을 적어요. 적는 글자는 모두에게 실시간으로 보여요.</li>
  <li><b>20초</b> 안에 제목을 다 적고 <b>제출</b>. 제출한 답은 모두가 함께 봐요. 띄어쓰기 · 문장부호는 신경 쓰지 않아도 돼요.</li>
  <li>맞히면 <b>+1점</b>, 다음 판으로. 틀리면 <b>−1점</b>이고 그 판에서는 손을 들 수 없어요.</li>
  <li>그런데 <b>남은 사람이 모두 틀리면</b> 모두 다시 살아나서 손을 들 수 있어요.</li>
  <li>한 판은 <b>최대 3분</b>. 아무도 못 맞히면 정답을 보여 주고 넘어가요. 점수가 높을수록 위.</li>
</ol>`;
$('#howBtn').onclick = () => {
  sheetFor = 'how'; sheet.hidden = false;
  $('#sheetTitle').textContent = '게임 방법';
  $('#sheetSub').textContent = '영화 · 웹툰 제목을 초성이나 줄임말만 보고 맞혀요. 1~8명.';
  $('#sheetBody').innerHTML = HOW;
  $('#sheetBtns').innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
};
function drawSheet(){
  if (!sheetFor || sheetFor === 'how' || !S) return;
  const T = $('#sheetTitle'), Sub = $('#sheetSub'), B = $('#sheetBody'), F = $('#sheetBtns');
  if (sheetFor === 'result'){
    const rows = ranking(S);
    const tops = rows.filter(r => r.rank === 1);
    T.textContent = tops.length > 1 ? '공동 1등!' : tops[0].id === me.id ? '1등이에요!' : `${nameOf(tops[0].id)} 님 1등`;
    Sub.textContent = `${CAT_NAME[S.cat]} · ${MODE_NAME[S.mode]} · ${S.total}판`;
    B.innerHTML = `<ol id="rank" class="${rows.length > 5 ? 'tight' : ''}">` + rows.map(r =>
      `<li class="${r.rank === 1 ? 'win' : ''}"><span class="no">${r.rank}</span><span class="nm">${esc(nameOf(r.id))}${r.id === me.id ? ' (나)' : ''}</span>
       <span class="tk">정답 ${r.right} · 오답 ${r.wrong}</span><span class="sc ${r.score < 0 ? 'down' : ''}">${r.score}</span></li>`).join('') + '</ol>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>' + readyButton();
  }
}

/* ─────────── 그리기 ─────────── */
function phaseNow(){ return !S ? 'idle' : S.over ? 'over' : S.phase; }

/* 손 든 사람이 적는 글자 — 이 칸만 자주 고친다 */
function paintLive(){
  const L = $('#live');
  if (!L || !S) return;
  if (S.phase === 'buzz'){
    const who = S.buzzer === me.id ? '내가' : `${nameOf(S.buzzer)} 님이`;
    L.innerHTML = `<span class="who">✋ ${esc(who)} 적는 중</span><b class="typed">${esc(liveText) || '<i>…</i>'}</b>`
      + `<div class="acount"><b id="ansBig">${Math.ceil(ansLeft() / 1000)}</b><span class="abar"><i id="ansBar"></i></span></div>`;
    paintAnsClock();
  }
}
/* 손 든 뒤 20초 — 큰 숫자와 줄어드는 띠 (판의 3분과 따로) */
function paintAnsClock(){
  const ms = ansLeft(), sec = Math.ceil(ms / 1000);
  const a = $('#ansClock'); if (a) a.textContent = sec;
  const b = $('#ansBig'), bar = $('#ansBar');
  if (b){ b.textContent = sec; b.parentNode.classList.toggle('low', ms <= 5000); }
  if (bar) bar.style.transform = `scaleX(${(ms / ANSWER_MS).toFixed(3)})`;
}
function render(){
  pres && pres.update();
  if (!net) return;
  const ph = phaseNow();
  const host = net.order()[0].id;
  const between = ph === 'idle' || ph === 'over';
  const o = roomOpt();

  // 자리 — 이름 · 점수 · 지금 모습 (✋ 손 · ✗ 이번 판 쉼 · ✓ 맞힘)
  const showIds = ph === 'idle' ? roomSeats().map(s => s.id)
    : ph === 'over' ? [...new Set([...S.order, ...roomSeats().map(s => s.id)])].slice(0, MAX_SEATS) : S.order;
  $('#seats').innerHTML = showIds.map(id => {
    const has = S && S.scores[id] != null;
    const sc = has ? S.scores[id] : 0;
    const rd = between && isReady(id);
    let right = '';
    if (between) right = id === host ? '방장' : rd ? '✓ 준비' : '대기';
    else if (S.buzzer === id) right = '✋ 답하는 중';
    else if (ph === 'reveal' && S.last && S.last.ok && S.last.id === id) right = '✓ 정답';
    else if (S.dead[id]) right = '✗ 쉬는 중';
    else right = '';
    return `<li class="${id === me.id ? 'me' : ''} ${S && S.buzzer === id ? 'turn' : ''} ${rd ? 'rd' : ''} ${!between && !here(id) && id !== me.id ? 'out' : ''} ${!between && S.dead[id] ? 'dead' : ''}">
      <span class="nm">${id === host ? '<em>★</em>' : ''}${esc(nameOf(id))}</span>
      <span class="sc ${sc < 0 ? 'down' : ''}">${has ? sc : ''}</span><span class="pk">${right}</span></li>`;
  }).join('') + Array.from({ length: Math.max(0, MAX_SEATS - showIds.length) }, () => '<li class="empty">빈자리</li>').join('');

  // 안내 두 줄
  let head = '', sub = '';
  if (ph === 'idle'){
    const n = roomSeats().length;
    head = allReady() ? (isHost() ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${n}`;
    sub = isHost() ? (allReady() ? '설정을 고르고 게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : roomSeats().some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 설정을 고르고 시작해요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요';
  } else if (ph === 'over'){
    const r = ranking(S).find(x => x.id === me.id);
    head = `${S.total}판 끝!`;
    sub = (r ? `나는 ${r.rank}등 · ${r.score}점 · ` : '') + `다음 게임 준비 ${readyCount()}/${roomSeats().length}`;
  } else {
    head = `${S.n + 1}/${S.total}판 · ${CAT_NAME[S.cat]} · ${MODE_NAME[S.mode]}`;
    if (ph === 'q') sub = S.dead[me.id] ? '오답이라 이번 판은 쉬어요 · 남은 사람이 모두 틀리면 다시 살아나요' : '정답을 알면 [✋ 손]을 먼저 누르세요';
    else if (ph === 'buzz') sub = S.buzzer === me.id ? '20초 안에 제목을 적고 제출하세요' : `${nameOf(S.buzzer)} 님이 답을 적고 있어요`;
    else if (ph === 'reveal') sub = S.last && S.last.ok ? `${nameOf(S.last.id)} 님 정답!` : '시간 끝 — 아무도 못 맞혔어요';
  }
  $('#phase').textContent = head;
  $('#hint').textContent = sub;

  // 가운데 판
  const B = $('#board');
  if (between && (ph === 'idle' || !S)){
    const can = isHost();
    const seg = (k, list, label) => `<div class="optrow"><span class="ol">${label}</span><div class="seg ${can ? '' : 'ro'}">` +
      list.map(([v, t]) => `<button type="button" data-opt="${k}:${v}" aria-pressed="${String(o[k]) === String(v)}" ${can ? '' : 'disabled'}>${t}</button>`).join('') + '</div></div>';
    const pool = poolSize(o.cat, o.mode);
    B.innerHTML = `<div class="setup"><p class="st">${can ? '게임 설정 · 시작 전에 골라요' : '방장이 고르는 게임 설정'}</p>`
      + seg('cat', [['movie', '영화'], ['webtoon', '웹툰']], '갈래')
      + seg('mode', [['cho', '초성'], ['abbr', '줄임말']], '문제')
      + seg('rounds', ROUND_CHOICES.map(r => [r, `${r}판`]), '판 수')
      + `<p class="pool">${CAT_NAME[o.cat]} ${MODE_NAME[o.mode]} 문제 ${pool}개${pool < o.rounds ? ` · ${pool}판까지 해요` : ''}</p></div>`;
  } else if (ph === 'over'){
    B.innerHTML = `<div class="qcard"><p class="qk">게임 끝</p><p class="q small">수고했어요!</p><p class="ans">결과 보기를 눌러 순위를 봐요</p></div>`;
  } else {
    const q = questionOf(S);
    const big = q.length > 12 ? 'long' : q.length > 7 ? 'mid' : '';
    const recent = S.guesses.slice(-3).map(gu => `<li class="${gu.ok ? 'ok' : 'no'}"><b>${esc(nameOf(gu.id))}</b> ${esc(gu.text) || '<i>(빈칸)</i>'} <span>${gu.ok ? '✓' : '✗'}</span></li>`).join('');
    const reveal = ph === 'reveal' ? `<p class="ans">정답 · <b>${esc(titleOf(S, S.n))}</b></p>` : '';
    B.innerHTML = `<div class="qcard ph-${ph}">
        <div class="qtop"><span class="qk">${MODE_NAME[S.mode]} · ${CAT_NAME[S.cat]}</span><span class="clock" id="clock">${fmt(left())}</span></div>
        <p class="q ${big}">${esc(q)}</p>${reveal}
        <div class="typing" id="live"></div>
        <ul class="tries">${recent}</ul>
      </div>`;
    paintLive();
  }

  // 단추 줄
  let act = '';
  if (ph === 'idle') act = readyButton();
  else if (ph === 'over') act = '<button class="btn" data-act="result" type="button">결과 보기</button>' + readyButton();
  else if (ph === 'q'){
    if (!inGame()) act = '<span class="wait">지켜보는 중</span>';
    else if (S.dead[me.id]) act = '<span class="wait">✗ 이번 판은 쉬어요</span>';
    else act = `<button class="btn buzz" data-act="buzz" type="button" ${sentBz === `${S.g}|${S.n}|${S.seq}` ? 'disabled' : ''}>✋ 손</button>`;
  } else if (ph === 'buzz'){
    if (S.buzzer === me.id){
      const sending = sentSb === S.k && !!mySb;
      act = `<form class="ans" autocomplete="off"><input class="field" id="ansIn" maxlength="40" enterkeyhint="send" placeholder="제목을 적어요" aria-label="정답" ${sending ? 'disabled' : ''}>
        <button class="btn primary" data-act="send" type="submit" ${sending ? 'disabled' : ''}>${sending ? '확인 중…' : '제출'}<small id="ansClock">${Math.ceil(ansLeft() / 1000)}</small></button></form>`;
    } else act = `<span class="wait">✋ ${esc(nameOf(S.buzzer))} 님이 답하는 중 · <b id="ansClock">${Math.ceil(ansLeft() / 1000)}</b>초</span>`;
  } else if (ph === 'reveal') act = '<span class="wait">다음 판으로 넘어가요…</span>';
  const A = $('#actions');
  // 적는 칸은 다시 그리면 글자와 커서가 날아간다 — 모양이 같으면 그대로 둔다
  const sig = act.replace(/<small id="ansClock">\d+<\/small>|<b id="ansClock">\d+<\/b>/, '');
  if (A.dataset.sig !== sig){
    const keep = $('#ansIn') ? $('#ansIn').value : null;
    A.innerHTML = act; A.dataset.sig = sig;
    if (keep != null && $('#ansIn')){ $('#ansIn').value = keep; }
  }

  if (ph === 'over' && shownOver !== S.g){ shownOver = S.g; openSheet('result'); return; }
  if (sheetFor) drawSheet();
}
/* 시계 — 판의 3분과 답의 20초를 매초 고친다 (다른 칸은 건드리지 않는다) */
setInterval(() => {
  if (!S || S.over) return;
  const c = $('#clock');
  if (c){ c.textContent = fmt(left()); c.classList.toggle('low', left() < 30000); }
  if (S.phase === 'buzz') paintAnsClock();
}, 100);

/* 접속 알림 (마스터의 '접속자') — 게임에 앉아 있는 동안이 게임 중 */
var pres = trackPresence(() => ({ state: net && inGame() ? 'game' : 'wait', place: '어메이징 선데이' }));
