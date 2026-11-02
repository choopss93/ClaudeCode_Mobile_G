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

/* ── 반려동물 ──
   품종 수치(pets.js)로 모양을 지어낸다. 강아지와 고양이는 바탕이 다르고,
   품종이 그 위에서 몸집·다리·주둥이·귀·꼬리·털을 흔든다. */

const KIND_BASE = {
  dog: { bodyL:0.185, bodyW:0.145, bodyH:0.125, legY:0.085, headR:0.145,
         muzzle:0.075, tailLen:0.075, tailThick:0.040, headFwd:0.150 },
  cat: { bodyL:0.195, bodyW:0.130, bodyH:0.115, legY:0.095, headR:0.135,
         muzzle:0.058, tailLen:0.105, tailThick:0.030, headFwd:0.145 }
};

export function createPet(spec){
  const K = KIND_BASE[spec.kind] || KIND_BASE.dog;
  const group = new THREE.Group();
  const inner = new THREE.Group();        // 품종별 크기를 여기에 건다
  inner.scale.setScalar(spec.scale);
  group.add(inner);

  const furColor = spec.base;
  const accentColor = spec.accent || spec.base;
  const fur = toon(furColor);
  const mark = toon(accentColor);         // 화이트블랙일 때 귀·꼬리끝·등무늬
  const dark = toon(0x4A4350);
  // 털빛이 짙으면 코를 밝게 둬야 보인다
  const nose = toon(spec.coatKey === 'black' ? 0x8C8498 : 0x8A6A5C);

  const bodyL = K.bodyL * spec.body[0];
  const bodyW = K.bodyW * spec.body[1] * spec.fluff;
  const bodyH = K.bodyH * spec.body[1] * spec.fluff;
  const legH  = K.legY * spec.legs;
  const bodyY = legH + bodyH * 0.72;

  group.add(makeBlob(0.2 * spec.scale * spec.body[0]));

  /* 다리 — 네 개 */
  const legs = [];
  const legX = bodyW * 0.62, legZ = bodyL * 0.52;
  for (const [x, z] of [[-legX, legZ], [legX, legZ], [-legX, -legZ], [legX, -legZ]]){
    legs.push(piece(inner, ball, fur, x, legH / 2 + 0.01, z,
                    0.046 * spec.body[1], legH, 0.046 * spec.body[1]));
  }
  const legRest = legH / 2 + 0.01;

  /* 몸통 */
  piece(inner, ball, fur, 0, bodyY, -0.02, bodyW, bodyH, bodyL);

  // 털북숭이면 덤불을 얹어 부풀린다
  if (spec.fluff > 1.15){
    const puff = (spec.fluff - 1) * 0.9;
    piece(inner, ball, fur, 0, bodyY + bodyH * 0.45, -bodyL * 0.35, bodyW * puff, bodyH * puff, bodyL * puff * 0.8);
    piece(inner, ball, fur, 0, bodyY + bodyH * 0.3, bodyL * 0.3, bodyW * puff * 0.85, bodyH * puff * 0.8, bodyL * puff * 0.7);
  }

  // 화이트블랙 — 등에 무늬 한 점
  if (spec.accent){
    piece(inner, ball, mark, 0, bodyY + bodyH * 0.52, -bodyL * 0.18,
          bodyW * 0.72, bodyH * 0.45, bodyL * 0.52);
  }

  /* 머리 */
  const headR = K.headR * spec.head;
  const head = new THREE.Group();
  head.position.set(0, bodyY + bodyH * 0.55, K.headFwd * spec.body[0] + headR * 0.3);
  inner.add(head);

  piece(head, ball, fur, 0, 0, 0, headR, headR * 0.94, headR * 0.9);

  // 주둥이
  const mz = K.muzzle * spec.muzzle;
  if (mz > 0.02){
    piece(head, ball, fur, 0, -headR * 0.26, headR * 0.72 + mz * 0.4,
          mz * 0.92, mz * 0.76, mz);
  }
  piece(head, ball, nose, 0, -headR * 0.14, headR * 0.76 + mz * 0.95,
        headR * 0.2, headR * 0.17, headR * 0.16);

  // 눈
  const eyeZ = headR * 0.72;
  piece(head, eyeGeo, dark, -headR * 0.42, headR * 0.2, eyeZ, 0.8, 0.95, 0.6);
  piece(head, eyeGeo, dark,  headR * 0.42, headR * 0.2, eyeZ, 0.8, 0.95, 0.6);

  // 귀 — 모양마다 다르게
  const er = headR * spec.earSize;
  const earMat = spec.accent ? mark : fur;
  for (const side of [-1, 1]){
    if (spec.ear === 'drop'){
      // 처진귀 — 옆으로 늘어진다
      const e = piece(head, ball, earMat, side * headR * 0.78, -headR * 0.05, -headR * 0.05,
                      er * 0.26, er * 0.62, er * 0.2);
      e.rotation.z = side * 0.3;
    } else if (spec.ear === 'fold'){
      // 접힌귀 — 작고 둥글게 붙는다
      piece(head, ball, earMat, side * headR * 0.62, headR * 0.6, -headR * 0.08,
            er * 0.3, er * 0.2, er * 0.2);
    } else {
      // 선귀 — 위로 쫑긋. tuft 는 끝에 술이 붙는다
      const e = piece(head, ball, earMat, side * headR * 0.56, headR * 0.78, -headR * 0.05,
                      er * 0.3, er * 0.5, er * 0.18);
      e.rotation.z = side * -0.18;
      if (spec.ear === 'tuft'){
        piece(head, ball, earMat, side * headR * 0.56, headR * 1.24, -headR * 0.05,
              er * 0.1, er * 0.22, er * 0.1);
      }
    }
  }

  /* 꼬리 */
  const tl = K.tailLen * (spec.tail === 'stub' ? 0.42 : 1) *
             (spec.tail === 'plume' ? 1.1 : 1);
  const tt = K.tailThick * (spec.tail === 'plume' ? 1.9 : 1);
  const tail = piece(inner, ball, spec.accent ? mark : fur,
                     0, bodyY + bodyH * 0.45, -bodyL - tl * 0.35,
                     tt, tl, tt);
  if (spec.tail === 'curl')      tail.rotation.x = -1.25;   // 등으로 말려 올라간다
  else if (spec.tail === 'plume') tail.rotation.x = -0.75;
  else if (spec.tail === 'long')  tail.rotation.x = -0.45;
  else                            tail.rotation.x = -0.9;

  // 반가워하기가 끝나면 이 각도로 되돌린다
  const tailRestX = tail.rotation.x;

  const HEAD_TOP = (head.position.y + headR * 1.5) * spec.scale + 0.06;
  const GREET_TIME = 2.4;
  let t = Math.random() * 6, step = 0, greetLeft = 0;

  return {
    group,
    headTop: HEAD_TOP,
    label: spec.breedName,

    /** 주인을 만났을 때. 평소 꼬리질과 확실히 달라야 한다. */
    startGreet(){ greetLeft = GREET_TIME; },
    greeting(){ return greetLeft > 0; },

    /** speed: 초당 걷는 거리. */
    update(dt, speed){
      t += dt;

      if (greetLeft > 0){
        greetLeft -= dt;
        const k = Math.min(1, greetLeft / 0.5);   // 끝에서 잦아든다
        if (spec.kind === 'cat'){
          // 고양이는 꼬리를 곧추세우고 천천히 흔들며 머리를 기울인다
          tail.rotation.x = -1.5;
          tail.rotation.z = Math.sin(t * 7) * 0.3 * k;
          head.rotation.x = 0;
          head.rotation.z = Math.sin(t * 2.4) * 0.14 * k;
          group.position.y = Math.abs(Math.sin(t * 3)) * 0.012 * k;
        } else {
          // 강아지는 꼬리를 세차게 흔들고 깡충거린다
          tail.rotation.x = tailRestX - 0.35 * k;
          tail.rotation.z = Math.sin(t * 22) * 0.95 * k;
          head.rotation.x = -0.14 * k;
          head.rotation.z = 0;
          group.position.y = Math.abs(Math.sin(t * 9)) * 0.055 * k;
        }
        for (const l of legs) l.position.y = legRest;
        return;
      }

      tail.rotation.x = tailRestX;
      head.rotation.z = 0;
      tail.rotation.z = Math.sin(t * (spec.kind === 'cat' ? 4 : 9)) *
                        (spec.kind === 'cat' ? 0.22 : 0.5);

      if (speed > 0.05){
        step += dt * (7 + speed * 2.2);
        const sw = Math.sin(step);
        // 앞뒤 다리가 어긋나게 — 네 발 짐승의 걸음새
        legs[0].position.y = legRest + Math.max(0,  sw) * 0.05;
        legs[1].position.y = legRest + Math.max(0, -sw) * 0.05;
        legs[2].position.y = legRest + Math.max(0, -sw) * 0.05;
        legs[3].position.y = legRest + Math.max(0,  sw) * 0.05;
        group.position.y = Math.abs(sw) * 0.022;
        head.rotation.x = Math.sin(step * 2) * 0.05;
      } else {
        step = 0;
        group.position.y = 0;
        for (const l of legs) l.position.y = legRest;
        head.rotation.x = Math.sin(t * 1.8) * 0.04;
      }
    },

    dispose(){
      group.traverse(o => { if (o.isMesh && o.material.map) o.material.dispose(); });
    }
  };
}
