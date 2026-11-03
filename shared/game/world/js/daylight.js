import * as THREE from 'three';

/*
 * 시간에 따라 정원의 빛이 바뀐다. 새벽 · 아침 · 낮 · 노을 · 밤.
 *
 * 기기의 실제 시각을 따른다 — 밤에 열면 밤 정원이다. 단계가 딱 끊기지
 * 않고 두 단계 사이를 천천히 건너간다.
 *
 * 미리보기: 주소 뒤에 #t=night 처럼 붙이면 그 시간대로 고정된다.
 * (dawn / morning / day / sunset / night)
 */

const LOOKS = {
  night: {
    label:'밤',
    sky:0x2E3858, fogNear:18, fogFar:64,
    // 밤이라도 누가 어디 있는지는 보여야 한다. 너무 깎으면 캐릭터가 묻힌다.
    hemiSky:0x6C7AA6, hemiGround:0x3C4642, hemi:0.78,
    sun:0xA8B4D8, sunPower:0.4, sunHeight:0.55, stars:1, dark:1
  },
  dawn: {
    label:'새벽',
    sky:0xC9B4CE, fogNear:22, fogFar:70,
    hemiSky:0xE2CBD6, hemiGround:0x8CA188, hemi:0.9,
    sun:0xFFC4A8, sunPower:0.55, sunHeight:0.14, stars:0.3, dark:0.62
  },
  morning: {
    label:'아침',
    sky:0xCDEBF8, fogNear:32, fogFar:92,
    hemiSky:0xFFFFFF, hemiGround:0xD6F5C4, hemi:1.25,
    sun:0xFFF0D6, sunPower:0.95, sunHeight:0.42, stars:0, dark:0.05
  },
  day: {
    label:'낮',
    sky:0xC3EBF8, fogNear:38, fogFar:104,
    hemiSky:0xFFFFFF, hemiGround:0xD6F5C4, hemi:1.35,
    sun:0xFFFBF0, sunPower:1.0, sunHeight:0.95, stars:0, dark:0
  },
  sunset: {
    label:'노을',
    sky:0xF6C3A0, fogNear:26, fogFar:78,
    hemiSky:0xFFD9BC, hemiGround:0xEDC9A4, hemi:1.05,
    sun:0xFF9E72, sunPower:0.8, sunHeight:0.12, stars:0.08, dark:0.34
  }
};

// 몇 시에 어떤 빛인지. 사이 시각은 두 쪽을 섞는다.
const CLOCK = [
  [0,  'night'], [4,  'night'], [5.5, 'dawn'], [7, 'morning'],
  [10, 'day'],   [16, 'day'],   [18,  'sunset'], [19.5, 'sunset'],
  [21, 'night'], [24, 'night']
];

function hourNow(){
  const forced = /(?:^#|[#&])t=([a-z]+)/.exec(location.hash || '');
  if (forced && LOOKS[forced[1]]){
    // 미리보기 — 그 시간대 한가운데를 골라 준다
    const key = forced[1];
    for (let i = 1; i < CLOCK.length; i++){
      if (CLOCK[i][1] === key && CLOCK[i - 1][1] === key){
        return (CLOCK[i - 1][0] + CLOCK[i][0]) / 2;
      }
    }
    for (const [h, k] of CLOCK) if (k === key) return h;
  }
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const ca = new THREE.Color(), cb = new THREE.Color();
const mix = (a, b, t) => a + (b - a) * t;

/** 지금 시각의 빛을 섞어 돌려준다. */
export function lookNow(){
  const h = hourNow();
  let i = 1;
  while (i < CLOCK.length - 1 && CLOCK[i][0] <= h) i++;
  const [h0, k0] = CLOCK[i - 1];
  const [h1, k1] = CLOCK[i];
  const span = h1 - h0;
  // 부드럽게 건너가도록 양 끝에서 천천히
  const raw = span > 0 ? Math.min(1, Math.max(0, (h - h0) / span)) : 0;
  const t = raw * raw * (3 - 2 * raw);

  const A = LOOKS[k0], B = LOOKS[k1];
  return {
    label: t < 0.5 ? A.label : B.label,
    sky:        ca.setHex(A.sky).lerp(cb.setHex(B.sky), t).getHex(),
    hemiSky:    ca.setHex(A.hemiSky).lerp(cb.setHex(B.hemiSky), t).getHex(),
    hemiGround: ca.setHex(A.hemiGround).lerp(cb.setHex(B.hemiGround), t).getHex(),
    sun:        ca.setHex(A.sun).lerp(cb.setHex(B.sun), t).getHex(),
    fogNear:   mix(A.fogNear, B.fogNear, t),
    fogFar:    mix(A.fogFar, B.fogFar, t),
    hemi:      mix(A.hemi, B.hemi, t),
    sunPower:  mix(A.sunPower, B.sunPower, t),
    sunHeight: mix(A.sunHeight, B.sunHeight, t),
    stars:     mix(A.stars, B.stars, t),
    dark:      mix(A.dark, B.dark, t)
  };
}

/** 밤하늘의 별. 낮에는 투명해져 사라진다. */
export function createStars(radius){
  const COUNT = 420;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++){
    // 지평선 아래로는 두지 않는다
    const a = Math.random() * Math.PI * 2;
    const y = 0.08 + Math.random() * 0.92;
    const r = Math.sqrt(1 - y * y);
    pos[i * 3]     = Math.cos(a) * r * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(a) * r * radius;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xFFFBEC, size: radius * 0.012,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
    sizeAttenuation: true
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -2;
  return points;
}

/** 재어 둔 빛을 하늘·안개·조명·별에 바른다. */
export function applyLook(look, { scene, hemi, sun, stars, follow }){
  scene.background.setHex(look.sky);
  scene.fog.color.setHex(look.sky);
  scene.fog.near = look.fogNear;
  scene.fog.far = look.fogFar;

  hemi.color.setHex(look.hemiSky);
  hemi.groundColor.setHex(look.hemiGround);
  hemi.intensity = look.hemi;

  sun.color.setHex(look.sun);
  sun.intensity = look.sunPower;
  // 해가 낮을수록 빛이 옆에서 들어온다
  const high = look.sunHeight;
  sun.position.set(
    follow.x + 9,
    1 + high * 26,
    follow.z + 7 + (1 - high) * 10
  );

  if (stars){
    stars.material.opacity = look.stars;
    stars.visible = look.stars > 0.01;
    stars.position.set(follow.x, 0, follow.z);
  }
}
