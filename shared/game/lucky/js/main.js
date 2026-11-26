import { COLS, H, MAX_SEATS, BUST_MS, limitsFor, teamable, newGame, current, sideOf, sides, membersOf, claimedBy,
         options, bustChance, roll, pick, afterBust, stop, skip, ranking, progressOf, botPick, botStops } from './rules.js?v=1';
import { joinRoom, makeId } from '../../poker/js/room.js?v=12';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';
import { trackPresence } from '../../../js/presence.js?v=p2';
import { isBot, botName, withBots } from '../../../js/bots.js';

/*
 * Lucky 주사위 — 접속과 화면.
 *
 * Tower 13 · 어메이징 선데이처럼 **방장**이 판을 돌린다 (rules.js). 주사위도 방장이 굴린다. 차례인 사람은
 * '굴리기 · 고르기 · 멈추기' 만 방장에게 보낸다 ('ac', 판 번호 seq 를 붙여 두 번 먹지 않게).
 * 방장이 나가면 다음 사람이 마지막 상태로 잇는다. 혼자 시작하면 META BOT 셋이 함께 한다.
 *
 * 꾸러미
 *   {t:'hi', id, name, at, ready, comm}   들어왔음 (room.js) — comm = 1 개인전 · 2 팀전 (방장 것을 쓴다)
 *   {t:'gs', id, s, el}                   판 상태 (el = 이번 단계가 시작된 뒤)
 *   {t:'ac', id, g, seq, a, i}            내 차례의 한 수 → 방장 (a = roll · pick · stop)
 */
const AWAY = 2500;
const RESEND = 1500;
const $ = s => document.querySelector(s);
const now = () => performance.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* 말 색 — 개인전은 사람마다, 팀전은 팀마다 (둘째 팀원은 테두리 말) */
const COLORS = ['#F2B84B', '#5EC2F0', '#F07A8A', '#7ED67E', '#B48CF0', '#F09A4E', '#4ED6C4', '#D9D9D9'];
const TEAM_NAMES = ['A', 'B', 'C', 'D'];

let store = {};
try { store = JSON.parse(localStorage.getItem('luckyDice') || '{}') || {}; } catch (_){}
const save = () => { try { localStorage.setItem('luckyDice', JSON.stringify(store)); } catch (_){} };

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ─────────── 상태 ─────────── */
const opt = { team: !!store.team };
const me = { id: makeId(), name: '', at: 0, ready: -1, comm: opt.team ? 2 : 1 };
let net = null, roomId = null;
let S = null;
let stepKey = '', stepAt = 0;
let lastSent = 0;
let sentAc = null;                 // 보냈는데 아직 판에 안 먹은 내 한 수 {seq, a, i}
let botWait = 1200;
let sheetFor = null, sheetCol = 0, shownOver = 0;
let seenSeq = -1;

const isHost = () => net && net.order()[0].id === me.id;
const roomSeats = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (isBot(id) ? botName(id) : id === me.id ? me.name : (net && net.peers.get(id)?.name) || (S && S.names[id]) || '나간 사람');
const here = id => isBot(id) || id === me.id || (net && net.present(id));
const inGame = () => S && !S.over && S.order.includes(me.id);
const myTurn = () => S && !S.over && current(S) === me.id;
const keyOf = s => s ? `${s.g}|${s.seq}` : '';

function roomOpt(){
  if (!net) return opt;
  const h = net.order()[0];
  if (h.id !== me.id){
    const p = net.peers.get(h.id);
    if (p && (p.comm === 1 || p.comm === 2)) opt.team = p.comm === 2;
  }
  return opt;
}
function setTeam(v){
  if (net && !isHost()) return;
  opt.team = v; store.team = v; save();
  me.comm = v ? 2 : 1;
  if (net) net.hi();
  render();
}
/* 지금 자리로 시작하면 몇 명 — 혼자면 봇 셋을 더해 넷 */
const startCount = () => withBots(roomSeats().map(s => s.id)).length;

/* 색 · 편 이름 */
function colorOf(id){
  if (S && S.order.includes(id)){
    if (S.teams) return COLORS[sideOf(S, id)];
    return COLORS[S.order.indexOf(id) % COLORS.length];
  }
  const i = net ? roomSeats().findIndex(s => s.id === id) : 0;
  return COLORS[Math.max(0, i) % COLORS.length];
}
const isSecond = id => !!(S && S.teams && S.teams[sideOf(S, id)][1] === id);
const sideName = side => (S && S.teams ? `${TEAM_NAMES[side]}팀` : nameOf(side));
const sideFull = side => (S && S.teams ? `${TEAM_NAMES[side]}팀 · ${S.teams[side].map(nameOf).join(' · ')}` : nameOf(side));

/* 준비 — 다른 게임과 같다 */
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
    room: id, me, topicBase: 'luckydice/', keep: [],
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
    if (navigator.share) await navigator.share({ title: 'Lucky 주사위', text: '같이 Lucky 주사위 해요', url: link });
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
const rollDice = () => { const r = new Uint32Array(4); crypto.getRandomValues(r); return [...r].map(x => 1 + (x % 6)); };
function sendState(){
  if (!S) return;
  lastSent = now();
  net.send({ t: 'gs', id: me.id, s: S, el: Math.round(now() - stepAt) });
}
function commit(nextS){ if (nextS === S) return; adopt(nextS, 0); sendState(); }
function startGame(){
  if (!isHost() || !allReady()) return;
  const seats = withBots(roomSeats().map(s => s.id));
  const names = {};
  for (const id of seats) names[id] = nameOf(id);
  adopt(newGame((S ? S.g : 0) + 1, seats, names, { team: roomOpt().team }), 0);
  sendState();
}
/** 방장이 받은 한 수 — 차례인 사람의 것이고 판 번호가 맞을 때만 */
function hostAct(id, seq, a, i){
  if (!S || S.over || current(S) !== id || seq !== S.seq) return;
  if (a === 'roll' && S.phase === 'roll') commit(roll(S, rollDice()));
  else if (a === 'pick' && S.phase === 'pick') commit(pick(S, +i || 0));
  else if (a === 'stop' && S.phase === 'roll' && Object.keys(S.temp).length) commit(stop(S));
}
setInterval(() => {
  if (!net || !isHost() || !S || S.over) return;
  const t = now() - stepAt;
  const cur = current(S);
  if (S.phase === 'bust'){
    if (t > BUST_MS){ commit(afterBust(S)); return; }
  } else if (isBot(cur)){
    if (t > botWait){
      botWait = 700 + Math.random() * 900;
      if (S.phase === 'pick') commit(pick(S, botPick(S)));
      else if (botStops(S)) commit(stop(S));
      else commit(roll(S, rollDice()));
      return;
    }
  } else if (!here(cur) && t > AWAY){
    // 나간 사람 — 고르던 중이면 첫 길, 오른 게 있으면 멈추고, 없으면 넘긴다
    if (S.phase === 'pick') commit(pick(S, 0));
    else commit(Object.keys(S.temp).length ? stop(S) : skip(S));
    return;
  }
  if (now() - lastSent > RESEND) sendState();
}, 200);

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'gs' && m.s && Array.isArray(m.s.order)){
    if (S && (m.s.g < S.g || (m.s.g === S.g && m.s.seq <= S.seq))) return;
    adopt(m.s, +m.el || 0);
  } else if (m.t === 'ac' && isHost() && S && m.g === S.g){
    hostAct(m.id, m.seq, m.a, m.i);
  }
}

function adopt(s, el){
  const fresh = !S || s.g !== S.g;
  const prev = S;
  S = s;
  const k = keyOf(s);
  if (k !== stepKey){ stepKey = k; stepAt = now() - el; }
  if (fresh){ seenSeq = s.seq; closeSheet(); }
  if (sentAc && sentAc.seq !== s.seq) sentAc = null;
  // 알림 — 꽝 · 길 차지 · 내 차례
  if (!fresh && prev && s.seq !== seenSeq && s.last && JSON.stringify(s.last) !== JSON.stringify(prev.last)){
    const L = s.last, who = L.id === me.id ? '나' : nameOf(L.id);
    if (L.bust) flash(`💥 꽝! ${L.id === me.id ? '이번 차례에 오른 것을 잃었어요' : `${who} 님 꽝`}`, 2000);
    else if (L.stop && L.got && L.got.length) flash(`🏁 ${L.id === me.id ? '내가' : `${who} 님이`} ${L.got.join(' · ')}번 길을 차지했어요!`, 2400);
  }
  if (!s.over && prev && current(s) === me.id && (current(prev) !== me.id || prev.g !== s.g) && s.phase === 'roll') flash('🎲 내 차례예요', 1400);
  seenSeq = s.seq;
  render();
}

/* ─────────── 내 차례의 한 수 ─────────── */
function act(a, i = 0){
  if (!myTurn()) return;
  if (sentAc && sentAc.seq === S.seq) return;
  sentAc = { seq: S.seq, a, i };
  if (isHost()) hostAct(me.id, S.seq, a, i);
  else { net.send({ t: 'ac', id: me.id, g: S.g, seq: S.seq, a, i }); render(); }
}
// QoS 0 — 방장에게 안 닿았을 수 있다. 판이 그대로면 다시 보낸다
setInterval(() => {
  if (!net || !S || isHost() || !sentAc || sentAc.seq !== S.seq || !myTurn()) return;
  net.send({ t: 'ac', id: me.id, g: S.g, seq: S.seq, a: sentAc.a, i: sentAc.i });
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
    return `<button class="btn primary" data-act="start" type="button" ${ok ? '' : 'disabled'}>${ok ? (n === 1 ? '게임 시작 · META BOT 셋과' : '게임 시작') : `준비 기다리는 중 ${readyCount()}/${n}`}</button>`;
  }
  if (!roomSeats().some(s => s.id === me.id)) return '<span class="wait">관전 중 · 자리가 나면 앉아요</span>';
  return me.ready === readyBase()
    ? '<button class="btn on" data-act="ready" type="button">✓ 준비 완료 <small>· 취소</small></button>'
    : '<button class="btn primary" data-act="ready" type="button">게임 준비</button>';
}

$('#actions').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'roll' || a === 'stop') act(a);
  else if (a === 'pick') act('pick', +b.dataset.i);
  else if (a === 'start') startGame();
  else if (a === 'ready') toggleReady();
  else if (a === 'result') openSheet('result');
});
$('#board').addEventListener('click', e => {
  const t = e.target.closest('[data-team]');
  if (t){ setTeam(t.dataset.team === '1'); return; }
  const c = e.target.closest('[data-col]');
  if (c && S){ sheetCol = +c.dataset.col; openSheet('col'); }
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
  <li>길은 <b>2~12</b> 열한 줄. 7번이 가장 길고(13칸) 2 · 12번이 가장 짧아요(3칸).</li>
  <li>내 차례에 <b>주사위 넷</b>을 굴려 둘씩 짝지은 <b>합 두 개</b>를 골라요. 그 길에 <b>임시 말</b>(흰 테두리)이 한 칸씩 올라가요.</li>
  <li>임시 말은 한 차례에 <b>3개 길</b>까지만 (5명부터는 2개). 더 굴릴지 <b>멈출지</b>는 내 마음.</li>
  <li>멈추면 임시 말 자리가 <b>내 자리로 굳어요.</b> 그런데 어떻게 짝지어도 올릴 길이 없으면 <b>💥 꽝</b> — 이번 차례에 오른 것을 모두 잃어요.</li>
  <li>꼭대기에 닿은 채로 멈추면 그 길은 <b>내 것</b>. 다른 사람은 그 길을 더 못 써요.</li>
  <li>길 <b>3개</b>를 먼저 차지하면 승리 (5명부터는 <b>2개</b>). 팀전(둘씩)은 팀원 길을 합쳐 늘 3개.</li>
</ol>`;
$('#howBtn').onclick = () => {
  sheetFor = 'how'; sheet.hidden = false;
  $('#sheetTitle').textContent = '게임 방법';
  $('#sheetSub').textContent = '주사위 넷으로 길을 올라요. 한 번만 더? 멈출까? 1~8명.';
  $('#sheetBody').innerHTML = HOW;
  $('#sheetBtns').innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
};
function drawSheet(){
  if (!sheetFor || sheetFor === 'how' || !S) return;
  const T = $('#sheetTitle'), Sub = $('#sheetSub'), B = $('#sheetBody'), F = $('#sheetBtns');
  if (sheetFor === 'result'){
    const rows = ranking(S);
    const mine = sideOf(S, me.id);
    T.textContent = S.winner === mine && S.order.includes(me.id) ? (S.teams ? '우리 팀 승리!' : '승리!') : `${sideName(S.winner)} 승리`;
    Sub.textContent = `${S.teams ? '팀전' : '개인전'} · 길 ${S.win}개 먼저`;
    B.innerHTML = `<ol id="rank" class="${rows.length > 5 ? 'tight' : ''}">` + rows.map(r =>
      `<li class="${r.side === S.winner ? 'win' : ''}"><span class="no">${r.rank}</span>
       <span class="nm"><i class="sw" style="--c:${COLORS[S.teams ? r.side : S.order.indexOf(r.side) % COLORS.length]}"></i>${esc(sideFull(r.side))}${r.side === mine && S.order.includes(me.id) ? ' (나)' : ''}</span>
       <span class="tk">${claimedBy(S, r.side).join(' · ') || '—'}</span><span class="sc">🏁${r.cols}</span></li>`).join('') + '</ol>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>' + readyButton();
  } else if (sheetFor === 'col'){
    const c = sheetCol;
    const own = S.owner[c];
    T.textContent = `${c}번 길 · ${H[c]}칸`;
    Sub.textContent = own != null ? `${nameOf(own)} 님이 차지한 길` : '누가 어디까지 올랐나';
    const rows = S.order.map(id => {
      const tmp = current(S) === id && c in S.temp ? S.temp[c] : null;
      const v = (S.pos[id] && S.pos[id][c]) || 0;
      return { id, v, tmp };
    }).sort((a, b) => Math.max(b.v, b.tmp || 0) - Math.max(a.v, a.tmp || 0));
    B.innerHTML = '<ul class="colp">' + rows.map(r => `<li><span class="nm"><i class="sw ${isSecond(r.id) ? 'ring' : ''}" style="--c:${colorOf(r.id)}"></i>${esc(nameOf(r.id))}</span>
      <span class="bar"><i style="width:${(r.v / H[c] * 100).toFixed(1)}%;background:${colorOf(r.id)}"></i>${r.tmp != null ? `<b style="width:${(r.tmp / H[c] * 100).toFixed(1)}%"></b>` : ''}</span>
      <span class="v">${own === r.id ? '🏁' : `${r.tmp != null ? `${r.tmp}↑` : r.v}/${H[c]}`}</span></li>`).join('') + '</ul>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
  }
}

/* ─────────── 그리기 ─────────── */
function phaseNow(){ return !S ? 'idle' : S.over ? 'over' : S.phase; }
const dieHtml = (d, on) => `<span class="die ${on ? 'on' : ''}">${d}</span>`;

/** 길판 — 11줄을 마름모로 (짧은 길은 가운데에). 13칸 + 번호 한 줄 */
function boardHtml(){
  const cur = S && !S.over ? current(S) : null;
  const temp = S && !S.over ? S.temp : {};
  const optCols = S && S.phase === 'pick' && myTurn() ? new Set(options(S, S.dice).flat()) : new Set();
  let html = '<div class="track">';
  COLS.forEach((c, ci) => {
    const h = H[c], off = (13 - h) / 2;
    const own = S ? S.owner[c] : null;
    const oc = own != null ? colorOf(own) : '';
    for (let k = h; k >= 1; k--){
      const row = off + (h - k) + 1;
      let marks = '';
      if (S) for (const id of S.order){
        if ((S.pos[id] && S.pos[id][c]) === k && own == null) marks += `<i class="m ${isSecond(id) ? 'ring' : ''}" style="--c:${colorOf(id)}"></i>`;
      }
      const tmp = cur && temp[c] === k;
      if (tmp) marks += `<i class="m tmp" style="--c:${colorOf(cur)}"></i>`;
      html += `<div class="cell ${k === h ? 'goal' : ''} ${own != null ? 'own' : ''} ${tmp ? 'hasTmp' : ''}" data-col="${c}"
        style="grid-column:${ci + 1};grid-row:${row};${own != null ? `--o:${oc}` : ''}">${k === h && own != null ? '<span class="flag">🏁</span>' : marks}</div>`;
    }
    html += `<div class="lab ${optCols.has(c) ? 'opt' : ''} ${c in temp ? 'used' : ''} ${own != null ? 'own' : ''}" data-col="${c}" style="grid-column:${ci + 1};grid-row:14;${own != null ? `--o:${oc}` : ''}">${c}</div>`;
  });
  return html + '</div>';
}

function render(){
  pres && pres.update();
  if (!net) return;
  const ph = phaseNow();
  const host = net.order()[0].id;
  const between = ph === 'idle' || ph === 'over';
  const o = roomOpt();

  // 자리 — 이름 · 차지한 길 수 · 지금 모습
  const showIds = ph === 'idle' ? roomSeats().map(s => s.id)
    : ph === 'over' ? [...new Set([...S.order, ...roomSeats().map(s => s.id)])].slice(0, MAX_SEATS) : S.order;
  $('#seats').innerHTML = showIds.map(id => {
    const playing = S && S.order.includes(id);
    const cols = playing ? claimedBy(S, sideOf(S, id)).filter(c => !S.teams || S.owner[c] === id).length : 0;
    const rd = between && isReady(id);
    let right = '';
    if (between) right = id === host ? '방장' : isBot(id) ? 'BOT' : rd ? '✓ 준비' : '대기';
    else if (current(S) === id) right = S.phase === 'bust' ? '💥 꽝' : '🎲 차례';
    else right = '';
    const tag = playing && S.teams ? `<b class="tm" style="--c:${colorOf(id)}">${TEAM_NAMES[sideOf(S, id)]}</b>` : '';
    return `<li class="${id === me.id ? 'me' : ''} ${!between && current(S) === id ? 'turn' : ''} ${rd ? 'rd' : ''} ${!between && !here(id) ? 'out' : ''}">
      <span class="nm"><i class="sw ${isSecond(id) ? 'ring' : ''}" style="--c:${colorOf(id)}"></i>${id === host ? '<em>★</em>' : ''}${tag}${esc(isBot(id) ? 'BOT ' + id.split('-')[1] : nameOf(id))}</span>
      <span class="sc">${playing ? `🏁${cols}` : ''}</span><span class="pk">${right}</span></li>`;
  }).join('') + Array.from({ length: Math.max(0, MAX_SEATS - showIds.length) }, () => '<li class="empty">빈자리</li>').join('');

  // 안내 두 줄 + 주사위
  let head = '', sub = '';
  if (ph === 'idle'){
    const n = roomSeats().length;
    head = allReady() ? (isHost() ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${n}`;
    sub = isHost() ? (allReady() ? '개인전 · 팀전을 고르고 게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : roomSeats().some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 시작해요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요';
  } else if (ph === 'over'){
    head = `${sideName(S.winner)} 승리!`;
    sub = `길 ${S.win}개 먼저 · 다음 게임 준비 ${readyCount()}/${roomSeats().length}`;
  } else {
    const cur = current(S), mine = cur === me.id;
    head = mine ? '🎲 내 차례' : `${nameOf(cur)} 님 차례`;
    const used = Object.keys(S.temp).length;
    if (ph === 'bust') sub = '💥 꽝! 올릴 길이 없어요 — 이번 차례에 오른 것을 잃어요';
    else if (ph === 'pick') sub = mine ? '두 합을 골라 임시 말을 올려요' : '길을 고르는 중…';
    else sub = !S.rolls ? (mine ? '주사위를 굴려요' : '주사위를 굴리려는 중…') : `임시 말 ${used}/${S.maxTemp} · ${mine ? '더 굴릴까요, 멈출까요?' : '더 굴릴까, 멈출까…'}`;
  }
  $('#phase').textContent = head;
  $('#hint').textContent = sub;
  const showDice = S && !S.over && (S.phase === 'pick' || S.phase === 'bust') && S.dice;
  $('#dice').innerHTML = showDice ? S.dice.map(d => dieHtml(d, S.phase === 'pick')).join('') : '';
  $('#dice').className = 'dice ' + (S && S.phase === 'bust' ? 'bust' : '');

  // 가운데 — 시작 전 설정 · 게임 중 길판
  const B = $('#board');
  if (ph === 'idle'){
    const can = isHost();
    const n = startCount();
    const canTeam = teamable(n);
    const team = o.team && canTeam;
    const lim = limitsFor(n, team);
    const ids = withBots(roomSeats().map(s => s.id));
    const pairs = [];
    if (team) for (let i = 0; i < ids.length; i += 2) pairs.push(`<li><b>${TEAM_NAMES[i / 2]}팀</b> ${esc(nameOf(ids[i]))} · ${esc(nameOf(ids[i + 1]))}</li>`);
    B.innerHTML = `<div class="setup"><p class="st">${can ? '게임 설정 · 시작 전에 골라요' : '방장이 고르는 게임 설정'}</p>
      <div class="optrow"><span class="ol">방식</span><div class="seg ${can ? '' : 'ro'}">
        <button type="button" data-team="0" aria-pressed="${!team}" ${can ? '' : 'disabled'}>개인전</button>
        <button type="button" data-team="1" aria-pressed="${team}" ${can && canTeam ? '' : 'disabled'}>팀전 (2명씩)</button></div></div>
      <p class="pool">${n}명${roomSeats().length === 1 ? ' (META BOT 셋과)' : ''} · <b>길 ${lim.win}개</b> 먼저 · <b>임시 말 ${lim.maxTemp}개</b>${canTeam ? '' : ' · 팀전은 짝수 · 4명부터'}</p>
      ${team ? `<ul class="pairs">${pairs.join('')}</ul><p class="pool">팀은 들어온 순서대로 둘씩 짝지어요</p>` : ''}</div>`;
  } else {
    B.innerHTML = boardHtml();
  }

  // 단추 줄 — 두 줄 (위: 한 수 · 아래: 정보)
  let act = '';
  if (ph === 'idle') act = `<div class="row1">${readyButton()}</div><p class="row2">${roomSeats().length === 1 ? '혼자 시작하면 META BOT 셋이 함께 해요' : '4명까지 길 3 · 말 3, 5명부터 길 2 · 말 2'}</p>`;
  else if (ph === 'over') act = `<div class="row1"><button class="btn" data-act="result" type="button">결과 보기</button>${readyButton()}</div><p class="row2">${esc(sideFull(S.winner))}</p>`;
  else if (myTurn() && ph === 'pick'){
    const opts = options(S, S.dice);
    const busy = sentAc && sentAc.seq === S.seq;
    act = `<div class="picks n${Math.min(opts.length, 6)}">` + opts.map((op, i) =>
      `<button class="btn pick" data-act="pick" data-i="${i}" type="button" ${busy ? 'disabled' : ''}>${op.length === 2 ? `<b>${op[0]}</b><span>+</span><b>${op[1]}</b>` : `<b>${op[0]}</b><small>만</small>`}</button>`).join('') + '</div>';
  } else if (myTurn() && ph === 'roll'){
    const busy = sentAc && sentAc.seq === S.seq;
    const used = Object.keys(S.temp).length;
    const p = S.rolls ? bustChance(S) : 0;
    act = `<div class="row1"><button class="btn roll" data-act="roll" type="button" ${busy ? 'disabled' : ''}>🎲 ${S.rolls ? '한 번 더' : '굴리기'}</button>
      <button class="btn stop" data-act="stop" type="button" ${busy || !used ? 'disabled' : ''}>✋ 멈추기</button></div>
      <p class="row2">${S.rolls ? `지금 굴리면 꽝 <b class="${p >= 0.3 ? 'down' : ''}">${Math.round(p * 100)}%</b> · 임시 말 ${used}/${S.maxTemp}` : `임시 말 ${S.maxTemp}개 · 길 ${S.win}개 먼저 차지하면 승리`}</p>`;
  } else {
    const cur = current(S);
    act = `<div class="row1"><span class="wait">${!inGame() ? '지켜보는 중 · ' : ''}${ph === 'bust' ? `💥 ${esc(nameOf(cur))} 님 꽝!` : `🎲 ${esc(nameOf(cur))} 님 차례`}</span></div>
      <p class="row2">${S.teams ? `팀전 · 팀원 길을 합쳐 ${S.win}개` : `길 ${S.win}개 먼저`} · 길을 누르면 누가 어디까지 올랐는지 보여요</p>`;
  }
  const A = $('#actions');
  if (A.dataset.sig !== act){ A.innerHTML = act; A.dataset.sig = act; }

  if (ph === 'over' && shownOver !== S.g){ shownOver = S.g; openSheet('result'); return; }
  if (sheetFor) drawSheet();
}

/* 접속 알림 (마스터의 '접속자') — 게임에 앉아 있는 동안이 게임 중 */
var pres = trackPresence(() => ({ state: net && inGame() ? 'game' : 'wait', place: 'Lucky 주사위' }));
