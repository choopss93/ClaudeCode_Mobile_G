import * as THREE from 'three';

/*
 * 그림체를 한 곳에 모아 둔다.
 *
 * 사실적인 음영 대신 단계가 뚝뚝 끊기는 토온 음영을 쓰고, 그림자 맵은
 * 아예 끄고 발밑에 부드러운 원 하나만 깐다. 일러스트처럼 보이면서
 * 폰에서도 가볍게 돈다.
 */

// 토온 음영의 단계. 세 칸이라 면이 셋으로만 나뉜다.
// 가장 어두운 칸을 높게 잡아야 그늘진 면도 화사하게 남는다.
const steps = new Uint8Array([155, 215, 255]);
const gradientMap = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.generateMipmaps = false;
gradientMap.needsUpdate = true;

const cache = new Map();

/** 같은 색은 재질 하나를 나눠 쓴다. */
export function toon(color){
  let m = cache.get(color);
  if (!m){
    m = new THREE.MeshToonMaterial({ color, gradientMap });
    cache.set(color, m);
  }
  return m;
}

/** 재질을 나눠 쓰면 안 되는 경우(투명도 등)에만. */
export function toonUnique(color, opts = {}){
  return new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
}

/* ── 발밑 그림자 ── */

let blobTex = null;
function blobTexture(){
  if (blobTex) return blobTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0,    'rgba(90,110,80,0.24)');
  grad.addColorStop(0.55, 'rgba(90,110,80,0.11)');
  grad.addColorStop(1,    'rgba(90,110,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

let blobGeo = null;
/** 캐릭터 발밑에 까는 부드러운 그림자 원. */
export function makeBlob(radius){
  if (!blobGeo) blobGeo = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({
    map: blobTexture(),
    transparent: true,
    depthWrite: false
  }));
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(radius * 2);
  m.position.y = 0.015;
  m.renderOrder = -1;
  return m;
}

/* ── 스프레이 자국 ── */

/* 둥근 자국 하나를 가운데는 진하게, 가장자리는 뿌옇게 만든다.
   한 장을 모든 자국이 나눠 쓴다 — 색은 재질이 맡는다. */
let sprayTex = null;
function sprayTexture(){
  if (sprayTex) return sprayTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  /* **알파맵은 투명도가 아니라 밝기를 본다.** 투명도로 그리면 화면에
     올라올 때 안쪽이 통째로 흰색(=불투명)이 되어 가장자리가 칼처럼
     떨어진다. 한 번 그렇게 만들어 동그란 딱지가 붙은 꼴이었다.
     그러니 **검은 바탕에 흰 원**을 그려서 밝기로 번지게 한다. */
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // 가운데 절반쯤은 꽉 찬 색이고 거기서부터 스르르 사라진다
  grad.addColorStop(0,    '#ffffff');
  grad.addColorStop(0.50, '#f7f7f7');
  grad.addColorStop(0.70, '#b4b4b4');
  grad.addColorStop(0.84, '#4d4d4d');
  grad.addColorStop(0.92, '#1a1a1a');
  grad.addColorStop(1,    '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  sprayTex = new THREE.CanvasTexture(c);
  sprayTex.colorSpace = THREE.NoColorSpace;   // 밝기 그대로 읽어야 한다
  return sprayTex;
}

const sprayCache = new Map();
/** 뿌린 자국의 재질. 빛은 받되 깊이는 쓰지 않는다. */
export function sprayMat(color){
  let m = sprayCache.get(color);
  if (!m){
    m = new THREE.MeshToonMaterial({
      color, gradientMap,
      alphaMap: sprayTexture(),
      transparent: true,
      /* 몸에 바짝 붙여 놓으므로 깊이를 쓰면 살갗과 다투며 깜빡인다.
         깊이를 안 쓰는 대신 그리는 차례를 몸보다 뒤로 미룬다. */
      depthWrite: false
    });
    sprayCache.set(color, m);
  }
  return m;
}

let sprayGeo = null;
/** 자국 하나. 크기는 바깥에서 정한다. */
export function makeSpray(color){
  if (!sprayGeo) sprayGeo = new THREE.PlaneGeometry(1, 1);
  const m = new THREE.Mesh(sprayGeo, sprayMat(color));
  m.renderOrder = 2;
  return m;
}

/* ── 바람 ── */

/*
 * 들꽃과 풀을 바람에 흔든다.
 *
 * 송이가 천 개가 넘어 매 프레임 자리를 다시 계산하면 폰이 버티지 못한다.
 * 그래서 자리는 그대로 두고 그래픽카드가 그리면서 휘게 한다 — CPU 는
 * 시간 하나만 올려 주면 된다.
 */
export const wind = {
  time: { value: 0 },
  sway: { value: 0.055 }      // 꼭대기가 휘는 폭 (미터)
};

// 흔들림을 싫어하는 사람에게는 멈춰 둔다.
try {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) wind.sway.value = 0;
} catch (_){}

// stalk: 밑동은 붙어 있고 위로 갈수록 휜다 (꽃대 · 풀날)
// head: 통째로 꽃대 끝을 따라 움직인다 (꽃잎)
const HEIGHT = { stalk: 'clamp(transformed.y, 0.0, 1.0)', head: '1.0' };

/** InstancedMesh 전용. 재질 하나를 바람에 흔들리게 고쳐 돌려준다. */
export function swayed(material, mode){
  const lift = HEIGHT[mode];
  material.onBeforeCompile = shader => {
    shader.uniforms.uWindTime = wind.time;
    shader.uniforms.uWindSway = wind.sway;
    shader.vertexShader =
      'uniform float uWindTime;\nuniform float uWindSway;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      {
        // 포기마다 자리가 다르므로 흔들리는 때도 조금씩 어긋난다
        vec3 ip = instanceMatrix[3].xyz;
        float sx = max(length(instanceMatrix[0].xyz), 0.0001);
        float ph = uWindTime * 1.5 + ip.x * 0.32 + ip.z * 0.32;
        float bend = (sin(ph) * 0.55 + sin(ph * 2.1 + 1.3) * 0.2) * uWindSway;
        float lift = ${lift};
        // 인스턴스 배율로 나눠, 크기가 달라도 같은 만큼 휘게 한다
        transformed.x += bend * lift / sx;
        transformed.z += bend * 0.4 * lift / sx;
      }
      #endif`
    );
  };
  // 두 모드가 같은 프로그램을 나눠 쓰면 한쪽 코드가 무시된다
  material.customProgramCacheKey = () => 'sway-' + mode;
  return material;
}

/* ── 색 ── */

export const SKY = 0xC3EBF8;

// 무지개 일곱 빛깔. 파스텔로 눌러 눈이 편하게.
export const RAINBOW = [
  0xFF9CA0, 0xFFBE78, 0xFFE783, 0x94E799,
  0x7DDDF4, 0xA2AFFC, 0xE3A9FC
];

function hashOf(name){
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** 머리칼. 옷과 같은 색이면 뒤에서 볼 때 한 덩어리로 뭉친다. */
export function hairFor(name){
  const HAIR = [0xBC8966, 0x97786A, 0xD5A372, 0x81716D, 0xE1B47C, 0xA88161];
  return HAIR[hashOf(name + 'hair') % HAIR.length];
}

/** 이름이 같으면 늘 같은 색. */
export function colorFor(name){
  const PALETTE = [
    0xFFABB4, 0xFFCD88, 0xFFED98, 0xACEDA5,
    0x94E2F1, 0xB1BCFC, 0xE7B5F2, 0xFFB6D9
  ];
  return PALETTE[hashOf(name) % PALETTE.length];
}
