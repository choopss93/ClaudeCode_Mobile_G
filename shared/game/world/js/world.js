import * as THREE from 'three';
import { toon, toonUnique, RAINBOW } from './look.js';

// 정원은 모든 접속자에게 똑같아야 하므로 난수를 고정 씨앗으로 돌린다.
function seeded(seed){
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export const WORLD_RADIUS = 21;

export function createWorld(){
  const rnd = seeded(20260314);
  const group = new THREE.Group();
  const colliders = [];              // {x, z, r}

  const ball = new THREE.SphereGeometry(1, 14, 10);
  const rod  = new THREE.CylinderGeometry(1, 1, 1, 8);

  function put(geo, color, x, y, z, sx, sy, sz){
    const m = new THREE.Mesh(geo, toon(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy ?? sx, sz ?? sx);
    group.add(m);
    return m;
  }

  /* ── 잔디 ── */
  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS, 56),
    toon(0x9EE87A)
  );
  lawn.rotation.x = -Math.PI / 2;
  group.add(lawn);

  // 가운데 빈터 — 모이는 자리
  const clearing = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), toon(0xFFF9E8));
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = 0.01;
  group.add(clearing);

  /* ── 무지개 ── */
  const arch = new THREE.Group();
  RAINBOW.forEach((c, i) => {
    const r = 8.6 - i * 0.44;
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.26, 6, 36, Math.PI),
      toonUnique(c, { transparent: true, opacity: 0.88 })
    );
    arch.add(band);
  });
  // 처음 들어섰을 때 정면에 보이도록. 가까우면 화면 밖으로 넘친다.
  arch.position.set(0, 0, -13);
  group.add(arch);

  /* ── 연못 ── */
  const POND = { x: -9.5, z: 6.5, r: 3.1 };
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 32), toon(0x6FDCF5));
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, 0.02, POND.z);
  group.add(water);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(POND.r + 0.12, 0.22, 6, 32),
    toon(0xF5E7C4)
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(POND.x, 0.1, POND.z);
  group.add(rim);
  colliders.push({ x: POND.x, z: POND.z, r: POND.r + 0.1 });

  /* ── 무지개 꽃밭: 빛깔마다 한 뙈기씩 ── */
  RAINBOW.forEach((c, i) => {
    const ang = (i / RAINBOW.length) * Math.PI * 2 + 0.35;
    const bx = Math.cos(ang) * 11.5;
    const bz = Math.sin(ang) * 11.5;

    const bed = new THREE.Mesh(new THREE.CircleGeometry(2, 20), toon(0x8AE069));
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(bx, 0.012, bz);
    group.add(bed);

    for (let f = 0; f < 9; f++){
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 1.6;
      const fx = bx + Math.cos(a) * d;
      const fz = bz + Math.sin(a) * d;
      const h = 0.3 + rnd() * 0.2;
      put(rod, 0x6FD15C, fx, h / 2, fz, 0.022, h, 0.022);
      put(ball, c, fx, h + 0.07, fz, 0.13, 0.1, 0.13);
      put(ball, 0xFFFAE4, fx, h + 0.105, fz, 0.05, 0.04, 0.05);   // 꽃술
    }
    // 꽃은 지나다닐 수 있게 충돌체를 두지 않는다
  });

  /* ── 나무와 덤불 ── */
  const GREENS = [0x76DB5F, 0x92EC7C, 0x63CC56];
  for (let i = 0; i < 16; i++){
    const ang = rnd() * Math.PI * 2;
    const dist = 6.5 + rnd() * (WORLD_RADIUS - 9);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;

    let clash = false;
    for (const c of colliders){
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.8) ** 2){ clash = true; break; }
    }
    if (clash) continue;

    if (rnd() > 0.42){
      const th = 0.9 + rnd() * 0.6;
      put(rod, 0xD1A277, x, th / 2, z, 0.12, th, 0.12);
      const r = 0.95 + rnd() * 0.5;
      const g = GREENS[Math.floor(rnd() * GREENS.length)];
      put(ball, g, x, th + r * 0.55, z, r, r * 0.86, r);
      put(ball, g, x - r * 0.5, th + r * 0.25, z + r * 0.2, r * 0.6);
      put(ball, g, x + r * 0.45, th + r * 0.3, z - r * 0.15, r * 0.55);
      colliders.push({ x, z, r: 0.42 });
    } else {
      const r = 0.55 + rnd() * 0.35;
      const g = GREENS[Math.floor(rnd() * GREENS.length)];
      put(ball, g, x, r * 0.72, z, r, r * 0.8, r);
      put(ball, g, x + r * 0.7, r * 0.5, z + r * 0.3, r * 0.6);
      colliders.push({ x, z, r: r * 0.9 });
    }
  }

  /* ── 버섯 ── */
  for (let i = 0; i < 7; i++){
    const ang = rnd() * Math.PI * 2;
    const dist = 6 + rnd() * (WORLD_RADIUS - 9);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    put(rod, 0xFFFAEC, x, 0.15, z, 0.072, 0.15, 0.072);
    put(ball, rnd() > 0.5 ? 0xFF8F9E : 0xFFC14D, x, 0.3, z, 0.185, 0.125, 0.185);
    colliders.push({ x, z, r: 0.22 });
  }

  /* ── 가운데 등불 ── */
  put(rod, 0xF5E7C4, 0, 0.55, 0, 0.08, 0.55, 0.08);
  put(ball, 0xFFF6B8, 0, 1.22, 0, 0.3, 0.34, 0.3);
  colliders.push({ x: 0, z: 0, r: 0.3 });

  /* ── 바깥 울타리: 둥근 산울타리 ── */
  const hedge = new THREE.Mesh(
    new THREE.TorusGeometry(WORLD_RADIUS, 0.75, 7, 64),
    toon(0x6FD45C)
  );
  hedge.rotation.x = -Math.PI / 2;
  hedge.position.y = 0.45;
  group.add(hedge);

  return { group, colliders, radius: WORLD_RADIUS };
}

/** 정원 안에 머물게 하고, 덤불·연못을 통과하지 못하게 밀어낸다. */
export function resolve(world, x, z, bodyRadius = 0.26){
  for (const c of world.colliders){
    const dx = x - c.x, dz = z - c.z;
    const min = c.r + bodyRadius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6){
      const d = Math.sqrt(d2);
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  const edge = world.radius - bodyRadius - 0.8;
  const d = Math.hypot(x, z);
  if (d > edge){ x = (x / d) * edge; z = (z / d) * edge; }
  return { x, z };
}
