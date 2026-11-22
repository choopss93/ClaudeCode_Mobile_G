import * as THREE from 'three';
import { createActor, HEAD_TOP } from '../game/world/js/actor.js?v=s1';
import { HAIR, CLOTH, SKIN, LOOKS, hex, cleanChar, colorsOf, randomChar } from './character.js?v=s1';
import { readAccount, refresh, checkId, signup, login, logout, saveChar } from './account.js?v=s1';

/*
 * Metaversal Studio — 시작 → 가입·로그인 → 캐릭터 꾸미기 → 메뉴.
 *
 * 가운데의 3D 캐릭터는 무지개 정원의 캐릭터 코드(actor.js)를 그대로 쓴다.
 * 그래서 여기서 꾸민 모습이 게임 속 모습과 똑같다. 캔버스는 하나만 두고
 * 화면이 바뀔 때마다 그 화면의 자리(.stage)로 옮겨 단다 — WebGL 화면을
 * 여럿 열면 폰이 버겁다.
 */

const $ = s => document.querySelector(s);
const screens = ['intro', 'auth', 'maker', 'menu'];

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
camera.position.set(0, LOOK_Y + 0.15, 2.4);
camera.lookAt(0, LOOK_Y, 0);

let actor = null, spin = 0.5, drag = null;
function wear(char){
  if (actor) scene.remove(actor.group);
  actor = createActor(colorsOf(char));
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
  camera.position.z = Math.max(1.6, need * Math.max(1, 0.9 / camera.aspect)) * 1.05;
  camera.updateProjectionMatrix();
}
new ResizeObserver(fit).observe(canvas);

canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, s: spin }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (drag) spin = drag.s + (e.clientX - drag.x) * 0.012; });
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });

let last = performance.now();
function frame(t){
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (!actor || !canvas.isConnected) return;
  if (!drag) spin += dt * 0.35;          // 가만두면 천천히 돈다
  actor.group.rotation.y = spin;
  actor.update(dt, 0);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ─────────── 화면 바꾸기 ─────────── */
function show(name){
  for (const s of screens) $('#' + s).hidden = s !== name;
  const slot = $('#' + name + ' [data-stage]');
  if (slot){ slot.appendChild(canvas); requestAnimationFrame(fit); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (b) show(b.dataset.go);
});

/* ─────────── 상태 ─────────── */
let account = readAccount();
let draft = account ? cleanChar(account.user.char) : randomChar();   // 꾸미는 중인 캐릭터
let pending = null;      // 가입 중인 {id, pw} — 캐릭터를 다 꾸민 뒤에 만든다
let makerFrom = 'auth';  // 꾸미기를 마치면 어디로 — 새 계정이면 가입, 아니면 저장

function paintIntro(){
  $('#startBtn').textContent = account ? '들어가기' : '시작하기';
  $('#who').textContent = account ? `${account.user.char.nick} 님으로 들어가요 · @${account.user.id}` : '';
  wear(account ? account.user.char : draft);
}
$('#startBtn').onclick = () => (account ? openMenu() : show('auth'));

/* ─────────── 가입 · 로그인 ─────────── */
let mode = 'signup';
function paintMode(){
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.mode === mode);
  $('#pw2Box').hidden = mode !== 'signup';
  $('#pwIn').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  $('#authBtn').textContent = mode === 'signup' ? '다음 · 캐릭터 만들기' : '로그인';
  $('#authMsg').textContent = '';
}
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-mode]');
  if (b){ mode = b.dataset.mode; paintMode(); }
});
paintMode();

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
      draft = cleanChar(account.user.char);
      $('#pwIn').value = '';
      openMenu();
    } else {
      if (pw !== $('#pw2In').value) throw new Error('비밀번호 두 칸이 서로 달라요');
      const c = await checkId(id);
      if (!c.ok) throw new Error(c.why || '쓸 수 없는 아이디예요');
      pending = { id, pw };
      makerFrom = 'auth';
      openMaker();
    }
  } catch (err){
    msg.textContent = err.message;
  } finally { btn.disabled = false; }
};

/* ─────────── 캐릭터 꾸미기 ─────────── */
let part = 'hair';
const PALETTE = { hair: HAIR, cloth: CLOTH, skin: SKIN };

$('#lookSeg').innerHTML = LOOKS.map(([k, t]) => `<button type="button" data-look="${k}">${t}</button>`).join('');
$('#lookSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-look]');
  if (b){ draft.look = b.dataset.look; paintMaker(); }
});
$('#partSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-part]');
  if (b){ part = b.dataset.part; paintMaker(); }
});
$('#swatches').addEventListener('click', e => {
  const b = e.target.closest('[data-i]');
  if (b){ draft[part] = +b.dataset.i; paintMaker(); }
});
$('#nickIn').addEventListener('input', () => { draft.nick = $('#nickIn').value; $('#makerMsg').textContent = ''; });

function paintMaker(){
  for (const b of $('#lookSeg').children) b.classList.toggle('on', b.dataset.look === draft.look);
  for (const b of $('#partSeg').children) b.classList.toggle('on', b.dataset.part === part);
  $('#swatches').innerHTML = PALETTE[part].map((c, i) =>
    `<button type="button" data-i="${i}" class="${draft[part] === i ? 'on' : ''}" style="background:${hex(c)}" aria-label="${part} ${i + 1}"></button>`).join('');
  wear(draft);
}

function openMaker(){
  $('#nickIn').value = draft.nick || '';
  $('#makerMsg').textContent = '';
  $('#makerBtn').textContent = makerFrom === 'auth' ? '완료 · 계정 만들기' : '저장';
  paintMaker();
  show('maker');
}
$('#makerBack').onclick = () => show(makerFrom === 'auth' ? 'auth' : 'menu');

$('#makerBtn').onclick = async () => {
  const msg = $('#makerMsg'), btn = $('#makerBtn');
  draft.nick = $('#nickIn').value.trim().slice(0, 12);
  if (!draft.nick){ msg.textContent = '캐릭터 이름을 적어 주세요'; $('#nickIn').focus(); return; }
  btn.disabled = true;
  try {
    if (makerFrom === 'auth'){
      account = await signup(pending.id, pending.pw, cleanChar(draft));
      pending = null;
      $('#pwIn').value = ''; $('#pw2In').value = '';
    } else {
      account = await saveChar(cleanChar(draft));
    }
    openMenu();
  } catch (err){
    msg.textContent = err.message;
    if (err.status === 409){ setTimeout(() => show('auth'), 1200); }   // 그 사이 누가 아이디를 가져갔다
  } finally { btn.disabled = false; }
};

/* ─────────── 메뉴 ─────────── */
function openMenu(){
  const c = account.user.char;
  $('#helloName').textContent = `안녕하세요, ${c.nick} 님`;
  $('#helloId').textContent = `@${account.user.id} · 어디로 갈까요?`;
  wear(c);
  show('menu');
}
$('#editBtn').onclick = () => { draft = cleanChar(account.user.char); makerFrom = 'menu'; openMaker(); };
$('#logoutBtn').onclick = () => {
  logout(); account = null; draft = randomChar();
  $('#idIn').value = ''; mode = 'login'; paintMode();
  paintIntro(); show('intro');
};

/* ─────────── 시작 ─────────── */
paintIntro();
show('intro');
// 다른 기기에서 캐릭터를 바꿨을 수 있으니 서버에서 다시 받아 둔다
refresh().then(a => { account = a; if (!$('#intro').hidden) paintIntro(); });
