import * as THREE from 'three';
import { makeBlob } from '#look';
import { SKINS, LIPS, HAIR_COLORS, PALETTE } from '../../../js/character.js?v=c7';

/*
 * 블록 캐릭터 (v3) — 사용자가 준 블렌더 모델(핑크 소녀)을 둥근 상자로 그대로 옮겼다.
 *
 * - 모든 조각이 **모서리 · 꼭짓점이 둥근 상자** 하나씩이다 (사용자 요청). 원본은 상자 하나에 삼각형 2천 개였는데,
 *   둥근 모서리에만 격자를 몰아(rbox) 300 개로 줄였다 — 한 명 1만8천 개쯤.
 * - **관절은 있되 모양은 없다** (사용자 요청). 머리 · 두 팔 · 두 다리를 각자의 돌쩌귀(그릇)에 묶어 돌릴 뿐,
 *   관절 구 같은 것을 따로 두지 않는다.
 * - 겉은 **유광 = 색 위에 투명한 유리 코팅** (사용자 요청 — 반투명 몸이 아니다), 또는 **무광** (finish, 사용자 요청). 불투명한 색 재질에 clearcoat 를 얹고,
 *   비칠 하늘(envMap)을 작은 그림으로 지어 준다. 밤에는 비침을 줄인다 (setHand).
 * - 같은 무리 · 같은 색 조각은 한 덩어리로 합쳐 그리기 횟수를 줄인다.
 *
 * 자료는 [이름, 원본 재질, 가운데 x y z, 폭 높이 깊이, 둥글기] — 앞은 +Z, 단위 m, 키 1.34.
 * 색은 원본 재질 자리를 계정의 색(character.js)으로 바꿔 칠한다 (paintOf).
 */
const PARTS = [
  ['boot_sole_L', 'sole', -.1, .02, .025, .17, .04, .27, .012],
  ['boot_L', 'boot', -.1, .09, .02, .155, .11, .23, .035],
  ['lace_L_0', 'black2', -.1, .08, .135, .08, .008, .012, .0025],
  ['lace_L_1', 'black2', -.1, .106, .117, .08, .008, .012, .0025],
  ['lace_L_2', 'black2', -.1, .132, .099, .08, .008, .012, .0025],
  ['boot_sole_R', 'sole', .1, .02, .025, .17, .04, .27, .012],
  ['boot_R', 'boot', .1, .09, .02, .155, .11, .23, .035],
  ['lace_R_0', 'black2', .1, .08, .135, .08, .008, .012, .0025],
  ['lace_R_1', 'black2', .1, .106, .117, .08, .008, .012, .0025],
  ['lace_R_2', 'black2', .1, .132, .099, .08, .008, .012, .0025],
  ['cuff_L', 'black2', -.1, .17, -0, .19, .07, .2, .03],
  ['leg_L', 'black', -.1, .34, -0, .18, .3, .19, .035],
  ['pocket_L', 'black2', -.198, .31, -0, .03, .11, .12, .012],
  ['flap_L', 'black', -.2, .375, -0, .036, .025, .13, .008],
  ['cuff_R', 'black2', .1, .17, -0, .19, .07, .2, .03],
  ['leg_R', 'black', .1, .34, -0, .18, .3, .19, .035],
  ['pocket_R', 'black2', .198, .31, -0, .03, .11, .12, .012],
  ['flap_R', 'black', .2, .375, -0, .036, .025, .13, .008],
  ['hips', 'black', 0, .52, -0, .38, .12, .2, .04],
  ['belt', 'sole', 0, .565, -0, .385, .03, .205, .01],
  ['buckle', 'metal', 0, .565, .106, .05, .035, .012, .0033],
  ['strap', 'strap', .06, .44, .106, .0346, .2504, .008, .0033],
  ['chain', 'chain', -.13, .45, .103, .023, .2196, .008, .0025],
  ['hem_rib', 'pink_d', 0, .6, -0, .42, .04, .24, .018],
  ['torso', 'pink', 0, .77, -0, .42, .32, .24, .05],
  ['neck_rib', 'pink_d', 0, .935, -0, .13, .02, .1, .008],
  ['sleeve_L', 'pink', -.27, .75, .01, .1656, .3436, .16, .045],
  ['sleeve_cuff_L', 'pink_d', -.285, .565, .02, .1504, .0614, .165, .02],
  ['sleeve_R', 'pink', .27, .75, .01, .1656, .3436, .16, .045],
  ['sleeve_cuff_R', 'pink_d', .285, .565, .02, .1504, .0614, .165, .02],
  ['cord', 'cord', -.03, .9, .122, .038, .0738, .006, .002],
  ['cord2', 'cord', .03, .9, .122, .038, .0738, .006, .002],
  ['pendant', 'cord', 0, .855, .124, .02, .024, .01, .0041],
  ['neck', 'skin', 0, .95, -0, .07, .05, .07, .015],
  ['head', 'skin', 0, 1.12, -0, .32, .32, .32, .07],
  ['mouth', 'lip', 0, 1.025, .161, .035, .01, .006, .0025],
  ['hair_top', 'hair', 0, 1.25, -.002, .345, .11, .345, .05],
  ['hair_back', 'hair', 0, 1, -.15, .345, .5, .07, .0332],
  ['bangs', 'hair', 0, 1.165, .157, .335, .11, .04, .018],
  ['hair_side_-1', 'hair', -.168, 1.12, -.01, .05, .3, .3, .0238],
  ['lock_-1', 'hair', -.16, .87, .1, .1188, .4188, .1106, .0525],
  ['bang_tip_-1_0', 'hair', -.03, 1.105, .162, .0526, .0526, .035, .015],
  ['bang_tip_-1_1', 'hair', -.085, 1.111, .162, .0526, .0526, .035, .015],
  ['bang_tip_-1_2', 'hair', -.14, 1.117, .162, .0526, .0526, .035, .015],
  ['hair_side_1', 'hair', .168, 1.12, -.01, .05, .3, .3, .0238],
  ['lock_1', 'hair', .16, .87, .1, .1188, .4188, .1106, .0525],
  ['bang_tip_1_0', 'hair', .03, 1.105, .162, .0526, .0526, .035, .015],
  ['bang_tip_1_1', 'hair', .085, 1.111, .162, .0526, .0526, .035, .015],
  ['bang_tip_1_2', 'hair', .14, 1.117, .162, .0526, .0526, .035, .015],
  ['cup_-1', 'orange', -.2, 1.13, -0, .055, .13, .13, .0261],
  ['cushion_-1', 'cush', -.231, 1.13, -0, .012, .09, .09, .0049],
  ['band_side_-1', 'orange', -.193, 1.255, -0, .035, .15, .05, .014],
  ['cup_1', 'orange', .2, 1.13, -0, .055, .13, .13, .0261],
  ['cushion_1', 'cush', .231, 1.13, -0, .012, .09, .09, .0049],
  ['band_side_1', 'orange', .193, 1.255, -0, .035, .15, .05, .014],
  ['band_top', 'orange', 0, 1.32, -0, .42, .04, .05, .018],
  ['hand_-1', 'skin', -.285, .506, .02, .072, .072, .072, .014],
  ['hand_1', 'skin', .285, .506, .02, .072, .072, .072, .014],
];

/* 무리 — 이름으로 정한다. 돌쩌귀는 그 무리가 도는 자리 (L = -x 쪽) */
const groupOf = n =>
  /^(leg|cuff|pocket|flap|boot|boot_sole|lace)_/.test(n) ? (n.includes('_L') ? 'legL' : 'legR')
  : /^(sleeve|sleeve_cuff)_|^hand_/.test(n) ? (/_L$|_-1$/.test(n) ? 'armL' : 'armR')
  : /^(torso|hem_rib|neck_rib|neck|hips|belt|buckle|strap|chain|cord|cord2|pendant)$/.test(n) ? 'body' : 'head';
const PIVOT = { body: [0, 0, 0], head: [0, 0.95, 0], armL: [-0.27, 0.88, 0], armR: [0.27, 0.88, 0], legL: [-0.1, 0.49, 0], legR: [0.1, 0.49, 0] };
export const HEAD_TOP = 1.34, HEAD_Y = 1.19;   // HEAD_Y — Studio 가 얼굴 · 머리를 고를 때 다가가 볼 높이 (헤드폰까지 들어오게)

/* 둥근 상자 — 평평한 가운데는 한 칸, 모서리 둥근 자리에만 n 칸씩 (각도를 고르게). 이웃 면과 꼭 맞물린다 */
function rbox(P, N, I, cx, cy, cz, w, h, d, r, n = 2){
  const H = [w / 2, h / 2, d / 2], C = [cx, cy, cz];
  const samp = hh => {
    const a = hh - r, s = [];
    for (let k = n; k >= 1; k--) s.push(-a - r * Math.tan(k / n * Math.PI / 4));
    s.push(-a, a);
    for (let k = 1; k <= n; k++) s.push(a + r * Math.tan(k / n * Math.PI / 4));
    return s;
  };
  const AX = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];               // [법선, u, v] — u × v = 법선
  for (const [na, ua, va] of AX) for (const sg of [1, -1]){
    const su = samp(H[ua]), sv = samp(H[va]), m = su.length, base = P.length / 3;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++){
      const p = [0, 0, 0];
      p[na] = sg * H[na]; p[ua] = su[i]; p[va] = sv[j];
      const q = p.map((x, k) => Math.max(-(H[k] - r), Math.min(H[k] - r, x)));
      let dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
      const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
      P.push(C[0] + q[0] + dx * r, C[1] + q[1] + dy * r, C[2] + q[2] + dz * r);
      N.push(dx, dy, dz);
    }
    for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++){
      const a = base + j * m + i, b = a + 1, c = a + m + 1, e = a + m;
      if (sg > 0) I.push(a, b, c, a, c, e); else I.push(a, c, b, a, e, c);
    }
  }
}

/* 머리 모양 — 원본(긴 생머리)에서 길이만 줄이거나 빼고, 묶은 머리는 꽁지를 더한다 */
function hairCut(rows, kind){
  const cut = (n, bottom) => { const r = rows.find(x => x[0] === n); if (!r) return;
    const top = r[3] + r[6] / 2; r[6] = top - bottom; r[3] = (top + bottom) / 2; r[8] = Math.min(r[8], r[6] / 2 * 0.95); };
  const drop = re => rows.splice(0, rows.length, ...rows.filter(x => !re.test(x[0])));
  if (kind === 1){ cut('hair_back', 0.93); cut('lock_-1', 0.93); cut('lock_1', 0.93); }
  if (kind >= 2){ cut('hair_back', 1.06); cut('hair_side_-1', 1.03); cut('hair_side_1', 1.03); drop(/^lock_/); }
  if (kind === 3){
    rows.push(['tail', 'hair', 0, 0.93, -0.215, 0.1, 0.3, 0.08, 0.035]);
    rows.push(['tie', 'strap', 0, 1.08, -0.2, 0.07, 0.035, 0.07, 0.012]);
  }
}

/* 색 — 원본 재질 자리를 계정 색으로. 단 · 주머니처럼 원본이 한 톤 다르던 곳은 같은 색을 조금 밝게/어둡게 */
const lin = hex => new THREE.Color(hex);
function tone(hex, k){
  const c = lin(hex), l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (k > 0 && l < 0.06){ c.r += 0.025; c.g += 0.017; c.b += 0.016; }   // 아주 짙은 색은 어둡게 할 수 없어 밝힌다
  else c.multiplyScalar(k > 0 ? 0.87 : 0.5);
  return c.getHex();
}
function paintOf(c){
  const top = PALETTE[c.topColor], bot = PALETTE[c.bottomColor], shoe = PALETTE[c.shoesColor], ph = PALETTE[c.phonesColor];
  return (name, mat) => {
    switch (mat){
      case 'pink': return top;
      case 'pink_d': return tone(top, 1);
      case 'black': return bot;
      case 'black2': return name.startsWith('lace') ? tone(shoe, 1) : tone(bot, 1);
      case 'boot': return shoe;
      case 'sole': return name === 'belt' ? 0x160D0D : tone(shoe, -1);
      case 'skin': return SKINS[c.skin];
      case 'lip': return LIPS[c.lip];
      case 'hair': return HAIR_COLORS[c.hairColor];
      case 'orange': return ph;
      case 'cush': return tone(ph, -1);
      default: return { metal: 0x806769, strap: 0xD37277, chain: 0x322A2B, cord: 0x281212 }[mat] ?? 0x888888;
    }
  };
}

/* 유리 코팅 — 비칠 하늘을 작은 그림으로 (위는 하늘, 가운데 흰 지평선, 아래는 풀빛, 밝은 창 몇 개가 반짝임이 된다) */
let envTex = null;
function env(){
  if (envTex) return envTex;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#BFD9F2'); g.addColorStop(0.47, '#FFFFFF'); g.addColorStop(0.53, '#E9F2DE'); g.addColorStop(1, '#8FB880');
  x.fillStyle = g; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#FFFFFF';
  for (const [px, py, pw, ph] of [[40, 22, 34, 18], [150, 16, 46, 22], [214, 30, 22, 14]]){ x.globalAlpha = 0.95; x.fillRect(px, py, pw, ph); }
  envTex = new THREE.CanvasTexture(cv);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  return envTex;
}
const mats = new Map();
let gloss = 1;
/* 유광 — 색 위에 투명 유리 코팅(clearcoat)과 하늘 비침. 무광 — 코팅 없이 거친 겉면 (사용자 요청 — 고를 수 있게) */
const ENV = [0.55, 0.22];
const coated = (hex, matte = 0) => {
  const key = hex + '|' + matte;
  if (!mats.has(key)) mats.set(key, Object.assign(new THREE.MeshPhysicalMaterial(matte
    ? { color: hex, roughness: 0.9, metalness: 0, envMap: env(), envMapIntensity: ENV[1] * gloss }
    : { color: hex, roughness: 0.62, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env(), envMapIntensity: ENV[0] * gloss }),
    { userData: { env: ENV[matte] } }));
  return mats.get(key);
};
const glowMat = new THREE.MeshBasicMaterial({ color: 0xFFE089 });
const LAMP = 5, LAMP_REACH = 16, LAMP_DECAY = 1, LAMP_COLOR = 0xFFECC4;

export function createBlocky(c, { lamp = false } = {}){
  const own = [];
  const group = new THREE.Group();
  group.add(makeBlob(0.3));
  const J = {};
  for (const k in PIVOT){
    const p = new THREE.Group();
    p.position.fromArray(PIVOT[k]);
    group.add(p);
    J[k] = p;
  }
  const rows = PARTS.map(r => r.slice());
  hairCut(rows, c.hair);
  const keep = rows.filter(r => (c.phones || !/^(cup|cushion|band)_|^band_top/.test(r[0])) && (c.necklace || !/^(cord|cord2|pendant)$/.test(r[0])));
  const paint = paintOf(c);
  const bins = new Map();
  for (const r of keep){
    const gk = groupOf(r[0]), col = paint(r[0], r[1]), key = gk + '|' + col;
    if (!bins.has(key)) bins.set(key, { gk, col, P: [], N: [], I: [] });
    const b = bins.get(key), pv = PIVOT[gk];
    rbox(b.P, b.N, b.I, r[2] - pv[0], r[3] - pv[1], r[4] - pv[2], r[5], r[6], r[7], r[8]);
  }
  for (const b of bins.values()){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.N, 3));
    g.setIndex(b.I);
    own.push(g);
    J[b.gk].add(new THREE.Mesh(g, coated(b.col, c.finish)));
  }

  /* 밤의 등불 — 오른손에. 빛은 내 캐릭터에만, group 에 늘 달아 두고 세기만 바꾼다 (actor.js 와 같은 까닭) */
  const lantern = new THREE.Group();
  lantern.position.set(0.015, -0.39, 0.03);
  J.armR.add(lantern);
  const rodG = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), bulbG = new THREE.SphereGeometry(1, 12, 9);
  own.push(rodG, bulbG);
  const rod = new THREE.Mesh(rodG, coated(0xB08A62, c.finish)); rod.position.y = 0.22; lantern.add(rod);
  const bulb = new THREE.Mesh(bulbG, glowMat); bulb.position.set(0, 0.5, 0.04); bulb.scale.set(0.055, 0.066, 0.055); lantern.add(bulb);
  lantern.visible = false;
  let glow = null;
  if (lamp){ glow = new THREE.PointLight(LAMP_COLOR, 0, LAMP_REACH, LAMP_DECAY); glow.position.set(0.15, 2.4, 0); group.add(glow); }

  let phase = 0, idle = Math.random() * 6, reachLeft = 0, tossLeft = 0, holding = false;
  const TOSS_TIME = 0.55;
  const ease = (o, k, v, t) => { o[k] += (v - o[k]) * t; };
  return {
    group, headTop: HEAD_TOP, headY: HEAD_Y, nearZ: 1.9,
    setHand(dark){
      holding = !!dark;
      lantern.visible = holding;
      if (glow) glow.intensity = dark ? LAMP : 0;
      const g = dark ? 0.15 : 1;                    // 밤에는 하늘이 비치지 않는다
      if (g !== gloss){ gloss = g; for (const m of mats.values()) m.envMapIntensity = m.userData.env * g; }
    },
    reach(sec){ reachLeft = Math.max(reachLeft, sec || 2); },
    reaching(){ return reachLeft > 0; },
    toss(){ tossLeft = TOSS_TIME; },
    setPose(){}, poseCount: 0,
    update(dt, speed){
      idle += dt;
      const t = Math.min(1, dt * (speed > 0.05 ? 14 : 6));
      let sw = 0, bob = 0;
      if (speed > 0.05){
        phase += dt * (5.5 + speed * 1.9);
        sw = Math.sin(phase); bob = Math.abs(Math.cos(phase)) * 0.02;
      } else phase = 0;
      ease(J.legL.rotation, 'x', -sw * 0.55, t);
      ease(J.legR.rotation, 'x', sw * 0.55, t);
      ease(J.armL.rotation, 'x', sw * 0.5, t);
      ease(J.armR.rotation, 'x', holding ? -0.45 : -sw * 0.5, t);
      ease(J.armL.rotation, 'z', -0.06, t); ease(J.armR.rotation, 'z', 0.06, t);
      ease(J.head.rotation, 'y', speed > 0.05 ? sw * 0.06 : Math.sin(idle * 0.4) * 0.25, t * 0.5);
      ease(J.head.rotation, 'x', speed > 0.05 ? 0 : Math.sin(idle * 1.5) * 0.02, t);
      for (const k in J) if (k !== 'legL' && k !== 'legR') J[k].position.y = PIVOT[k][1] + bob;
      if (tossLeft > 0){
        tossLeft -= dt;
        const k = 1 - tossLeft / TOSS_TIME;
        J.armL.rotation.x = k < 0.3 ? (k / 0.3) * 1.5 - 0.1 : 1.4 - ((k - 0.3) / 0.7) * 3.3;
        J.armL.rotation.z = -0.8;
      } else {
        if (reachLeft > 0){
          reachLeft -= dt;
          const k = Math.min(1, reachLeft / 0.3);
          J.armL.rotation.set(-1.1 * k, 0, -0.5 * k);
        }
      }
    },
    dispose(){ for (const o of own) o.dispose(); }
  };
}
