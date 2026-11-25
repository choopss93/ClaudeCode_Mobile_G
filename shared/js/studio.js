import * as THREE from 'three';
import { createActor, HEAD_TOP } from '../game/world/js/actor.js?v=s5';
import { GENDERS, SKIN, PARTS, hex, cleanChar, randomChar } from './character.js?v=c3';
import { readAccount, refresh, signup, login, logout, saveChar, recover, newRecovery, checkId, renameId } from './account.js?v=s8';
import { trackPresence } from './presence.js?v=p1';
import { createLogo } from './logo.js?v=l2';

/*
 * Metaversal Studio — 시작 → 가입·로그인 → 캐릭터 꾸미기 → 메뉴.
 *
 * 가운데의 3D 캐릭터는 무지개 정원의 캐릭터 코드(actor.js)를 그대로 쓴다.
 * 그래서 여기서 꾸민 모습이 게임 속 모습과 똑같다. 캔버스는 하나만 두고
 * 화면이 바뀔 때마다 그 화면의 자리(.stage)로 옮겨 단다 — WebGL 화면을
 * 여럿 열면 폰이 버겁다.
 */

const $ = s => document.querySelector(s);
const screens = ['intro', 'auth', 'recover', 'codeScreen', 'maker', 'menu', 'cat'];

/* 확대 막기 — 두 손가락 오므리기 (사파리는 viewport 를 듣지 않는다) */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

/* ─────────── 3D 무대 ─────────── */
const canvas = document.createElement('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xD6F5C4, 1.35));
const sun = new THREE.DirectionalLight(0xFFFBF0, 1.0);
sun.position.set(2, 4, 3);
scene.add(sun);
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
const LOOK_Y = HEAD_TOP * 0.55;
const HEAD_C = HEAD_TOP - 0.36;           // 머리 가운데보다 조금 아래 — 묶은 머리 끝까지 들어오게
let zoom = 0, zoomTo = 0;                 // 0 온몸 · 1 머리
let farZ = 2.4;
camera.position.set(0, LOOK_Y + 0.15, farZ);
camera.lookAt(0, LOOK_Y, 0);

/* 첫 화면에는 캐릭터 대신 3D 로고를 띄운다 (사용자 요청). 같은 캔버스에 장면만 바꿔 그린다. */
const logo = createLogo();
let showLogo = true;

let actor = null, spin = 0.5, pitch = 0.3, drag = null;   // pitch — 로고만 위아래로도 돈다
function wear(char){
  if (actor) scene.remove(actor.group);
  actor = createActor({ style: cleanChar(char) });
  actor.setHand(false);
  actor.group.rotation.y = spin;
  scene.add(actor.group);
}

function fit(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 낮고 넓은 자리에서도 머리부터 발끝까지 들어가게 거리를 맞춘다
  const need = (HEAD_TOP + 0.25) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  farZ = Math.max(1.6, need * Math.max(1, 0.9 / camera.aspect)) * 1.05;
  camera.updateProjectionMatrix();
  logo.fit(w / h);
}
new ResizeObserver(fit).observe(canvas);

canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, s: spin, p: pitch }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  spin = drag.s + (e.clientX - drag.x) * 0.012;
  if (showLogo) pitch = drag.p + (e.clientY - drag.y) * 0.012;   // 캐릭터는 옆으로만
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

let last = performance.now();
function frame(t){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (!canvas.isConnected) return;
  if (showLogo){
    if (!drag){ spin += dt * 0.45; pitch += dt * 0.31; }   // 빠르기를 달리 해 구처럼 구른다
    logo.update(dt, spin, pitch);
    renderer.render(logo.scene, logo.camera);
    return;
  }
  if (!actor) return;
  if (!drag){
    if (zoomTo > 0){
      // 얼굴 · 헤어를 고를 때는 앞을 보고 멈춘다 — 돌아가 있으면 뒤통수만 보인다
      const front = Math.round(spin / (Math.PI * 2)) * Math.PI * 2 + 0.25;
      spin += (front - spin) * Math.min(1, dt * 4);
    } else spin += dt * 0.35;            // 가만두면 천천히 돈다
  }
  actor.group.rotation.y = spin;
  actor.update(dt, 0);
  zoom += (zoomTo - zoom) * Math.min(1, dt * 6);
  const y = LOOK_Y + (HEAD_C - LOOK_Y) * zoom;
  camera.position.set(0, y + 0.15 * (1 - zoom) + 0.05 * zoom, farZ + (farZ * 0.8 - farZ) * zoom);
  camera.lookAt(0, y, 0);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ─────────── 화면 바꾸기 ─────────── */
function show(name){
  for (const s of screens) $('#' + s).hidden = s !== name;
  // 첫 화면 · 캐릭터 없는 메뉴에는 로고, 그 밖에는 캐릭터
  showLogo = name === 'intro' || ((name === 'menu' || name === 'cat') && !charOf(account));
  const slot = $('#' + name + ' [data-stage]');
  // 1차 · 2차 목록(메뉴 · 갈래)에는 로고를 띄우지 않는다 (사용자 요청) — 캐릭터가 있으면 캐릭터만
  const bare = showLogo && name !== 'intro';
  $('#' + name).classList.toggle('nostage', bare);
  if (slot) slot.hidden = bare;
  if (slot && !bare){ slot.appendChild(canvas); requestAnimationFrame(fit); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (b) show(b.dataset.go);
});

/* ─────────── 상태 ─────────── */
let account = readAccount();
/* 캐릭터는 가입 때가 아니라 **무지개 정원에 처음 들어가기 직전**에 만든다 (사용자 요청).
   그래서 계정에 캐릭터가 없을 수 있다 (user.char === null). */
const charOf = a => (a && a.user && a.user.char ? cleanChar(a.user.char) : null);
const nameOf = a => (charOf(a) ? charOf(a).nick : a.user.id);
let draft = charOf(account) || randomChar();   // 꾸미는 중인 캐릭터
let makerFrom = 'menu';  // 꾸미기를 마치면 어디로 — 'world' 면 저장하고 무지개 정원으로, 'menu' 면 메뉴로

function paintIntro(){
  zoomTo = 0;
  $('#startBtn').textContent = account ? '들어가기' : '시작하기';
  $('#who').textContent = account ? `${nameOf(account)} 님으로 들어가요 · @${account.user.id}` : '';
}
$('#startBtn').onclick = () => (account ? openMenu() : show('auth'));

/* ─────────── 가입 · 로그인 ─────────── */
let mode = 'signup';
function paintMode(){
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.mode === mode);
  $('#pw2Box').hidden = mode !== 'signup';
  $('#pwIn').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#authBtn').textContent = mode === 'signup' ? '계정 만들기' : '로그인';
  $('#forgotBtn').hidden = mode !== 'login';
  $('#authMsg').textContent = '';
  $('#idMatch').textContent = '';
  if (mode === 'signup' && $('#idIn').value) $('#idIn').dispatchEvent(new Event('input'));   // 가입으로 오면 다시 확인
  paintMatch();
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]');
  if (b){ mode = b.dataset.mode; paintMode(); }
});
paintMode();

/* 비밀번호 확인 — 두 칸이 같은지 칠 때마다 바로 알려 주고, '보기' 로 눈으로도 확인한다 */
function paintMatch(){
  const a = $('#pwIn').value, b = $('#pw2In').value, m = $('#pwMatch');
  if (!b){ m.textContent = ''; m.className = 'match'; return; }
  const ok = a === b;
  m.textContent = ok ? '✓ 비밀번호가 일치해요' : '두 비밀번호가 서로 달라요';
  m.className = 'match ' + (ok ? 'ok' : 'no');
}
for (const id of ['#idIn', '#pwIn', '#pw2In']) $(id).addEventListener('input', () => { paintMatch(); $('#authMsg').textContent = ''; });
$('#pwShow').onclick = () => {
  const show = $('#pwIn').type === 'password';
  for (const id of ['#pwIn', '#pw2In']) $(id).type = show ? 'text' : 'password';
  $('#pwShow').textContent = show ? '숨기기' : '보기';
  $('#pwShow').setAttribute('aria-pressed', String(show));
};

/* 아이디는 대문자 (사용자 요청) — 치는 대로 대문자로 바꿔 보여 주고, 그대로 보내고 쓴다 */
const ID_RE = /^[A-Z0-9_]{3,16}$/;
const ID_WHY = '아이디는 영문 대문자 · 숫자 · _ 로 3~16자예요';
function upperIn(el){
  el.addEventListener('input', () => {
    const v = el.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 16);
    if (v !== el.value) el.value = v;
  });
}
/* 중복 확인 — 칠 때마다 잠깐 기다렸다 서버에 묻는다. 가입 · 아이디 바꾸기에서 쓴다.
   마지막에 물은 것의 답만 받는다 (빨리 치면 앞의 답이 늦게 올 수 있다). */
function liveCheck(input, out, enabled, mine = () => ''){
  let timer = 0, seq = 0;
  const say = (t, cls) => { out.textContent = t; out.className = 'match ' + (cls || ''); };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const id = input.value, n = ++seq;
    if (!enabled() || !id){ say(''); return; }
    if (!ID_RE.test(id)){ say(ID_WHY, 'no'); return; }
    if (id === mine()){ say('지금 쓰는 아이디예요', 'no'); return; }
    say('확인하는 중…');
    timer = setTimeout(async () => {
      try {
        const r = await checkId(id);
        if (n === seq) r.ok ? say('✓ 쓸 수 있는 아이디예요', 'ok') : say(r.why || '쓸 수 없는 아이디예요', 'no');
      } catch (e){ if (n === seq) say(e.message, 'no'); }
    }, 350);
  });
  return () => say('');
}
upperIn($('#idIn'));
liveCheck($('#idIn'), $('#idMatch'), () => mode === 'signup');

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const id = $('#idIn').value.trim().toUpperCase(), pw = $('#pwIn').value;
  const msg = $('#authMsg'), btn = $('#authBtn');
  msg.className = 'msg';
  if (!ID_RE.test(id)) return void (msg.textContent = ID_WHY);
  if (pw.length < 6) return void (msg.textContent = '비밀번호는 6자 이상이에요');
  btn.disabled = true;
  try {
    if (mode === 'login'){
      account = await login(id, pw);
      draft = charOf(account) || randomChar();
      $('#pwIn').value = '';
      openMenu();
    } else {
      if (!$('#pw2In').value) throw new Error('비밀번호 확인 칸에 한 번 더 적어 주세요');
      if (pw !== $('#pw2In').value) throw new Error('비밀번호 두 칸이 서로 달라요');
      const got = await signup(id, pw);       // 아이디 · 비밀번호만 — 캐릭터는 정원 앞에서
      account = got.account;
      $('#pwIn').value = ''; $('#pw2In').value = ''; paintMatch();
      draft = randomChar();
      showCode(got.recovery, 'signup');
    }
  } catch (err){
    msg.textContent = err.message;
  } finally { btn.disabled = false; }
};

/* ─────────── 캐릭터 꾸미기 ───────────
   남자 · 여자를 고르면 얼굴 · 헤어 · 상의 · 하의가 그에 맞는 8가지로 바뀐다.
   번호는 그대로 두므로, 성별을 바꿔도 "세 번째 헤어" 는 세 번째 헤어다. */
let part = 'face';
const TABS = [...PARTS.map(([k, t]) => [k, t]), ['skin', '피부']];

$('#genderSeg').innerHTML = GENDERS.map(([k, t]) => `<button type="button" data-g="${k}">${t}</button>`).join('');
$('#partSeg').innerHTML = TABS.map(([k, t]) => `<button type="button" data-part="${k}">${t}</button>`).join('');
$('#genderSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-g]');
  if (b){ draft.gender = b.dataset.g; paintMaker(); }
});
$('#partSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-part]');
  if (b){ part = b.dataset.part; paintMaker(); }
});
$('#opts').addEventListener('click', e => {
  const b = e.target.closest('[data-i]');
  if (b){ draft[part] = +b.dataset.i; paintMaker(); }
});
$('#nickIn').addEventListener('input', () => { draft.nick = $('#nickIn').value; $('#makerMsg').textContent = ''; });

function paintMaker(){
  draft = { ...cleanChar(draft), nick: draft.nick || '' };
  for (const b of $('#genderSeg').children) b.classList.toggle('on', b.dataset.g === draft.gender);
  for (const b of $('#partSeg').children) b.classList.toggle('on', b.dataset.part === part);
  let html;
  if (part === 'skin'){
    html = SKIN.map((c, i) => `<button type="button" class="skin ${draft.skin === i ? 'on' : ''}" data-i="${i}" aria-label="피부 ${i + 1}"><i style="background:${hex(c)}"></i></button>`).join('');
  } else {
    const list = PARTS.find(p => p[0] === part)[2][draft.gender];
    html = list.map((o, i) => {
      const dot = o.color != null && part !== 'face' && part !== 'expr' ? `<i style="background:${hex(o.color)}"></i>` : '';
      return `<button type="button" class="${draft[part] === i ? 'on' : ''}" data-i="${i}">${dot}<span>${o.name}</span></button>`;
    }).join('');
  }
  $('#opts').innerHTML = html;
  zoomTo = part === 'face' || part === 'expr' || part === 'hair' ? 1 : 0;
  wear(draft);
}

function openMaker(){
  $('#nickIn').value = draft.nick || '';
  $('#makerMsg').textContent = '';
  $('#makerBtn').textContent = makerFrom === 'world' ? '완료 · 무지개 정원으로' : '저장';
  paintMaker();
  show('maker');
}
$('#makerBack').onclick = () => (makerFrom === 'world' ? openCat('world') : openMenu());

$('#makerBtn').onclick = async () => {
  const msg = $('#makerMsg'), btn = $('#makerBtn');
  draft.nick = $('#nickIn').value.trim().slice(0, 12);
  if (!draft.nick){ msg.textContent = '캐릭터 이름을 적어 주세요'; $('#nickIn').focus(); return; }
  btn.disabled = true;
  try {
    account = await saveChar(cleanChar(draft));
    if (makerFrom === 'world'){ location.href = 'game/world/'; return; }
    openMenu();
  } catch (err){
    msg.textContent = err.message;
  } finally { btn.disabled = false; }
};

/* ─────────── 메뉴 ─────────── */
function openMenu(){
  zoomTo = 0;
  const c = charOf(account);
  $('#helloName').textContent = `안녕하세요, ${nameOf(account)} 님`;
  $('#helloId').textContent = c ? `@${account.user.id} · 어디로 갈까요?` : `@${account.user.id} · 캐릭터는 무지개 정원에 들어갈 때 만들어요`;
  $('#editBtn').hidden = !c;               // 만들기 전에는 고칠 것이 없다
  $('#myBtn').hidden = !isAdmin();         // 마이페이지는 마스터 계정만 (사용자 요청)
  if (c) wear(c);
  show('menu');
}
$('#editBtn').onclick = () => { draft = charOf(account) || randomChar(); makerFrom = 'menu'; openMaker(); };

/* 무지개 정원 — 캐릭터가 없으면 들어가기 직전에 만든다 */
function toWorld(e){
  if (charOf(account)) return;            // 있으면 링크 그대로 들어간다
  e && e.preventDefault();
  draft = randomChar(); makerFrom = 'world'; openMaker();
}

/* ─────────── 갈래 목록 ───────────
   메뉴는 두 갈래 — Metaversal Studio › META WORLD › 무지개 정원,
   Metaversal Studio › META PROJECT › Memory Poker · Tower 13 (사용자 요청).
   게임의 '뒤로' 는 자기 갈래(#world · #project)로 돌아온다. 게임을 더할 때는 여기에 한 줄. */
const CATS = {
  world: { label: 'META WORLD', name: '메타 월드', sub: '걸어 다니며 함께 지내는 3D 세계', items: [
    { href: 'game/world/', ic: '🌈', icStyle: 'background:linear-gradient(135deg,#FFABB4,#FFED98,#94E2F1,#E7B5F2)', name: '무지개 정원', desc: '반려동물과 천천히 거니는 정원' }
  ] },
  project: { label: 'META PROJECT', name: '메타 프로젝트', sub: '친구와 · META BOT 과 겨루는 게임', items: [
    { href: 'game/poker/', ic: '♠', icStyle: 'background:#DCA94E;color:#1a1206', name: 'Memory Poker', desc: '16장을 외우고 두 칸을 골라 겨뤄요' },
    { href: 'game/tower/', ic: '13', icStyle: 'background:linear-gradient(180deg,#F0767A 0 33%,#6CCB8A 33% 66%,#6FA8F5 66%);color:#141414;font-weight:800;font-size:17px', name: 'Tower 13', desc: '박스를 쌓다가 13을 넘기면 와르르' }
  ] }
};
const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function openCat(key){
  const c = CATS[key];
  if (!c || !account) return;
  const ch = charOf(account);
  if (ch) wear(ch);
  $('#catCrumb').innerHTML = `Metaversal Studio › <b>${c.label}</b>`;
  $('#catTitle').textContent = c.name;
  $('#catSub').textContent = c.sub;
  $('#catList').innerHTML = c.items.map(it => `<a href="${it.href}">
    <span class="ic" style="${it.icStyle}">${it.ic}</span>
    <span class="t"><b>${c.label}</b><span>${escH(it.name)}</span><small>${escH(it.desc)}</small></span>
    <span class="go">›</span></a>`).join('');
  history.replaceState(null, '', location.pathname + '#' + key);   // 새로 고쳐도 이 목록에 머문다
  show('cat');
}
document.querySelector('#menu .menu').addEventListener('click', e => {
  const a = e.target.closest('[data-cat]');
  if (a){ e.preventDefault(); openCat(a.dataset.cat); }
});
$('#catList').addEventListener('click', e => {
  const a = e.target.closest('a[href="game/world/"]');
  if (a) toWorld(e);
});
$('#catBack').onclick = () => { history.replaceState(null, '', location.pathname); openMenu(); };
$('#logoutBtn').onclick = () => {
  logout(); account = null; draft = randomChar();
  $('#idIn').value = ''; mode = 'login'; paintMode();
  paintIntro(); show('intro');
};

/* ─────────── 복구 코드 ───────────
   가입할 때, 비밀번호를 되찾았을 때, 새로 만들었을 때 — 한 번만 보여 준다.
   '적어 두었어요' 를 체크해야 넘어간다. 다시는 볼 수 없기 때문이다. */
function showCode(code, why){
  $('#codeTitle').textContent = why === 'signup' ? '계정이 만들어졌어요 · 복구 코드' : '새 복구 코드';
  $('#codeLead').innerHTML = (why === 'signup'
    ? '비밀번호를 잊었을 때 이 코드로 되찾아요.<br>'
    : '예전 복구 코드는 이제 쓸 수 없어요.<br>')
    + '<b>지금 한 번만 보여 드려요.</b> 꼭 적어 두거나 복사해 두세요.';
  $('#codeText').textContent = code;
  $('#codeCopy').textContent = '복사하기';
  $('#codeSaved').checked = false;
  $('#codeNext').disabled = true;
  show('codeScreen');
}
async function copyCode(){
  const code = $('#codeText').textContent;
  try { await navigator.clipboard.writeText(code); $('#codeCopy').textContent = '복사했어요 ✓'; }
  catch (_){ getSelection().selectAllChildren($('#codeText')); $('#codeCopy').textContent = '꾹 눌러 복사하세요'; }
}
$('#codeText').onclick = copyCode;
$('#codeCopy').onclick = copyCode;
$('#codeSaved').onchange = () => { $('#codeNext').disabled = !$('#codeSaved').checked; };
$('#codeNext').onclick = () => { $('#codeText').textContent = ''; openMenu(); };

$('#forgotBtn').onclick = () => {
  $('#recId').value = $('#idIn').value;
  for (const id of ['#recCode', '#recPw', '#recPw2']) $(id).value = '';
  $('#recMsg').textContent = ''; $('#recMatch').textContent = '';
  show('recover');
};
upperIn($('#recId'));
for (const id of ['#recPw', '#recPw2']) $(id).addEventListener('input', () => {
  const a = $('#recPw').value, b = $('#recPw2').value, m = $('#recMatch');
  m.textContent = !b ? '' : a === b ? '✓ 비밀번호가 일치해요' : '두 비밀번호가 서로 달라요';
  m.className = 'match ' + (!b ? '' : a === b ? 'ok' : 'no');
  $('#recMsg').textContent = '';
});
$('#recForm').onsubmit = async e => {
  e.preventDefault();
  const id = $('#recId').value.trim(), code = $('#recCode').value, pw = $('#recPw').value, msg = $('#recMsg'), btn = $('#recBtn');
  if (!ID_RE.test(id)) return void (msg.textContent = '아이디를 확인해 주세요');
  if (code.replace(/[^0-9a-z]/gi, '').length !== 16) return void (msg.textContent = '복구 코드는 16자리예요');
  if (pw.length < 6) return void (msg.textContent = '새 비밀번호는 6자 이상이에요');
  if (pw !== $('#recPw2').value) return void (msg.textContent = '새 비밀번호 두 칸이 서로 달라요');
  btn.disabled = true;
  try {
    const got = await recover(id, code, pw);
    account = got.account;
    draft = charOf(account) || randomChar();
    showCode(got.recovery, 'recover');
  } catch (err){ msg.textContent = err.message; }
  finally { btn.disabled = false; }
};

$('#recNewBtn').onclick = async () => {
  if (!confirm('복구 코드를 새로 만들까요?\n예전 복구 코드는 더 이상 쓸 수 없어요.')) return;
  try { showCode(await newRecovery(), 'new'); }
  catch (err){ alert(err.message); }
};

/* ─────────── 아이디 바꾸기 ───────────
   메뉴에서 연다. 새 아이디는 치는 동안 중복을 확인하고, 지금 비밀번호를 한 번 더 받는다. */
const idSheet = $('#idSheet');
upperIn($('#newId'));
liveCheck($('#newId'), $('#newIdMatch'), () => true, () => account && account.user.id);
function openIdSheet(){
  $('#curId').textContent = account.user.id;
  $('#newId').value = ''; $('#idPw').value = ''; $('#newIdMatch').textContent = ''; $('#idMsg').textContent = '';
  idSheet.hidden = false; $('#newId').focus();
}
const closeIdSheet = () => { idSheet.hidden = true; $('#idBtn').focus(); };
$('#idBtn').onclick = openIdSheet;
idSheet.addEventListener('click', e => { if (e.target === idSheet || e.target.closest('[data-close]')) closeIdSheet(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !idSheet.hidden) closeIdSheet(); });
$('#idForm').onsubmit = async e => {
  e.preventDefault();
  const id = $('#newId').value.trim().toUpperCase(), pw = $('#idPw').value, msg = $('#idMsg'), btn = $('#idSave');
  msg.className = 'msg';
  if (!ID_RE.test(id)) return void (msg.textContent = ID_WHY);
  if (!pw) return void (msg.textContent = '지금 비밀번호를 적어 주세요');
  btn.disabled = true;
  try {
    account = await renameId(id, pw);
    idSheet.hidden = true;
    openMenu();
    $('#helloId').textContent = `@${account.user.id} · 아이디를 바꿨어요`;
  } catch (err){ msg.textContent = err.message; }
  finally { btn.disabled = false; }
};

/* ─────────── 시작 ─────────── */
paintIntro();
// 정원에서 "캐릭터부터" 하고 돌려보냈으면 (#make) 곧장 꾸미기로
if (account && location.hash === '#make'){
  history.replaceState(null, '', location.pathname);
  charOf(account) ? openMenu() : toWorld();
} else if (account && CATS[location.hash.slice(1)]){
  // 게임에서 '뒤로' 를 누르면 자기 갈래 목록으로 (#world · #project)
  openMenu(); openCat(location.hash.slice(1));
} else show('intro');
// 다른 기기에서 캐릭터를 바꿨을 수 있으니 서버에서 다시 받아 둔다
refresh().then(a => { account = a; if (!$('#intro').hidden) paintIntro(); });

/* ─────────── 마이페이지 (마스터 계정만 — 사용자 요청) ───────────
   목록 → [접속자] → 접속 · 게임 중 · 대기 중 몇 명 → 누르면 그 사람들의 아이디와 수정일시.
   수정일시 = 그 사람의 상태(게임 중 · 대기 중 · 있는 곳)가 마지막으로 바뀐 때, 한국 시간.
   서버도 마스터가 아니면 목록을 주지 않는다 (api.js 의 ADMINS). */
function isAdmin(){ return !!(account && ['MASTER'].includes(account.user.id)); }   // 함수로 — 위에서 먼저 불린다
const mySheet = $('#mySheet');
const PAGE = 6;
let myView = 'menu', myFilter = 'all', myPage = 0, online = null, onlineErr = '', myTimer = 0;
const KST = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function when(t){
  const p = Object.fromEntries(KST.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { all: '접속자', game: '게임 중', wait: '대기 중' };
/* 몇 분 전 — 서버 시각에 견준다 (폰 시계가 틀려도 같게) */
function ago(t, now){
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

async function loadOnline(){
  try {
    const r = await fetch('/api/online', { headers: { 'X-Session': account.token } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '불러오지 못했어요');
    online = d; onlineErr = '';
  } catch (e){ onlineErr = e.message || '서버에 닿지 못했어요'; }
  drawMy();
}
function openMy(){
  if (!isAdmin()) return;
  myView = 'menu'; mySheet.hidden = false; drawMy();
}
function closeMy(){ mySheet.hidden = true; clearInterval(myTimer); myTimer = 0; $('#myBtn').focus(); }
function goMy(view, filter){
  myView = view; if (filter) myFilter = filter; myPage = 0;
  if (view !== 'menu' && !myTimer){ loadOnline(); myTimer = setInterval(loadOnline, 10000); }
  if (view === 'menu'){ clearInterval(myTimer); myTimer = 0; }
  drawMy();
}
function drawMy(){
  const T = $('#mySheetT'), Sub = $('#mySub'), B = $('#myBody'), F = $('#myBtns');
  $('#myBack').hidden = myView === 'menu';
  const list = online ? online.list : [];
  const count = k => (k === 'all' ? list.length : list.filter(r => r.state === k).length);
  if (myView === 'menu'){
    T.textContent = '마이페이지';
    Sub.textContent = `@${account.user.id} · 관리 메뉴`;
    B.innerHTML = '<div class="mylist"><button type="button" data-my="online"><span>접속자</span><small>지금 누가 있는지</small> ›</button></div>';
    F.innerHTML = '<button class="btn" type="button" data-close>닫기</button>';
    return;
  }
  const stamp = online ? `${when(online.now)} 기준 · 10초마다 새로` : '불러오는 중…';
  if (myView === 'online'){
    T.textContent = '접속자';
    Sub.textContent = onlineErr || stamp + ' · 로그인한 사람만 세요';
    B.innerHTML = '<div class="tiles">' + ['all', 'game', 'wait'].map(k =>
      `<button type="button" class="${k}" data-my="list" data-f="${k}"><b>${online ? count(k) : '–'}</b><span>${k === 'all' ? '접속자' : KIND[k]}</span></button>`).join('') + '</div>';
    F.innerHTML = '<button class="btn" type="button" data-my="reload">새로고침</button><button class="btn" type="button" data-close>닫기</button>';
    return;
  }
  // 그 사람들 — 아이디 · 몇 분 전 / 상태 · 있는 곳 · 수정일시
  // 순서대로 아래에서부터 쌓는다 (사용자 요청) — 먼저 바뀐 사람이 맨 아래, 최근일수록 위
  const rows = (myFilter === 'all' ? list : list.filter(r => r.state === myFilter)).slice().sort((a, b) => a.since - b.since);
  T.textContent = `${KIND[myFilter]} ${online ? rows.length : '–'}명`;
  Sub.textContent = onlineErr || stamp;
  F.innerHTML = '<button class="btn" type="button" data-my="reload">새로고침</button><button class="btn" type="button" data-close>닫기</button>';
  // 한 장에 몇 줄 — 창 안에 다 들어갈 만큼만 (넘겨 보지 않는다). 큰 데서 줄여 간다
  const wide = matchMedia('(orientation:landscape) and (max-height:520px)').matches;
  for (let per = wide ? 8 : 8; per >= (wide ? 2 : 2); per -= wide ? 2 : 1){
    const pages = Math.max(1, Math.ceil(rows.length / per));
    const pg = Math.min(myPage, pages - 1);
    const slots = wide ? Math.ceil(per / 2) : per;
    B.innerHTML = `<ul class="onl" style="min-height:${slots * ROW - 5}px">` + (rows.length ? rows.slice(pg * per, pg * per + per).reverse().map(r =>
      `<li><span class="id">${esc(r.id)}</span><b class="ago">${ago(r.since, online.now)}</b>
         <span class="pl"><i class="st ${r.state}">${KIND[r.state]}</i> · ${esc(r.place || '')}</span><span class="tm">수정 ${when(r.since)}</span></li>`).join('')
      : `<li class="none">${online ? '아무도 없어요' : '불러오는 중…'}</li>`) + '</ul>'
      + (pages > 1 ? `<div class="pager"><button class="btn" type="button" data-my="prev" ${pg ? '' : 'disabled'}>‹</button>${pg + 1} / ${pages}<button class="btn" type="button" data-my="next" ${pg < pages - 1 ? '' : 'disabled'}>›</button></div>` : '');
    myShown = pg;
    if (B.scrollHeight <= B.clientHeight + 1) break;
  }
  myPage = myShown;
}
let myShown = 0;
const ROW = 50;   // 한 줄 45px + 사이 5px (index.html 의 .onl li)
$('#myBtn').onclick = openMy;
$('#myBack').onclick = () => goMy(myView === 'list' ? 'online' : 'menu');
mySheet.addEventListener('click', e => {
  if (e.target === mySheet || e.target.closest('[data-close]')) return closeMy();
  const b = e.target.closest('[data-my]');
  if (!b) return;
  const a = b.dataset.my;
  if (a === 'online') goMy('online');
  else if (a === 'list') goMy('list', b.dataset.f);
  else if (a === 'reload') loadOnline();
  else if (a === 'prev'){ myPage--; drawMy(); }
  else if (a === 'next'){ myPage++; drawMy(); }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !mySheet.hidden) closeMy(); });
addEventListener('resize', () => { if (!mySheet.hidden) drawMy(); });   // 몇 줄 들어가는지 다시 잰다

/* 접속 알림 — Studio 에 있는 동안은 대기 중 */
trackPresence(() => ({ state: 'wait', place: 'Studio' }));
