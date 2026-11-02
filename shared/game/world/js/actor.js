import * as THREE from 'three';
import { toon, makeBlob } from '#look';

/*
 * 머리가 크고 몸이 작은, 동글동글한 캐릭터.
 * 얼굴 지름(0.64)이 몸 높이(0.32)의 두 배다.
 */

const BODY_H = 0.32;          // 몸 높이
const HEAD_R = BODY_H;        // 머리 반지름 → 지름은 몸의 두 배
const LEG_H  = 0.17;
const BODY_Y = LEG_H + BODY_H / 2;
const HEAD_Y = BODY_Y + BODY_H / 2 + HEAD_R * 0.72;
export const HEAD_TOP = HEAD_Y + HEAD_R;

const ball = new THREE.SphereGeometry(1, 16, 12);
const eyeGeo = new THREE.SphereGeometry(0.042, 10, 8);

function piece(group, geo, mat, x, y, z, sx, sy, sz){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  group.add(m);
  return m;
}

export function createActor({ color = 0xF2A2A2, hair = 0x6B4A3A } = {}){
  const group = new THREE.Group();
  const skin = toon(0xFFE9D4);
  const cloth = toon(color);
  const hairMat = toon(hair);
  const dark = toon(0x5C5560);
  const blush = toon(0xFFB4C0);

  group.add(makeBlob(0.3));

  // 다리 — 짧고 동글한 발
  const legL = piece(group, ball, cloth, -0.085, LEG_H / 2, 0, 0.082, LEG_H / 2, 0.095);
  const legR = piece(group, ball, cloth,  0.085, LEG_H / 2, 0, 0.082, LEG_H / 2, 0.095);

  // 몸 — 작고 동그랗게
  piece(group, ball, cloth, 0, BODY_Y, 0, 0.19, BODY_H / 2, 0.165);

  // 팔 — 몸에 붙은 작은 방울
  const armL = piece(group, ball, cloth, -0.185, BODY_Y + 0.03, 0, 0.062, 0.085, 0.062);
  const armR = piece(group, ball, cloth,  0.185, BODY_Y + 0.03, 0, 0.062, 0.085, 0.062);

  // 머리 — 몸의 두 배
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  group.add(head);

  piece(head, ball, skin, 0, 0, 0, HEAD_R, HEAD_R * 0.96, HEAD_R * 0.92);
  // 머리칼 — 머리보다 조금 크게 덮어야 모자처럼 보인다. 작게 하면
  // 머리 안으로 파묻혀 깎인 자국처럼 보인다. 얼굴은 드러나게 뒤로 민다.
  piece(head, ball, hairMat, 0, HEAD_R * 0.22, -HEAD_R * 0.16,
        HEAD_R * 1.04, HEAD_R * 0.88, HEAD_R * 0.92);

  const fz = HEAD_R * 0.84;   // 얼굴이 향하는 면 (+Z)
  piece(head, eyeGeo, dark, -0.105, 0.015, fz, 1, 1.15, 0.7);
  piece(head, eyeGeo, dark,  0.105, 0.015, fz, 1, 1.15, 0.7);
  piece(head, ball, blush, -0.175, -0.07, fz * 0.86, 0.055, 0.035, 0.03);
  piece(head, ball, blush,  0.175, -0.07, fz * 0.86, 0.055, 0.035, 0.03);
  piece(head, ball, skin, 0, -0.04, fz * 1.02, 0.034, 0.03, 0.03);   // 코

  const LEG_Y = LEG_H / 2;
  let phase = 0, idle = Math.random() * 6;

  return {
    group,
    headTop: HEAD_TOP,

    /** speed: 초당 걷는 거리. 0 이면 가만히 서 있다. */
    update(dt, speed){
      idle += dt;
      const moving = speed > 0.05;

      if (moving){
        // 다리가 공 모양이라 돌려 봐야 표가 안 난다. 번갈아 들어 올린다.
        phase += dt * (5.5 + speed * 1.9);
        const sw = Math.sin(phase);
        legL.position.y = LEG_Y + Math.max(0, sw) * 0.07;
        legR.position.y = LEG_Y + Math.max(0, -sw) * 0.07;
        armL.rotation.x = -sw * 0.5;
        armR.rotation.x =  sw * 0.5;

        // 걸음마다 살짝 통통 — 머리가 크니 몸이 조금 늦게 따라온다
        group.position.y = Math.abs(sw) * 0.035;
        const squash = 1 + Math.sin(phase * 2) * 0.025;
        group.scale.set(2 - squash, squash, 2 - squash);
        head.position.y = HEAD_Y - Math.sin(phase * 2 - 0.6) * 0.012;
      } else {
        // 가만히 있을 때 숨 쉬듯 아주 천천히
        phase = 0;
        const breathe = Math.sin(idle * 1.5) * 0.012;
        group.position.y = 0;
        group.scale.set(1 - breathe, 1 + breathe, 1 - breathe);
        legL.position.y = legR.position.y = LEG_Y;
        armL.rotation.x = armR.rotation.x = 0;
        head.position.y = HEAD_Y + breathe * 0.4;
      }
    },

    dispose(){
      group.traverse(o => { if (o.isMesh && o.material.map) o.material.dispose(); });
    }
  };
}

/* ── 강아지 ── */

export const DOG_HEAD_TOP = 0.56;

export function createDog({ color = 0xEBC99A } = {}){
  const group = new THREE.Group();
  const fur = toon(color);
  const dark = toon(0x5C5560);
  const nose = toon(0xA1877A);

  group.add(makeBlob(0.24));

  const LEGY = 0.08;
  const legs = [];
  for (const [x, z] of [[-0.085, 0.1], [0.085, 0.1], [-0.085, -0.1], [0.085, -0.1]]){
    legs.push(piece(group, ball, fur, x, LEGY / 2 + 0.01, z, 0.047, LEGY, 0.047));
  }

  piece(group, ball, fur, 0, 0.21, -0.02, 0.145, 0.125, 0.185);   // 몸통

  const head = new THREE.Group();
  head.position.set(0, 0.34, 0.15);
  group.add(head);
  piece(head, ball, fur, 0, 0, 0, 0.145, 0.135, 0.13);
  piece(head, ball, fur, 0, -0.035, 0.115, 0.075, 0.062, 0.062);   // 주둥이
  piece(head, ball, nose, 0, -0.02, 0.17, 0.032, 0.028, 0.026);
  piece(head, eyeGeo, dark, -0.062, 0.03, 0.105, 0.78, 0.9, 0.6);
  piece(head, eyeGeo, dark,  0.062, 0.03, 0.105, 0.78, 0.9, 0.6);
  piece(head, ball, fur, -0.115, 0.055, -0.02, 0.05, 0.085, 0.035);  // 귀
  piece(head, ball, fur,  0.115, 0.055, -0.02, 0.05, 0.085, 0.035);

  const tail = piece(group, ball, fur, 0, 0.27, -0.18, 0.04, 0.075, 0.04);
  tail.rotation.x = -0.6;

  const DOG_LEG_Y = LEGY / 2 + 0.01;
  let t = Math.random() * 6, step = 0;

  return {
    group,
    headTop: DOG_HEAD_TOP,

    /** speed: 초당 걷는 거리. */
    update(dt, speed){
      t += dt;
      tail.rotation.z = Math.sin(t * 9) * 0.5;   // 꼬리는 늘 흔든다

      if (speed > 0.05){
        step += dt * (7 + speed * 2.2);
        const sw = Math.sin(step);
        // 앞뒤 다리가 어긋나게 — 네 발 짐승의 걸음새
        legs[0].position.y = DOG_LEG_Y + Math.max(0,  sw) * 0.05;
        legs[1].position.y = DOG_LEG_Y + Math.max(0, -sw) * 0.05;
        legs[2].position.y = DOG_LEG_Y + Math.max(0, -sw) * 0.05;
        legs[3].position.y = DOG_LEG_Y + Math.max(0,  sw) * 0.05;
        group.position.y = Math.abs(sw) * 0.022;
        head.rotation.x = Math.sin(step * 2) * 0.05;
      } else {
        step = 0;
        group.position.y = 0;
        for (const l of legs) l.position.y = DOG_LEG_Y;
        head.rotation.x = Math.sin(t * 1.8) * 0.04;
      }
    },

    dispose(){
      group.traverse(o => { if (o.isMesh && o.material.map) o.material.dispose(); });
    }
  };
}
