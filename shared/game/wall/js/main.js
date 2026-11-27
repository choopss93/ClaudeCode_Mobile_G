import { MAX_SEATS, SIDE_NAME, layoutFor, teamable, newGame, current, teamOf, sideKey, distOf, legalMoves, wallProblem,
         move, wall, autoAct, ranking, botAction } from './rules.js?v=1';
import { joinRoom, makeId } from '../../poker/js/room.js?v=13';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';
import { trackPresence } from '../../../js/presence.js?v=p2';
import { isBot, botName, withBots } from '../../../js/bots.js';

/*
 * Pass the Wall — 접속과 화면.
 *
 * 다른 게임처럼 **방장**이 판을 돌린다 (rules.js). 차례인 사람은 한 수(이동 · 벽)만 방장에게 보낸다
 * ('ac', 판 번호 seq 를 붙여 두 번 먹지 않게). 5명 이상이면 차례당 1분 — 지나면 방장이 가장 짧은 길로 한 칸 옮긴다.
 * 혼자 시작하면 META BOT 셋이 함께 한다.
 *
 * 꾸러미
 *   {t:'hi', id, name, at, ready, comm}   들어왔음 (room.js) — comm = 1 개인전 · 2 팀전 (방장 것을 쓴다)
 *   {t:'gs', id, s, el}                   판 상태 (el = 이번 차례가 시작된 뒤)
 *   {t:'ac', id, g, seq, a, r, c, o}      내 차례의 한 수 → 방장 (a = move · wall)
 */
const AWAY = 2500;
const RESEND = 1500;
const CELL = 10;
const $ = s => document.querySelector(s);
const now = () => performance.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = ['#F2B84B', '#5EC2F0', '#F07A8A', '#7ED67E', '#B48CF0', '#F09A4E', '#4ED6C4', '#D9D9D9'];
const TEAM_NAMES = ['A', 'B', 'C', 'D'];

let store = {};
try { store = JSON.parse(localStorage.getItem('passWall') || '{}') || {}; } catch (_){}
const save = () => { try { localStorage.setItem('passWall', JSON.stringify(store)); } catch (_){} };

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ─────────── 상태 ─────────── */
const opt = { team: !!store.team };
const me = { id: makeId(), name: '', at: 0, ready: -1, comm: opt.team ? 2 : 1 };
let net = null, roomId = null;
let S = null;
let stepKey = '', stepAt = 0;
let lastSent = 0;
let sentAc = null;
let botWait = 1200;
let wallMode = false, preview = null;      // 벽 놓기 — 미리보기 [r,c,o]
let sheetFor = null, shownOver = 0;
let seenSeq = -1;

const isHost = () => net && net.order()[0].id === me.id;
const roomSeats = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (isBot(id) ? botName(id) : id === me.id ? me.name : (net && net.peers.get(id)?.name) || (S && S.names[id]) || '나간 사람');
const shortName = id => (isBot(id) ? 'BOT ' + id.split('-')[1] : nameOf(id));
const here = id => isBot(id) || id === me.id || (net && net.present(id));
const inGame = () => S && !S.over && S.order.includes(me.id);
const myTurn = () => S && !S.over && current(S) === me.id;
const keyOf = s => s ? `${s.g}|${s.seq}` : '';
const left = () => (S && S.limit ? Math.max(0, S.limit - (now() - stepAt)) : 0);

function roomOpt(){
  if (!net) return opt;
  const h = net.order()[0];
  if (h.id !== me.id){ const p = net.peers.get(h.id); if (p && (p.comm === 1 || p.comm === 2)) opt.team = p.comm === 2; }
  return opt;
}
function setTeam(v){
  if (net && !isHost()) return;
  opt.team = v; store.team = v; save(); me.comm = v ? 2 : 1;
  if (net) net.hi();
  render();
}
const startCount = () => withBots(roomSeats().map(s => s.id)).length;
function colorOf(id){
  if (S && S.order.includes(id)) return S.teams ? COLORS[teamOf(S, id)] : COLORS[S.order.indexOf(id) % COLORS.length];
  const i = net ? roomSeats().findIndex(s => s.id === id) : 0;
  return COLORS[Math.max(0, i) % COLORS.length];
}
const isSecond = id => !!(S && S.teams && S.teams[teamOf(S, id)][1] === id);
const keyName = k => (S && S.teams ? `${TEAM_NAMES[k]}팀` : nameOf(k));
const keyFull = k => (S && S.teams ? `${TEAM_NAMES[k]}팀 · ${S.teams[k].map(nameOf).join(' · ')}` : nameOf(k));

/* 준비 */
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
  nameIn.value = ACCOUNT.user.id; nameIn.readOnly = true; nameIn.classList.add('locked');
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
    room: id, me, topicBase: 'passwall/', keep: [],
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
    if (navigator.share) await navigator.share({ title: 'Pass the Wall', text: '같이 Pass the Wall 해요', url: link });
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
function apply(s, a){
  if (a.a === 'move') return move(s, +a.r, +a.c);
  if (a.a === 'wall') return wall(s, +a.r, +a.c, a.o === 'v' ? 'v' : 'h');
  return s;
}
function hostAct(id, seq, a){
  if (!S || S.over || current(S) !== id || seq !== S.seq) return;
  commit(apply(S, a));
}
setInterval(() => {
  if (!net || !isHost() || !S || S.over) return;
  const t = now() - stepAt;
  const cur = current(S);
  if (isBot(cur)){
    if (t > botWait){
      botWait = 900 + Math.random() * 1200;
      const a = botAction(S);
      const n = apply(S, a);
      commit(n === S ? autoAct(S) : n);
      return;
    }
  } else if ((S.limit && t > S.limit + 400) || (!here(cur) && t > AWAY)){
    commit(autoAct(S));          // 1분이 지났거나 나간 사람 — 가장 짧은 길로 한 칸
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
    hostAct(m.id, m.seq, m);
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
  if (!myTurn()){ wallMode = false; preview = null; }
  if (!fresh && prev && s.last && s.seq !== seenSeq && (s.last.skip || s.last.auto) && s.last.id === me.id) flash(s.last.skip ? '갈 데가 없어 차례를 넘겼어요' : '시간이 지나 가장 짧은 길로 한 칸 옮겼어요', 2200);
  if (!s.over && prev && current(s) === me.id && current(prev) !== me.id) flash('내 차례예요', 1200);
  seenSeq = s.seq;
  render();
}

/* ─────────── 내 차례 ─────────── */
function act(a){
  if (!myTurn() || (sentAc && sentAc.seq === S.seq)) return;
  sentAc = { seq: S.seq, ...a };
  wallMode = false; preview = null;
  if (isHost()) hostAct(me.id, S.seq, a);
  else { net.send({ t: 'ac', id: me.id, g: S.g, seq: S.seq, ...a }); render(); }
}
setInterval(() => {
  if (!net || !S || isHost() || !sentAc || sentAc.seq !== S.seq || !myTurn()) return;
  net.send({ t: 'ac', id: me.id, g: S.g, ...sentAc });
}, 1000);

/* 판을 누르기 — 이동 모드면 칸, 벽 모드면 가장 가까운 홈 */
function boardPoint(e){
  const svg = $('#bd svg'); if (!svg) return null;
  const b = svg.getBoundingClientRect();
  const u = S.size * CELL;
  return [(e.clientX - b.left) / b.width * u, (e.clientY - b.top) / b.height * u];
}
$('#board').addEventListener('click', e => {
  const t = e.target.closest('[data-team]');
  if (t){ setTeam(t.dataset.team === '1'); return; }
  if (!S || S.over || !myTurn() || !e.target.closest('#bd')) return;
  const p = boardPoint(e); if (!p) return;
  const [x, y] = p, n = S.size;
  if (!wallMode){
    const r = Math.floor(y / CELL), c = Math.floor(x / CELL);
    if (legalMoves(S, me.id).some(([a, b]) => a === r && b === c)) act({ a: 'move', r, c });
    return;
  }
  const gy = Math.abs(y / CELL - Math.round(y / CELL)), gx = Math.abs(x / CELL - Math.round(x / CELL));
  const o = gy < gx ? 'h' : 'v';
  const clamp = v => Math.max(0, Math.min(n - 2, v));
  // 벽은 두 칸 길이 — 누른 자리에 가장 가까운 교차점이 벽의 가운데가 된다
  const r = clamp(Math.round(y / CELL) - 1), c = clamp(Math.round(x / CELL) - 1);
  preview = [r, c, o];
  render();
});

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
  if (a === 'wallmode'){ wallMode = true; preview = null; render(); }
  else if (a === 'movemode' || a === 'cancel'){ wallMode = false; preview = null; render(); }
  else if (a === 'rotate' && preview){ preview = [preview[0], preview[1], preview[2] === 'h' ? 'v' : 'h']; render(); }
  else if (a === 'place' && preview) act({ a: 'wall', r: preview[0], c: preview[1], o: preview[2] });
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
  <li>내 말을 <b>맞은편 변</b>까지 먼저 보내면 이겨요. 내 도착 줄은 판에 내 색으로 보여요.</li>
  <li>차례마다 <b>한 칸 이동</b> 또는 <b>벽 하나 놓기</b> 중 하나. 갈 수 있는 칸에 점이 찍혀요.</li>
  <li>바로 앞에 말이 있으면 <b>뛰어넘고</b>, 그 뒤가 막혔으면 그 말의 <b>옆으로</b> 비껴가요.</li>
  <li>벽은 두 칸 길이. 홈을 누르면 미리보기가 나오고 <b>✓ 놓기</b>로 세워요. <b>누구의 길도 완전히 막을 수는 없어요.</b></li>
  <li>2명 9×9 · 벽 10개 / 3~4명 9×9 · 벽 5개 / 5~8명 13×13 · 벽 3개. 5명부터는 <b>차례당 1분</b>.</li>
  <li><b>팀전</b>(2명씩)은 팀원 중 한 명만 도착해도 이겨요. 혼자 시작하면 META BOT 셋과.</li>
</ol>`;
$('#howBtn').onclick = () => {
  sheetFor = 'how'; sheet.hidden = false;
  $('#sheetTitle').textContent = '게임 방법';
  $('#sheetSub').textContent = '벽으로 막고, 벽을 피해 먼저 건너가요. 1~8명.';
  $('#sheetBody').innerHTML = HOW;
  $('#sheetBtns').innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
};
function drawSheet(){
  if (!sheetFor || sheetFor === 'how' || !S) return;
  const T = $('#sheetTitle'), Sub = $('#sheetSub'), B = $('#sheetBody'), F = $('#sheetBtns');
  if (sheetFor === 'result'){
    const rows = ranking(S);
    const mine = sideKey(S, me.id);
    T.textContent = S.winner === mine && S.order.includes(me.id) ? (S.teams ? '우리 팀 승리!' : '승리!') : `${keyName(S.winner)} 승리`;
    Sub.textContent = `${S.teams ? '팀전' : '개인전'} · ${S.size}×${S.size}`;
    B.innerHTML = `<ol id="rank" class="${rows.length > 5 ? 'tight' : ''}">` + rows.map(r =>
      `<li class="${r.key === S.winner ? 'win' : ''}"><span class="no">${r.rank}</span>
       <span class="nm"><i class="sw" style="--c:${S.teams ? COLORS[r.key] : colorOf(r.key)}"></i>${esc(keyFull(r.key))}${r.key === mine && S.order.includes(me.id) ? ' (나)' : ''}</span>
       <span class="tk">${r.key === S.winner ? '도착!' : `남은 길 ${r.dist}칸`}</span></li>`).join('') + '</ol>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>' + readyButton();
  }
}

/* ─────────── 그리기 ─────────── */
function phaseNow(){ return !S ? 'idle' : S.over ? 'over' : 'play'; }

function boardSvg(){
  const n = S.size, U = n * CELL;
  let g = `<svg viewBox="-1.5 -1.5 ${U + 3} ${U + 3}" xmlns="http://www.w3.org/2000/svg">`;
  // 도착 줄 — 내 것은 진하게, 남의 것은 옅게
  const goals = {};
  for (const id of S.order){ const sd = S.side[id]; (goals[sd] = goals[sd] || []).push(id); }
  const strip = (sd, col, op) => {
    const t = 1.3;
    const r = sd === 'S' ? [0, -1.5, U, t] : sd === 'N' ? [0, U + 0.2, U, t] : sd === 'W' ? [U + 0.2, 0, t, U] : [-1.5, 0, t, U];
    return `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx=".6" fill="${col}" opacity="${op}"/>`;
  };
  for (const [sd, ids] of Object.entries(goals)) g += strip(sd, colorOf(ids[0]), ids.includes(me.id) ? 1 : 0.35);
  // 칸
  const moves = myTurn() && !wallMode && !(sentAc && sentAc.seq === S.seq) ? legalMoves(S, me.id) : [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g += `<rect x="${c * CELL + 0.8}" y="${r * CELL + 0.8}" width="${CELL - 1.6}" height="${CELL - 1.6}" rx="1.4" class="cl"/>`;
  for (const [r, c] of moves) g += `<rect x="${c * CELL + 0.8}" y="${r * CELL + 0.8}" width="${CELL - 1.6}" height="${CELL - 1.6}" rx="1.4" class="mv"/><circle cx="${c * CELL + 5}" cy="${r * CELL + 5}" r="1.4" class="mvd"/>`;
  // 벽
  const wallRect = ([r, c, o], cls) => o === 'h'
    ? `<rect x="${c * CELL + 0.5}" y="${(r + 1) * CELL - 1}" width="${CELL * 2 - 1}" height="2" rx=".8" class="${cls}"/>`
    : `<rect x="${(c + 1) * CELL - 1}" y="${r * CELL + 0.5}" width="2" height="${CELL * 2 - 1}" rx=".8" class="${cls}"/>`;
  for (const w of S.walls) g += wallRect(w, 'wl');
  if (S.last && S.last.wall) g += wallRect(S.last.wall, 'wl new');
  if (preview) g += wallRect(preview, wallProblem(S, me.id, ...preview) ? 'pv bad' : 'pv');
  // 말
  for (const id of S.order){
    const [r, c] = S.pos[id], col = colorOf(id);
    const cur = current(S) === id && !S.over;
    g += `<g transform="translate(${c * CELL + 5} ${r * CELL + 5})">${cur ? '<circle r="4.6" class="ring"/>' : ''}`
      + (isSecond(id) ? `<circle r="3.2" fill="#111" stroke="${col}" stroke-width="1.6"/>` : `<circle r="3.4" fill="${col}"/>`)
      + (id === me.id ? '<circle r="1.1" fill="#fff"/>' : '') + '</g>';
  }
  return g + '</svg>';
}

function render(){
  pres && pres.update();
  if (!net) return;
  const ph = phaseNow();
  const host = net.order()[0].id;
  const between = ph === 'idle' || ph === 'over';
  const o = roomOpt();

  // 자리
  const showIds = ph === 'idle' ? roomSeats().map(s => s.id)
    : ph === 'over' ? [...new Set([...S.order, ...roomSeats().map(s => s.id)])].slice(0, MAX_SEATS) : S.order;
  $('#seats').innerHTML = showIds.map(id => {
    const playing = S && S.order.includes(id);
    const rd = between && isReady(id);
    let right = '';
    if (between) right = id === host ? '방장' : isBot(id) ? 'BOT' : rd ? '✓ 준비' : '대기';
    else if (current(S) === id) right = '▶ 차례';
    const tag = playing && S.teams ? `<b class="tm" style="--c:${colorOf(id)}">${TEAM_NAMES[teamOf(S, id)]}</b>` : '';
    return `<li class="${id === me.id ? 'me' : ''} ${!between && current(S) === id ? 'turn' : ''} ${rd ? 'rd' : ''} ${!between && !here(id) ? 'out' : ''}">
      <span class="nm"><i class="sw ${isSecond(id) ? 'ring' : ''}" style="--c:${colorOf(id)}"></i>${id === host ? '<em>★</em>' : ''}${tag}${esc(shortName(id))}</span>
      <span class="sc">${playing ? `🧱${S.left[id]}` : ''}</span><span class="pk">${right}</span></li>`;
  }).join('') + Array.from({ length: Math.max(0, MAX_SEATS - showIds.length) }, () => '<li class="empty">빈자리</li>').join('');

  // 안내
  let head = '', sub = '';
  if (ph === 'idle'){
    const n = roomSeats().length;
    head = allReady() ? (isHost() ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${n}`;
    sub = isHost() ? (allReady() ? '개인전 · 팀전을 고르고 게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : roomSeats().some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 시작해요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요';
  } else if (ph === 'over'){
    head = `${keyName(S.winner)} 승리!`;
    sub = `다음 게임 준비 ${readyCount()}/${roomSeats().length}`;
  } else {
    const cur = current(S), mine = cur === me.id;
    head = mine ? '▶ 내 차례' : `${nameOf(cur)} 님 차례`;
    if (mine && wallMode) sub = preview ? (wallProblem(S, me.id, ...preview) || '✓ 놓기를 누르면 세워져요 · ↻ 로 방향') : '벽을 세울 홈(칸 사이)을 누르세요';
    else if (mine) sub = `점 찍힌 칸으로 옮기거나 벽을 놓아요 · 내 도착까지 ${distOf(S, me.id)}칸`;
    else sub = inGame() ? `내 도착까지 ${distOf(S, me.id)}칸 · 벽 ${S.left[me.id]}개` : '지켜보는 중';
  }
  $('#phase').textContent = head;
  $('#hint').textContent = sub;
  const clock = $('#clock');
  clock.hidden = !(ph === 'play' && S.limit);
  if (!clock.hidden) clock.textContent = Math.ceil(left() / 1000) + '초';

  // 가운데
  const B = $('#board');
  if (ph === 'idle'){
    const can = isHost();
    const n = startCount();
    const canTeam = teamable(n);
    const team = o.team && canTeam;
    const L = layoutFor(n);
    const ids = withBots(roomSeats().map(s => s.id));
    const pairs = [];
    if (team) for (let i = 0; i < ids.length; i += 2) pairs.push(`<li><b>${TEAM_NAMES[i / 2]}팀</b> ${esc(shortName(ids[i]))} · ${esc(shortName(ids[i + 1]))}</li>`);
    B.innerHTML = `<div class="setup"><p class="st">${can ? '게임 설정 · 시작 전에 골라요' : '방장이 고르는 게임 설정'}</p>
      <div class="optrow"><span class="ol">방식</span><div class="seg">
        <button type="button" data-team="0" aria-pressed="${!team}" ${can ? '' : 'disabled'}>개인전</button>
        <button type="button" data-team="1" aria-pressed="${team}" ${can && canTeam ? '' : 'disabled'}>팀전 (2명씩)</button></div></div>
      <p class="pool">${n}명${roomSeats().length === 1 ? ' (META BOT 셋과)' : ''} · <b>${L.size}×${L.size}</b> · 벽 <b>${L.walls}개씩</b> · ${n >= 5 ? '<b>차례당 1분</b>' : '시간 제한 없음'}${canTeam ? '' : ' · 팀전은 짝수 · 4명부터'}</p>
      ${team ? `<ul class="pairs">${pairs.join('')}</ul><p class="pool">팀은 들어온 순서대로 둘씩 · 한 명만 도착해도 팀 승리</p>` : ''}</div>`;
  } else {
    B.innerHTML = `<div class="bwrap"><div id="bd" class="${wallMode ? 'wm' : ''}">${boardSvg()}</div></div>`;
  }

  // 단추
  let act = '';
  const busy = sentAc && S && sentAc.seq === S.seq;
  if (ph === 'idle') act = readyButton();
  else if (ph === 'over') act = '<button class="btn" data-act="result" type="button">결과 보기</button>' + readyButton();
  else if (myTurn() && wallMode){
    const bad = !preview || !!wallProblem(S, me.id, ...preview);
    act = `<button class="btn" data-act="cancel" type="button">✕</button><button class="btn" data-act="rotate" type="button" ${preview ? '' : 'disabled'}>↻ 돌리기</button>
      <button class="btn primary" data-act="place" type="button" ${bad || busy ? 'disabled' : ''}>✓ 놓기</button>`;
  } else if (myTurn()){
    act = `<span class="wait">${busy ? '보내는 중…' : '🚶 점 찍힌 칸을 눌러 이동'}</span><button class="btn wallbtn" data-act="wallmode" type="button" ${S.left[me.id] && !busy ? '' : 'disabled'}>🧱 벽 놓기 <small>${S.left[me.id]}</small></button>`;
  } else act = `<span class="wait">${inGame() ? `${esc(nameOf(current(S)))} 님 차례` : '지켜보는 중'}</span>`;
  const A = $('#actions');
  if (A.dataset.sig !== act){ A.innerHTML = act; A.dataset.sig = act; }

  if (ph === 'over' && shownOver !== S.g){ shownOver = S.g; openSheet('result'); return; }
  if (sheetFor) drawSheet();
}
setInterval(() => {
  if (!S || S.over || !S.limit) return;
  const c = $('#clock');
  if (c){ const sec = Math.ceil(left() / 1000); c.textContent = sec + '초'; c.classList.toggle('low', sec <= 10); }
}, 250);

var pres = trackPresence(() => ({ state: net && inGame() ? 'game' : 'wait', place: 'Pass the Wall' }));
