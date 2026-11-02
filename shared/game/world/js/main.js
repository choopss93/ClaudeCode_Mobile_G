import * as THREE from 'three';
import { createWorld, resolve } from '#world';
import { createActor, createDog } from '#actor';
import { createControls } from '#controls';
import { createLocalNet } from '#net';
import { SKY, colorFor, hairFor, furFor, wind } from '#look';

const SPEED = 3.1;           // 전속력으로 걸을 때 초당 거리
const TURN = 11;             // 몸이 방향을 따라 도는 빠르기
const DOG_SPEED = 3.6;       // 뒤처지면 종종걸음으로 쫓아온다
const DOG_NEAR = 1.3;        // 이만큼 떨어지면 따라나선다
const DOG_STOP = 0.9;        // 이만큼 가까워지면 멈춘다
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

  let dogSpeed = 0;

  /* ── 다른 사람들 ── */
  const peers = new Map();

  const handlers = {
    onJoin(id, info){
      const actor = createActor({ color: colorFor(info.name), hair: hairFor(info.name) });
      scene.add(actor.group);
      const entry = { actor, label: makeLabel(info.name), s: { x:0, y:0, z:0, ry:0, speed:0 }, started: false };

      if (info.dog){
        entry.dog = createDog({ color: furFor(info.dog) });
        scene.add(entry.dog.group);
        entry.dogLabel = makeLabel(info.dog, 'pet');
        entry.dogSpeed = 0;
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
  const controls = createControls(canvas, { stick: $('stick'), knob: $('knob') });

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

  /* ── 걷기 ──
     한 걸음 옮기고, 덤불을 피해 자리를 바로잡고, 몸을 가는 쪽으로 돌린다.
     실제로 옮겨진 거리를 돌려주므로 벽에 막히면 걸음 동작도 멎는다. */
  function walk(obj, dirX, dirZ, speed, dt){
    const from = obj.position;
    const p = resolve(world, from.x + dirX * speed * dt, from.z + dirZ * speed * dt);
    const moved = Math.hypot(p.x - from.x, p.z - from.z);
    from.x = p.x;
    from.z = p.z;

    // 한 번에 꺾지 않고 짧은 쪽으로 돌린다
    let diff = Math.atan2(dirX, dirZ) - obj.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    obj.rotation.y += diff * Math.min(1, dt * TURN);

    return moved / Math.max(dt, 1e-4);
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
    // 화면 크기는 캔버스에서 잰 것을 쓴다 — innerWidth 로 하면 어긋난다
    label.el.style.transform =
      `translate(${(probe.x * 0.5 + 0.5) * vw}px, ${(-probe.y * 0.5 + 0.5) * vh}px) translate(-50%, -100%)`;
  }

  /* ── 화면 ──
     innerHeight 로 재면 안 된다. 아이폰 사파리는 주소창이 접히고 펴지는
     동안 innerHeight 와 캔버스가 실제로 차지한 높이가 어긋나는데, 그만큼
     화면이 늘어나 보인다. 캔버스가 실제로 몇 픽셀인지 직접 재서 쓴다. */
  let vw = 0, vh = 0;
  function resize(){
    const w = canvas.clientWidth  || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    if (w === vw && h === vh) return;
    vw = w; vh = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 세로로 길면 좌우가 좁아진다. 시야를 넓혀 앞을 보게 한다.
    camera.fov = camera.aspect < 1 ? 62 : 50;
    camera.updateProjectionMatrix();
  }
  resize();

  // 주소창이 움직이는 것은 resize 로 안 오는 때가 있다. 캔버스를 직접 지켜본다.
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  addEventListener('resize', resize);
  addEventListener('orientationchange', resize);
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);

  /* ── 루프 ── */
  const camWant = new THREE.Vector3();
  const camAim = new THREE.Vector3();
  let last = performance.now();
  let first = true;

  function frame(now){
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const cam = controls.update();   // 눌린 키와 조이스틱을 여기서 읽는다

    // 바람은 그래픽카드가 흔든다. 여기서는 시간만 올려 준다.
    wind.time.value += dt;

    /* 나 — 조이스틱을 민 방향으로, 민 만큼 빠르게 */
    let mySpeed = 0;
    const push = Math.hypot(cam.move.x, cam.move.z);
    if (push > 0.001){
      // 카메라가 보는 방향을 앞으로 삼는다
      const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
      const dx = cos * cam.move.x - sin * cam.move.z;
      const dz = -sin * cam.move.x - cos * cam.move.z;
      const len = Math.hypot(dx, dz);
      mySpeed = walk(me.group, dx / len, dz / len, SPEED * Math.min(1, push), dt);
    }
    me.update(dt, mySpeed);

    /* 강아지 — 뒤처지면 쫓아오고, 가까워지면 멈춰 선다 */
    {
      const dx = me.group.position.x - dog.group.position.x;
      const dz = me.group.position.z - dog.group.position.z;
      const gap = Math.hypot(dx, dz);
      if (gap > DOG_NEAR) dogSpeed = DOG_SPEED;
      else if (gap < DOG_STOP) dogSpeed = 0;
      dogSpeed > 0 && gap > 0.01
        ? dog.update(dt, walk(dog.group, dx / gap, dz / gap, Math.min(dogSpeed, gap / Math.max(dt, 1e-4)), dt))
        : dog.update(dt, 0);
    }

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
      p.actor.update(dt, p.s.speed || 0);

      if (p.dog){
        const dx = g.position.x - p.dog.group.position.x;
        const dz = g.position.z - p.dog.group.position.z;
        const gap = Math.hypot(dx, dz);
        if (gap > DOG_NEAR) p.dogSpeed = DOG_SPEED;
        else if (gap < DOG_STOP) p.dogSpeed = 0;
        p.dog.update(dt, p.dogSpeed > 0 && gap > 0.01
          ? walk(p.dog.group, dx / gap, dz / gap, Math.min(p.dogSpeed, gap / Math.max(dt, 1e-4)), dt)
          : 0);
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
