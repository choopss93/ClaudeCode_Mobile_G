import { resolve } from './world.js';

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
 *   createXxxNet({ world, handlers }) => {
 *     mode,                         // 화면에 표시할 접속 상태
 *     sendState({x, y, z, ry}),     // 내 위치 (y 는 뛴 높이)
 *     say(text),
 *     update(dt)
 *   }
 */

const GUESTS = [
  { name: '햇살', dog: '구름' },
  { name: '민들레', dog: '보리' }
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

const HOP_DIST = 1.25;
const HOP_TIME = 0.42;
export const HOP_HEIGHT = 0.5;

export function createLocalNet({ world, handlers }){
  const guests = [];

  GUESTS.forEach((g, i) => {
    const ang = (i / GUESTS.length) * Math.PI * 2 + 1.2;
    const guest = {
      id: 'local-' + i,
      x: Math.cos(ang) * 5.5,
      z: Math.sin(ang) * 5.5,
      ry: 0,
      fromX: 0, fromZ: 0, toX: 0, toZ: 0,
      hop: 0, hopping: false,
      rest: 0.6 + Math.random() * 1.6,
      sayIn: 6 + Math.random() * 10,
      tx: 0, tz: 0
    };
    pickTarget(guest);
    guests.push(guest);
    handlers.onJoin(guest.id, { name: g.name, dog: g.dog });
  });

  function pickTarget(g){
    const ang = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * (world.radius - 7);
    const p = resolve(world, Math.cos(ang) * dist, Math.sin(ang) * dist);
    g.tx = p.x; g.tz = p.z;
  }

  function startHop(g){
    const dx = g.tx - g.x, dz = g.tz - g.z;
    const d = Math.hypot(dx, dz);
    if (d < HOP_DIST * 0.8){ pickTarget(g); return; }

    // 네 방향 중 목적지에 가까워지는 쪽으로만 뛴다
    const ux = Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0;
    const uz = ux === 0 ? Math.sign(dz) : 0;
    const p = resolve(world, g.x + ux * HOP_DIST, g.z + uz * HOP_DIST);

    // 벽에 막혀 거의 제자리면 목적지를 바꾼다
    if (Math.hypot(p.x - g.x, p.z - g.z) < HOP_DIST * 0.35){ pickTarget(g); return; }

    g.fromX = g.x; g.fromZ = g.z;
    g.toX = p.x;   g.toZ = p.z;
    g.ry = Math.atan2(ux, uz);
    g.hop = 0;
    g.hopping = true;
  }

  return {
    mode: 'local',
    sendState(){},
    say(){},

    update(dt){
      for (const g of guests){
        if (g.hopping){
          g.hop += dt / HOP_TIME;
          if (g.hop >= 1){
            g.hop = 0;
            g.hopping = false;
            g.x = g.toX; g.z = g.toZ;
            g.rest = 0.25 + Math.random() * 1.5;
          } else {
            g.x = g.fromX + (g.toX - g.fromX) * g.hop;
            g.z = g.fromZ + (g.toZ - g.fromZ) * g.hop;
          }
        } else {
          g.rest -= dt;
          if (g.rest <= 0) startHop(g);
        }

        handlers.onState(g.id, {
          x: g.x,
          y: g.hopping ? Math.sin(g.hop * Math.PI) * HOP_HEIGHT : 0,
          z: g.z,
          ry: g.ry,
          hop: g.hopping ? g.hop : 0
        });

        g.sayIn -= dt;
        if (g.sayIn <= 0){
          g.sayIn = 11 + Math.random() * 18;
          handlers.onSay(g.id, LINES[Math.floor(Math.random() * LINES.length)]);
        }
      }
    }
  };
}
