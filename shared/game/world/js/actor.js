import * as THREE from 'three';
import { toon, makeBlob } from '#look';

/*
 * 머리가 크고 몸이 작은, 동글동글한 캐릭터.
 * 얼굴 지름(0.64)이 몸 높이(0.32)의 두 배다.
 */

const BODY_H = 0.32;          // 몸 높이
const HEAD_R = BODY_H;        // 머리 반지름 → 지름은 몸의 두 배
const LEG_H  = 0.17;

/* 등불이 둘레를 밝히는 정도. 밤에 캐릭터와 그 둘레가 환히 보이되, 멀리는
   어둡게 남아 밤인 줄 알게 하는 선에서 잡았다.
   - 세기는 three r155 부터 단위가 바뀌어 예전 감각보다 큰 값이 든다.
   - 멀어짐(`decay`)은 1 로 둔다. 2(실제 물리값)로 두면 바로 곁의 캐릭터만
     하얗게 타고 두어 걸음 밖 땅은 깜깜해서, 정작 둘레가 안 보인다.
   - 빛은 등불이 아니라 머리 위(2.4m)에 둔다. 등불 자리에 두면 거리 차가
     커서 또 캐릭터만 탄다. 그림자를 쓰지 않으므로 티가 나지 않는다. */
/* 재주 — 반려동물이 말을 알아듣고 하는 것들. 몇 초 동안 그 자세로 있다. */
export const TRICKS = {
  sit:  { word: '앉아',   hold: 7,   near: 2.4 },
  down: { word: '엎드려', hold: 7,   near: 2.4 },
  // 코와 손은 닿을 만큼 바짝 와야 하고, 내민 손 곁으로 온다 (hand).
  // 몸 바로 앞으로 오면 큰 머리에 가려 카메라에서 안 보인다.
  nose: { word: '코',     hold: 2.4, near: 0.3, hand: true },
  paw:  { word: '손',     hold: 2.8, near: 0.3, hand: true }
};

/** 내민 왼손이 있는 자리 (캐릭터 기준). 재주를 받아 줄 때 여기로 온다. */
export const HAND_SPOT = { x: -0.68, z: 0.45 };

const LAMP = 5;               // 불을 켰을 때의 세기
const LAMP_REACH = 16;        // 빛이 닿는 거리 (m)
const LAMP_DECAY = 1;         // 멀어질수록 줄어드는 가파르기
const LAMP_COLOR = 0xFFECC4;  // 너무 짙으면 머리칼이 주황으로 뜬다
const BODY_Y = LEG_H + BODY_H / 2;
const HEAD_Y = BODY_Y + BODY_H / 2 + HEAD_R * 0.72;
export const HEAD_TOP = HEAD_Y + HEAD_R;

const ball = new THREE.SphereGeometry(1, 16, 12);
const eyeGeo = new THREE.SphereGeometry(0.042, 10, 8);
const rod = new THREE.CylinderGeometry(1, 1, 1, 6);

function piece(group, geo, mat, x, y, z, sx, sy, sz){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy ?? sx, sz ?? sx);
  group.add(m);
  return m;
}

export function createActor({ color = 0xF2A2A2, hair = 0x6B4A3A, long = false,
                              lamp = false } = {}){
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

  // 팔 — 어깨에서 돌아가는 무리로 둔다. 방울 하나만 두면 돌려도 표가 안 나고,
  // 손에 든 것도 같이 흔들리지 않는다.
  function makeArm(side){
    const a = new THREE.Group();
    a.position.set(side * 0.185, BODY_Y + 0.115, 0);
    group.add(a);
    piece(a, ball, cloth, 0, -0.085, 0, 0.062, 0.085, 0.062);
    return a;
  }
  const armL = makeArm(-1);
  const armR = makeArm(1);
  armR.rotation.z = -0.34;        // 든 팔은 바깥으로 벌린다

  /* 오른손 — 밝을 땐 바람개비, 어두울 땐 등불.
     머리가 몸보다 크고 넓어, 몸 옆에 그냥 두면 통째로 가려진다. 아이가
     바람개비를 치켜들듯 길게 올리고 바깥으로 기울여 머리 옆으로 내보낸다. */
  const hand = new THREE.Group();
  hand.position.set(0.055, -0.17, 0.02);
  armR.add(hand);

  /* 바람개비 */
  const pinwheel = new THREE.Group();
  pinwheel.rotation.z = -0.26;    // 머리에서 비켜나도록
  hand.add(pinwheel);
  piece(pinwheel, rod, toon(0xC9A77E), 0, 0.33, 0, 0.011, 0.66, 0.011);   // 자루
  const vanes = new THREE.Group();
  vanes.position.set(0, 0.68, 0.02);
  pinwheel.add(vanes);
  const VANE = [0xFF9CA0, 0xFFE783, 0x94E799, 0x7DDDF4];
  VANE.forEach((c, i) => {
    const v = new THREE.Group();
    v.rotation.z = (i / VANE.length) * Math.PI * 2;
    vanes.add(v);
    piece(v, ball, toon(c), 0, 0.075, 0, 0.034, 0.075, 0.014);
  });
  piece(vanes, ball, toon(0xFFFBF2), 0, 0, 0.012, 0.022, 0.022, 0.014);   // 가운데 못

  /* 등불 — 나무 자루 끝에 노란 불빛이 매달렸다 */
  const lantern = new THREE.Group();
  lantern.rotation.z = -0.3;
  lantern.rotation.x = -0.22;     // 앞으로도 조금 내밀어 길을 비춘다
  hand.add(lantern);
  piece(lantern, rod, toon(0xB08A62), 0, 0.27, 0, 0.012, 0.54, 0.012);    // 나무 자루
  piece(lantern, rod, toon(0x8A7258), 0.035, 0.545, 0, 0.055, 0.012, 0.012); // 끝의 가로대
  piece(lantern, rod, toon(0x8A7258), 0.07, 0.505, 0, 0.006, 0.08, 0.006);   // 매단 줄

  // 불빛은 빛을 받지 않는 재질이라야 어두울 때도 환하다
  const flame = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: 0xFFE089 }));
  flame.position.set(0.07, 0.425, 0);
  flame.scale.set(0.058, 0.07, 0.058);
  lantern.add(flame);
  const halo = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({
    color: 0xFFEFB4, transparent: true, opacity: 0.32, depthWrite: false
  }));
  halo.position.copy(flame.position);
  halo.scale.set(0.14, 0.15, 0.14);
  halo.renderOrder = 1;
  lantern.add(halo);
  lantern.visible = false;

  /* 등불이 둘레를 밝힌다.
     - 빛은 **내 캐릭터에만** 단다. 사람마다 달면 서른 명이 들어왔을 때
       빛이 서른 개가 되어 셰이더가 버티지 못한다. 남의 등불은 불빛만
       보인다.
     - 등불 밑에 달지 않고 `group` 에 단다. 등불은 밝을 때 `visible=false`
       가 되는데, 안 보이는 가지 밑의 빛은 빛 목록에서 통째로 빠진다.
       그러면 밤낮이 바뀔 때마다 모든 재질이 다시 컴파일돼 화면이 멎는다.
       늘 달아 두고 **세기만** 0 과 LAMP 사이로 옮긴다. */
  let glow = null;
  if (lamp){
    glow = new THREE.PointLight(LAMP_COLOR, 0, LAMP_REACH, LAMP_DECAY);
    glow.position.set(0.15, 2.4, 0);      // 머리 위 — 까닭은 위 설명
    group.add(glow);
  }

  // 머리 — 몸의 두 배
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  group.add(head);

  piece(head, ball, skin, 0, 0, 0, HEAD_R, HEAD_R * 0.96, HEAD_R * 0.92);
  // 머리칼 — 머리보다 조금 크게 덮어야 모자처럼 보인다. 작게 하면
  // 머리 안으로 파묻혀 깎인 자국처럼 보인다. 얼굴은 드러나게 뒤로 민다.
  piece(head, ball, hairMat, 0, HEAD_R * 0.22, -HEAD_R * 0.16,
        HEAD_R * 1.04, HEAD_R * 0.88, HEAD_R * 0.92);

  // 긴 머리 — 게임에서는 뒷모습을 주로 보므로, 뒤에서도 구분되게 옆과 뒤로
  // 흘러내리게 한다. 옷 색은 이름에서 나오므로 머리 모양만 다르다.
  if (long){
    for (const side of [-1, 1]){
      piece(head, ball, hairMat, side * HEAD_R * 0.84, -HEAD_R * 0.42, -HEAD_R * 0.04,
            HEAD_R * 0.3, HEAD_R * 0.62, HEAD_R * 0.34);
    }
    piece(head, ball, hairMat, 0, -HEAD_R * 0.46, -HEAD_R * 0.6,
          HEAD_R * 0.74, HEAD_R * 0.58, HEAD_R * 0.44);
  }

  const fz = HEAD_R * 0.84;   // 얼굴이 향하는 면 (+Z)
  piece(head, eyeGeo, dark, -0.105, 0.015, fz, 1, 1.15, 0.7);
  piece(head, eyeGeo, dark,  0.105, 0.015, fz, 1, 1.15, 0.7);
  piece(head, ball, blush, -0.175, -0.07, fz * 0.86, 0.055, 0.035, 0.03);
  piece(head, ball, blush,  0.175, -0.07, fz * 0.86, 0.055, 0.035, 0.03);
  piece(head, ball, skin, 0, -0.04, fz * 1.02, 0.034, 0.03, 0.03);   // 코

  const LEG_Y = LEG_H / 2;
  let phase = 0, idle = Math.random() * 6;
  let reachLeft = 0;        // 반려동물에게 손을 내밀고 있는 시간

  return {
    group,
    headTop: HEAD_TOP,

    /** 어두우면 등불, 밝으면 바람개비. */
    setHand(dark){
      pinwheel.visible = !dark;
      lantern.visible = !!dark;
      if (glow) glow.intensity = dark ? LAMP : 0;
    },

    /* 반려동물이 "코" · "손" 을 할 때 이쪽도 손을 내민다. 혼자만 재주를
       부리면 허공에 대고 하는 꼴이라, 받아 주는 쪽이 있어야 한다.
       든 손은 오른손이므로 내미는 것은 왼손이다. */
    reach(sec){ reachLeft = Math.max(reachLeft, sec || 2); },
    reaching(){ return reachLeft > 0; },

    /** speed: 초당 걷는 거리. 0 이면 가만히 서 있다. */
    update(dt, speed){
      idle += dt;
      const moving = speed > 0.05;

      // 바람개비 — 걸으면 바람을 받아 빠르게 돈다. 서 있으면 산들바람에
      // 천천히 돌 뿐이다.
      if (pinwheel.visible) vanes.rotation.z += dt * (0.5 + speed * 2.9);

      if (moving){
        // 다리가 공 모양이라 돌려 봐야 표가 안 난다. 번갈아 들어 올린다.
        phase += dt * (5.5 + speed * 1.9);
        const sw = Math.sin(phase);
        legL.position.y = LEG_Y + Math.max(0, sw) * 0.07;
        legR.position.y = LEG_Y + Math.max(0, -sw) * 0.07;
        armL.rotation.x = -sw * 0.55;
        armR.rotation.x =  sw * 0.4;    // 든 손은 덜 흔든다

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

      // 손 내밀기는 걸음보다 뒤에 둔다 — 앞에 두면 팔 흔들기가 덮어쓴다
      if (reachLeft > 0){
        reachLeft -= dt;
        const k = Math.min(1, reachLeft / 0.3);
        armL.rotation.x = -1.15 * k;     // 앞아래로 내민다
        /* 바깥으로 벌리는 부호는 팔마다 다르다. 오른팔(+x)은 음수,
           왼팔(-x)은 양수라야 바깥이다. 반대로 주면 몸 앞으로 접혀
           큰 머리에 가려 아무것도 안 보인다. */
        armL.rotation.z = 0.5 * k;
        /* 팔을 돌리기만 하면 티가 안 난다. 팔이 몸과 같은 색이고 짧아서
           몸에 묻힌다. 내미는 동안 길게 늘여야 알아볼 수 있다. */
        armL.scale.y = 1 + 0.75 * k;
      } else {
        armL.rotation.z = 0;
        armL.scale.y = 1;
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
  let trick = null, trickLeft = 0;      // 앉아 · 엎드려 · 코 · 손

  return {
    group,
    headTop: HEAD_TOP,
    label: spec.breedName,

    /** 주인을 만났을 때. 평소 꼬리질과 확실히 달라야 한다. */
    startGreet(){ greetLeft = GREET_TIME; },
    greeting(){ return greetLeft > 0; },

    /* 재주. 남의 기기에서는 주인이 보내 주는 것을 그대로 받아 거는데,
       그때는 짧은 시간만 주고 꾸러미가 올 때마다 다시 건다. 주인 쪽
       소식이 끊기면 저절로 풀리게 하려는 것이다. */
    doTrick(kind, sec){
      if (!TRICKS[kind]) return;
      trick = kind;
      trickLeft = sec || TRICKS[kind].hold;
      greetLeft = 0;                    // 재주가 반가워하기보다 먼저다
    },
    stopTrick(){ trick = null; trickLeft = 0; },
    trickNow(){ return trickLeft > 0 ? trick : null; },

    /** speed: 초당 걷는 거리. */
    update(dt, speed){
      t += dt;

      /* 재주 — 몇 초 동안 그 자세로 있는다. 몸통을 통째로 젖히거나
         내리는 쪽이 다리를 하나씩 접는 것보다 훨씬 또렷하게 읽힌다. */
      if (trickLeft > 0){
        trickLeft -= dt;
        const k = Math.min(1, trickLeft / 0.35);   // 끝에서 스르르 풀린다

        inner.rotation.x = 0;
        inner.position.y = 0;
        head.rotation.z = 0;
        head.rotation.x = 0;
        group.position.y = 0;
        for (const l of legs) l.position.y = legRest;
        legs[1].position.z = legZ;
        tail.rotation.x = tailRestX;
        tail.rotation.z = Math.sin(t * (spec.kind === 'cat' ? 4 : 11)) *
                          (spec.kind === 'cat' ? 0.22 : 0.45);

        /* inner 에는 품종 배율(spec.scale)이 걸려 있다. 그 안쪽 값
           (bodyY · legH) 으로 inner 자신을 옮기려면 배율을 곱해야 한다.
           안 곱하면 작은 아이일수록 크게 어긋나 땅에 파묻힌다. */
        const S = spec.scale;

        if (trick === 'sit'){
          inner.rotation.x = -0.52 * k;             // 엉덩이를 내린다
          inner.position.y = bodyY * 0.16 * S * k;
          head.rotation.x = 0.34 * k;               // 젖혀진 만큼 고개는 바로
        } else if (trick === 'down'){
          inner.position.y = -legH * 0.8 * S * k;   // 배를 바닥에 붙인다
          head.rotation.x = 0.1 * k;
        } else if (trick === 'nose'){
          head.rotation.x = -0.6 * k;               // 코를 들어 올린다
          group.position.y = Math.abs(Math.sin(t * 6)) * 0.018 * k;
        } else if (trick === 'paw'){
          inner.rotation.x = -0.45 * k;             // 앉은 채로
          inner.position.y = bodyY * 0.14 * S * k;
          // 앞발 하나를 높이 든다. 작은 몸이라 크게 들어야 알아본다.
          legs[1].position.y = legRest + legH * 1.25 * k;
          legs[1].position.z = legZ + legH * 0.7 * k;
          head.rotation.x = 0.26 * k;
        }

        if (trickLeft <= 0) trick = null;
        return;
      }

      inner.rotation.x = 0;
      inner.position.y = 0;
      legs[1].position.z = legZ;

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
