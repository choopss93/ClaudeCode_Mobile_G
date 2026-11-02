import * as THREE from 'three';
import { createWorld, resolve } from './world.js';
import { createActor, colorFor } from './actor.js';
import { createControls } from './controls.js';
import { createLocalNet } from './net.js';

const WALK = 3.6;
const RUN  = 6.4;
const BUBBLE_MS = 6000;
const LABEL_FAR = 55;      // 이보다 멀면 이름표를 숨긴다

const canvas   = document.getElementById('scene');
const layer    = document.getElementById('labels');
const chatForm = document.getElementById('chat');
const chatIn   = document.getElementById('chatInput');
const modeEl   = document.getElementById('mode');
const countEl  = document.getElementById('count');
const loading  = document.getElementById('loading');

/* ── 렌더러 ── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ED2EA);
scene.fog = new THREE.Fog(0x9ED2EA, 42, 96);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);

scene.add(new THREE.HemisphereLight(0xCFE6F2, 0x6B7A55, 1.05));
const sun = new THREE.DirectionalLight(0xFFF3DC, 1.5);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 90;
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.bias = -0.0012;
scene.add(sun);

/* ── 맵 ── */
const world = createWorld();
scene.add(world.group);

/* ── 이름표와 말풍선 (3D 위에 얹은 HTML) ── */
function makeLabel(name){
  const el = document.createElement('div');
  el.className = 'label';
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = name;
  const bub = document.createElement('div');
  bub.className = 'bubble';
  bub.hidden = true;
  el.appendChild(bub);
  el.appendChild(tag);
  layer.appendChild(el);

  let timer = null;
  return {
    el,
    say(text){
      bub.textContent = text;
      bub.hidden = false;
      bub.classList.remove('fade');
      clearTimeout(timer);
      timer = setTimeout(() => {
        bub.classList.add('fade');
        timer = setTimeout(() => { bub.hidden = true; }, 400);
      }, BUBBLE_MS);
    },
    remove(){ clearTimeout(timer); el.remove(); }
  };
}

/* ── 나 ── */
const myName = '나';
const me = createActor({ color: colorFor(myName) });
me.group.position.set(0, 0, 11);
me.group.rotation.y = Math.PI;
scene.add(me.group);
const myLabel = makeLabel(myName);

/* ── 다른 사람들 ── */
const peers = new Map();

const handlers = {
  onJoin(id, info){
    const actor = createActor({ color: colorFor(info.name) });
    scene.add(actor.group);
    peers.set(id, {
      actor,
      label: makeLabel(info.name),
      x: 0, z: 0, ry: 0,          // 받은 목표값
      sx: 0, sz: 0, sry: 0,       // 화면에 그리는 값 (목표를 부드럽게 따라감)
      speed: 0,
      started: false
    });
    updateCount();
  },
  onState(id, s){
    const p = peers.get(id);
    if (!p) return;
    p.x = s.x; p.z = s.z; p.ry = s.ry;
    if (!p.started){ p.sx = s.x; p.sz = s.z; p.sry = s.ry; p.started = true; }
  },
  onSay(id, text){
    const p = peers.get(id);
    if (p) p.label.say(text);
  },
  onLeave(id){
    const p = peers.get(id);
    if (!p) return;
    scene.remove(p.actor.group);
    p.actor.dispose();
    p.label.remove();
    peers.delete(id);
    updateCount();
  }
};

function updateCount(){
  countEl.textContent = (peers.size + 1) + '명';
}

const net = createLocalNet({ world, handlers });
modeEl.textContent = net.mode === 'local' ? '혼자 플레이 중' : '접속됨';
updateCount();

/* ── 조작 ── */
const controls = createControls(canvas, { joystick: document.getElementById('stick') });

/* ── 대화 ── */
function send(){
  const text = chatIn.value.trim().slice(0, 60);
  chatIn.value = '';
  if (!text) return;
  myLabel.say(text);
  net.say(text);
}
chatForm.addEventListener('submit', e => { e.preventDefault(); send(); chatIn.blur(); });

// Enter 로 대화창을 열고, Esc 로 닫는다.
addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement !== chatIn){
    e.preventDefault();
    chatIn.focus();
  } else if (e.key === 'Escape' && document.activeElement === chatIn){
    chatIn.blur();
  }
});

/* ── 이름표를 머리 위 화면 좌표로 옮기기 ── */
const probe = new THREE.Vector3();
function placeLabel(label, actor, group){
  group.getWorldPosition(probe);
  probe.y += actor.headTop;
  const dist = camera.position.distanceTo(probe);
  probe.project(camera);

  // 카메라 뒤에 있거나 너무 멀면 숨긴다
  if (probe.z > 1 || dist > LABEL_FAR){
    label.el.style.visibility = 'hidden';
    return;
  }
  label.el.style.visibility = 'visible';
  label.el.style.transform =
    `translate(${(probe.x * 0.5 + 0.5) * innerWidth}px, ${(-probe.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
  label.el.style.opacity = dist > LABEL_FAR * 0.72 ? '0.45' : '1';
}

/* ── 화면 크기 ── */
function resize(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ── 루프 ── */
const camPos = new THREE.Vector3();
const camAim = new THREE.Vector3();
let last = performance.now();
let first = true;

function frame(now){
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  const input = controls.update();

  /* 카메라가 보는 방향을 기준으로 움직인다 */
  const sin = Math.sin(input.yaw), cos = Math.cos(input.yaw);
  const dx = cos * input.move.x - sin * input.move.z;
  const dz = -sin * input.move.x - cos * input.move.z;

  const want = Math.hypot(dx, dz);
  const speed = want > 0 ? (input.run ? RUN : WALK) : 0;

  if (want > 0){
    const p = resolve(
      world,
      me.group.position.x + dx * speed * dt,
      me.group.position.z + dz * speed * dt
    );
    me.group.position.x = p.x;
    me.group.position.z = p.z;

    // 가려는 쪽으로 몸을 돌린다 (한 번에 꺾지 않고 짧은 쪽으로 돌려서)
    const target = Math.atan2(dx, dz);
    let diff = target - me.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    me.group.rotation.y += diff * Math.min(1, dt * 12);
  }
  me.update(dt, speed);

  /* 다른 사람들 — 받은 위치를 부드럽게 따라간다 */
  net.update(dt);
  for (const p of peers.values()){
    const k = Math.min(1, dt * 9);
    const px = p.sx, pz = p.sz;
    p.sx += (p.x - p.sx) * k;
    p.sz += (p.z - p.sz) * k;
    let d = p.ry - p.sry;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.sry += d * Math.min(1, dt * 9);

    p.actor.group.position.set(p.sx, 0, p.sz);
    p.actor.group.rotation.y = p.sry;
    p.speed = Math.hypot(p.sx - px, p.sz - pz) / Math.max(dt, 1e-4);
    p.actor.update(dt, p.speed);
  }

  /* 카메라 — 캐릭터 뒤를 따라간다 */
  const t = me.group.position;
  camAim.set(t.x, t.y + 1.25, t.z);
  camPos.set(
    t.x + Math.sin(input.yaw) * Math.cos(input.pitch) * input.dist,
    t.y + 1.25 + Math.sin(input.pitch) * input.dist,
    t.z + Math.cos(input.yaw) * Math.cos(input.pitch) * input.dist
  );
  if (camPos.y < 0.6) camPos.y = 0.6;
  camera.position.lerp(camPos, first ? 1 : Math.min(1, dt * 10));
  camera.lookAt(camAim);

  sun.position.set(t.x + 18, 28, t.z + 12);
  sun.target.position.copy(t);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);

  placeLabel(myLabel, me, me.group);
  for (const p of peers.values()) placeLabel(p.label, p.actor, p.actor.group);

  if (first){
    first = false;
    loading.hidden = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
