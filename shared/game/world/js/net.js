import { resolve } from '#world';
import { CAPACITY, PUBLIC } from '#channel';

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

const GUESTS = [
  { name: '햇살',   look: 'short', dog: '구름', pet: { kind:'dog', breed:4, coat:'brown'  } },  // 웰시코기
  { name: '민들레', look: 'long',  dog: '단비', pet: { kind:'cat', breed:7, coat:'tuxedo' } }   // 메인쿤
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

export function createLocalNet({ world, handlers, channel = PUBLIC }){
  const guests = [];

  // 열린 정원에는 거니는 사람들이 있고, 내가 판 채널은 조용하다 —
  // 코드를 받은 사람이 들어오기 전까지는.
  const here = channel === PUBLIC ? GUESTS : [];

  here.forEach((g, i) => {
    const ang = (i / here.length) * Math.PI * 2 + 1.2;
    const guest = {
      id: 'local-' + i,
      x: Math.cos(ang) * 5.5,
      z: Math.sin(ang) * 5.5,
      ry: 0,
      speed: 0,
      rest: 0.6 + Math.random() * 1.6,
      sayIn: 6 + Math.random() * 10,
      tx: 0, tz: 0
    };
    pickTarget(guest);
    guests.push(guest);
    handlers.onJoin(guest.id, { name: g.name, look: g.look, dog: g.dog, pet: g.pet });
  });

  function pickTarget(g){
    const ang = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * (world.radius - 7);
    const p = resolve(world, Math.cos(ang) * dist, Math.sin(ang) * dist);
    g.tx = p.x; g.tz = p.z;
  }

  return {
    mode: 'local',
    channel,
    capacity: CAPACITY,
    count(){ return guests.length + 1; },        // 손님들 + 나
    full(){ return this.count() >= CAPACITY; },
    sendState(){},
    say(){},

    update(dt){
      for (const g of guests){
        if (g.rest > 0){
          g.rest -= dt;
          g.speed = 0;
        } else {
          const dx = g.tx - g.x, dz = g.tz - g.z;
          const d = Math.hypot(dx, dz);

          if (d < 0.4){
            // 도착했으니 잠시 쉬었다 다른 데로
            g.rest = 1 + Math.random() * 3.5;
            g.speed = 0;
            pickTarget(g);
          } else {
            const step = Math.min(GUEST_SPEED * dt, d);
            const p = resolve(world, g.x + (dx / d) * step, g.z + (dz / d) * step);
            // 덤불에 막혀 거의 제자리면 가려던 곳을 포기한다
            if (Math.hypot(p.x - g.x, p.z - g.z) < step * 0.3) pickTarget(g);
            g.x = p.x; g.z = p.z;
            g.ry = Math.atan2(dx, dz);
            g.speed = GUEST_SPEED;
          }
        }

        handlers.onState(g.id, { x: g.x, y: 0, z: g.z, ry: g.ry, speed: g.speed });

        g.sayIn -= dt;
        if (g.sayIn <= 0){
          g.sayIn = 11 + Math.random() * 18;
          handlers.onSay(g.id, LINES[Math.floor(Math.random() * LINES.length)]);
        }
      }
    }
  };
}
