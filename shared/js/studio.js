import * as THREE from 'three';
import { createActor, HEAD_TOP } from '../game/world/js/actor.js?v=s20';
import { GENDERS, HAIRS, TOPS, BOTTOMS, SHOES, HATS, FACES, NECKS, BACKS, FINISHES, OPTIONS, BODY, SLIDER, hex, cleanChar, blankChar, fitGender } from './character.js?v=c9';
import { readAccount, refresh, signup, login, logout, logoutAll, deleteAccount, saveChar, recover, newRecovery, checkId, renameId } from './account.js?v=s9';
import { trackPresence } from './presence.js?v=p2';
import { serverNow } from './clock.js?v=k1';
import { createLogo } from './logo.js?v=l2';
import { readPhoto, applyPhoto } from './photo.js?v=f1';

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
/* 캐릭터마다 키가 다르다 (스타일 · 다리길이) — 입힐 때마다 다시 잰다 */
let H = HEAD_TOP, LOOK_Y = H * 0.55, HEAD_C = H - 0.36, NEAR_Z = 1.6;
let zoom = 0, zoomTo = 0;                 // 0 온몸 · 1 머리
let far = 1, farTo = 1;                   // META WORLD 목록에서는 두 배 멀리 — 캐릭터를 반 크기로 (사용자 요청)
let farZ = 2.4;
camera.position.set(0, LOOK_Y + 0.15, farZ);
camera.lookAt(0, LOOK_Y, 0);

/* 첫 화면에는 캐릭터 대신 3D 로고를 띄운다 (사용자 요청). 같은 캔버스에 장면만 바꿔 그린다. */
const logo = createLogo();
let showLogo = true;

let actor = null, spin = 0.5, pitch = 0.3, drag = null;   // pitch — 로고만 위아래로도 돈다
function wear(char){
  if (actor) scene.remove(actor.group);
  actor = createActor({ style: cleanChar(char), poses: false });   // 꾸미는 동안은 쉬는 자세 없이
  actor.setHand(false);
  if (actor.headTop !== H){
    H = actor.headTop; LOOK_Y = H * 0.55;
    HEAD_C = actor.headY != null ? actor.headY - 0.04 : H - 0.36;      // 얼굴을 고를 때 다가갈 자리
    NEAR_Z = actor.nearZ ?? Math.max(0.75, (H - HEAD_C) * 5.2);         // 작은 머리일수록 더 다가간다 (캐릭터가 거리를 알려 주면 그대로)
    fit();
  }
  actor.group.rotation.y = spin;
  scene.add(actor.group);
}

function fit(){
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 낮고 넓은 자리에서도 머리부터 발끝까지 들어가게 거리를 맞춘다
  const need = (H + 0.25) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  farZ = Math.max(1.6, need * Math.max(1, 0.9 / camera.aspect)) * 1.05;
  camera.updateProjectionMatrix();
  logo.fit(w / h);
}
new ResizeObserver(fit).observe(canvas);

/* 손으로 돌리면 그 각도 그대로 둔다 (사용자 요청) — 저절로 돌거나 앞으로 되돌아가지 않는다. 화면을 새로 열면 풀린다 */
let held = false;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, s: spin, p: pitch }; if (!showLogo) held = true; canvas.setPointerCapture(e.pointerId); });
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
  if (!actor){ renderer.clear(); return; }    // 캐릭터가 없을 때 비워 둔다 — 안 비우면 첫 화면의 로고가 그대로 남아 보였다
  if (!drag && !held){
    if (zoomTo > 0){
      // 얼굴 · 헤어를 고를 때는 앞을 보고 멈춘다 — 돌아가 있으면 뒤통수만 보인다
      const front = Math.round(spin / (Math.PI * 2)) * Math.PI * 2 + 0.25;
      spin += (front - spin) * Math.min(1, dt * 4);
    } else spin += dt * 0.35;            // 가만두면 천천히 돈다
  }
  actor.group.rotation.y = spin;
  actor.update(dt, 0);
  zoom += (zoomTo - zoom) * Math.min(1, dt * 6);
  far += (farTo - far) * Math.min(1, dt * 6);
  const y = LOOK_Y + (HEAD_C - LOOK_Y) * zoom;
  camera.position.set(0, y + 0.15 * (1 - zoom) + 0.05 * zoom, farZ * far + (Math.min(farZ * 0.8, NEAR_Z) - farZ * far) * zoom);
  camera.lookAt(0, y, 0);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* ─────────── 화면 바꾸기 ─────────── */
function show(name){
  for (const s of screens) $('#' + s).hidden = s !== name;
  // 로고는 첫 화면에만 (사용자 요청). 로그인하자마자 오는 메뉴에는 캐릭터도 두지 않는다 (사용자 요청).
  // META WORLD 목록에는 늘 내 캐릭터 — 아직 없으면 만들 캐릭터를 미리 보여 준다 (사용자 요청).
  // META PROJECT 목록에는 캐릭터를 쓰지 않으므로 자리를 비운다.
  showLogo = name === 'intro';
  farTo = name === 'cat' ? 2 : 1; if (name === 'cat') far = 2;
  const slot = $('#' + name + ' [data-stage]');
  const bare = name === 'menu' || (name === 'cat' && catKey !== 'world');
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
const nameOf = a => a.user.id;   // 화면에 쓰는 이름은 늘 로그인 아이디 (사용자 요청)
let draft = charOf(account) || blankChar();   // 꾸미는 중인 캐릭터
let makerFrom = 'menu';  // 꾸미기를 마치면 어디로 — 'world' 면 저장하고 무지개 정원으로, 'cat' 이면 META WORLD 목록으로, 'menu' 면 메뉴로

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
      draft = charOf(account) || blankChar();
      $('#pwIn').value = '';
      openMenu();
    } else {
      if (!$('#pw2In').value) throw new Error('비밀번호 확인 칸에 한 번 더 적어 주세요');
      if (pw !== $('#pw2In').value) throw new Error('비밀번호 두 칸이 서로 달라요');
      const got = await signup(id, pw);       // 아이디 · 비밀번호만 — 캐릭터는 정원 앞에서
      account = got.account;
      $('#pwIn').value = ''; $('#pw2In').value = ''; paintMatch();
      draft = blankChar();
      showCode(got.recovery, 'signup');
    }
  } catch (err){
    msg.textContent = err.message;
  } finally { btn.disabled = false; }
};

/* ─────────── 캐릭터 꾸미기 (블록 캐릭터 · v4) ───────────
   차례: 기본(성별 · 피부 · 입 · 표면) → 머리 → 상의 → 하의 → 신발 → 소품(모자 · 얼굴 · 목 · 가방).
   한 칸 안에서 **종류와 색을 함께** 고른다 (사용자 요청 — 상의 안에 상의 종류 + 색). 색은 모두 **컬러피커**.
   보이는 종류는 남녀마다 다르다 (character.js 의 OPTIONS). 처음엔 아무것도 고르지 않은 맨몸. 화면은 넘기지 않는다.
   칸: [열쇠, 이름, 종류 목록(없으면 색만), 색 열쇠] */
const STEPS = [['base', '기본'], ['body', '체형'], ['hair', '머리'], ['top', '상의'], ['bottom', '하의'], ['shoes', '신발'], ['acc', '소품']];
const SUBS = {
  base: [['gender', '성별', GENDERS], ['skin', '피부'], ['lip', '입'], ['finish', '표면', FINISHES]],
  body: [['body', '체형 — 길이 · 살찜 (옷도 같이 맞춰진다)', 'sliders']],
  hair: [['hair', '헤어', HAIRS, 'hairColor']],
  top: [['top', '상의', TOPS, 'topColor']],
  bottom: [['bottom', '하의', BOTTOMS, 'bottomColor']],
  shoes: [['shoes', '신발', SHOES, 'shoesColor']],
  acc: [['hat', '모자', HATS, 'hatColor'], ['face', '얼굴', FACES, 'faceColor'], ['neck', '목', NECKS, 'neckColor'], ['back', '가방', BACKS, 'backColor']]
};
const NEAR = new Set(['skin', 'lip', 'hair', 'hat', 'face']);       // 이 칸들은 얼굴로 다가가 본다
let step = 'base', sub = { base: 'gender', body: 'body', hair: 'hair', top: 'top', bottom: 'bottom', shoes: 'shoes', acc: 'hat' };
const subsOf = st => SUBS[st] || [];

$('#stepSeg').innerHTML = STEPS.map(([k, t], i) => `<button type="button" data-step="${k}"><small>${i + 1}</small>${t}</button>`).join('');
$('#stepSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-step]');
  if (b){ step = b.dataset.step; paintMaker(); }
});
$('#subSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-sub]');
  if (b){ sub[step] = b.dataset.sub; paintMaker(); }
});
const PER = 8;                                   // 한 장에 종류 8개 (4칸 × 2줄) — 넘치면 ‹ › 로 넘긴다 (창 안은 넘겨 보지 않는다)
const page = {};
$('#opts').addEventListener('click', e => {
  const pg = e.target.closest('[data-pg]');
  if (pg){ const k = sub[step]; page[k] = (page[k] || 0) + +pg.dataset.pg; paintMaker(); return; }
  const b = e.target.closest('[data-v]');
  if (!b) return;
  draft[b.dataset.k] = +b.dataset.v;
  if (b.dataset.k === 'gender') fitGender(draft);   // 성별을 바꾸면 그쪽에 없는 종류는 없음으로
  paintMaker();
});
/* 컬러피커 — 미는 동안은 칸을 다시 그리지 않는다 (피커가 닫힌다). 다시 입히기는 한 화면에 한 번 */
let wearSoon = 0;
$('#opts').addEventListener('input', e => {
  const r = e.target.closest('input[type=range]');
  if (r){ draft[r.dataset.k] = +r.value; if (!wearSoon) wearSoon = requestAnimationFrame(() => { wearSoon = 0; wear(draft); }); return; }
  const p = e.target.closest('input[type=color]');
  if (!p) return;
  draft[p.dataset.c] = parseInt(p.value.slice(1), 16);
  const tag = p.parentNode.querySelector('em');
  if (tag) tag.textContent = p.value.toUpperCase();
  if (!wearSoon) wearSoon = requestAnimationFrame(() => { wearSoon = 0; wear(draft); });
});
$('#nickIn').addEventListener('input', () => { draft.nick = $('#nickIn').value; $('#makerMsg').textContent = ''; });

const picker = (ck, off) => `<label class="pick${off ? ' off' : ''}"><b>색상</b>
  <input type="color" value="${hex(draft[ck])}" data-c="${ck}" aria-label="색상"${off ? ' disabled' : ''}><em>${hex(draft[ck]).toUpperCase()}</em></label>`;

function paintMaker(){
  draft = { ...cleanChar({ ...draft, v: 4 }), nick: draft.nick || '' };
  const i = STEPS.findIndex(s => s[0] === step);
  for (const b of $('#stepSeg').children) b.classList.toggle('on', b.dataset.step === step);
  const subs = subsOf(step);
  if (!subs.some(x => x[0] === sub[step])) sub[step] = subs[0][0];
  const sb = $('#subSeg');
  sb.style.setProperty('--cols', subs.length);
  sb.innerHTML = subs.map(([k, t]) => `<button type="button" data-sub="${k}" class="${sub[step] === k ? 'on' : ''}">${t}</button>`).join('');
  const o = $('#opts');
  const [k, , list, ck] = subs.find(x => x[0] === sub[step]);
  if (list === 'sliders'){                                            // 체형 — 밀대 넷
    o.className = 'opts sliders';
    o.innerHTML = BODY.map(([bk, t, lo, hi]) => `<label class="sl"><b>${t}</b><span>${lo}</span>
      <input type="range" min="0" max="${SLIDER}" step="1" value="${draft[bk]}" data-k="${bk}" aria-label="${t}"><span>${hi}</span></label>`).join('');
  } else if (!list){                                                  // 색만 — 피부 · 입
    o.className = 'opts solo';
    o.innerHTML = picker(k);
  } else {
    const all = (OPTIONS[draft.gender][k] || list.map((_, v) => v));
    const pages = Math.ceil(all.length / PER);
    if (page[k] == null) page[k] = Math.floor(Math.max(0, all.indexOf(draft[k])) / PER);   // 고른 것이 있는 장부터
    page[k] = (page[k] + pages) % pages;
    const shown = all.slice(page[k] * PER, page[k] * PER + PER);
    o.className = 'opts ' + (ck ? 'mix' : 'names');
    o.style.setProperty('--cols', ck ? Math.min(4, Math.max(2, Math.ceil(all.length / 2))) : shown.length);
    const pager = pages > 1 ? `<span class="pager"><button type="button" data-pg="-1" aria-label="앞 장">‹</button><i>${page[k] + 1}/${pages}</i><button type="button" data-pg="1" aria-label="다음 장">›</button></span>` : '';
    o.innerHTML = shown.map(v => `<button type="button" class="${draft[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}"><span>${list[v]}</span></button>`).join('')
      + (ck ? `<div class="mrow">${pager}${picker(ck, !draft[k])}</div>` : '');
  }
  $('#makerPrev').hidden = i === 0;
  $('#makerBtn').textContent = i < STEPS.length - 1 ? '다음 ›' : makerFrom === 'world' ? '완료 · 무지개 정원으로' : '저장';
  zoomTo = NEAR.has(sub[step]) ? 1 : 0;
  wear(draft);
}
$('#makerPrev').onclick = () => {
  const i = STEPS.findIndex(s => s[0] === step);
  if (i > 0){ step = STEPS[i - 1][0]; paintMaker(); }
};

function openMaker(){
  $('#nickIn').value = account ? account.user.id : '';     // 캐릭터 이름 = 로그인 아이디 (고칠 수 없다)
  $('#makerMsg').textContent = '';
  step = 'base'; held = false;
  paintMaker();
  show('maker');
}
$('#makerBack').onclick = () => (makerFrom === 'world' || makerFrom === 'cat' ? openCat('world') : openMenu());

$('#makerBtn').onclick = async () => {
  const msg = $('#makerMsg'), btn = $('#makerBtn');
  const i = STEPS.findIndex(s => s[0] === step);
  if (i < STEPS.length - 1){ step = STEPS[i + 1][0]; paintMaker(); return; }
  draft.nick = account.user.id;           // 서버도 아이디로 덮어 적는다
  btn.disabled = true;
  try {
    account = await saveChar(cleanChar(draft));
    if (makerFrom === 'world'){ location.href = 'game/world/'; return; }
    if (makerFrom === 'cat'){ openCat('world'); return; }
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
  $('#editBtn').hidden = !c;               // 만들기 전에는 고칠 것이 없다
  if (c) wear(c);
  show('menu');
}
$('#editBtn').onclick = () => { draft = charOf(account) || blankChar(); makerFrom = 'menu'; openMaker(); };

/* 무지개 정원 — 캐릭터가 없으면 들어가기 직전에 만든다 */
function toWorld(e){
  if (charOf(account)) return;            // 있으면 링크 그대로 들어간다
  e && e.preventDefault();
  draft = blankChar(); makerFrom = 'world'; openMaker();       // 새 캐릭터부터 만든다
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
    { href: 'game/tower/', ic: '13', icStyle: 'background:linear-gradient(180deg,#F0767A 0 33%,#6CCB8A 33% 66%,#6FA8F5 66%);color:#141414;font-weight:800;font-size:17px', name: 'Tower 13', desc: '박스를 쌓다가 13을 넘기면 와르르' },
    { href: 'game/sunday/', ic: '✋', icStyle: 'background:linear-gradient(135deg,#FFE9B8,#DCA94E 55%,#F0A080);color:#1a1206', name: '어메이징 선데이', desc: '초성 · 줄임말로 영화 · 웹툰 제목 맞히기' },
    { href: 'game/lucky/', ic: '🎲', icStyle: 'background:linear-gradient(135deg,#7ED67E,#5EC2F0 55%,#B48CF0);color:#141414', name: 'Lucky 주사위', desc: '주사위 넷으로 길을 올라요 · 한 번만 더?' },
    { href: 'game/spot/', ic: '🔍', icStyle: 'background:linear-gradient(135deg,#A9DCFF,#9BD27F 60%,#FFC93C);color:#141414', name: '틀린그림찾기', desc: '3분 동안 외우고 바뀐 곳 다섯 찾기' },
    { href: 'game/wall/', ic: '🧱', icStyle: 'background:linear-gradient(135deg,#E8C99A,#C99566 55%,#8A5A3C);color:#141414', name: 'Pass the Wall', desc: '벽으로 막고 피해서 먼저 건너가기 · 팀전' }
  ] }
};
const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let catKey = '';
function openCat(key){
  const c = CATS[key];
  if (!c || !account) return;
  catKey = key;
  zoomTo = 0;
  spin = 0.25; held = false;                     // 앞을 보고 시작한다 (꾸미기의 front 와 같은 값) — 돌다 뒷모습으로 잡히지 않게
  const ch = charOf(account);
  if (ch) wear(ch);
  else if (actor) actor.group.visible = false;   // 아직 없으면 캐릭터 자리에 '캐릭터를 생성해주세요.' 만 (사용자 요청)
  $('#catEmpty').hidden = !!ch || key !== 'world';
  $('#catBtns').hidden = key !== 'world';
  $('#catMake').innerHTML = ch ? '<span class="lg">캐릭터 </span>수정 ›' : '새 <span class="lg">캐릭터 </span>만들기 ›';
  $('#catCrumb').innerHTML = `Metaversal Studio › <b>${c.label}</b>`;
  $('#catTitle').textContent = c.name;
  $('#catSub').textContent = c.sub;
  $('#catList').classList.toggle('dense', c.items.length >= 4);
  $('#catList').classList.toggle('denser', c.items.length >= 6);
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
/* 미리 보여 준 그 캐릭터로 꾸미기를 시작한다 — 마치면 곧장 무지개 정원으로 */
/* 이미 있으면 '캐릭터 수정' — 저장하면 이 목록으로 돌아온다 (사용자 요청) */
$('#catMake').onclick = () => {
  const ch = charOf(account);
  if (ch){ draft = { ...ch }; makerFrom = 'cat'; } else { draft = blankChar(); makerFrom = 'world'; }   // 없으면 새 캐릭터부터
  openMaker();
};
/* 📷 사진으로 만들기 (사용자 요청) — 온몸 사진에서 머리칼 · 피부 · 상의 · 하의 · 신발 색을 뽑아 입히고 꾸미기를 연다.
   지금 캐릭터가 있으면 그 모양에 색만 바꾸고, 없으면 새 캐릭터에 기본 종류를 골라 둔다. 사진은 이 기기 밖으로 나가지 않는다 */
$('#catPhoto').onclick = () => { $('#photoIn').value = ''; $('#photoIn').click(); };
$('#photoIn').onchange = async () => {
  const f = $('#photoIn').files[0];
  if (!f) return;
  const btn = $('#catPhoto'); btn.disabled = true;
  try {
    const { colors, found } = await readPhoto(f);
    const ch = charOf(account);
    draft = applyPhoto(ch ? { ...ch } : blankChar(), colors);
    makerFrom = ch ? 'cat' : 'world';
    openMaker();
    $('#makerMsg').textContent = found ? '사진에서 색을 뽑았어요. 모양은 단계마다 골라 주세요.'
                                       : '사람을 또렷이 못 찾아 가운데 색을 썼어요. 온몸이 나온 사진이 좋아요.';
  } catch (err){
    alert(err.message);
  } finally { btn.disabled = false; }
};
$('#catList').addEventListener('click', e => {
  const a = e.target.closest('a[href="game/world/"]');
  if (a) toWorld(e);
});
$('#catBack').onclick = () => { history.replaceState(null, '', location.pathname); openMenu(); };
/* 로그아웃 · 계정 삭제 뒤 — 첫 화면으로 */
function signedOut(){
  pres.bye();                     // 접속 기록 — 바로 로그아웃으로 (안 알리면 100초 넘게 접속 중으로 남는다)
  account = null; draft = blankChar();
  $('#idIn').value = ''; mode = 'login'; paintMode();
  paintIntro(); show('intro');
}

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
    draft = charOf(account) || blankChar();
    showCode(got.recovery, 'recover');
  } catch (err){ msg.textContent = err.message; }
  finally { btn.disabled = false; }
};

async function newCode(){
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
const closeIdSheet = () => { idSheet.hidden = true; $('#myBtn').focus(); };
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

/* ─────────── 마이페이지 (누구에게나 — 사용자 요청) ───────────
   내 계정: 아이디 변경 · 복구 코드 · 로그아웃 · 계정 삭제 — 하나씩 창(모달)으로 연다.
   마스터 계정이면 '관리' 가 더 보인다: 
   [접속자] → 지금 접속 · 게임 중 · 대기 중 몇 명 (누르면 그 사람들) + 기간별(일 · 월 · 년 · 기간설정)
             가입 · 로그인 · 활동(그 기간에 있었던 사람 수) · 로그아웃 · 탈퇴 수.
        → [접속 기록] → 들어옴 · 바뀜 · 나감을 계속 저장해 둔 것 (서버에 암호화해 둔다, presence.js).
   수정일시 = 그 사람의 상태(게임 중 · 대기 중 · 있는 곳)가 마지막으로 바뀐 때, 한국 시간.
   새로 받는 때 = 그 화면에 들어올 때와 머리의 ↻ 를 누를 때 (사용자 요청).
   서버도 마스터가 아니면 목록을 주지 않는다 (api.js 의 ADMINS). */
function isAdmin(){ return !!(account && ['MASTER'].includes(account.user.id)); }   // 함수로 — 위에서 먼저 불린다
const mySheet = $('#mySheet');
let myView = 'menu', myFilter = 'all', myPage = 0, online = null, onlineErr = '', logs = null, myBusy = false;
/* 기간별 — unit: day · month · year · range. anchor 는 그 단위의 한 날(한국 날짜) */
const kstDay = t => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
let stUnit = 'day', stAnchor = '', stFrom = '', stTo = '', stats = null;
function stRange(){
  const [y, m] = stAnchor.split('-').map(Number);
  if (stUnit === 'day') return [stAnchor, stAnchor];
  if (stUnit === 'month') return [`${y}-${String(m).padStart(2, '0')}-01`, kstDay(Date.UTC(y, m, 0) - 9 * 3600 * 1000)];
  if (stUnit === 'year') return [`${y}-01-01`, `${y}-12-31`];
  return [stFrom, stTo];
}
function stLabel(){
  const [y, m] = stAnchor.split('-');
  return stUnit === 'day' ? stAnchor : stUnit === 'month' ? `${y}년 ${+m}월` : `${y}년`;
}
function stShift(dir){            // ‹ › — 그 단위만큼 옮긴다
  const [y, m, d] = stAnchor.split('-').map(Number);
  const t = stUnit === 'day' ? Date.UTC(y, m - 1, d + dir) : stUnit === 'month' ? Date.UTC(y, m - 1 + dir, 1) : Date.UTC(y + dir, 0, 1);
  stAnchor = new Date(t).toISOString().slice(0, 10);
  loadStats();
}
async function loadStats(){
  const [a, b] = stRange();
  if (!a || !b || a > b){ stats = { error: '시작 날이 끝 날보다 앞이어야 해요' }; return drawMy(); }
  stats = null; drawMy();
  try { stats = await getJson(`/api/online-stats?from=${a}&to=${b}`); }
  catch (e){ stats = { error: e.message }; }
  drawMy();
}
const KST = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
function when(t){
  const p = Object.fromEntries(KST.formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { all: '접속자', game: '게임 중', wait: '대기 중' };
/* 기록 한 줄의 이름 — 로그인 · 대기중 · 게임중(어디) · 로그아웃 (사용자 요청) */
const evName = r => ({ in: '로그인', out: '로그아웃', join: '가입', del: '탈퇴' }[r.ev] || (r.state === 'game' ? `게임중(${r.place || '?'})` : '대기중'));
const evKind = r => ({ in: 'in', out: 'out', join: 'join', del: 'out' }[r.ev] || (r.state === 'game' ? 'game' : 'wait'));
/* 몇 분 전 — 서버 시각에 견준다 (폰 시계가 틀려도 같게) */
function ago(t, now){
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

async function getJson(path){
  const r = await fetch(path, { headers: { 'X-Session': account.token } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || '불러오지 못했어요');
  return d;
}
/* 지금 화면에 맞는 것을 새로 받는다 — 들어올 때 · ↻ 를 누를 때 */
async function reloadMy(){
  if (myView === 'menu') return;
  myBusy = true; drawMy();
  try {
    if (myView === 'log') logs = await getJson('/api/online-log?limit=300');
    else online = await getJson('/api/online');
    if (myView === 'online') loadStats();
    onlineErr = '';
  } catch (e){ onlineErr = e.message || '서버에 닿지 못했어요'; }
  myBusy = false; drawMy();
}
function openMy(){
  if (!account) return;
  myView = 'menu'; mySheet.hidden = false; drawMy();
}
function closeMy(){ mySheet.hidden = true; $('#myBtn').focus(); }
function goMy(view, filter){
  myView = view; if (filter) myFilter = filter; myPage = 0;
  drawMy();
  reloadMy();        // 들어올 때마다 새로 받는다
}
/* 한 장에 몇 줄 — 창 안에 다 들어갈 만큼만 (넘겨 보지 않는다). 큰 데서 줄여 간다.
   rows 는 위에서 아래로 그릴 차례 — 최근 것이 맨 위. 목록은 위에서부터 채운다 (사용자 요청) */
function drawRows(B, rows, empty, row){
  const wide = matchMedia('(orientation:landscape) and (max-height:520px)').matches;
  for (let per = 8; per >= 2; per -= wide ? 2 : 1){
    const pages = Math.max(1, Math.ceil(rows.length / per));
    const pg = Math.min(myPage, pages - 1);
    const slots = wide ? Math.ceil(per / 2) : per;
    B.innerHTML = `<ul class="onl" style="min-height:${slots * ROW - 5}px">` + (rows.length ? rows.slice(pg * per, pg * per + per).map(row).join('')
      : `<li class="none">${empty}</li>`) + '</ul>'
      + (pages > 1 ? `<div class="pager"><button class="btn" type="button" data-my="prev" ${pg ? '' : 'disabled'}>‹ 최근</button>${pg + 1} / ${pages}<button class="btn" type="button" data-my="next" ${pg < pages - 1 ? '' : 'disabled'}>이전 ›</button></div>` : '');
    myShown = pg;
    if (B.scrollHeight <= B.clientHeight + 1) break;
  }
  myPage = myShown;
}
function drawMy(){
  const T = $('#mySheetT'), Sub = $('#mySub'), B = $('#myBody'), F = $('#myBtns');
  $('#myBack').hidden = myView === 'menu';
  const rl = $('#myReload');
  rl.hidden = myView === 'menu';
  rl.classList.toggle('spin', myBusy);
  F.innerHTML = '<button class="btn" type="button" data-close>닫기</button>';
  if (myView === 'menu'){
    T.textContent = '마이페이지';
    Sub.textContent = `@${account.user.id}`;
    B.innerHTML = '<div class="mylist">'
      + (isAdmin() ? '<p class="grp">관리</p><div class="mygrid"><button type="button" data-my="online"><span>접속자</span> ›</button><button type="button" data-my="log"><span>접속 기록</span> ›</button></div>' : '')
      + '<p class="grp">내 계정</p><div class="mygrid">'
      + '<button type="button" data-my="idchg"><span>아이디 변경</span></button>'
      + '<button type="button" data-my="rec"><span>복구 코드</span></button>'
      + '<button type="button" data-my="out"><span>로그아웃</span></button>'
      + (isAdmin() ? '' : '<button type="button" class="del" data-my="del"><span>계정 삭제</span></button>')
      + '</div></div>';
    return;
  }
  const src = myView === 'log' ? logs : online;
  const stamp = onlineErr || (myBusy ? '새로 받는 중…' : src ? `${when(src.now)} 기준 · ↻ 로 새로고침` : '불러오는 중…');
  const list = online ? online.list : [];
  if (myView === 'online'){
    const count = k => (k === 'all' ? list.length : list.filter(r => r.state === k).length);
    T.textContent = '접속자';
    Sub.textContent = stamp + (onlineErr ? '' : ' · 로그인한 사람만');
    const units = { day: '일', month: '월', year: '년', range: '기간' };
    const [a, b] = stRange();
    const num = k => (stats && !stats.error ? stats[k] : '–');
    B.innerHTML = '<div class="dash"><div class="tiles">' + ['all', 'game', 'wait'].map(k =>
      `<button type="button" class="${k}" data-my="list" data-f="${k}"><b>${online ? count(k) : '–'}</b><span>${k === 'all' ? '지금 접속자' : KIND[k]}</span></button>`).join('') + '</div>'
      + '<div class="seg4" role="tablist" aria-label="기간 단위">' + Object.entries(units).map(([u, t]) =>
        `<button type="button" role="tab" data-my="unit" data-u="${u}" aria-selected="${stUnit === u}">${t}</button>`).join('') + '</div>'
      + (stUnit === 'range'
        ? `<div class="per"><input type="date" id="stFrom" value="${a}" aria-label="시작 날"><span>~</span><input type="date" id="stTo" value="${b}" aria-label="끝 날"></div>`
        : `<div class="per"><button class="btn" type="button" data-my="sprev" aria-label="앞으로">‹</button><b>${stLabel()}</b><button class="btn" type="button" data-my="snext" aria-label="뒤로">›</button></div>`)
      + '<div class="stats">' + [['join', '가입'], ['in', '로그인'], ['active', '활동'], ['out', '로그아웃'], ['del', '탈퇴']].map(([k, t]) =>
        `<div><b>${num(k)}</b><span>${t}</span></div>`).join('') + '</div>'
      + (stats && stats.error ? `<p class="msg">${esc(stats.error)}</p>` : '') + '</div>';
    return;
  }
  if (myView === 'log'){
    const rows = logs ? logs.list : [];      // 서버가 최근 것부터 준다
    T.textContent = `접속 기록 ${logs ? logs.total : '–'}건`;
    Sub.textContent = stamp + (logs && logs.total > rows.length ? ` · 최근 ${rows.length}건` : '');
    drawRows(B, rows, logs ? '기록이 없어요' : '불러오는 중…', r =>
      `<li><span class="id">${esc(r.id)}</span><b class="ago">${ago(r.at, logs.now)}</b>
         <span class="pl"><i class="ev ${evKind(r)}">${esc(evName(r))}</i></span><span class="tm">${when(r.at)}</span></li>`);
    return;
  }
  // 그 사람들 — 아이디 · 몇 분 전 / 상태 · 있는 곳 · 수정일시. 최근에 바뀐 사람이 위
  const rows = (myFilter === 'all' ? list : list.filter(r => r.state === myFilter)).slice().sort((a, b) => b.since - a.since);
  T.textContent = `${KIND[myFilter]} ${online ? rows.length : '–'}명`;
  Sub.textContent = stamp;
  drawRows(B, rows, online ? '아무도 없어요' : '불러오는 중…', r =>
    `<li><span class="id">${esc(r.id)}</span><b class="ago">${ago(r.since, online.now)}</b>
       <span class="pl"><i class="st ${r.state}">${KIND[r.state]}</i> · ${esc(r.place || '')}</span><span class="tm">수정 ${when(r.since)}</span></li>`);
}
let myShown = 0;
const ROW = 50;   // 한 줄 45px + 사이 5px (index.html 의 .onl li)
$('#myBtn').onclick = openMy;
$('#myBack').onclick = () => goMy(myView === 'list' ? 'online' : 'menu');
$('#myReload').onclick = () => { if (!myBusy) reloadMy(); };
mySheet.addEventListener('click', e => {
  if (e.target === mySheet || e.target.closest('[data-close]')) return closeMy();
  const b = e.target.closest('[data-my]');
  if (!b) return;
  const a = b.dataset.my;
  if (a === 'online' || a === 'log'){
    if (a === 'online' && !stAnchor){ stAnchor = kstDay(serverNow()); stFrom = stTo = stAnchor; }
    goMy(a);
  }
  else if (a === 'unit'){ stUnit = b.dataset.u; loadStats(); }
  else if (a === 'sprev') stShift(-1);
  else if (a === 'snext') stShift(1);
  else if (a === 'idchg'){ closeMy(); openIdSheet(); }
  else if (a === 'rec'){ closeMy(); newCode(); }
  else if (a === 'out'){ closeMy(); openOut(); }
  else if (a === 'del'){ closeMy(); openDel(); }
  else if (a === 'list') goMy('list', b.dataset.f);
  else if (a === 'prev'){ myPage--; drawMy(); }
  else if (a === 'next'){ myPage++; drawMy(); }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && !mySheet.hidden) closeMy(); });
addEventListener('resize', () => { if (!mySheet.hidden) drawMy(); });   // 몇 줄 들어가는지 다시 잰다
// 기간설정 — 날짜를 고르면 바로 다시 센다
mySheet.addEventListener('change', e => {
  if (e.target.id === 'stFrom') stFrom = e.target.value;
  else if (e.target.id === 'stTo') stTo = e.target.value;
  else return;
  loadStats();
});

/* 로그아웃 창 — 이 기기만, 또는 다른 기기까지 모두 */
const outSheet = $('#outSheet');
function openOut(){ $('#outId').textContent = account.user.id; $('#outAll').checked = false; $('#outMsg').textContent = ''; outSheet.hidden = false; }
outSheet.addEventListener('click', e => { if (e.target === outSheet || e.target.closest('[data-close]')) outSheet.hidden = true; });
$('#outGo').onclick = async () => {
  $('#outGo').disabled = true;
  pres.bye();                     // 표가 지워지기 전에 알린다
  if ($('#outAll').checked) await logoutAll(); else logout();
  $('#outGo').disabled = false; outSheet.hidden = true;
  signedOut();
};

/* 계정 삭제 창 — 비밀번호 + '되돌릴 수 없다' 확인. 마스터 계정은 지우지 못한다 (서버도 막는다) */
const delSheet = $('#delSheet');
function openDel(){
  $('#delId').textContent = account.user.id; $('#delPw').value = ''; $('#delOk').checked = false;
  $('#delGo').disabled = true; $('#delMsg').textContent = ''; delSheet.hidden = false; $('#delPw').focus();
}
delSheet.addEventListener('click', e => { if (e.target === delSheet || e.target.closest('[data-close]')) delSheet.hidden = true; });
const delReady = () => { $('#delGo').disabled = !($('#delOk').checked && $('#delPw').value.length >= 6); };
$('#delOk').onchange = delReady; $('#delPw').oninput = delReady;
$('#delForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('#delGo'); btn.disabled = true;
  try { await deleteAccount($('#delPw').value); delSheet.hidden = true; signedOut(); }
  catch (err){ $('#delMsg').textContent = err.message; delReady(); }
};
addEventListener('keydown', e => { if (e.key === 'Escape'){ outSheet.hidden = true; delSheet.hidden = true; } });

/* 접속 알림 — Studio 에 있는 동안은 대기 중 */
var pres = trackPresence(() => ({ state: 'wait', place: 'Studio' }));

/* ─────────── 새 판 알아채기 ───────────
   폰(특히 앱 안 브라우저 · 뒤로 가기로 돌아온 화면)은 예전 페이지를 그대로 꺼내 보여 줄 때가 있다.
   한동안 바꾼 것이 '안 바뀌었다' 는 말을 여러 번 들었다. 화면이 다시 보일 때마다 첫 페이지를
   캐시 없이 받아 studio.js 의 판(?v=)을 견주고, 다르면 다시 불러온다.
   무언가 적고 있는 화면(가입 · 꾸미기 · 창)에서는 미뤘다가 다음에 한다. 30초 안에 두 번은 안 한다. */
const MY_VER = new URL(import.meta.url).searchParams.get('v');
async function checkNew(){
  try {
    const t = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const v = (t.match(/studio\.js\?v=([\w-]+)/) || [])[1];
    if (!v || v === MY_VER) return;
    const calm = ['intro', 'menu', 'cat'].some(n => !$('#' + n).hidden) && [...document.querySelectorAll('.sheet')].every(s => s.hidden);
    const last = +sessionStorage.getItem('studioReload') || 0;
    if (calm && Date.now() - last > 30000){ sessionStorage.setItem('studioReload', Date.now()); location.reload(); }
  } catch (_){}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNew(); });
addEventListener('pageshow', e => { if (e.persisted) checkNew(); });
setTimeout(checkNew, 1500);
