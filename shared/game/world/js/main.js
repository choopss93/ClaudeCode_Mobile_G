import * as THREE from 'three';
import { createWorld, resolve, START } from '#world';
import { createActor, createPet, TRICKS, HAND_SPOT } from '#actor';
import { KINDS, COATS, resolvePet } from '#pets';
import { makeCode, readCodes } from '#petcode';
import { CAPACITY, PUBLIC, makeChannel, readChannel, showChannel,
         channelFromHash, writeChannelToHash, inviteLink } from '#channel';
import { lookNow, createStars, createSun, applyLook } from '#daylight';
import { createControls } from '#controls';
import { createLocalNet } from '#net';
import { createLiveNet } from '#live';
import { SKY, colorFor, hairFor, wind, toon } from '#look';

const SPEED = 3.1;           // 전속력으로 걸을 때 초당 거리
const TURN = 11;             // 몸이 방향을 따라 도는 빠르기
// 거니는 빠르기는 품종마다 다르다 (pets.js 의 walkSpeed). 사람보다 늘 느리다.
const GREET_RANGE = 4.2;     // 주인이 이만큼 가까워지면 알아본다
                             // (좁게 잡으면 스쳐 지나가느라 좀처럼 못 알아본다)
const FOLLOW_GO = 2.4;       // 만난 뒤 — 이만큼 떨어지면 따라나선다
const FOLLOW_STOP = 1.5;     // 이만큼 가까우면 멈춰 선다
const FOLLOW_LOSE = 24;      // 이만큼 벌어지면 놓친 것으로 보고 다시 거닌다
const FOLLOW_TROT = 1.75;    // 따라올 때는 종종걸음. 그래도 사람보다 느리다.
const FOLLOW_MAX = 2.9;      // 사람(3.1)을 앞지르지 않도록 여기서 막는다
const GREET_CHANCE = 0.85;   // 알아봤을 때 반가워할 확률
const GREET_AGAIN = 9;       // 한 번 반긴 뒤 다시 반기기까지 (초)
const MEET_CHANCE = 0.8;     // 다음 갈 곳을 바로 내 근처로 잡을 확률
const MEET_NEAR = 12;        // 그 "내 근처" 의 넓이
const MEET_FAR = 26;         // 멀리 갈 때도 이 안에서만 — 넓은 들판 끝까지
                             // 보내면 느린 걸음으로 30초씩 걸려 안 보인다
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
const whenEl  = $('when');
const whereEl = $('where');
const themeMeta = document.querySelector('meta[name="theme-color"]');

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

/* ── 이름과 반려동물 고르기 ── */

const choice = { look: 'short', kind: 'dog', breed: 3, coat: 'white' };

try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved){
    nameIn.value = saved.name || '';
    dogIn.value = saved.dog || '';
    if (saved.look === 'short' || saved.look === 'long') choice.look = saved.look;
    if (KINDS[saved.kind]) choice.kind = saved.kind;
    if (Number.isInteger(saved.breed)) choice.breed = saved.breed;
    if (COATS.some(c => c.key === saved.coat)) choice.coat = saved.coat;
  }
} catch (_){}

/* ── 채널 ──
   열린 정원 / 내 채널 만들기 / 코드로 들어가기. 링크에 코드가 들어 있으면
   그대로 그 채널로 들어간다. */
let channel = channelFromHash() || PUBLIC;
let chMode = channel === PUBLIC ? 'open' : 'join';

const chCodeEl = $('chCode');
const chNameEl = $('chName');
const chHintEl = $('chHint');

const CH_HINT = {
  open: '누구나 들어오는 정원이에요. 한 채널에 서른 명까지.',
  mine: '나만의 채널이에요. 코드를 보내면 친구가 들어옵니다.',
  join: '받은 코드를 적으면 그 채널로 들어갑니다.'
};

function paintChannel(){
  for (const b of $('chPick').querySelectorAll('button[data-ch]')){
    b.classList.toggle('on', b.dataset.ch === chMode);
  }
  chCodeEl.hidden = chMode !== 'join';
  chHintEl.textContent = CH_HINT[chMode];
  chNameEl.textContent =
    chMode === 'open' ? '열린 정원'
    : chMode === 'mine' ? showChannel(channel)
    : '코드 입력';
}

for (const btn of $('chPick').querySelectorAll('button[data-ch]')){
  btn.addEventListener('click', () => {
    chMode = btn.dataset.ch;
    if (chMode === 'open') channel = PUBLIC;
    else if (chMode === 'mine') channel = makeChannel();
    paintChannel();
    if (chMode === 'join') chCodeEl.focus();
  });
}
if (chMode === 'join') chCodeEl.value = showChannel(channel);
paintChannel();

const breedsEl = $('breeds');
const coatsEl = $('coats');
const coatNameEl = $('coatName');

function paintBreeds(){
  const list = KINDS[choice.kind].breeds;
  if (choice.breed >= list.length) choice.breed = 0;
  breedsEl.replaceChildren();
  list.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.name;
    btn.className = i === choice.breed ? 'on' : '';
    btn.setAttribute('aria-pressed', i === choice.breed ? 'true' : 'false');
    btn.addEventListener('click', () => { choice.breed = i; paintBreeds(); });
    breedsEl.appendChild(btn);
  });
}

function paintCoats(){
  coatsEl.replaceChildren();
  COATS.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = c.key === choice.coat ? 'on' : '';
    btn.setAttribute('aria-label', c.label);
    btn.setAttribute('aria-pressed', c.key === choice.coat ? 'true' : 'false');

    if (c.random){
      btn.innerHTML = '<span class="fill" style="background:' +
        'conic-gradient(#FFF6EC 0 25%, #5E5866 0 50%, #C0906A 0 75%, #FFD9A0 0)"></span>' +
        '<span class="dice">?</span>';
    } else {
      const hex = '#' + c.base.toString(16).padStart(6, '0');
      let html = '<span class="fill" style="background:' + hex + '"></span>';
      if (c.accent){
        // 화이트블랙은 반반으로 보여 준다
        html += '<span class="half" style="background:#' +
          c.accent.toString(16).padStart(6, '0') + '"></span>';
      }
      btn.innerHTML = html;
    }
    btn.addEventListener('click', () => {
      choice.coat = c.key;
      coatNameEl.textContent = c.label;
      paintCoats();
    });
    coatsEl.appendChild(btn);
  });
  const cur = COATS.find(c => c.key === choice.coat);
  if (cur) coatNameEl.textContent = cur.label;
}

for (const btn of $('gender').querySelectorAll('button[data-look]')){
  btn.addEventListener('click', () => {
    choice.look = btn.dataset.look;
    for (const o of $('gender').querySelectorAll('button[data-look]')){
      o.classList.toggle('on', o.dataset.look === choice.look);
    }
  });
  btn.classList.toggle('on', btn.dataset.look === choice.look);
}

for (const btn of $('kind').querySelectorAll('button[data-kind]')){
  btn.addEventListener('click', () => {
    choice.kind = btn.dataset.kind;
    choice.breed = 0;
    for (const b of $('kind').querySelectorAll('button[data-kind]')){
      b.classList.toggle('on', b.dataset.kind === choice.kind);
    }
    paintBreeds();
  });
  btn.classList.toggle('on', btn.dataset.kind === choice.kind);
}

paintBreeds();
paintCoats();

startForm.addEventListener('submit', e => {
  e.preventDefault();
  const name = nameIn.value.trim().slice(0, 12);
  const dog  = dogIn.value.trim().slice(0, 12);
  if (!name || !dog) return;
  try {
    localStorage.setItem(STORE, JSON.stringify({
      name, dog, look: choice.look,
      kind: choice.kind, breed: choice.breed, coat: choice.coat
    }));
  } catch (_){}
  if (chMode === 'join'){
    const got = readChannel(chCodeEl.value);
    if (!got){
      chHintEl.textContent = '채널 코드를 읽지 못했어요. 다시 확인해 주세요.';
      chCodeEl.focus();
      return;
    }
    channel = got;
  } else if (chMode === 'open'){
    channel = PUBLIC;
  }
  writeChannelToHash(channel);

  startEl.hidden = true;
  // 랜덤이면 여기서 한 번만 뽑는다. 들어갈 때마다 달라진다.
  begin(name, dog, resolvePet(choice), readCodes($('friendCodes').value), choice.look);
});
if (!TOUCH) nameIn.focus();   // 폰에서는 키보드가 시작 화면을 가린다

/* ── 게임 ── */
function begin(myName, petName, petSpec, friends, myLook){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 38, 104);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);   // 안개가 지우는 거리보다 조금 멀리까지만

  // 밝기와 색은 시간대(daylight.js)가 정한다. 여기서는 자리만 만든다.
  const hemi = new THREE.HemisphereLight(0xFFFFFF, 0xD6F5C4, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFFBF0, 1.0);
  scene.add(sun);
  scene.add(sun.target);

  const stars = createStars(170);
  const sunDisc = createSun(150);   // 하늘에 보이는 해
  scene.add(sunDisc);
  scene.add(stars);

  const world = createWorld();
  scene.add(world.group);

  // 시간대 — 손에 드는 것도 여기에 따른다. handlers 보다 먼저 있어야 한다.
  let look = lookNow();
  let skyWait = 0;
  whenEl.textContent = look.label;

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
      say(text, ms){
        bub.textContent = text;
        bub.hidden = false;
        bub.classList.remove('fade');
        clearTimeout(timer);
        timer = setTimeout(() => {
          bub.classList.add('fade');
          timer = setTimeout(() => { bub.hidden = true; }, 420);
        }, ms || BUBBLE_MS);
      },
      remove(){ clearTimeout(timer); el.remove(); }
    };
  }

  /* ── 나와 내 강아지 ── */
  // 등불 빛은 내 캐릭터에만 단다 (actor.js 의 lamp 설명 참고)
  const me = createActor({ lamp: true, color: colorFor(myName), hair: hairFor(myName),
                          long: myLook === 'long' });
  // 무지개 다리 바깥 끝에서 시작한다. 앞으로 쭉 건너가면 들판이다.
  me.group.position.set(START.x, 0, START.z);
  me.group.rotation.y = Math.PI;
  scene.add(me.group);
  me.setHand(look.dark > 0.5);
  const myLabel = makeLabel(myName);

  // 이름표는 아래에서 다시 쓴다 — 코드를 넣었으면 그 아이의 이름이라야 한다

  /* ── 반려동물 ──
     따라다니지 않는다. 저마다 정원을 거닐되, 다음 갈 곳을 열에 일곱쯤은
     내 근처로 잡아 자주 마주치게 한다. */
  const pets = [];

  /* 아이들이 가운데 삼을 자리. 내가 들판 안에 있으면 나를, 다리 위에
     있으면 들판 한가운데를 삼는다. 안 그러면 내가 다리에 서 있는 동안
     모두 입구에만 몰린다 — 건너가 보면 들판에서 놀고 있어야 한다. */
  const middle = { x: 0, z: 0 };
  function around(){
    const p = me.group.position;
    return Math.hypot(p.x, p.z) < world.radius - 6 ? p : middle;
  }

  function wander(e){
    const a = Math.random() * Math.PI * 2;
    // 멀리 가든 가까이 오든 늘 그 가운데를 삼는다. 그래야 다시 만난다.
    // 때로는 바로 코앞을 목적지로 삼는다 — 그래야 주인을 알아볼 일이 생긴다
    const roll = Math.random();
    const d = roll < 0.3 ? 1 + Math.random() * 2.5
            : roll < MEET_CHANCE ? 3.5 + Math.random() * (MEET_NEAR - 3.5)
            : MEET_NEAR + Math.random() * (MEET_FAR - MEET_NEAR);
    const c = around();
    const at = inGarden(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d);
    e.tx = at.x; e.tz = at.z;
  }

  /* 반려동물은 들판에서 논다. 다리 위로 보내지 않는다. */
  function inGarden(x, z){
    const keep = world.radius - 5;
    const d = Math.hypot(x, z);
    if (d > keep){ x = (x / d) * keep; z = (z / d) * keep; }
    return resolve(world, x, z);
  }

  /* 걷게 하면서 그 빠르기를 적어 둔다. 내 아이의 걸음은 남의 화면에서
     다리를 움직이는 값이 되므로, 흘려버리면 미끄러져 보인다. */
  function step(e, dt, speed){
    e.lastSpeed = speed;
    e.actor.update(dt, speed);
  }

  function addPet(spec, name, owner, remote){
    const actor = createPet(spec);
    // 들어서자마자 곁에 있으면 찾아다닐 일이 없다. 들판 어딘가 멀찍이 둔다 —
    // 다리를 건너가 만나거나, 이름을 부르면 된다.
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * (world.radius - 14);
    const c = around();
    const at = inGarden(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d);
    actor.group.position.set(at.x, 0, at.z);
    scene.add(actor.group);

    // 반기는 것은 가족 모두에게, 따라다니는 것은 제 주인에게만.
    const family = [me.group];
    if (owner && owner !== me.group) family.push(owner);

    const e = { actor, name, spec, label: makeLabel(name, 'pet'), tx: at.x, tz: at.z,
                speed: spec.speed,
                trot: Math.min(spec.speed * FOLLOW_TROT, FOLLOW_MAX),
                rest: Math.random() * 1.5,
                family,
                owner: owner || null,   // 따라다니는 상대는 이 사람뿐이다
                remote: !!remote,       // 주인의 기기에서 사는 아이 — 여기서는 놓기만 한다
                lastSpeed: 0,
                greetWait: 2,
                follows: null,          // 만나 반긴 뒤 제 주인을 따라나선다
                called: false,          // 이름을 부르면 곧장 달려온다
                order: null };          // 시킨 재주 — 와서 하고 간다
    wander(e);
    pets.push(e);
    return e;
  }

  /* 한 정원에 아이는 **한 마리**다.
     코드를 넣었으면 그 아이가 내 아이가 된다 — 고른 이름과 품종은 쓰지
     않는다. 둘 다 두면 정원에 아이가 둘이 되어 버린다. */
  const given = (friends && friends[0]) || null;
  let mySpec = given ? resolvePet(given) : petSpec;
  let myName2 = given ? given.name : petName;
  let myCard = given
    ? { kind: given.kind, breed: given.breed, coat: given.coat, name: given.name }
    : { kind: petSpec.kind, breed: choice.breed, coat: petSpec.coatKey, name: petName };

  let myPet = addPet(mySpec, myName2, me.group);     // 이 아이의 주인은 나다

  /* 어떤 아이인지 한 줄로. 같은 채널에 같은 아이를 가진 사람이 있으면
     한쪽만 움직여야 두 화면에서 같은 자리에 있다. */
  const keyOf = c => c ? [c.kind, c.breed, c.coat, c.name].join('|') : '';
  let myKey = keyOf(myCard);

  /* 같은 아이를 맡은 사람. id 가 가장 작은 사람이 움직이고 나머지는
     받아서 놓기만 한다. 양쪽이 같은 규칙으로 따지므로 의논할 필요가 없다.
     id 는 net 보다 먼저 있어야 해서 여기서 미리 뽑는다 — net 을 들여다보면
     손님이 들어올 때 아직 만들어지지 않아 터진다. */
  const myId = 'rb' + Math.random().toString(36).slice(2, 10);
  let driver = null;
  /* 공을 던진 사람이 그동안 아이를 맡는다. 안 그러면 내가 던진 공을
     저쪽 사람의 아이가 물어오고, 내 화면에서는 아무 일도 안 일어난다. */
  let throwing = false;

  function pickDriver(){
    let small = null, thrower = null;
    for (const [id, p] of peers){
      if (p.petKey !== myKey) continue;
      if (small === null || id < small) small = id;
      if (p.throwing && (thrower === null || id < thrower)) thrower = id;
    }
    // 공을 던진 사람이 먼저다. 둘이 같이 던졌으면 id 가 작은 쪽.
    let next;
    if (throwing && (thrower === null || myId < thrower)) next = null;
    else if (thrower !== null) next = thrower;
    else next = (small !== null && small < myId) ? small : null;
    if (next === driver) return;
    driver = next;
    myPet.remote = !!driver;
    myPet.rStarted = false;
    if (!driver){ myPet.rest = 0.4; wander(myPet); }   // 내가 다시 맡는다
  }

  /* ── 다른 사람들 ── */
  const peers = new Map();

  const handlers = {
    onJoin(id, info){
      const actor = createActor({ color: colorFor(info.name), hair: hairFor(info.name),
                                  long: info.look === 'long' });
      scene.add(actor.group);
      actor.setHand(look.dark > 0.5);
      /* 남의 아이를 따로 만들지 않는다 — 정원에 아이는 하나뿐이다.
         다만 그 사람이 **나와 같은 아이**(같은 코드)를 데리고 있으면,
         둘 중 하나만 움직여야 두 화면에서 같은 자리에 있다. 누가 움직일지는
         id 가 작은 쪽으로 정한다 — 양쪽이 같은 답을 내므로 의논이 필요 없다. */
      const entry = { actor, label: makeLabel(info.name), s: { x:0, y:0, z:0, ry:0, speed:0 },
                      started: false,
                      petKey: info.pet ? keyOf({ ...info.pet, name: info.dog }) : '' };
      peers.set(id, entry);
      pickDriver();
      updateCount();
    },
    onState(id, s){
      const p = peers.get(id);
      if (!p) return;
      p.s = s;
      if (s.reach) p.actor.reach(0.6);
      if (!!p.throwing !== !!s.throwing){ p.throwing = !!s.throwing; pickDriver(); }
      if (!p.started){
        p.actor.group.position.set(s.x, 0, s.z);
        p.started = true;
      }

      // 맡은 사람이 알려 주는 공
      if (s.ball && id === driver){
        const m = BALL_MODES[s.ball.mode] || 'none';
        ball.mode = m;
        ball.mesh.visible = m !== 'none';
        ball.mesh.position.set(s.ball.x, s.ball.y, s.ball.z);
      }

      // 같은 아이를 맡은 사람이 보내 주는 자리
      if (s.pet && id === driver){
        const e = myPet;
        e.rx = s.pet.x; e.rz = s.pet.z; e.rry = s.pet.ry;
        e.rsp = s.pet.speed; e.rgreet = s.pet.greet; e.rtrick = s.pet.trick;
        if (!e.rStarted){
          e.rStarted = true;
          e.actor.group.position.set(s.pet.x, 0, s.pet.z);
          e.actor.group.rotation.y = s.pet.ry;
        }
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
      peers.delete(id);
      pickDriver();          // 맡고 있던 사람이면 내가 다시 움직인다
      updateCount();
    }
  };

  // net 보다 먼저 불린다 (손님이 들어올 때). net 을 들여다보지 말 것.
  function updateCount(){ paintCount(); }

  function paintCount(){
    const n = peers.size + 1;
    countEl.textContent = n + ' / ' + CAPACITY;
    const where = n >= CAPACITY ? '자리가 찼어요' : '';
    countEl.title = where ? where + ' · ' + netSaid : netSaid;
    const hint = $('chHow');
    if (hint) hint.textContent = netSaid;
  }

  // 접속 상태. strollers 가 손님을 넣을 때 updateCount 가 이것을
  // 들여다보므로 반드시 먼저 만들어 둔다 (안 그러면 TDZ 오류가 난다).
  let netSaid = '잇는 중';

  // 거니는 손님들. 열린 정원에만 있고 내가 판 채널은 조용하다.
  const strollers = createLocalNet({ world, handlers, channel });

  // 같은 채널에 들어온 실제 사람들. 못 붙어도 정원은 그대로 거닐 수 있다.
  const net = createLiveNet({
    handlers, channel,
    id: myId,
    me: { name: myName, look: myLook, dog: myCard.name,
          // '랜덤' 을 그대로 보내면 받는 쪽에서 다른 털빛이 된다.
          // 이미 뽑힌 값을 보내야 같은 아이가 된다.
          pet: { kind: myCard.kind, breed: myCard.breed, coat: myCard.coat } },
    onStatus(s){ netSaid = s; paintCount(); }
  });
  updateCount();

  /* ── 조작 ── */
  const controls = createControls(canvas, { stick: $('stick'), knob: $('knob') });
  let lastYaw = 0;              // 카메라가 보는 쪽 — 공은 이쪽으로 던진다

  /* ── 공 ──
     한 정원에 공도 하나다. 던지면 날아가 튀다 멎고, 아이가 물어다 준다.
     움직이는 일은 아이를 맡은 사람만 한다 (pickDriver). 다른 사람은
     보내온 자리에 놓기만 한다 — 아이와 같은 규칙이다. */
  const BALL_R = 0.12;
  const BALL_MODES = ['none', 'fly', 'rest', 'held'];
  const ball = {
    mesh: new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 14, 10), toon(0xFF8FA3)),
    mode: 'none',
    v: new THREE.Vector3()
  };
  ball.mesh.visible = false;
  scene.add(ball.mesh);

  function throwBall(){
    if (!myPet) return;
    const from = me.group.position;
    /* 다리나 작은 섬에서 던지면 아이가 가져다줄 수가 없다 — 아이는
       들판을 벗어나지 않는다. 건너와서 던지라고 알려 준다. */
    if (Math.hypot(from.x, from.z) > world.radius - 2){
      myLabel.say('들판에서 던져요', 1900);
      return;
    }
    const dx = -Math.sin(lastYaw), dz = -Math.cos(lastYaw);   // 보는 쪽 앞으로
    ball.mesh.position.set(from.x + dx * 0.35, 0.78, from.z + dz * 0.35);
    ball.v.set(dx * 7.6, 5.0, dz * 7.6);
    ball.mode = 'fly';
    ball.mesh.visible = true;

    myPet.fetch = 'go';
    myPet.order = null;
    myPet.called = false;
    myPet.follows = null;
    myPet.rest = 0;
    myPet.actor.stopTrick();
    myPet.label.say('!', 1400);

    throwing = true;            // 물어올 때까지 내가 맡는다
    pickDriver();
  }

  /* 날아가고 튀는 일. 맡은 사람만 부른다. */
  function stepBall(dt){
    const p = ball.mesh.position;
    if (ball.mode === 'fly'){
      ball.v.y -= 17 * dt;
      p.x += ball.v.x * dt; p.y += ball.v.y * dt; p.z += ball.v.z * dt;
      // 들판 밖으로는 안 나간다 — 구름 위로 날아가 버리면 못 찾는다
      const at = inGarden(p.x, p.z);
      if (Math.hypot(at.x - p.x, at.z - p.z) > 0.01){
        p.x = at.x; p.z = at.z;
        ball.v.x *= -0.4; ball.v.z *= -0.4;
      }
      if (p.y <= BALL_R){
        p.y = BALL_R;
        if (Math.abs(ball.v.y) < 1.4){ ball.mode = 'rest'; ball.v.set(0, 0, 0); }
        else { ball.v.y = -ball.v.y * 0.45; ball.v.x *= 0.72; ball.v.z *= 0.72; }
      }
    } else if (ball.mode === 'held' && myPet){
      // 입에 물고 있다 — 주둥이 앞쪽에 붙인다
      const g = myPet.actor.group;
      p.set(g.position.x + Math.sin(g.rotation.y) * 0.24,
            Math.max(BALL_R, myPet.actor.headTop * 0.58),
            g.position.z + Math.cos(g.rotation.y) * 0.24);
    }
  }

  /* 오른쪽 단추 셋 */
  $('actBall').addEventListener('click', throwBall);
  $('actSit').addEventListener('click', () => orderKind('sit'));
  $('actPaw').addEventListener('click', () => orderKind('paw'));

  /* ── 반려동물 코드 ── */
  let myCode = makeCode(myCard);
  $('myCode').textContent = myCode;
  $('myPetName').textContent = myCard.name;
  whoEl.textContent = myName + ' · ' + myCard.name;
  whoEl.title = mySpec.breedName + ' · ' + mySpec.coatName;

  /* 아이를 갈아 끼운다. 한 정원에 아이는 하나뿐이라 더하는 것이 아니라
     바꾸는 것이다. */
  function swapPet(card){
    const i = pets.indexOf(myPet);
    if (i >= 0) pets.splice(i, 1);
    scene.remove(myPet.actor.group);
    myPet.actor.dispose();
    myPet.label.remove();

    myCard = card;
    myKey = keyOf(card);
    mySpec = resolvePet(card);
    myPet = addPet(mySpec, card.name, me.group);
    myCode = makeCode(card);
    $('myCode').textContent = myCode;
    $('myPetName').textContent = card.name;
    whoEl.textContent = myName + ' · ' + card.name;
    whoEl.title = mySpec.breedName + ' · ' + mySpec.coatName;
    driver = null;
    pickDriver();
  }

  const chLabel = showChannel(channel);
  whereEl.textContent = chLabel;
  $('chWho').textContent = chLabel;
  $('chShown').textContent = channel === PUBLIC ? '열린 정원 — 코드가 없어요' : chLabel;

  $('copyCh').addEventListener('click', async () => {
    const link = inviteLink(channel);
    try {
      await navigator.clipboard.writeText(link);
      tell('초대 링크를 복사했어요. 이 링크로 들어오면 같은 채널이에요.');
    } catch (_){
      window.prompt('이 링크를 복사해 보내세요', link);
    }
  });

  const panel = $('codePanel');
  const said = $('codeSaid');

  function tell(text, bad){
    said.textContent = text;
    said.classList.toggle('no', !!bad);
  }

  $('codeOpen').addEventListener('click', () => { tell(''); panel.hidden = false; });
  $('closeCode').addEventListener('click', () => { panel.hidden = true; });
  panel.addEventListener('click', e => { if (e.target === panel) panel.hidden = true; });

  $('copyCode').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(myCode);
      tell('코드를 복사했어요. 친구에게 보내세요.');
    } catch (_){
      // 복사가 막힌 곳에서는 직접 고를 수 있게 띄워 준다
      window.prompt('이 코드를 복사해 보내세요', myCode);
    }
  });

  $('addCodeBtn').addEventListener('click', () => {
    const found = readCodes($('addCode').value);
    if (!found.length){
      tell('코드를 읽지 못했어요. 다시 확인해 주세요.', true);
      return;
    }
    // 한 마리뿐이므로 더하는 것이 아니라 **바꾼다**
    const f = found[0];
    swapPet({ kind: f.kind, breed: f.breed, coat: f.coat, name: f.name });
    $('addCode').value = '';
    tell(f.name + ' 로 바뀌었어요. 정원에 아이는 한 마리예요.');
  });

  /* ── 대화 ── */
  /** 적은 말 안에 이름이 들어 있으면 그 아이가 달려온다. */
  function callByName(text){
    const came = [];
    for (const e of pets){
      if (!e.name || !text.includes(e.name)) continue;
      e.called = true;
      e.follows = null;      // 부름이 먼저다
      e.rest = 0;
      e.label.say('!', 1800);
      came.push(e.name);
    }
    return came;
  }

  /* 재주 시키기.
     "코" 와 "손" 은 한 글자라 다른 말 안에 쉽게 끼어든다 (코드 · 손님).
     앞뒤가 글자가 아닐 때만 그 말로 본다. */
  const SAYS = [
    ['sit',  /앉아|앉자|앉어|앉으/],
    ['down', /엎드|엎디/],
    ['nose', /(^|[^가-힣A-Za-z])코([^가-힣A-Za-z]|$)/],
    ['paw',  /(^|[^가-힣A-Za-z])손([^가-힣A-Za-z]|$)/]
  ];

  function readTrick(text){
    for (const [kind, re] of SAYS) if (re.test(text)) return kind;
    return null;
  }

  /* 누구에게 시키는가 — 이름을 부르면 그 아이, 아니면 내 아이.
     남의 아이에게도 이름을 부르면 시킬 수 있다. */
  /* 종류를 바로 시킨다. 대화창에서도, 오른쪽 단추에서도 여기로 온다. */
  function orderKind(kind, named){
    const who = (named && named.length)
      ? named : pets.filter(e => e.owner === me.group && !e.remote);
    if (!who.length) return false;
    for (const e of who){
      e.order = kind;
      e.called = false;      // 부름이 아니라 시킴이다
      e.follows = null;
      e.fetch = null;        // 물어오던 것도 그만둔다
      e.rest = 0;
      e.label.say(TRICKS[kind].word, 1700);
    }
    return true;
  }

  function order(text){
    const kind = readTrick(text);
    if (!kind) return false;
    return orderKind(kind, pets.filter(e => e.name && text.includes(e.name)));
  }

  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = chatIn.value.trim().slice(0, 60);
    chatIn.value = '';
    chatIn.blur();
    if (!text) return;
    myLabel.say(text);
    net.say(text);
    // 재주가 먼저다. "콩이야 앉아" 면 부르는 대신 와서 앉는다.
    if (!order(text)) callByName(text);
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
    lastYaw = cam.yaw;
    if (!driver) stepBall(dt);       // 공은 아이를 맡은 사람이 움직인다

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

    /* 반려동물 — 저마다 거닐다, 주인을 만나면 반가워한다 */
    for (const e of pets){
      /* 남의 아이는 주인의 기기에서 살아 있다. 여기서는 보내온 자리로
         옮기기만 한다 — 따로 거닐게 하면 화면마다 다른 데 있게 된다. */
      if (e.remote){
        const g = e.actor.group;
        if (!e.rStarted){ e.actor.update(dt, 0); continue; }
        const k = Math.min(1, dt * 14);
        g.position.x += (e.rx - g.position.x) * k;
        g.position.z += (e.rz - g.position.z) * k;
        let turn = e.rry - g.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        g.rotation.y += turn * Math.min(1, dt * TURN);
        // 반기는 것도 주인이 알려 준다. 한 번 시작하면 끝까지 두고,
        // 주인이 그만둘 때까지는 다시 걸지 않는다.
        /* 주인이 보내 준 재주. 꾸러미가 올 때마다 짧게 다시 걸어서,
           주인 쪽 소식이 끊기면 저절로 풀리게 한다. */
        if (e.rtrick){
          if (e.trickSeen !== e.rtrick){
            e.trickSeen = e.rtrick;
            e.label.say(TRICKS[e.rtrick] ? TRICKS[e.rtrick].word : '', 1700);
          }
          e.actor.doTrick(e.rtrick, 0.6);
        } else {
          e.trickSeen = null;
          if (e.rgreet){
            if (!e.greetSeen){
              e.greetSeen = true;
              e.actor.startGreet();
              e.label.say('♥', 2600);
            }
          } else e.greetSeen = false;
        }
        e.actor.update(dt, e.rsp || 0);
        continue;
      }

      /* 재주를 부리는 동안에는 걸음을 멈춘다 */
      if (e.actor.trickNow()){
        step(e, dt, 0);
        continue;
      }

      /* 던진 공을 물어온다. 가서 물고, 나에게 가져와 내려놓는다. */
      if (e === myPet && e.fetch){
        const at = e.actor.group.position;
        const toBall = e.fetch === 'go';
        const want = toBall ? 0.42 : 1.15;
        const aim = toBall ? ball.mesh.position : me.group.position;
        const to = inGarden(aim.x, aim.z);
        const gap = Math.hypot(to.x - at.x, to.z - at.z);
        if (gap > want){
          step(e, dt, walk(e.actor.group, (to.x - at.x) / gap,
                           (to.z - at.z) / gap, e.trot, dt));
          continue;
        }
        if (toBall){
          // 아직 날아가는 중이면 곁에서 기다린다
          if (ball.mode !== 'fly'){ ball.mode = 'held'; e.fetch = 'back'; }
        } else {
          ball.mode = 'rest';
          ball.mesh.position.y = BALL_R;
          e.actor.group.rotation.y =
            Math.atan2(me.group.position.x - at.x, me.group.position.z - at.z);
          e.fetch = null;
          e.greetWait = 0;       // 가져다주고 반긴다
          e.follows = e.owner;
          throwing = false;
          pickDriver();
        }
        step(e, dt, 0);
        continue;
      }

      /* 시킨 재주 — 와서 한다.
         "앉아 · 엎드려" 는 두어 걸음 앞까지, "코 · 손" 은 닿을 만큼
         바짝 와야 한다. 제자리에서 하게 두면 저 멀리서 앉아 버려
         보이지도 않는다. */
      if (e.order){
        const spec = TRICKS[e.order];
        const mine = me.group.position;
        let tx = mine.x, tz = mine.z;
        if (spec.hand){
          // 내민 손 곁으로. 캐릭터가 바라보는 쪽을 기준으로 왼앞이다.
          const a = me.group.rotation.y;
          const cos = Math.cos(a), sin = Math.sin(a);
          tx += HAND_SPOT.x * cos + HAND_SPOT.z * sin;
          tz += -HAND_SPOT.x * sin + HAND_SPOT.z * cos;
        }
        const at = e.actor.group.position;
        const gap = Math.hypot(tx - at.x, tz - at.z);
        if (gap > spec.near){
          /* 아이는 들판을 벗어나지 않는다. 그냥 나를 향해 걸리면
             `resolve` 가 다리도 작은 섬도 걸을 수 있는 자리로 봐서,
             다리를 건너 작은 섬까지 따라온다. */
          const to = inGarden(tx, tz);
          const toGap = Math.hypot(to.x - at.x, to.z - at.z);
          // 갈 자리가 들판 밖으로 밀렸다면 내가 다리나 작은 섬에 있는 것이다
          const out = Math.hypot(to.x - tx, to.z - tz) > 0.6;
          if (out && toGap < 0.6){
            e.order = null;       // 들판 끝까지 왔는데도 못 닿는다
            e.rest = 0.8;
            wander(e);
            step(e, dt, 0);
            continue;
          }
          /* 포기하는 거리를 코·손이 닿아야 할 거리(0.3m)보다 넓게 잡으면
             거의 다 와서 그만둔다. 밀렸는지로만 판단해야 한다. */
          step(e, dt, walk(e.actor.group, (to.x - at.x) / toGap,
                           (to.z - at.z) / toGap, e.trot, dt));
          continue;
        }
        // 자리에 왔으면 나를 바라본다
        e.actor.group.rotation.y = Math.atan2(mine.x - at.x, mine.z - at.z);
        e.actor.doTrick(e.order);
        // 코와 손은 받아 주는 쪽이 있어야 한다
        if (spec.hand) me.reach(spec.hold);
        e.order = null;
        e.greetWait = GREET_AGAIN;      // 재주 끝에 곧바로 반기면 겹친다
        e.follows = e.owner;
        step(e, dt, 0);
        continue;
      }

      if (e.greetWait > 0) e.greetWait -= dt;

      // 가족이 곁에 오면 알아본다. 한 번 반긴 뒤에는 잠시 쉬었다 다시.
      if (e.greetWait <= 0 && !e.actor.greeting()){
        for (const who of e.family){
          const ox = who.position.x - e.actor.group.position.x;
          const oz = who.position.z - e.actor.group.position.z;
          if (Math.hypot(ox, oz) >= GREET_RANGE) continue;
          e.greetWait = GREET_AGAIN;
          e.called = false;              // 불러서 왔든 아니든, 다 왔다
          // 반가워하는 것과 따라다니는 것은 다르다. 남의 아이는 나를 보고
          // 반겨 주지만, 그러고 나면 제 주인에게로 간다. 주인이 정원에
          // 없으면 다시 혼자 거닌다.
          e.follows = e.owner;
          if (Math.random() < GREET_CHANCE){
            e.actor.startGreet();
            e.actor.group.rotation.y = Math.atan2(ox, oz);   // 그 사람을 바라본다
            e.label.say('♥', 2600);
          }
          break;
        }
      }

      // 반가워하는 동안에는 걸음을 멈춘다
      if (e.actor.greeting()){
        step(e, dt, 0);
        continue;
      }

      /* 이름을 들었으면 아무리 멀어도 곧장 달려온다. */
      if (e.called){
        const at = e.actor.group.position;
        const dx = me.group.position.x - at.x;
        const dz = me.group.position.z - at.z;
        const gap = Math.hypot(dx, dz);
        if (gap > GREET_RANGE){
          // 부름도 들판 안까지다 (시킴과 같은 까닭)
          const to = inGarden(me.group.position.x, me.group.position.z);
          const near = Math.hypot(to.x - at.x, to.z - at.z);
          if (near > 0.45){
            step(e, dt, walk(e.actor.group, (to.x - at.x) / near,
                             (to.z - at.z) / near, e.trot, dt));
            continue;
          }
          e.called = false;      // 들판 끝까지 왔는데도 멀다 — 내가 밖에 있다
          e.rest = 0.8;
          wander(e);
          step(e, dt, 0);
          continue;
        }
        // 다 왔다. 쉬는 참이었어도 바로 반기도록 기다림을 지운다.
        // (반기기가 먼저 걸리는 경우에는 위 반기기 쪽에서 이미 지웠다.)
        e.called = false;
        e.greetWait = 0;
      }

      /* 만난 사람을 따라다닌다. 사람이 빨라 멀찍이 벌어지면 놓친 것으로
         보고 다시 정원을 거닌다 — 그러면 또 만날 일이 생긴다. */
      if (e.follows){
        const at = e.actor.group.position;
        const dx = e.follows.position.x - at.x;
        const dz = e.follows.position.z - at.z;
        const gap = Math.hypot(dx, dz);

        if (gap > FOLLOW_LOSE){
          e.follows = null;
          e.rest = 0.5;
          wander(e);
        } else if (gap > FOLLOW_GO){
          // 멈출 자리를 지나치지 않을 만큼만. 도우미 step 과 이름이
          // 겹치면 안 된다 — 지역 변수가 가려서 그 자리에서 터진다.
          const pace = Math.min(e.trot, (gap - FOLLOW_STOP) / Math.max(dt, 1e-4));
          step(e, dt, walk(e.actor.group, dx / gap, dz / gap, pace, dt));
          continue;
        } else {
          step(e, dt, 0);
          continue;
        }
      }

      if (e.rest > 0){
        e.rest -= dt;
        step(e, dt, 0);
        continue;
      }
      const at = e.actor.group.position;
      const dx = e.tx - at.x, dz = e.tz - at.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5){
        // 내 곁이면 좀 더 머물다 간다
        const near = Math.hypot(me.group.position.x - at.x, me.group.position.z - at.z) < 3.2;
        e.rest = near ? 2.5 + Math.random() * 4 : 0.6 + Math.random() * 2.4;
        wander(e);
        step(e, dt, 0);
      } else {
        step(e, dt, walk(e.actor.group, dx / d, dz / d, e.speed, dt));
      }
    }

    /* 다른 사람들 */
    strollers.update(dt);       // 거니는 손님
    net.update(dt);             // 접속한 사람

    /* 내 모습과 내 아이의 자리를 알린다. 아이는 주인인 내 기기에서만
       살아 있으므로, 내가 보내지 않으면 남의 화면에서는 멈춰 있다. */
    net.sendState(
      { x: me.group.position.x, z: me.group.position.z,
        ry: me.group.rotation.y, speed: mySpeed },
      // 남이 맡고 있으면 보내지 않는다 — 둘이 같이 보내면 서로 밀친다
      (myPet && !myPet.remote) ? { x: myPet.actor.group.position.x,
                z: myPet.actor.group.position.z,
                ry: myPet.actor.group.rotation.y,
                speed: myPet.lastSpeed,
                greet: myPet.actor.greeting(),
                trick: myPet.actor.trickNow() } : null,
      me.reaching(), throwing,
      driver ? null : { x: ball.mesh.position.x, y: ball.mesh.position.y,
                        z: ball.mesh.position.z,
                        mode: BALL_MODES.indexOf(ball.mode) });
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

    /* 시간대 — 새벽 · 아침 · 낮 · 노을 · 밤.
       빛은 천천히 바뀌므로 몇 초에 한 번만 다시 재면 충분하다. */
    skyWait -= dt;
    if (skyWait <= 0){
      skyWait = 2;
      look = lookNow();
      if (look.label !== whenEl.textContent) whenEl.textContent = look.label;
      // 어두우면 등불, 밝으면 바람개비
      const dark = look.dark > 0.5;
      me.setHand(dark);
      for (const p of peers.values()) p.actor.setHand(dark);
      if (themeMeta){
        themeMeta.setAttribute('content', '#' + look.sky.toString(16).padStart(6, '0'));
      }
    }
    applyLook(look, { scene, hemi, sun, stars, disc: sunDisc, follow: t });
    sun.target.position.copy(t);
    sun.target.updateMatrixWorld();

    renderer.render(scene, camera);

    place(myLabel, me.headTop, me.group);
    for (const e of pets) place(e.label, e.actor.headTop, e.actor.group);
    for (const p of peers.values()){
      place(p.label, p.actor.headTop, p.actor.group);
    }

    if (first){ first = false; $('loading').hidden = true; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
