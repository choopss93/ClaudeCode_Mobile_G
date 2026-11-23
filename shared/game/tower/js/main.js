import { ROUNDS, LIMIT, CARDS, CHIPS, ZONES, ZONE_NAME, MAX_SEATS, sumOf, canPut, newGame, legal, play, autoMove, ranking } from './rules.js?v=1';
import { joinRoom, makeId } from '../../poker/js/room.js?v=11';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';

/*
 * Tower 13 — 접속과 화면.
 *
 * 서버가 없으므로 Memory Poker 처럼 **방장**이 판을 돌린다. 방장만 판 상태를 바꾸고
 * (rules.js 의 play), 바뀔 때마다 · 그리고 1.5초마다 모두에게 통째로 보낸다 ('gs').
 * 차례인 사람은 자기 수를 방장에게 보낸다 ('mv'). 방장이 나가면 다음 사람이 이어받는데,
 * 모두 마지막 판 상태를 갖고 있으므로 그대로 이어 간다.
 *
 * 꾸러미
 *   {t:'hi', id, name, at, ready}                     들어왔음 · 3초마다 (room.js)
 *   {t:'gs', id, s, el}                               판 상태 (el = 이번 차례가 시작된 뒤 지난 밀리초)
 *   {t:'mv', id, g, seq, card, chip, zone}            내 수 → 방장
 */
const TURN = 30000;          // 한 차례 30초 — 넘기면 방장이 대신 둔다 (터지지 않는 쪽으로)
const AWAY = 2500;           // 차례인 사람이 나가 있으면 이만큼 기다렸다 대신 둔다
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
let turnAt = 0;          // 이번 차례가 시작된 때 (내 시계)
let startedAt = 0;       // 이번 게임이 시작된 때 (순서 뽑기 보여 주기)
let lastSent = 0;
let pick = { card: null, chip: null, zone: null };
let seenSeq = -1;        // 무너짐 · 새 박스를 한 번만 보여 주려고
let shownOver = 0, shownDraw = 0;
let sheetFor = null;

const isHost = () => net && net.order()[0].id === me.id;
const roomSeats = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (id === me.id ? me.name : (net && net.peers.get(id)?.name) || (S && S.names[id]) || '나간 사람');
const myTurn = () => S && !S.over && S.order[S.turn] === me.id && now() - startedAt > DRAW_SHOW;

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
  net.send({ t: 'gs', id: me.id, s: S, el: Math.round(now() - turnAt), st: Math.round(now() - startedAt) });
}
function startGame(){
  if (!isHost() || !allReady()) return;
  const seats = roomSeats().map(s => s.id);
  const names = {};
  for (const id of seats) names[id] = nameOf(id);
  adopt(newGame((S ? S.g : 0) + 1, seats, names), 0, 0);
  sendState();
}
function hostMove(id, card, chip, zone){
  if (!legal(S, id, card, chip, zone)) return false;
  adopt(play(S, id, card, chip, zone), 0, now() - startedAt);
  sendState();
  return true;
}
setInterval(() => {
  if (!net || !isHost() || !S) return;
  if (!S.over && now() - startedAt > DRAW_SHOW){
    const id = S.order[S.turn];
    const late = now() - turnAt > TURN + 600;
    const away = !net.present(id) && now() - turnAt > AWAY;
    if (late || away){
      const m = autoMove(S, id);
      if (m && hostMove(id, m.card, m.chip, m.zone)) return;
    }
  }
  if (now() - lastSent > RESEND) sendState();
}, 250);

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'gs' && m.s && Array.isArray(m.s.order)){
    // 새 게임이거나 같은 게임의 더 나중 상태만 받는다
    if (S && (m.s.g < S.g || (m.s.g === S.g && m.s.seq < S.seq))) return;
    if (S && m.s.g === S.g && m.s.seq === S.seq) return;     // 같은 것 — 시계만 맞추면 흔들린다
    adopt(m.s, +m.el || 0, +m.st || 0);
  } else if (m.t === 'mv' && isHost() && S && m.g === S.g && m.seq === S.seq){
    hostMove(m.id, m.card | 0, m.chip | 0, m.zone);
  }
}

function adopt(s, el, st){
  const fresh = !S || s.g !== S.g;
  const moved = !S || s.seq !== S.seq || fresh;
  S = s;
  if (moved) turnAt = now() - el;
  if (fresh){ startedAt = now() - st; pick = { card: null, chip: null, zone: null }; seenSeq = s.seq; closeSheet(); }
  if (moved) pick = { card: null, chip: null, zone: null };
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
let boomZone = null;

/* ─────────── 내 수 ─────────── */
function choose(kind, v){
  if (!myTurn()) return;
  pick[kind] = pick[kind] === v ? null : v;
  if (kind === 'chip'){
    const c = pick.chip == null ? null : CHIPS[pick.chip];
    pick.zone = c && c !== 'w' ? c : (c === 'w' && pick.zone ? pick.zone : null);
  }
  if (navigator.vibrate) navigator.vibrate(6);
  render();
}
function chooseZone(z){
  if (!myTurn() || pick.chip == null || !canPut(pick.chip, z)) return;
  pick.zone = z;
  render();
}
function submit(){
  if (!myTurn() || pick.card == null || pick.chip == null || !pick.zone) return;
  if (!legal(S, me.id, pick.card, pick.chip, pick.zone)) return;
  if (isHost()) hostMove(me.id, pick.card, pick.chip, pick.zone);
  else net.send({ t: 'mv', id: me.id, g: S.g, seq: S.seq, card: pick.card, chip: pick.chip, zone: pick.zone });
  pick.sent = S.seq;
  render();
}
// 보낸 수가 방장에게 닿지 않았을 수 있다 (QoS 0) — 차례가 그대로면 1초마다 다시 보낸다
setInterval(() => {
  if (net && S && !isHost() && myTurn() && pick.sent === S.seq && pick.card != null)
    net.send({ t: 'mv', id: me.id, g: S.g, seq: S.seq, card: pick.card, chip: pick.chip, zone: pick.zone });
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

$('#cards').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) choose('card', +b.dataset.v); });
$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose('chip', +b.dataset.i); });
$('#board').addEventListener('click', e => { const z = e.target.closest('[data-z]'); if (z) chooseZone(z.dataset.z); });
$('#actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'put') submit();
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
  <li>각자 <b>숫자 카드 0~6</b> 일곱 장과 <b>칩 일곱 개</b>(빨강 · 초록 · 파랑 둘씩, 무지개 하나)를 가져요. 손에 든 것은 남에게 안 보여요.</li>
  <li>시작할 때 카드를 뽑아 <b>순서</b>를 정해요. 일곱 판 내내 같은 순서예요.</li>
  <li>내 차례에 <b>카드 한 장 + 칩 하나</b>를 골라 그 색 탑에 숫자 박스를 올려요. <b>무지개 칩</b>은 아무 색에나.</li>
  <li>올린 숫자와 탑의 합은 모두에게 보여요.</li>
  <li>올린 뒤 그 탑이 <b>13 이상</b>이면 와르르 — 올린 사람이 박스를 <b>방금 것까지 전부</b> 가져오고 <b>하나에 −1점</b>. 탑은 비고 다시 쌓아요.</li>
  <li>모두 한 번씩 올리면 한 판, <b>7판</b>이면 끝. 점수가 높을수록 위, 같으면 같은 등수.</li>
  <li>한 차례 <b>30초</b>. 넘기면 덜 위험한 수로 대신 놓여요.</li>
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
    T.textContent = solo ? '연습 끝' : top && rows.filter(r => r.rank === 1).length > 1 ? '공동 1등!' : top.id === me.id ? '이겼어요!' : `${nameOf(top.id)} 님 승리`;
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
  if (now() - startedAt < DRAW_SHOW) return 'draw';
  return 'play';
}

function render(){
  if (!net) return;
  const ph = phaseNow();
  const host = net.order()[0].id;
  const seatIds = S && ph !== 'idle' && !S.over ? S.order : (S && S.over ? S.order : roomSeats().map(s => s.id));
  const cur = S && ph === 'play' ? S.order[S.turn] : null;

  // 자리 — 이름 · 점수 · 차례 / 이번 판에 올렸는지 / 준비
  const between = ph === 'idle' || ph === 'over';
  const showIds = between ? roomSeats().map(s => s.id) : seatIds;
  $('#seats').innerHTML = showIds.map(id => {
    const sc = S && S.scores[id] != null ? S.scores[id] : 0;
    const inGame = S && S.order.includes(id);
    const rd = between && isReady(id);
    let right = '';
    if (between) right = id === host ? '방장' : rd ? '✓ 준비' : '대기';
    else if (inGame){
      const idx = S.order.indexOf(id);
      right = id === cur ? '▶ 차례' : idx < S.turn ? '올림' : `${idx + 1}번`;
    }
    return `<li class="${id === me.id ? 'me' : ''} ${id === cur ? 'turn' : ''} ${rd ? 'rd' : ''} ${S && !between && !net.present(id) ? 'out' : ''}">
      <span class="nm">${id === host ? '<em>★</em>' : ''}${esc(nameOf(id))}</span>
      <span class="sc ${sc < 0 ? 'down' : ''}">${S && S.scores[id] != null ? sc : ''}</span><span class="pk ${rd ? 'up' : ''}">${right}</span></li>`;
  }).join('') + Array.from({ length: Math.max(0, MAX_SEATS - showIds.length) }, () => '<li class="empty">빈자리</li>').join('');

  // 판 — 세 탑
  const zones = S ? S.zones : { r: [], g: [], b: [] };
  const canZ = z => myTurn() && pick.chip != null && canPut(pick.chip, z) && CHIPS[pick.chip] === 'w';
  $('#board').innerHTML = ZONES.map(z => {
    const boxes = zones[z];
    const sum = sumOf(boxes);
    const newest = S && S.last && S.last.zone === z && !S.last.boom && boxes.length ? boxes.length - 1 : -1;
    const bang = boomZone && boomZone.z === z && now() - boomZone.at < 1600 ? `<div class="bang">💥 −${boomZone.n}</div>` : '';
    return `<button class="zone ${canZ(z) ? 'can' : ''} ${pick.zone === z && myTurn() ? 'pick' : ''} ${bang ? 'boom' : ''}" data-z="${z}" type="button" aria-label="${ZONE_NAME[z]} 탑 합 ${sum}">
      <div class="head"><span class="nmz">${ZONE_NAME[z]}</span><span class="sum">${sum}<small>/${LIMIT}</small></span></div>
      <div class="meter"><i style="transform:scaleX(${Math.min(1, sum / LIMIT)})"></i></div>
      <div class="stack ${boxes.length > 5 ? 'dense' : ''}">${boxes.length ? boxes.map(([n, by], i) => `<div class="box ${i === newest ? 'new' : ''}"><small>${esc(nameOf(by))}</small>${n}</div>`).join('') : '<span class="none">비어 있어요</span>'}</div>
      ${bang}</button>`;
  }).join('');

  // 내 손
  const mine = S && S.used[me.id];
  const playing = !!mine && !S.over;
  $('#hand').classList.toggle('off', !myTurn());
  $('#cards').innerHTML = CARDS.map(c => {
    const used = mine ? mine.c.includes(c) : false;
    return `<button type="button" data-v="${c}" ${used || !myTurn() ? 'disabled' : ''} class="${pick.card === c ? 'sel' : ''}" aria-label="숫자 ${c}${used ? ' (냄)' : ''}">${c}</button>`;
  }).join('');
  $('#chips').innerHTML = CHIPS.map((c, i) => {
    const used = mine ? mine.h.includes(i) : false;
    return `<button type="button" data-i="${i}" data-c="${c}" ${used || !myTurn() ? 'disabled' : ''} class="${pick.chip === i ? 'sel' : ''}" aria-label="${ZONE_NAME[c]} 칩${used ? ' (냄)' : ''}"><i></i></button>`;
  }).join('');
  // 손이 없는 사람(관전 · 시작 전)은 쓸 수 있는 손을 흐리게 보여 준다
  if (!playing){ for (const b of document.querySelectorAll('.row7 button')) b.disabled = true; }

  // 안내 두 줄
  let head = '', sub = '';
  if (ph === 'idle'){
    const n = roomSeats().length;
    head = allReady() ? (isHost() ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${n}`;
    sub = isHost() ? (n === 1 ? '혼자서도 연습할 수 있어요 · 위의 초대로' : allReady() ? '게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : roomSeats().some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 시작하길 기다려요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요';
  } else if (ph === 'draw'){
    head = '순서를 뽑는 중';
    sub = S.order.map(id => nameOf(id)).join(' → ');
  } else if (ph === 'play'){
    head = `${S.round}/${ROUNDS}판 · ` + (cur === me.id ? '내 차례' : `${nameOf(cur)} 님 차례`);
    if (cur === me.id){
      sub = pick.card == null ? '숫자 카드를 골라요' : pick.chip == null ? '색 칩을 골라요'
        : !pick.zone ? '무지개 칩 — 올릴 탑을 눌러요'
        : `${ZONE_NAME[pick.zone]} 탑에 ${pick.card} → 합 ${sumOf(S.zones[pick.zone]) + pick.card}${sumOf(S.zones[pick.zone]) + pick.card >= LIMIT ? ' · 와르르!' : ''}`;
    } else sub = lastLine();
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
  else if (ph === 'play'){
    if (cur === me.id){
      const ok = pick.card != null && pick.chip != null && pick.zone && pick.sent !== S.seq;
      act = `<button class="btn primary" data-act="put" type="button" ${ok ? '' : 'disabled'}>${pick.sent === S.seq ? '올리는 중…' : '올리기'}</button>`;
    } else act = `<span class="wait">${S.order.includes(me.id) ? `${esc(nameOf(cur))} 님이 고르는 중` : '지켜보는 중'}</span>`;
  } else if (ph === 'over') act = '<button class="btn" data-act="result" type="button">결과 보기</button>' + readyButton();
  const A = $('#actions');
  if (A.dataset.html !== act){ A.innerHTML = act; A.dataset.html = act; }

  // 게임이 시작되면 순서 뽑기를, 끝나면 결과를 한 번 저절로 띄운다
  if (ph === 'draw' && shownDraw !== S.g){ shownDraw = S.g; openSheet('draw'); return; }
  if (ph === 'play' && sheetFor === 'draw') closeSheet();
  if (ph === 'over' && shownOver !== S.g){ shownOver = S.g; openSheet('result'); return; }
  if (sheetFor) drawSheet();
}
function lastLine(){
  const L = S && S.last;
  if (!L) return '첫 박스를 기다려요';
  const who = L.id === me.id ? '내가' : `${nameOf(L.id)} 님이`;
  return L.boom ? `${who} ${ZONE_NAME[L.zone]}에 ${L.card} → ${L.sum} 💥 −${L.boom}점`
                : `${who} ${ZONE_NAME[L.zone]}에 ${L.card}${L.chip === 'w' ? ' (무지개)' : ''} → 합 ${L.sum}`;
}

/* 시간 띠 · 남은 초는 따로 자주 그린다 */
let lastPh = null;
function clock(){
  requestAnimationFrame(clock);
  const ph = phaseNow();
  if (ph !== lastPh){ lastPh = ph; render(); }
  const bar = $('#bar'), num = $('#count');
  if (ph !== 'play'){ bar.style.transform = 'scaleX(0)'; num.textContent = ''; return; }
  const left = Math.max(0, TURN - (now() - turnAt));
  bar.style.transform = `scaleX(${left / TURN})`;
  const s = Math.ceil(left / 1000);
  if (num.textContent !== String(s)) num.textContent = s;
  if (boomZone && now() - boomZone.at > 1700){ boomZone = null; render(); }
}
requestAnimationFrame(clock);
