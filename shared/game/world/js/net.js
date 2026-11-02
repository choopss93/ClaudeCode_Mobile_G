import { resolve } from './world.js';

/*
 * 네트워크 자리.
 *
 * 지금은 접속 기능이 없으므로 local 구현만 있다. 임시 캐릭터 몇 명이
 * 맵을 돌아다니며 가끔 말을 거는데, 이들은 "다른 접속자"와 똑같은
 * 통로(onJoin / onState / onSay / onLeave)로 들어온다.
 *
 * 나중에 WebRTC 나 Firebase 를 붙일 때는 아래와 같은 모양의 객체를
 * 하나 더 만들어 main.js 에서 바꿔 끼우기만 하면 된다. 게임 쪽 코드는
 * 손대지 않는다.
 *
 *   createXxxNet({ world, me, handlers }) => {
 *     mode,                      // 화면에 표시할 접속 상태
 *     sendState({x, z, ry}),     // 내 위치를 남에게 알림
 *     say(text),                 // 내 말풍선을 남에게 알림
 *     update(dt)                 // 매 프레임
 *   }
 */

const NAMES = ['초록', '바다', '노을', '모래', '구름'];
const LINES = [
  '안녕!',
  '여기 좋다',
  '분수 앞에서 만나자',
  '저 집은 누구 거지',
  '한 바퀴 돌고 올게',
  '나무 그늘 시원하다',
  '같이 갈래?',
  '오늘 날씨 좋네'
];

export function createLocalNet({ world, handlers }){
  const npcs = [];

  for (let i = 0; i < 3; i++){
    const ang = (i / 3) * Math.PI * 2;
    const npc = {
      id: 'local-' + i,
      name: NAMES[i % NAMES.length],
      x: Math.cos(ang) * 7,
      z: Math.sin(ang) * 7,
      ry: 0,
      tx: 0, tz: 0,
      wait: Math.random() * 2,
      sayIn: 4 + Math.random() * 10
    };
    pickTarget(npc);
    npcs.push(npc);
    handlers.onJoin(npc.id, { name: npc.name });
  }

  function pickTarget(npc){
    const ang = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * (world.radius - 9);
    const p = resolve(world, Math.cos(ang) * dist, Math.sin(ang) * dist);
    npc.tx = p.x;
    npc.tz = p.z;
  }

  return {
    mode: 'local',

    // 접속 기능이 붙기 전까지 내 상태는 아무 데도 가지 않는다.
    sendState(){},
    say(){},

    update(dt){
      for (const npc of npcs){
        if (npc.wait > 0){
          npc.wait -= dt;
        } else {
          const dx = npc.tx - npc.x;
          const dz = npc.tz - npc.z;
          const d = Math.hypot(dx, dz);

          if (d < 0.5){
            npc.wait = 1 + Math.random() * 4;
            pickTarget(npc);
          } else {
            const step = Math.min(2.4 * dt, d);
            const p = resolve(world, npc.x + (dx / d) * step, npc.z + (dz / d) * step);
            // 밀려나 제자리면 가려던 곳을 포기한다 (벽에 붙어 버티지 않게)
            if (Math.hypot(p.x - npc.x, p.z - npc.z) < step * 0.25) pickTarget(npc);
            npc.x = p.x;
            npc.z = p.z;
            npc.ry = Math.atan2(dx, dz);
          }
        }

        handlers.onState(npc.id, { x: npc.x, z: npc.z, ry: npc.ry });

        npc.sayIn -= dt;
        if (npc.sayIn <= 0){
          npc.sayIn = 9 + Math.random() * 16;
          handlers.onSay(npc.id, LINES[Math.floor(Math.random() * LINES.length)]);
        }
      }
    }
  };
}
