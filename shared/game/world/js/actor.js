import * as THREE from 'three';
import { toon, makeBlob, makeSpray } from '#look';
import { PAINTS, fixPaint, fixSprays, SPRAY_SIZE } from '#pets';

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
  nose: { word: '코',     hold: 2.4, near: 0.14, hand: true },
  paw:  { word: '손',     hold: 2.8, near: 0.14, hand: true }
};

/* 내민 왼손이 있는 자리 (캐릭터 기준). 재주를 받아 줄 때 여기로 온다.
   앞발이 손에 **닿아야** 하므로 바짝 붙인다. 멀면 허공을 짚는다. */
export const HAND_SPOT = { x: -0.42, z: 0.2 };

const LAMP = 5;               // 불을 켰을 때의 세기
const LAMP_REACH = 16;        // 빛이 닿는 거리 (m)
const LAMP_DECAY = 1;         // 멀어질수록 줄어드는 가파르기
const LAMP_COLOR = 0xFFECC4;  // 너무 짙으면 머리칼이 주황으로 뜬다
const BODY_Y = LEG_H + BODY_H / 2;
const HEAD_Y = BODY_Y + BODY_H / 2 + HEAD_R * 0.72;
export const HEAD_TOP = HEAD_Y + HEAD_R;

const ball = new THREE.SphereGeometry(1, 16, 12);
const eyeGeo = new THREE.SphereGeometry(0.042, 10, 8);
/* 눈 둘레는 **가운데가 뚫린 고리**다. 덩어리로 두면 어떻게 놓아도 눈앞을
   덮어 초승달만 남는다 — 눈은 머리에 거의 파묻혀 있고 앞머리만 내민
   모양이라, 그 앞을 지나는 면은 전부 눈을 가린다. */
/* 구멍은 **눈보다 넉넉히 커야** 한다. 눈 크기는 머리 크기와 상관없이
   고정(반지름 0.034 · 0.040)이므로, 고리도 길이로 적는다. 머리 크기로
   비례만 주면 작은 품종에서 구멍이 눈보다 작아져 테두리가 눈을 가른다. */
const ringGeo = new THREE.RingGeometry(0.058, 0.105, 22);
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
  let tossLeft = 0;         // 공을 던지는 동작이 남은 시간
  const TOSS_TIME = 0.55;

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

    /* 공 던지는 동작. 뒤로 젖혔다 앞으로 뿌린다. 든 손이 오른손이라
       던지는 것은 왼손이다. */
    toss(){ tossLeft = TOSS_TIME; },

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

      /* 왼팔이 하는 일은 걸음보다 뒤에 둔다 — 앞에 두면 팔 흔들기가
         덮어쓴다. 던지기가 손 내밀기보다 먼저다. */
      group.rotation.x = 0;
      if (tossLeft > 0){
        tossLeft -= dt;
        const t = 1 - tossLeft / TOSS_TIME;       // 0 → 1
        // 앞의 3할은 뒤로 젖히고, 나머지는 앞으로 뿌린다
        const swing = t < 0.3 ? (t / 0.3) * 1.5 - 0.1
                              : 1.4 - ((t - 0.3) / 0.7) * 3.3;
        armL.rotation.x = swing;
        /* 몸도 같이 젖혔다 숙인다. 기본 카메라가 **뒤에** 있어서 팔만
           움직이면 큰 머리에 가려 아무것도 안 보인다. 몸이 기울면
           뒤에서도 실루엣이 달라져 던진 줄 안다. */
        group.rotation.x = t < 0.3 ? -0.12 * (t / 0.3)
                                   : -0.12 + 0.34 * ((t - 0.3) / 0.7);
        /* 바깥으로 넉넉히 벌리고 뿌리는 동안 길게 늘인다. 기본 카메라가
           뒤에 있어서, 몸 옆에 붙여 두면 큰 머리에 통째로 가린다. */
        armL.rotation.z = -0.8;
        armL.scale.y = 1 + 0.8 * Math.sin(t * Math.PI);
      } else if (reachLeft > 0){
        reachLeft -= dt;
        const k = Math.min(1, reachLeft / 0.3);
        /* 아이가 앞발을 올릴 수 있게 손을 **낮게** 내민다. 너무 높이
           들면 작은 아이의 발이 닿지 않아 허공을 짚는다. */
        armL.rotation.x = -0.45 * k;
        /* 바깥으로 벌리는 부호. 손은 팔 아래쪽(-y)에 달려 있으므로,
           z 를 **음수**로 돌려야 왼쪽(-x) 바깥으로 간다. 양수로 두면
           몸을 가로질러 반대쪽으로 가서, 큰 머리에 가려 안 보인다.
           (한동안 +0.5 로 두어 내민 손이 몸 뒤에 숨어 있었다. 눈으로는
           구분이 안 돼서 손의 월드 좌표를 재고서야 알았다.) */
        armL.rotation.z = -1.0 * k;
        /* 팔을 돌리기만 하면 티가 안 난다. 팔이 몸과 같은 색이고 짧아서
           몸에 묻힌다. 내미는 동안 길게 늘여야 알아볼 수 있다. */
        armL.scale.y = 1 + 0.4 * k;
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
  // 털빛이 짙으면 코를 밝게 둬야 보인다 (직접 칠했으면 머리 색으로 따진다)
  const nose = toon(spec.darkHead || spec.coatKey === 'black' ? 0x8C8498 : 0x8A6A5C);

  /* 직접 칠한 아이는 부위마다 색이 다르다. 칠하지 않았으면 모두 털빛
     하나를 나눠 쓴다. `toon` 이 빛깔마다 재질을 하나씩 돌려주므로,
     같은 색으로 칠한 부위끼리는 저절로 같은 재질이 된다. */
  const paint = fixPaint(spec.paint);
  const coat = i => paint ? toon(PAINTS[paint[i]].hex) : fur;
  /* 편집기가 눌린 자리를 알아보려면 조각마다 어느 부위인지 적어 둬야
     한다 (`paint.js`). 칠하지 않은 아이에도 적어 둔다 — 그래야 편집기를
     털빛에서 바로 열 수 있다. */
  const tag = (m, i) => { m.userData.part = i; return m; };
  const BODY = 0, HEAD = 1, EAR = 2, LEG = 3, TAIL = 4, MUZZLE = 5,
        HIND = 6, BACK = 7, BELLY = 8, CHEST = 9, PAW = 10, PATCH = 11;

  const bodyL = K.bodyL * spec.body[0];
  const bodyW = K.bodyW * spec.body[1] * spec.fluff;
  const bodyH = K.bodyH * spec.body[1] * spec.fluff;
  const legH  = K.legY * spec.legs;
  const bodyY = legH + bodyH * 0.72;

  group.add(makeBlob(0.2 * spec.scale * spec.body[0]));

  /* 다리 — 네 개 */
  const legs = [];
  const legX = bodyW * 0.62, legZ = bodyL * 0.52;
  /* 앞의 둘이 앞다리(+z), 뒤의 둘이 뒷다리다. 발은 다리에 **달아** 둔다 —
     따로 두면 걸을 때 다리만 움직이고 발은 제자리에 남는다. */
  for (const [x, z] of [[-legX, legZ], [legX, legZ], [-legX, -legZ], [legX, -legZ]]){
    const which = z > 0 ? LEG : HIND;
    const leg = tag(piece(inner, ball, coat(which), x, legH / 2 + 0.01, z,
                          0.046 * spec.body[1], legH, 0.046 * spec.body[1]), which);
    legs.push(leg);
    if (paint){
      /* 다리 안쪽 자(1 이 다리 길이의 절반)로 적는다. 다리가 길쭉하게
         눌려 있어서, 여기 1.4 는 바깥에서 보면 납작하고 넓은 발이 된다. */
      tag(piece(leg, ball, coat(PAW), 0, -0.76, 0.22, 1.35, 0.26, 1.5), PAW);
    }
  }
  const legRest = legH / 2 + 0.01;

  /* 몸통 */
  tag(piece(inner, ball, coat(BODY), 0, bodyY, -0.02, bodyW, bodyH, bodyL), BODY);

  // 털북숭이면 덤불을 얹어 부풀린다
  if (spec.fluff > 1.15){
    const puff = (spec.fluff - 1) * 0.9;
    tag(piece(inner, ball, coat(BODY), 0, bodyY + bodyH * 0.45, -bodyL * 0.35, bodyW * puff, bodyH * puff, bodyL * puff * 0.8), BODY);
    tag(piece(inner, ball, coat(BODY), 0, bodyY + bodyH * 0.3, bodyL * 0.3, bodyW * puff * 0.85, bodyH * puff * 0.8, bodyL * puff * 0.7), BODY);
  }

  /* 칠한 아이에게만 붙이는 자리들. 안 칠한 아이에게는 붙이지 않는다 —
     털빛 하나로 칠해 봐야 보이지도 않으면서 그리는 값만 는다.
     공처럼 둥근 것을 몸에 **걸쳐** 둔다. 같은 높이로 포개면 z-파이팅이
     나므로, 파묻지 말고 비어져 나오게 놓는 것이 중요하다. */
  if (paint){
    /* **몸보다 비어져 나오게** 놓는 것이 요령이다. 몸 안에 들어가 있으면
       칠해도 보이지 않고 눌러도 몸이 먼저 잡힌다 (배를 한 번 그렇게
       만들어 아예 칠할 수가 없었다). 가운데 높이에서 몸의 반지름보다
       넓게 잡으면 옆구리에 띠처럼 걸린다. */
    tag(piece(inner, ball, coat(BACK), 0, bodyY + bodyH * 0.58, -bodyL * 0.1,
              bodyW * 0.88, bodyH * 0.5, bodyL * 0.64), BACK);
    tag(piece(inner, ball, coat(BELLY), 0, bodyY - bodyH * 0.55, -0.02,
              bodyW * 1.02, bodyH * 0.52, bodyL), BELLY);
    // 가슴은 머리에 가리기 쉽다. 턱 아래로 내리고 앞으로 더 내민다.
    tag(piece(inner, ball, coat(CHEST), 0, bodyY - bodyH * 0.26, bodyL * 0.7,
              bodyW * 0.52, bodyH * 0.6, bodyL * 0.42), CHEST);
  }

  // 화이트블랙 — 등에 무늬 한 점. 직접 칠했으면 무늬를 두지 않는다.
  if (spec.accent && !paint){
    piece(inner, ball, mark, 0, bodyY + bodyH * 0.52, -bodyL * 0.18,
          bodyW * 0.72, bodyH * 0.45, bodyL * 0.52);
  }

  /* 머리 */
  const headR = K.headR * spec.head;
  const head = new THREE.Group();
  head.position.set(0, bodyY + bodyH * 0.55, K.headFwd * spec.body[0] + headR * 0.3);
  inner.add(head);

  tag(piece(head, ball, coat(HEAD), 0, 0, 0, headR, headR * 0.94, headR * 0.9), HEAD);

  // 주둥이
  const mz = K.muzzle * spec.muzzle;
  if (mz > 0.02){
    tag(piece(head, ball, coat(MUZZLE), 0, -headR * 0.26, headR * 0.72 + mz * 0.4,
              mz * 0.92, mz * 0.76, mz), MUZZLE);
  }
  /* 눈과 코에는 **칠하지도 뿌리지도 않는다.** 작고 또렷한 자리라
     덮이면 표정이 사라진다. 부위 칠하기는 `userData.part` 가 없어서
     저절로 비껴가고, 스프레이는 이 표시를 보고 비껴간다. */
  piece(head, ball, nose, 0, -headR * 0.14, headR * 0.76 + mz * 0.95,
        headR * 0.2, headR * 0.17, headR * 0.16).userData.noPaint = 1;

  /* 눈 둘레 — 얼굴에 점박이처럼 걸린다.
     **눈보다 앞으로 나오면 안 된다.** 눈이 가려져 초승달만 남는다.
     머리 거죽(눈 자리에서 `0.79 * headR` 쯤)보다는 나오고, 눈 앞면
     (`0.72 * headR + 0.025`)보다는 들어가야 한다. 지금 앞면이
     `0.82 * headR` 이라 둘 사이에 든다. */
  if (paint){
    /* 고리는 **눈이 있는 쪽으로 눕혀** 머리 거죽에 붙인다. 평평한 판을
       고정 높이에 두면 둥근 머리와 어긋나 한쪽은 눈을 가르고 한쪽은
       허공으로 삐져나온다 — 한 번 그렇게 만들어 봤다. */
    const rs = Math.max(0.9, headR / 0.16);
    const front = new THREE.Vector3(0, 0, 1);
    for (const sx of [-1, 1]){
      const dir = new THREE.Vector3(sx * headR * 0.42, headR * 0.2, headR * 0.72).normalize();
      // 머리 타원면과 만나는 자리까지의 거리
      const t = 1 / Math.sqrt((dir.x / headR) ** 2 +
                              (dir.y / (headR * 0.94)) ** 2 +
                              (dir.z / (headR * 0.9)) ** 2);
      const m = tag(piece(head, ringGeo, coat(PATCH), 0, 0, 0, rs, rs, 1), PATCH);
      m.position.copy(dir).multiplyScalar(t + 0.005);
      m.quaternion.setFromUnitVectors(front, dir);
    }
  }

  // 눈
  const eyeZ = headR * 0.72;
  piece(head, eyeGeo, dark, -headR * 0.42, headR * 0.2, eyeZ, 0.8, 0.95, 0.6)
    .userData.noPaint = 1;
  piece(head, eyeGeo, dark,  headR * 0.42, headR * 0.2, eyeZ, 0.8, 0.95, 0.6)
    .userData.noPaint = 1;

  // 귀 — 모양마다 다르게
  const er = headR * spec.earSize;
  const earMat = paint ? coat(EAR) : (spec.accent ? mark : fur);
  for (const side of [-1, 1]){
    if (spec.ear === 'drop'){
      // 처진귀 — 옆으로 늘어진다
      const e = tag(piece(head, ball, earMat, side * headR * 0.78, -headR * 0.05, -headR * 0.05,
                          er * 0.26, er * 0.62, er * 0.2), EAR);
      e.rotation.z = side * 0.3;
    } else if (spec.ear === 'fold'){
      // 접힌귀 — 작고 둥글게 붙는다
      tag(piece(head, ball, earMat, side * headR * 0.62, headR * 0.6, -headR * 0.08,
                er * 0.3, er * 0.2, er * 0.2), EAR);
    } else {
      // 선귀 — 위로 쫑긋. tuft 는 끝에 술이 붙는다
      const e = tag(piece(head, ball, earMat, side * headR * 0.56, headR * 0.78, -headR * 0.05,
                          er * 0.3, er * 0.5, er * 0.18), EAR);
      e.rotation.z = side * -0.18;
      if (spec.ear === 'tuft'){
        tag(piece(head, ball, earMat, side * headR * 0.56, headR * 1.24, -headR * 0.05,
                  er * 0.1, er * 0.22, er * 0.1), EAR);
      }
    }
  }

  /* 꼬리 */
  const tl = K.tailLen * (spec.tail === 'stub' ? 0.42 : 1) *
             (spec.tail === 'plume' ? 1.1 : 1);
  const tt = K.tailThick * (spec.tail === 'plume' ? 1.9 : 1);
  const tail = tag(piece(inner, ball,
                         paint ? coat(TAIL) : (spec.accent ? mark : fur),
                         0, bodyY + bodyH * 0.45, -bodyL - tl * 0.35,
                         tt, tl, tt), TAIL);
  if (spec.tail === 'curl')      tail.rotation.x = -1.25;   // 등으로 말려 올라간다
  else if (spec.tail === 'plume') tail.rotation.x = -0.75;
  else if (spec.tail === 'long')  tail.rotation.x = -0.45;
  else                            tail.rotation.x = -0.9;

  // 반가워하기가 끝나면 이 각도로 되돌린다
  const tailRestX = tail.rotation.x;

  /* ── 뿌린 자국 ──
     자리는 **몸통 상자 안의 0~1 비율**로 적혀 온다. 여기서 그 비율을
     길이로 풀고, 바깥에서 광선을 쏘아 살갗에 붙인다. 면이 어느 쪽을
     보는지는 광선이 알려 주므로 코드에 담지 않는다.
     상자는 **자국을 붙이기 전**에 잰다 — 붙인 뒤에 재면 자국이 상자를
     넓혀서, 같은 코드가 기기마다 다른 자리에 찍힌다. */
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const innerBox = {
    min: box.min.clone().divideScalar(spec.scale),
    max: box.max.clone().divideScalar(spec.scale)
  };

  const sprays = fixSprays(spec.sprays);
  if (sprays){
    const ray = new THREE.Raycaster();
    const mid = box.getCenter(new THREE.Vector3());
    const at = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const flat = new THREE.Vector3(0, 0, 1);
    const inv = new THREE.Matrix4();
    for (const s of sprays){
      at.set(box.min.x + s.x * (box.max.x - box.min.x),
             box.min.y + s.y * (box.max.y - box.min.y),
             box.min.z + s.z * (box.max.z - box.min.z));
      dir.copy(at).sub(mid);
      if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
      dir.normalize();
      ray.set(at.clone().addScaledVector(dir, 1.5), dir.clone().negate());
      const hit = ray.intersectObject(inner, true)[0];
      if (!hit || !hit.face) continue;

      // 머리에 찍힌 자국은 머리에 달아야 고개를 숙일 때 같이 간다
      let host = inner;
      for (let o = hit.object; o && o !== inner; o = o.parent){
        if (o === head){ host = head; break; }
      }
      const scale = host === head ? spec.scale : spec.scale;   // 둘 다 inner 배율
      const local = host.worldToLocal(hit.point.clone());
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      n.transformDirection(inv.copy(host.matrixWorld).invert()).normalize();

      const m = makeSpray(PAINTS[s.ci].hex);
      m.userData.spray = 1;      // 편집기가 자국 위에 또 찍지 않도록
      m.position.copy(local).addScaledVector(n, 0.014 / scale);
      m.quaternion.setFromUnitVectors(flat, n);
      m.scale.setScalar(SPRAY_SIZE[s.big] * 2 / scale);
      host.add(m);
    }
  }

  const HEAD_TOP = (head.position.y + headR * 1.5) * spec.scale + 0.06;
  const GREET_TIME = 2.4;
  let t = Math.random() * 6, step = 0, greetLeft = 0, eatLeft = 0;
  let trick = null, trickLeft = 0;      // 앉아 · 엎드려 · 코 · 손

  return {
    group,
    headTop: HEAD_TOP,
    label: spec.breedName,
    /* 편집기가 뿌린 자리를 적을 때 쓴다 — 몸통 자리와, 자국을 붙이기
       전에 잰 상자. 둘이 있어야 "상자 안의 몇 할" 로 적을 수 있다. */
    inner,
    box: innerBox,

    /** 주인을 만났을 때. 평소 꼬리질과 확실히 달라야 한다. */
    startGreet(){ greetLeft = GREET_TIME; },
    greeting(){ return greetLeft > 0; },

    /* 밥 먹는 모습. 그릇에 닿아 있는 동안 짧게 다시 걸어 준다 — 그래야
       밥이 떨어지거나 자리를 뜨면 저절로 풀린다. 재주와 반기기보다
       먼저다 (먹는 중에 재주를 부리면 그릇을 두고 가 버린다). */
    startEat(sec){
      eatLeft = Math.max(eatLeft, sec || 1);
      trick = null; trickLeft = 0;
      greetLeft = 0;
    },
    stopEat(){ eatLeft = 0; },
    eating(){ return eatLeft > 0; },

    /* 재주. 남의 기기에서는 주인이 보내 주는 것을 그대로 받아 거는데,
       그때는 짧은 시간만 주고 꾸러미가 올 때마다 다시 건다. 주인 쪽
       소식이 끊기면 저절로 풀리게 하려는 것이다. */
    doTrick(kind, sec){
      if (!TRICKS[kind]) return;
      eatLeft = 0;              // 재주를 시키면 밥그릇을 두고 온다
      trick = kind;
      trickLeft = sec || TRICKS[kind].hold;
      greetLeft = 0;                    // 재주가 반가워하기보다 먼저다
    },
    stopTrick(){ trick = null; trickLeft = 0; },
    trickNow(){ return trickLeft > 0 ? trick : null; },

    /** speed: 초당 걷는 거리. */
    update(dt, speed){
      t += dt;

      /* 밥 먹기 — 고개를 푹 숙이고 오물거린다. 꼬리는 신나게.
         재주보다 먼저 본다. */
      if (eatLeft > 0){
        eatLeft -= dt;
        const k = Math.min(1, eatLeft / 0.3);   // 끝에서 스르르 고개를 든다
        inner.rotation.x = 0;
        inner.position.y = 0;
        group.position.y = 0;
        head.rotation.z = 0;
        for (const l of legs) l.position.y = legRest;
        legs[1].position.z = legZ;
        legs[1].scale.y = legH;
        // 머리는 **양수가 숙이는 쪽**이다 (코 재주가 -0.6 으로 들어 올린다)
        head.rotation.x = (0.92 + Math.sin(t * 15) * 0.1) * k;
        tail.rotation.x = tailRestX;
        tail.rotation.z = Math.sin(t * (spec.kind === 'cat' ? 7 : 18)) *
                          (spec.kind === 'cat' ? 0.3 : 0.7);
        return;
      }

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
        /* 늘여 둔 앞다리를 **여기서도** 되돌린다. 재주가 끝날 때만
           되돌리면, "손" 다음에 바로 "앉아" 를 시켰을 때 늘어난 다리가
           그대로 남아 어깨 위로 삐쭉 솟는다.
           제자리 길이는 `1` 이 아니라 **`legH`** 다 — `piece` 가 공
           모양을 다리 길이만큼 눌러 만들기 때문이다. 1 로 되돌리면
           다리가 열 배로 늘어난다. */
        legs[1].scale.y = legH;
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
          /* 앞발 하나를 들어 **사람 손 위에 올린다.** 몸 앞쪽(+z)이
             사람 쪽이므로 앞으로 길게 뻗어야 닿는다. */
          legs[1].position.y = legRest + legH * 1.5 * k;
          legs[1].position.z = legZ + legH * 1.1 * k;
          legs[1].scale.y = legH * (1 + 0.25 * k);
          head.rotation.x = 0.26 * k;
        }

        if (trickLeft <= 0) trick = null;
        return;
      }

      inner.rotation.x = 0;
      inner.position.y = 0;
      legs[1].position.z = legZ;
      legs[1].scale.y = legH;

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
