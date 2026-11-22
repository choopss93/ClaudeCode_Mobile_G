import * as THREE from 'three';
import { createActor, HEAD_TOP } from '../game/world/js/actor.js?v=s5';
import { GENDERS, SKIN, PARTS, hex, cleanChar, randomChar } from './character.js?v=c3';
import { readAccount, refresh, signup, login, logout, saveChar, recover, newRecovery } from './account.js?v=s7';
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
const screens = ['intro', 'auth', 'recover', 'codeScreen', 'maker', 'menu'];

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
  showLogo = name === 'intro' || (name === 'menu' && !charOf(account));
  const slot = $('#' + name + ' [data-stage]');
  if (slot){ slot.appendChild(canvas); requestAnimationFrame(fit); }
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

const ID_RE = /^[a-z0-9_]{3,16}$/;
$('#idIn').addEventListener('input', () => {
  const v = $('#idIn').value.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (v !== $('#idIn').value) $('#idIn').value = v;
});

$('#authForm').onsubmit = async e => {
  e.preventDefault();
  const id = $('#idIn').value.trim().toLowerCase(), pw = $('#pwIn').value;
  const msg = $('#authMsg'), btn = $('#authBtn');
  msg.className = 'msg';
  if (!ID_RE.test(id)) return void (msg.textContent = '아이디는 영문 소문자 · 숫자 · _ 로 3~16자예요');
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
$('#makerBack').onclick = () => openMenu();

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
document.querySelector('.menu a[href="game/world/"]').addEventListener('click', toWorld);
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
$('#recId').addEventListener('input', () => { const v = $('#recId').value.toLowerCase().replace(/[^a-z0-9_]/g, ''); if (v !== $('#recId').value) $('#recId').value = v; });
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

/* ─────────── 시작 ─────────── */
paintIntro();
// 정원에서 "캐릭터부터" 하고 돌려보냈으면 (#make) 곧장 꾸미기로
if (account && location.hash === '#make'){
  history.replaceState(null, '', location.pathname);
  charOf(account) ? openMenu() : toWorld();
} else show('intro');
// 다른 기기에서 캐릭터를 바꿨을 수 있으니 서버에서 다시 받아 둔다
refresh().then(a => { account = a; if (!$('#intro').hidden) paintIntro(); });
