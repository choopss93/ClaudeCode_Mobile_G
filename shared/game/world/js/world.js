import * as THREE from 'three';
import { toon, toonUnique, swayed, RAINBOW } from './look.js';

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

  /* ── 들판 ── */

  // 울타리 너머로도 들판이 이어진다. 여기서 끊기면 정원이 하늘에 뜬
  // 접시처럼 보인다. 멀리는 안개가 하늘빛으로 지워 준다.
  const field = new THREE.Mesh(
    new THREE.CircleGeometry(120, 48),
    toon(0xC6F0AC)
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.03;
  group.add(field);

  const lawn = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS, 56),
    toon(0xB7ED99)
  );
  lawn.rotation.x = -Math.PI / 2;
  group.add(lawn);

  // 가운데 모이는 자리 — 풀을 짧게 깎은 듯한 옅은 풀빛
  const clearing = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), toon(0xC4F0A8));
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
  // 처음 들어섰을 때 정면에 보이도록. 가까우면 세로 화면에서 머리 위를
  // 덮어 아치가 아니라 기둥처럼 보인다.
  arch.position.set(0, 0, -17);
  group.add(arch);

  /* ── 연못 ── */
  const POND = { x: -9.5, z: 6.5, r: 3.1 };
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r, 32), toon(0x94E4F4));
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.x, 0.02, POND.z);
  group.add(water);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(POND.r + 0.12, 0.22, 6, 32),
    toon(0xF7ECCF)
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(POND.x, 0.1, POND.z);
  group.add(rim);
  colliders.push({ x: POND.x, z: POND.z, r: POND.r + 0.1 });

  /* ── 나무와 덤불 ── */
  const GREENS = [0x9AE385, 0xAEF09B, 0x8CD87F];
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
      put(rod, 0xDCB795, x, th / 2, z, 0.12, th, 0.12);
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
    put(rod, 0xFFFAED, x, 0.15, z, 0.072, 0.15, 0.072);
    put(ball, rnd() > 0.5 ? 0xFF8F9E : 0xFFD078, x, 0.3, z, 0.185, 0.125, 0.185);
    colliders.push({ x, z, r: 0.22 });
  }

  /* ── 가운데 등불 ── */
  put(rod, 0xF7ECCF, 0, 0.55, 0, 0.08, 0.55, 0.08);
  put(ball, 0xFFF7C5, 0, 1.22, 0, 0.3, 0.34, 0.3);
  colliders.push({ x: 0, z: 0, r: 0.3 });

  /* ── 들꽃과 풀포기 ──
     수가 많아 하나씩 그리면 폰이 버겁다. 같은 모양을 한 번에 그리는
     인스턴스로 묶어, 들꽃 전체가 그리기 두 번이면 끝난다. */

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  // 들판 어디에 설지 고른다. 안쪽은 촘촘하게, 울타리 너머는 성기게.
  function spot(){
    const inside = rnd() < 0.68;
    const ang = rnd() * Math.PI * 2;
    // 가운데 모이는 자리는 비워 둔다 — 풀이 짧게 깎인 곳이다
    const dist = inside
      ? 5.2 + rnd() * (WORLD_RADIUS - 6)
      : WORLD_RADIUS + 2.5 + rnd() * 42;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    if (inside){
      for (const c of colliders){
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 0.45) ** 2) return null;
      }
    }
    return { x, z };
  }

  const FLOWERS = 480;
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.028, 1, 5);
  stemGeo.translate(0, 0.5, 0);              // 밑동을 원점에 두고 높이만 늘린다
  const bloomGeo = new THREE.SphereGeometry(1, 7, 5);

  // 바람에 흔들 재질은 고쳐 쓰므로 공유 재질(toon)을 넘기면 안 된다.
  const stems  = new THREE.InstancedMesh(
    stemGeo, swayed(toonUnique(0x94DC83), 'stalk'), FLOWERS);
  // 꽃잎 색은 송이마다 다르다. 흰 재질에 색을 곱해야 그대로 나온다.
  const blooms = new THREE.InstancedMesh(
    bloomGeo, swayed(toonUnique(0xFFFFFF), 'head'), FLOWERS);

  let f = 0, tries = 0;
  while (f < FLOWERS && tries++ < FLOWERS * 12){
    const at = spot();
    if (!at) continue;

    const h = 0.2 + rnd() * 0.26;
    dummy.position.set(at.x, 0, at.z);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    stems.setMatrixAt(f, dummy.matrix);

    const r = 0.065 + rnd() * 0.055;
    dummy.position.set(at.x, h + r * 0.5, at.z);
    dummy.scale.set(r, r * 0.78, r);
    dummy.updateMatrix();
    blooms.setMatrixAt(f, dummy.matrix);
    blooms.setColorAt(f, tint.setHex(RAINBOW[Math.floor(rnd() * RAINBOW.length)]));
    f++;
  }
  stems.count = blooms.count = f;
  stems.instanceMatrix.needsUpdate = true;
  blooms.instanceMatrix.needsUpdate = true;
  blooms.instanceColor.needsUpdate = true;
  group.add(stems, blooms);

  // 풀포기 — 들판을 초록초록하게 만드는 잔털
  // 넓적하면 풀이 아니라 삼각형 조각처럼 보인다. 가늘고 길어야 풀날이다.
  const TUFTS = 850;
  const tuftGeo = new THREE.ConeGeometry(0.055, 1, 5);
  tuftGeo.translate(0, 0.5, 0);
  const tufts = new THREE.InstancedMesh(
    tuftGeo, swayed(toonUnique(0xFFFFFF), 'stalk'), TUFTS);
  const TUFT_GREENS = [0x9AE385, 0xAEF09B, 0x8CD87F];

  let t = 0; tries = 0;
  while (t < TUFTS && tries++ < TUFTS * 12){
    const at = spot();
    if (!at) continue;
    const h = 0.22 + rnd() * 0.3;
    dummy.position.set(at.x, 0, at.z);
    dummy.scale.set(0.7 + rnd() * 0.5, h, 0.7 + rnd() * 0.5);
    dummy.rotation.set((rnd() - 0.5) * 0.4, rnd() * 3.14, (rnd() - 0.5) * 0.4);
    dummy.updateMatrix();
    tufts.setMatrixAt(t, dummy.matrix);
    tufts.setColorAt(t, tint.setHex(TUFT_GREENS[Math.floor(rnd() * TUFT_GREENS.length)]));
    t++;
  }
  dummy.rotation.set(0, 0, 0);
  tufts.count = t;
  tufts.instanceMatrix.needsUpdate = true;
  tufts.instanceColor.needsUpdate = true;
  group.add(tufts);

  /* ── 바깥 울타리: 둥근 산울타리 ── */
  const hedge = new THREE.Mesh(
    new THREE.TorusGeometry(WORLD_RADIUS, 0.75, 7, 64),
    toon(0x94DE83)
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
