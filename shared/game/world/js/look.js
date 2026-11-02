import * as THREE from 'three';

/*
 * 그림체를 한 곳에 모아 둔다.
 *
 * 사실적인 음영 대신 단계가 뚝뚝 끊기는 토온 음영을 쓰고, 그림자 맵은
 * 아예 끄고 발밑에 부드러운 원 하나만 깐다. 일러스트처럼 보이면서
 * 폰에서도 가볍게 돈다.
 */

// 토온 음영의 단계. 세 칸이라 면이 셋으로만 나뉜다.
const steps = new Uint8Array([90, 175, 255]);
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
  grad.addColorStop(0,    'rgba(60,70,55,0.38)');
  grad.addColorStop(0.55, 'rgba(60,70,55,0.18)');
  grad.addColorStop(1,    'rgba(60,70,55,0)');
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

/* ── 색 ── */

export const SKY = 0xDCEFF6;

// 무지개 일곱 빛깔. 파스텔로 눌러 눈이 편하게.
export const RAINBOW = [
  0xF28B82, 0xF7B267, 0xF6DD72, 0x9BD178,
  0x7EC8E3, 0x8B9FE8, 0xC49BE0
];

function hashOf(name){
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** 머리칼. 옷과 같은 색이면 뒤에서 볼 때 한 덩어리로 뭉친다. */
export function hairFor(name){
  const HAIR = [0x6B4A3A, 0x463A36, 0x8A5A3C, 0x3E3A3C, 0xA9764A, 0x5E4636];
  return HAIR[hashOf(name + 'hair') % HAIR.length];
}

/** 강아지 털. 파란 강아지는 없으니 따뜻한 색에서만 고른다. */
export function furFor(name){
  const FUR = [0xEBC99A, 0xD9A878, 0xF2E4CE, 0xB08E6E, 0xCFC4B4, 0xE8D2A8];
  return FUR[hashOf(name + 'fur') % FUR.length];
}

/** 이름이 같으면 늘 같은 색. */
export function colorFor(name){
  const PALETTE = [
    0xF2A2A2, 0xF6C48A, 0xF3E29A, 0xA8D9A0,
    0x9BD2E0, 0xA9B2E8, 0xD3AEE6, 0xF0B9D4
  ];
  return PALETTE[hashOf(name) % PALETTE.length];
}
