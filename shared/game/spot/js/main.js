import { LOOK_MS, FIND_MS, RES_MS, ROUND_CHOICES, MAX_SEATS, SPOTS, newGame, addFound, toFind, toRes, nextRound, allDone, ranking } from './rules.js?v=1';
import { W, HH, makeDiffs, drawScene, hitDiff, KIND_NAME } from './scene.js?v=1';
import { joinRoom, makeId } from '../../poker/js/room.js?v=12';
import { makeChannel, readChannel, showChannel, channelFromHash, writeChannelToHash, inviteLink } from '../../world/js/channel.js';
import { readAccount } from '../../../js/account.js?v=s6';
import { serverNow } from '../../../js/clock.js?v=k1';
import { trackPresence } from '../../../js/presence.js?v=p2';

/*
 * 틀린그림찾기 — 접속과 화면.
 *
 * 다른 게임처럼 **방장**이 판을 돌린다 (rules.js — 보기 3분 → 찾기 1분 → 라운드 점수). 그림은 라운드마다 씨앗 하나
 * (판 상태의 seeds) 로 모두의 기기에서 똑같이 지어진다 (scene.js). 찾았는지는 각자 기기가 따지고, 찾은 번호만
 * 방장에게 보낸다 ('fd'). 틀린 데를 누르면 2초 동안 못 누른다 — 아무 데나 마구 누르지 못하게.
 *
 * 꾸러미
 *   {t:'hi', id, name, at, ready, games}   들어왔음 (room.js) — games = 라운드 수 (방장 것을 쓴다)
 *   {t:'gs', id, s, el}                    판 상태
 *   {t:'fd', id, g, r, f:[번호]}           내가 찾은 곳 → 방장
 */
const AWAY = 2500;
const RESEND = 1500;
const WRONG_LOCK = 2000;
const $ = s => document.querySelector(s);
const now = () => performance.now();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let store = {};
try { store = JSON.parse(localStorage.getItem('spotGame') || '{}') || {}; } catch (_){}
const save = () => { try { localStorage.setItem('spotGame', JSON.stringify(store)); } catch (_){} };

for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ─────────── 상태 ─────────── */
const opt = { rounds: ROUND_CHOICES.includes(store.rounds) ? store.rounds : 3 };
const me = { id: makeId(), name: '', at: 0, ready: -1, games: opt.rounds };
let net = null, roomId = null;
let S = null;
let stepKey = '', stepAt = 0;
let lastSent = 0;
let mine = new Set();              // 이번 라운드에 내가 찾은 곳 (방장에게 닿기 전에도 바로 보인다)
let mineKey = '';
let wrongAt = -1e9, wrongXY = null;
let sheetFor = null, shownRes = '', shownOver = 0;
let lastSig = '';
const sceneCache = new Map();

const isHost = () => net && net.order()[0].id === me.id;
const roomSeats = () => net.order().slice(0, MAX_SEATS);
const nameOf = id => (id === me.id ? me.name : (net && net.peers.get(id)?.name) || (S && S.names[id]) || '나간 사람');
const here = id => id === me.id || (net && net.present(id));
const inGame = () => S && !S.over && S.order.includes(me.id);
const keyOf = s => s ? `${s.g}|${s.r}|${s.phase}` : '';
const roundKey = s => `${s.g}|${s.r}`;
const phaseMs = ph => (ph === 'look' ? LOOK_MS : ph === 'find' ? FIND_MS : ph === 'res' ? RES_MS : 0);
const left = () => S ? Math.max(0, phaseMs(S.phase) - (now() - stepAt)) : 0;
const fmt = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function puzzle(s = S){
  const seed = s.seeds[s.r];
  if (!sceneCache.has(seed)){
    const p = makeDiffs(seed);
    sceneCache.set(seed, { ...p, svgA: drawScene(p.scene), svgB: drawScene(p.changed) });
  }
  return sceneCache.get(seed);
}

function roomOpt(){
  if (!net) return opt;
  const h = net.order()[0];
  if (h.id !== me.id){
    const p = net.peers.get(h.id);
    if (p && ROUND_CHOICES.includes(p.games)) opt.rounds = p.games;
  }
  return opt;
}
function setRounds(v){
  if (net && !isHost()) return;
  opt.rounds = v; store.rounds = v; save();
  me.games = v;
  if (net) net.hi();
  render();
}

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
    room: id, me, topicBase: 'spotdiff/', keep: [],
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
    if (navigator.share) await navigator.share({ title: '틀린그림찾기', text: '같이 틀린그림찾기 해요', url: link });
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
function commit(nextS){ if (nextS === S) return; adopt(nextS, 0); sendState(); }   // 같은 단계면 keyOf 가 그대로라 시계도 그대로
function startGame(){
  if (!isHost() || !allReady()) return;
  const seats = roomSeats().map(s => s.id);
  const names = {};
  for (const id of seats) names[id] = nameOf(id);
  adopt(newGame((S ? S.g : 0) + 1, seats, names, roomOpt()), 0);
  sendState();
}
setInterval(() => {
  if (!net || !isHost() || !S || S.over) return;
  const t = now() - stepAt;
  if (S.phase === 'look' && t > LOOK_MS){ commit(toFind(S)); return; }
  if (S.phase === 'find' && (t > FIND_MS + 600 || allDone(S, S.order.filter(here)))){ commit(toRes(S)); return; }
  if (S.phase === 'res' && t > RES_MS){ commit(nextRound(S)); return; }
  if (now() - lastSent > RESEND) sendState();
}, 200);

/* ─────────── 꾸러미 받기 ─────────── */
function onMessage(m){
  if (m.t === 'gs' && m.s && Array.isArray(m.s.order)){
    if (S && (m.s.g < S.g || (m.s.g === S.g && m.s.seq <= S.seq))) return;
    adopt(m.s, +m.el || 0);
  } else if (m.t === 'fd' && isHost() && S && m.g === S.g && m.r === S.r && Array.isArray(m.f)){
    commit(addFound(S, m.id, m.f));
  }
}

function adopt(s, el){
  const fresh = !S || s.g !== S.g;
  const prev = S;
  S = s;
  const k = keyOf(s);
  if (k !== stepKey){ stepKey = k; stepAt = now() - el; }
  if (fresh){ closeSheet(); }
  if (roundKey(s) !== mineKey){ mine = new Set(); mineKey = roundKey(s); wrongXY = null; }
  // 방장이 아는 내 것도 더한다 (다른 기기에서 넘어온 경우 등)
  for (const i of s.found[me.id] || []) mine.add(i);
  if (prev && prev.phase !== s.phase && (s.phase === 'look' || s.phase === 'find') && (sheetFor === 'res' || sheetFor === 'over')) closeSheet();   // 다음 라운드 — 점수 창이 그림을 가리지 않게
  if (!fresh && prev && prev.phase !== s.phase){
    if (s.phase === 'find') flash('그림이 바뀌었어요! 틀린 곳 다섯을 찾아요', 2200);
    if (s.phase === 'look' && s.r > 0) flash(`${s.r + 1}라운드 — 그림을 잘 봐 두세요`, 2000);
  }
  render();
}

/* ─────────── 누르기 — 찾기 ─────────── */
function tapAt(ev){
  if (!S || S.phase !== 'find' || !inGame()) return;
  if (now() - wrongAt < WRONG_LOCK) return;
  const svg = $('#pic svg');
  if (!svg) return;
  const b = svg.getBoundingClientRect();
  const x = (ev.clientX - b.left) / b.width * W, y = (ev.clientY - b.top) / b.height * HH;
  if (x < 0 || y < 0 || x > W || y > HH) return;
  const { diffs } = puzzle();
  const i = hitDiff(diffs, x, y);
  if (i >= 0 && !mine.has(i)){
    mine.add(i);
    if (isHost()) commit(addFound(S, me.id, [...mine]));
    else net.send({ t: 'fd', id: me.id, g: S.g, r: S.r, f: [...mine] });
    if (mine.size >= SPOTS) flash('다섯 곳을 다 찾았어요! 🎉', 2000);
    render();
  } else if (i < 0){
    wrongAt = now(); wrongXY = [x, y];
    render();
    setTimeout(render, WRONG_LOCK + 30);
  }
}
$('#board').addEventListener('pointerdown', e => { if (e.target.closest('#pic')) tapAt(e); });
// QoS 0 — 방장이 모르는 게 있으면 다시 보낸다
setInterval(() => {
  if (!net || !S || isHost() || S.phase !== 'find') return;
  const known = new Set(S.found[me.id] || []);
  if ([...mine].some(i => !known.has(i))) net.send({ t: 'fd', id: me.id, g: S.g, r: S.r, f: [...mine] });
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
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  if (a === 'start') startGame();
  else if (a === 'ready') toggleReady();
  else if (a === 'result') openSheet(S && S.over ? 'over' : 'res');
});
$('#board').addEventListener('click', e => {
  const b = e.target.closest('[data-opt]');
  if (b) setRounds(+b.dataset.opt);
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
  <li>시작 전에 방장이 <b>3 · 5 · 7 라운드</b> 중에 골라요.</li>
  <li>그림이 <b>3분</b> 동안 나와요. 구석구석 잘 봐 두세요.</li>
  <li>그림이 사라지고 <b>조금 바뀐 그림</b>이 나와요. <b>1분</b> 안에 틀린 곳 <b>다섯</b>을 눌러요.</li>
  <li>틀린 곳은 <b>색상 · 모양 · 사물 · 그림자 · 형태</b> 중에서 나와요.</li>
  <li>한 곳에 <b>1점</b>. 틀린 데를 누르면 <b>2초</b> 동안 못 눌러요.</li>
  <li>라운드가 끝날 때마다 모두의 점수와 정답 자리를 봐요. 합이 높을수록 위.</li>
</ol>`;
$('#howBtn').onclick = () => {
  sheetFor = 'how'; sheet.hidden = false;
  $('#sheetTitle').textContent = '게임 방법';
  $('#sheetSub').textContent = '3분 동안 그림을 외우고, 바뀐 곳 다섯을 1분 안에 찾아요. 1~8명.';
  $('#sheetBody').innerHTML = HOW;
  $('#sheetBtns').innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>';
};
function drawSheet(){
  if (!sheetFor || sheetFor === 'how' || !S) return;
  const T = $('#sheetTitle'), Sub = $('#sheetSub'), B = $('#sheetBody'), F = $('#sheetBtns');
  if (sheetFor === 'res' && S.history.length){
    const last = S.history[S.history.length - 1];
    const rnd = S.history.length;
    T.textContent = `${rnd}라운드 점수`;
    Sub.textContent = S.over || rnd >= S.rounds ? '마지막 라운드였어요' : `다음 라운드까지 ${Math.ceil(left() / 1000)}초`;
    const rows = ranking(S);
    B.innerHTML = `<ol id="rank" class="${rows.length > 5 ? 'tight' : ''}">` + rows.map(r =>
      `<li><span class="no">${r.rank}</span><span class="nm">${esc(nameOf(r.id))}${r.id === me.id ? ' (나)' : ''}</span>
       <span class="tk">이번 +${last[r.id] || 0}</span><span class="sc">${r.score}</span></li>`).join('') + '</ol>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">닫기 · 정답 자리 보기</button>';
  } else if (sheetFor === 'over' || (sheetFor === 'res' && !S.history.length)){
    const rows = ranking(S);
    const tops = rows.filter(r => r.rank === 1);
    T.textContent = tops.length > 1 ? '공동 1등!' : tops[0].id === me.id ? '1등이에요!' : `${nameOf(tops[0].id)} 님 1등`;
    Sub.textContent = `${S.rounds}라운드 · 모두 ${S.rounds * SPOTS}곳`;
    B.innerHTML = `<ol id="rank" class="${rows.length > 5 ? 'tight' : ''}">` + rows.map(r =>
      `<li class="${r.rank === 1 ? 'win' : ''}"><span class="no">${r.rank}</span><span class="nm">${esc(nameOf(r.id))}${r.id === me.id ? ' (나)' : ''}</span>
       <span class="tk">${S.history.map(h => h[r.id] || 0).join(' · ')}</span><span class="sc">${r.score}</span></li>`).join('') + '</ol>';
    F.innerHTML = '<button class="btn" data-act="close" type="button">닫기</button>' + readyButton();
  }
}

/* ─────────── 그리기 ─────────── */
function phaseNow(){ return !S ? 'idle' : S.over ? 'over' : S.phase; }

/** 그림 위 표시 — 찾은 곳(초록) · 결과 때 못 찾은 곳(빨강) · 방금 틀리게 누른 곳(✗) */
function marks(ph){
  const { diffs } = puzzle();
  let m = '';
  diffs.forEach((d, i) => {
    const [x0, y0, x1, y1] = d.region;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(14, (x1 - x0) / 2 + 5), ry = Math.max(14, (y1 - y0) / 2 + 5);
    const got = mine.has(i);
    if (got) m += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#2BD46B" stroke-width="3.5"/>`;
    else if (ph === 'res' || ph === 'over') m += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#FF4D5E" stroke-width="3" stroke-dasharray="7 5"/>`;
    if (ph === 'res' || ph === 'over') m += `<text x="${cx}" y="${Math.max(12, y0 - 4)}" text-anchor="middle" font-size="11" font-weight="700" fill="${got ? '#127A3A' : '#C21F2F'}" stroke="#fff" stroke-width="3" paint-order="stroke">${KIND_NAME[d.kind]}</text>`;
  });
  if (ph === 'find' && wrongXY && now() - wrongAt < WRONG_LOCK) m += `<text x="${wrongXY[0]}" y="${wrongXY[1] + 9}" text-anchor="middle" font-size="28" font-weight="800" fill="#FF4D5E" stroke="#fff" stroke-width="3" paint-order="stroke">✗</text>`;
  return m;
}

function render(){
  pres && pres.update();
  if (!net) return;
  const ph = phaseNow();
  const host = net.order()[0].id;
  const between = ph === 'idle' || ph === 'over';
  const o = roomOpt();

  // 자리 — 이름 · 합계 · 이번 라운드
  const showIds = ph === 'idle' ? roomSeats().map(s => s.id)
    : ph === 'over' ? [...new Set([...S.order, ...roomSeats().map(s => s.id)])].slice(0, MAX_SEATS) : S.order;
  $('#seats').innerHTML = showIds.map(id => {
    const has = S && S.scores[id] != null;
    const rd = between && isReady(id);
    let right = '';
    if (between) right = id === host ? '방장' : rd ? '✓ 준비' : '대기';
    else if (ph === 'find') right = `${(id === me.id ? mine.size : (S.found[id] || []).length)}/${SPOTS}`;
    else if (ph === 'res') right = `+${S.history[S.history.length - 1]?.[id] || 0}`;
    else right = '보는 중';
    return `<li class="${id === me.id ? 'me' : ''} ${rd ? 'rd' : ''} ${!between && !here(id) ? 'out' : ''} ${ph === 'find' && (S.found[id] || []).length >= SPOTS ? 'done' : ''}">
      <span class="nm">${id === host ? '<em>★</em>' : ''}${esc(nameOf(id))}</span>
      <span class="sc">${has ? S.scores[id] : ''}</span><span class="pk">${right}</span></li>`;
  }).join('') + Array.from({ length: Math.max(0, MAX_SEATS - showIds.length) }, () => '<li class="empty">빈자리</li>').join('');

  // 안내 두 줄
  let head = '', sub = '';
  if (ph === 'idle'){
    const n = roomSeats().length;
    head = allReady() ? (isHost() ? '모두 준비됐어요' : '모두 준비 · 곧 시작') : `준비 ${readyCount()}/${n}`;
    sub = isHost() ? (allReady() ? '라운드 수를 고르고 게임 시작을 눌러 주세요' : '모두 게임 준비를 누르면 시작할 수 있어요')
      : roomSeats().some(s => s.id === me.id) ? (me.ready === readyBase() ? `방장 ${nameOf(host)} 님이 시작해요` : '게임 준비를 눌러 주세요') : '자리가 차서 지켜봐요';
  } else if (ph === 'over'){
    const r = ranking(S).find(x => x.id === me.id);
    head = `${S.rounds}라운드 끝!`;
    sub = (r ? `나는 ${r.rank}등 · ${r.score}점 · ` : '') + `다음 게임 준비 ${readyCount()}/${roomSeats().length}`;
  } else {
    head = `${S.r + 1}/${S.rounds}라운드 · ${ph === 'look' ? '그림을 잘 봐 두세요' : ph === 'find' ? '틀린 곳 찾기' : '라운드 결과'}`;
    sub = ph === 'look' ? '3분 뒤에 그림이 사라지고 바뀐 그림이 나와요'
      : ph === 'find' ? (now() - wrongAt < WRONG_LOCK ? '✗ 틀렸어요 — 2초 뒤에 다시 누를 수 있어요' : '바뀐 곳을 눌러요 · 한 곳에 1점')
      : '초록은 찾은 곳 · 빨강은 못 찾은 곳';
  }
  $('#phase').textContent = head;
  $('#hint').textContent = sub;

  // 가운데 — 설정 · 그림
  const B = $('#board');
  let html = '', sig = '';
  if (ph === 'idle'){
    const can = isHost();
    html = `<div class="setup"><p class="st">${can ? '게임 설정 · 시작 전에 골라요' : '방장이 고르는 게임 설정'}</p>
      <div class="optrow"><span class="ol">라운드</span><div class="seg ${can ? '' : 'ro'}">` +
      ROUND_CHOICES.map(v => `<button type="button" data-opt="${v}" aria-pressed="${o.rounds === v}" ${can ? '' : 'disabled'}>${v}라운드</button>`).join('') +
      `</div></div><p class="pool">한 라운드 = 보기 <b>3분</b> + 찾기 <b>1분</b> · 틀린 곳 <b>5곳</b> (한 곳에 1점)</p></div>`;
    sig = html;
  } else {
    const p = puzzle();
    const showB = ph !== 'look';
    const mk = showB ? marks(ph) : '';
    const svg = showB ? p.svgB.replace('</svg>', mk + '</svg>') : p.svgA;
    const dots = Array.from({ length: SPOTS }, (_, i) => `<i class="${i < mine.size ? 'on' : ''}"></i>`).join('');
    html = `<div class="pcard ph-${ph}">
      <div class="ptop"><span class="pk2">${ph === 'look' ? '👀 외우는 중' : ph === 'find' ? '🔍 바뀐 그림' : '정답 자리'}</span>
        <span class="spots">${ph === 'look' ? '' : dots}</span><span class="clock ${ph}" id="clock">${fmt(left())}</span></div>
      <div class="pwrap"><div id="pic" class="${ph === 'find' && now() - wrongAt < WRONG_LOCK ? 'locked' : ''}">${svg}</div></div></div>`;
    sig = `${S.g}|${S.r}|${ph}|${[...mine].join(',')}|${ph === 'find' && now() - wrongAt < WRONG_LOCK ? wrongAt : 0}`;
  }
  if (sig !== lastSig){ B.innerHTML = html; lastSig = sig; }

  // 단추 줄
  let act = '';
  if (ph === 'idle') act = readyButton();
  else if (ph === 'over') act = '<button class="btn" data-act="result" type="button">결과 보기</button>' + readyButton();
  else if (ph === 'look') act = `<span class="wait">👀 잘 봐 두세요 · <b id="actClock">${fmt(left())}</b> 뒤에 사라져요</span>`;
  else if (ph === 'find') act = inGame() ? `<span class="wait">찾은 곳 <b>${mine.size}/${SPOTS}</b>${mine.size >= SPOTS ? ' · 다 찾았어요!' : ''}</span>` : '<span class="wait">지켜보는 중</span>';
  else if (ph === 'res') act = `<button class="btn" data-act="result" type="button">점수 보기</button><span class="wait">다음 라운드 <b id="actClock">${Math.ceil(left() / 1000)}</b>초</span>`;
  const A = $('#actions');
  const asig = act.replace(/<b id="actClock">[^<]*<\/b>/, '');
  if (A.dataset.sig !== asig){ A.innerHTML = act; A.dataset.sig = asig; }

  if (ph === 'res' && shownRes !== roundKey(S)){ shownRes = roundKey(S); openSheet('res'); return; }
  if (ph === 'over' && shownOver !== S.g){ shownOver = S.g; openSheet('over'); return; }
  if (sheetFor) drawSheet();
}
/* 시계 — 매초 고친다 */
setInterval(() => {
  if (!S || S.over) return;
  const c = $('#clock');
  if (c){ c.textContent = fmt(left()); c.classList.toggle('low', S.phase !== 'res' && left() < (S.phase === 'look' ? 20000 : 10000)); }
  const a = $('#actClock');
  if (a) a.textContent = S.phase === 'res' ? Math.ceil(left() / 1000) : fmt(left());
  if (sheetFor === 'res') { const sub = $('#sheetSub'); if (sub && S.phase === 'res') sub.textContent = `다음 라운드까지 ${Math.ceil(left() / 1000)}초`; }
}, 250);

/* 접속 알림 (마스터의 '접속자') — 게임에 앉아 있는 동안이 게임 중 */
var pres = trackPresence(() => ({ state: net && inGame() ? 'game' : 'wait', place: '틀린그림찾기' }));
