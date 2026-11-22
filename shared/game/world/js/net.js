import { resolve } from '#world';
import { CAPACITY, PUBLIC } from '#channel';
import { serverNow } from '../../../js/clock.js?v=k1';

/*
 * 네트워크 자리.
 *
 * 지금은 접속 기능이 없으므로 local 구현만 있다. 정원을 거니는 손님
 * 몇 명이 "다른 접속자"와 똑같은 통로(onJoin / onState / onSay /
 * onLeave)로 들어온다.
 *
 * 나중에 실시간 연결을 붙일 때는 아래 모양의 객체를 하나 더 만들어
 * main.js 에서 바꿔 끼우기만 하면 된다. 게임 쪽 코드는 손대지 않는다.
 *
 *   createXxxNet({ world, handlers, channel }) => {
 *     mode,                         // 화면에 표시할 접속 상태
 *     channel,                      // 지금 있는 채널
 *     count(),                      // 나를 포함한 사람 수
 *     full(),                       // 서른 명이 찼는가
 *     sendState({x, y, z, ry}),     // 내 위치 (y 는 뛴 높이)
 *     say(text),
 *     update(dt)
 *   }
 *
 * 한 채널에 CAPACITY(30) 명까지. 지금은 혼자이므로 늘 여유가 있지만,
 * 자리가 찼을 때 막는 일은 접속을 붙이는 쪽에서 이 `full()` 을 보고 한다.
 */

/* 한 정원에 아이는 한 마리뿐이다. 그래서 거니는 손님은 아이를 데려오지
   않는다 — 예전에는 데려왔고, 그 탓에 코드를 넣으면 셋이 보였다. */
const GUESTS = [
  { name: '햇살',   look: 'short' },
  { name: '민들레', look: 'long'  }
];

const LINES = [
  '오늘 볕이 좋다',
  '여기 앉아 있으면 마음이 놓여',
  '저 무지개 아래까지 가보자',
  '연못에 비친 하늘 봤어?',
  '천천히 가도 괜찮아',
  '꽃밭 한 바퀴 돌고 올게',
  '바람이 부드럽다',
  '같이 쉬었다 갈래?'
];

const GUEST_SPEED = 1.5;      // 손님은 느긋하게 거닌다

/*
 * 손님은 **모두의 화면에서 같은 자리에** 있다 (사용자 요청 — "손님·풍경도 똑같이").
 *
 * 예전에는 화면마다 제멋대로(Math.random) 거닐어서 사람마다 다른 데 보였다.
 * 이제는 손님이 걷는 길을 **고정 씨앗**으로 미리 짜 두고, 지금 그 길의 어디쯤인지를
 * **서버 시각**(clock.js)으로만 정한다. 같은 씨앗 · 같은 시각이면 누구 화면이든 같은
 * 자리 · 같은 방향 · 같은 말이다. 주고받는 것이 없으니 끊겨도 어긋나지 않는다.
 *
 * - 길은 들판 안의 점 몇 개를 잇는다. 점과 점 사이를 촘촘히 따져 덤불 · 나무에 걸리지
 *   않는 것만 고른다. 둘레에 여유(CLEAR)를 두고 따지는 것은, 기기마다 삼각함수의
 *   마지막 자리가 아주 조금 달라도 같은 길을 고르게 하려는 것이다.
 * - 갔던 길을 되짚어 돌아오므로 마지막 점에서 처음으로 건너뛰는 일이 없다.
 * - 손님은 밀리지 않는다 — 밀리면 화면마다 자리가 달라진다. 대신 내가 손님에게서
 *   비켜선다 (main.js 의 keepApart 는 움직이는 쪽만 민다).
 * - 말도 시각으로 정한다. SAY 초마다 한 칸, 칸마다 말할지 · 언제 · 무엇을.
 */
const LEGS = 14;              // 길의 점 수 (가는 길)
const CLEAR = 0.35;           // 길 둘레 여유 (m)
const STEP = 0.25;            // 길을 따질 때의 간격 (m)
const SAY = 17;               // 말 한 칸 (초)

// 같은 씨앗이면 어디서나 같은 수 — 정수 연산만 쓴다
function rng(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mixSeed = (a, b) => (Math.imul(a, 0x9E3779B1) ^ Math.imul(b + 0x632BE5AB, 0x85EBCA77)) >>> 0;

/** 그 자리에 서도 되는가 — 둘레 여유까지 덤불 · 나무 · 들판 밖이 아닌지. */
function free(world, x, z){
  for (const [ox, oz] of [[0, 0], [CLEAR, 0], [-CLEAR, 0], [0, CLEAR], [0, -CLEAR]]){
    const p = resolve(world, x + ox, z + oz);
    if (Math.abs(p.x - x - ox) > 1e-6 || Math.abs(p.z - z - oz) > 1e-6) return false;
  }
  return true;
}
function clearLine(world, a, b){
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(d / STEP));
  for (let k = 1; k <= n; k++){
    const f = k / n;
    if (!free(world, a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f)) return false;
  }
  return true;
}

/** 손님 i 의 길 — 다리들(가는 길 + 되짚는 길)과 한 바퀴 길이. */
function buildRoute(world, i){
  const r = rng(mixSeed(0xA11CE, i));
  const R = world.radius - 7;
  const pick = () => {                       // 들판 안 아무 데나 (삼각함수 없이)
    for (let t = 0; t < 200; t++){
      const x = (r() * 2 - 1) * R, z = (r() * 2 - 1) * R;
      if (x * x + z * z >= 9 && x * x + z * z <= R * R && free(world, x, z)) return { x, z };
    }
    return { x: 0, z: 0 };
  };
  const pts = [pick()];
  while (pts.length <= LEGS){
    const a = pts[pts.length - 1];
    let next = null;
    for (let t = 0; t < 40 && !next; t++){
      const c = pick();
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d > 2 && d < 16 && clearLine(world, a, c)) next = c;
    }
    pts.push(next || a);                     // 못 찾으면 그 자리에서 쉬기만 한다
  }
  const way = [...pts, ...pts.slice(0, -1).reverse()];   // 갔다가 되짚어 온다
  const legs = [];
  let t = 0;
  for (let k = 1; k < way.length; k++){
    const a = way[k - 1], b = way[k];
    const walk = Math.hypot(b.x - a.x, b.z - a.z) / GUEST_SPEED;
    const rest = 1 + r() * 3.5;
    legs.push({ a, b, t0: t, walk, rest, ry: Math.atan2(b.x - a.x, b.z - a.z) });
    t += walk + rest;
  }
  return { legs, period: t, shift: r() * t };
}

/** 그 시각(초)에 손님이 어디서 무엇을 하는가. */
function placeAt(route, sec){
  let u = (sec + route.shift) % route.period;
  if (u < 0) u += route.period;
  const L = route.legs;
  let lo = 0, hi = L.length - 1;
  while (lo < hi){ const mid = (lo + hi + 1) >> 1; if (L[mid].t0 <= u) lo = mid; else hi = mid - 1; }
  const g = L[lo];
  const e = u - g.t0;
  if (e < g.walk){
    const f = e / g.walk;
    return { x: g.a.x + (g.b.x - g.a.x) * f, z: g.a.z + (g.b.z - g.a.z) * f, ry: g.ry, speed: GUEST_SPEED };
  }
  return { x: g.b.x, z: g.b.z, ry: g.ry, speed: 0 };
}

/** 그 말 칸에 손님 i 가 말한다면 언제(초) 무엇을. 안 하면 null. */
function lineIn(i, slot){
  const r = rng(mixSeed(slot | 0, 0x5A7 + i));
  if (r() > 0.6) return null;
  return { at: slot * SAY + r() * SAY, text: LINES[Math.floor(r() * LINES.length)] };
}

/* `place` 는 예전 모양을 지키려고 받아만 둔다 — 손님은 이제 밀리지 않는다. */
export function createLocalNet({ world, handlers, channel = PUBLIC, now = serverNow }){
  // 열린 정원에는 거니는 사람들이 있고, 내가 판 채널은 조용하다 —
  // 코드를 받은 사람이 들어오기 전까지는.
  const here = channel === PUBLIC ? GUESTS : [];
  const guests = here.map((g, i) => {
    const guest = { id: 'local-' + i, i, route: buildRoute(world, i) };
    handlers.onJoin(guest.id, { name: g.name, look: g.look, dog: g.dog, pet: g.pet });
    return guest;
  });
  let lastSec = now() / 1000;

  return {
    mode: 'local',
    channel,
    capacity: CAPACITY,
    count(){ return guests.length + 1; },        // 손님들 + 나
    full(){ return this.count() >= CAPACITY; },
    sendState(){},
    say(){},
    toss(){},        // 거니는 손님은 공을 던지지 않는다
    setPet(){},      // 알릴 상대가 없다
    setMe(){},
    feed(){},        // 거니는 손님은 밥을 주지 않는다

    update(){
      const sec = now() / 1000;
      for (const g of guests){
        const p = placeAt(g.route, sec);
        handlers.onState(g.id, { x: p.x, y: 0, z: p.z, ry: p.ry, speed: p.speed });
        // 지난 프레임과 이번 프레임 사이에 말할 때가 있었으면 말한다
        if (sec > lastSec && sec - lastSec < SAY){
          for (let slot = Math.floor(lastSec / SAY); slot <= Math.floor(sec / SAY); slot++){
            const l = lineIn(g.i, slot);
            if (l && l.at > lastSec && l.at <= sec) handlers.onSay(g.id, l.text);
          }
        }
      }
      lastSec = sec;
    }
  };
}

/* 시험용 — 같은 시각이면 어디서나 같은 자리인지 재 볼 때 쓴다 */
export const _guestAt = (world, i, sec) => placeAt(buildRoute(world, i), sec);
