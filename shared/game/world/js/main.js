import * as THREE from 'three';
import { createWorld, resolve } from './world.js';
import { createActor, createDog } from './actor.js';
import { createControls, dirToVector } from './controls.js';
import { createLocalNet, HOP_HEIGHT } from './net.js';
import { SKY, colorFor, hairFor, furFor, wind } from './look.js';

const HOP_DIST = 1.25;
const HOP_TIME = 0.42;
const DOG_NEAR = 1.6;        // 이만큼 떨어지면 강아지가 따라 뛴다
const BUBBLE_MS = 6500;
const LABEL_FAR = 42;
const STORE = 'rainbowGarden.names';

const $ = id => document.getElementById(id);
const TOUCH = matchMedia('(hover:none) and (pointer:coarse)').matches;

const canvas  = $('scene');
const layer   = $('labels');
const startEl = $('start');
const startForm = $('startForm');
const nameIn  = $('nameInput');
const dogIn   = $('dogInput');
const chatForm = $('chat');
const chatIn  = $('chatInput');
const countEl = $('count');
const whoEl   = $('who');

/* ── 폰: 소프트 키보드가 가리는 높이를 재어 UI 를 올린다 ──
   100dvh 만으로는 키보드를 알 수 없다. visualViewport 가 알려준다. */
if (window.visualViewport){
  const vv = window.visualViewport;
  const sync = () => {
    const gap = Math.max(0, innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty('--kb', gap + 'px');
    document.body.classList.toggle('kb', gap > 80);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

// 캔버스를 길게 눌렀을 때 뜨는 메뉴가 조작을 끊지 않게
$('scene').addEventListener('contextmenu', e => e.preventDefault());

/* ── 이름 먼저 ── */
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved){ nameIn.value = saved.name || ''; dogIn.value = saved.dog || ''; }
} catch (_){}

startForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = nameIn.value.trim().slice(0, 12);
  const dog  = dogIn.value.trim().slice(0, 12);
  if (!name || !dog) return;
  try { localStorage.setItem(STORE, JSON.stringify({ name, dog })); } catch (_){}
  startEl.hidden = true;
  begin(name, dog);
});
if (!TOUCH) nameIn.focus();   // 폰에서는 키보드가 시작 화면을 가린다

/* ── 게임 ── */
function begin(myName, dogName){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 34, 74);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);

  // 그림자 맵 없이 빛 둘로만. 일러스트처럼 납작하고 가볍다.
  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xD6F5C4, 1.35));
  const sun = new THREE.DirectionalLight(0xFFFBF0, 1.0);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  const world = createWorld();
  scene.add(world.group);

  /* ── 이름표와 말풍선 ── */
  function makeLabel(name, kind){
    const el = document.createElement('div');
    el.className = 'label' + (kind ? ' ' + kind : '');
    const bub = document.createElement('div');
    bub.className = 'bubble';
    bub.hidden = true;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = name;
    el.append(bub, tag);
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
          timer = setTimeout(() => { bub.hidden = true; }, 420);
        }, BUBBLE_MS);
      },
      remove(){ clearTimeout(timer); el.remove(); }
    };
  }

  /* ── 나와 내 강아지 ── */
  const me = createActor({ color: colorFor(myName), hair: hairFor(myName) });
  me.group.position.set(0, 0, 5.5);
  me.group.rotation.y = Math.PI;
  scene.add(me.group);
  const myLabel = makeLabel(myName);

  const dog = createDog({ color: furFor(dogName) });
  dog.group.position.set(0.9, 0, 6.4);
  scene.add(dog.group);
  const dogLabel = makeLabel(dogName, 'pet');

  whoEl.textContent = myName + ' · ' + dogName;

  // 점프 한 번의 상태
  const makeHop = () => ({ on: false, t: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0 });
  const myHop = makeHop();
  const dogHop = makeHop();

  /* ── 다른 사람들 ── */
  const peers = new Map();

  const handlers = {
    onJoin(id, info){
      const actor = createActor({ color: colorFor(info.name), hair: hairFor(info.name) });
      scene.add(actor.group);
      const entry = { actor, label: makeLabel(info.name), s: { x:0, y:0, z:0, ry:0, hop:0 }, started: false };

      if (info.dog){
        entry.dog = createDog({ color: furFor(info.dog) });
        scene.add(entry.dog.group);
        entry.dogLabel = makeLabel(info.dog, 'pet');
        entry.dogHop = makeHop();
        entry.dog.group.position.set(info.x ?? 0, 0, (info.z ?? 0) + 1);
      }
      peers.set(id, entry);
      updateCount();
    },
    onState(id, s){
      const p = peers.get(id);
      if (!p) return;
      p.s = s;
      if (!p.started){
        p.actor.group.position.set(s.x, 0, s.z);
        if (p.dog) p.dog.group.position.set(s.x, 0, s.z + 1);
        p.started = true;
      }
    },
    onSay(id, text){
      const p = peers.get(id);
      if (p) p.label.say(text);
    },
    onLeave(id){
      const p = peers.get(id);
      if (!p) return;
      scene.remove(p.actor.group); p.actor.dispose(); p.label.remove();
      if (p.dog){ scene.remove(p.dog.group); p.dog.dispose(); p.dogLabel.remove(); }
      peers.delete(id);
      updateCount();
    }
  };

  function updateCount(){ countEl.textContent = (peers.size + 1) + '명'; }

  const net = createLocalNet({ world, handlers });
  updateCount();

  /* ── 조작 ── */
  const controls = createControls(canvas, { pad: $('pad') });

  /* ── 대화 ── */
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatIn.value.trim().slice(0, 60);
    chatIn.value = '';
    chatIn.blur();
    if (!text) return;
    myLabel.say(text);
    net.say(text);
  });
  // 폰에는 Enter 키가 없으니 키보드 단축키는 마우스 쪽에서만 쓴다
  addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.activeElement !== chatIn){
      e.preventDefault(); chatIn.focus();
    } else if (e.key === 'Escape' && document.activeElement === chatIn){
      chatIn.blur();
    }
  });

  /* ── 점프 ── */
  function launch(hop, obj, fromX, fromZ, ux, uz){
    const p = resolve(world, fromX + ux * HOP_DIST, fromZ + uz * HOP_DIST);
    hop.on = true;
    hop.t = 0;
    hop.fromX = fromX; hop.fromZ = fromZ;
    hop.toX = p.x;     hop.toZ = p.z;
    obj.rotation.y = Math.atan2(ux, uz);
  }

  // 뛰는 동안의 위치와 높이를 되돌린다. 0 이면 땅.
  function stepHop(hop, obj, dt){
    if (!hop.on) return 0;
    hop.t += dt / HOP_TIME;
    if (hop.t >= 1){
      hop.on = false;
      obj.position.set(hop.toX, 0, hop.toZ);
      return 0;
    }
    obj.position.x = hop.fromX + (hop.toX - hop.fromX) * hop.t;
    obj.position.z = hop.fromZ + (hop.toZ - hop.fromZ) * hop.t;
    obj.position.y = Math.sin(hop.t * Math.PI) * HOP_HEIGHT;
    return hop.t;
  }

  /* ── 이름표를 머리 위 화면 좌표로 ── */
  const probe = new THREE.Vector3();
  function place(label, headTop, obj){
    obj.getWorldPosition(probe);
    probe.y += headTop;
    const dist = camera.position.distanceTo(probe);
    probe.project(camera);
    if (probe.z > 1 || dist > LABEL_FAR){
      label.el.style.visibility = 'hidden';
      return;
    }
    label.el.style.visibility = 'visible';
    label.el.style.opacity = dist > LABEL_FAR * 0.75 ? '0.4' : '1';
    label.el.style.transform =
      `translate(${(probe.x * 0.5 + 0.5) * innerWidth}px, ${(-probe.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
  }

  /* ── 화면 ── */
  function resize(){
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // 세로로 길면 좌우가 좁아진다. 시야를 넓혀 앞을 보게 한다.
    camera.fov = camera.aspect < 1 ? 62 : 50;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  /* ── 루프 ── */
  const camWant = new THREE.Vector3();
  const camAim = new THREE.Vector3();
  let last = performance.now();
  let first = true;

  function frame(now){
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const cam = controls.state;

    // 바람은 그래픽카드가 흔든다. 여기서는 시간만 올려 준다.
    wind.time.value += dt;

    /* 나 */
    if (!myHop.on){
      const dir = controls.takeHop();
      if (dir){
        const v = dirToVector(dir, cam.yaw);
        // 네 방향으로만 뛰므로 축 하나를 골라 또렷하게
        const ux = Math.abs(v.x) > Math.abs(v.z) ? Math.sign(v.x) : 0;
        const uz = ux === 0 ? Math.sign(v.z) : 0;
        launch(myHop, me.group, me.group.position.x, me.group.position.z, ux, uz);
      }
    }
    me.update(dt, stepHop(myHop, me.group, dt));

    /* 강아지 — 멀어지면 따라 뛴다 */
    if (!dogHop.on){
      const dx = me.group.position.x - dog.group.position.x;
      const dz = me.group.position.z - dog.group.position.z;
      if (Math.hypot(dx, dz) > DOG_NEAR){
        const ux = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
        const uz = ux === 0 ? Math.sign(dz) : 0;
        launch(dogHop, dog.group, dog.group.position.x, dog.group.position.z, ux, uz);
      }
    }
    dog.update(dt, stepHop(dogHop, dog.group, dt));

    /* 다른 사람들 */
    net.update(dt);
    for (const p of peers.values()){
      const k = Math.min(1, dt * 14);
      const g = p.actor.group;
      g.position.x += (p.s.x - g.position.x) * k;
      g.position.z += (p.s.z - g.position.z) * k;
      g.position.y = p.s.y;
      let d = p.s.ry - g.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * k;
      p.actor.update(dt, p.s.hop || 0);

      if (p.dog){
        if (!p.dogHop.on){
          const dx = g.position.x - p.dog.group.position.x;
          const dz = g.position.z - p.dog.group.position.z;
          if (Math.hypot(dx, dz) > DOG_NEAR){
            const ux = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
            const uz = ux === 0 ? Math.sign(dz) : 0;
            launch(p.dogHop, p.dog.group, p.dog.group.position.x, p.dog.group.position.z, ux, uz);
          }
        }
        p.dog.update(dt, stepHop(p.dogHop, p.dog.group, dt));
      }
    }

    /* 카메라 */
    const t = me.group.position;
    camAim.set(t.x, 0.9, t.z);
    camWant.set(
      t.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      0.9 + Math.sin(cam.pitch) * cam.dist,
      t.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist
    );
    if (camWant.y < 1) camWant.y = 1;
    camera.position.lerp(camWant, first ? 1 : Math.min(1, dt * 7));
    camera.lookAt(camAim);

    renderer.render(scene, camera);

    place(myLabel, me.headTop, me.group);
    place(dogLabel, dog.headTop, dog.group);
    for (const p of peers.values()){
      place(p.label, p.actor.headTop, p.actor.group);
      if (p.dog) place(p.dogLabel, p.dog.headTop, p.dog.group);
    }

    if (first){ first = false; $('loading').hidden = true; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
