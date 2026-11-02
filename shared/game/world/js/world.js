import * as THREE from 'three';
import { toon, toonUnique, swayed, RAINBOW } from '#look';

// 정원은 모든 접속자에게 똑같아야 하므로 난수를 고정 씨앗으로 돌린다.
function seeded(seed){
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export const WORLD_RADIUS = 44;   // 거닐 맛이 나도록 넓게

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
    new THREE.CircleGeometry(220, 56),
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
  const clearing = new THREE.Mesh(new THREE.CircleGeometry(5.4, 40), toon(0xC4F0A8));
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
  arch.position.set(0, 0, -21);
  group.add(arch);

  /* ── 연못 ── */
  const POND = { x: -17, z: 12, r: 5.2 };
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

  /* ── 나무와 덤불 ──
     들판이 넓어지며 수가 서너 배로 늘었다. 하나씩 그리면 그리기 횟수가
     수백 번이 되므로, 줄기와 잎덩이를 각각 인스턴스로 묶는다. */
  const GREENS = [0x9AE385, 0xAEF09B, 0x8CD87F];
  const PLANTS = 58;
  const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 7);
  trunkGeo.translate(0, 0.5, 0);

  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0xDCB795), PLANTS);
  const leaves = new THREE.InstancedMesh(ball, toonUnique(0xFFFFFF), PLANTS * 3);
  const plantAt = new THREE.Object3D();
  const leafTint = new THREE.Color();
  let tn = 0, ln = 0;

  function leaf(x, y, z, sx, sy, sz, color){
    plantAt.position.set(x, y, z);
    plantAt.scale.set(sx, sy, sz);
    plantAt.updateMatrix();
    leaves.setMatrixAt(ln, plantAt.matrix);
    leaves.setColorAt(ln, leafTint.setHex(color));
    ln++;
  }

  for (let i = 0; i < PLANTS; i++){
    const ang = rnd() * Math.PI * 2;
    const dist = 7 + rnd() * (WORLD_RADIUS - 10);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;

    let clash = false;
    for (const c of colliders){
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.8) ** 2){ clash = true; break; }
    }
    if (clash) continue;

    const g = GREENS[Math.floor(rnd() * GREENS.length)];
    if (rnd() > 0.42){
      const th = 0.9 + rnd() * 0.7;
      plantAt.position.set(x, 0, z);
      plantAt.scale.set(0.12, th, 0.12);
      plantAt.updateMatrix();
      trunks.setMatrixAt(tn++, plantAt.matrix);

      const r = 0.95 + rnd() * 0.6;
      leaf(x, th + r * 0.55, z, r, r * 0.86, r, g);
      leaf(x - r * 0.5, th + r * 0.25, z + r * 0.2, r * 0.6, r * 0.6, r * 0.6, g);
      leaf(x + r * 0.45, th + r * 0.3, z - r * 0.15, r * 0.55, r * 0.55, r * 0.55, g);
      colliders.push({ x, z, r: 0.42 });
    } else {
      const r = 0.55 + rnd() * 0.4;
      leaf(x, r * 0.72, z, r, r * 0.8, r, g);
      leaf(x + r * 0.7, r * 0.5, z + r * 0.3, r * 0.6, r * 0.6, r * 0.6, g);
      colliders.push({ x, z, r: r * 0.9 });
    }
  }
  trunks.count = tn;
  leaves.count = ln;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  leaves.instanceColor.needsUpdate = true;
  group.add(trunks, leaves);

  /* ── 버섯 ── */
  for (let i = 0; i < 18; i++){
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

  // 그 자리에 심어도 되는지. 울타리 너머는 배경일 뿐이라 따지지 않는다.
  function free(x, z, pad){
    const d = Math.hypot(x, z);
    if (d > WORLD_RADIUS) return true;
    if (d < 5.2) return false;             // 가운데 모이는 자리는 비워 둔다
    for (const c of colliders){
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return false;
    }
    return true;
  }

  // 들판 어디에 설지 고른다. 안쪽은 촘촘하게, 울타리 너머는 성기게.
  function spot(){
    const inside = rnd() < 0.68;
    const ang = rnd() * Math.PI * 2;
    const dist = inside
      ? 5.2 + rnd() * (WORLD_RADIUS - 6)
      // 안개가 지우는 거리 너머에는 심어도 보이지 않는다. 괜히 그리지 않게.
      : WORLD_RADIUS + 3 + rnd() * 34;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    return free(x, z, 0.45) ? { x, z } : null;
  }

  const FLOWERS = 2100;          // 뭉치 크기가 제각각이라 넉넉히 잡고 남는 건 안 그린다
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.028, 1, 5);
  stemGeo.translate(0, 0.5, 0);              // 밑동을 원점에 두고 높이만 늘린다
  const bloomGeo = new THREE.SphereGeometry(1, 6, 4);   // 멀리선 작게 보이니 면을 아껴도 된다

  // 바람에 흔들 재질은 고쳐 쓰므로 공유 재질(toon)을 넘기면 안 된다.
  const stems  = new THREE.InstancedMesh(
    stemGeo, swayed(toonUnique(0x94DC83), 'stalk'), FLOWERS);
  // 꽃잎 색은 송이마다 다르다. 흰 재질에 색을 곱해야 그대로 나온다.
  const blooms = new THREE.InstancedMesh(
    bloomGeo, swayed(toonUnique(0xFFFFFF), 'head'), FLOWERS);

  /* 고르게 흩뿌리면 색종이를 뿌린 것처럼 보인다. 들꽃은 뭉쳐서 핀다 —
     한두 송이만 선 자리도 있고, 한 무더기로 뒤덮은 자리도 있고, 사이사이는
     그냥 풀밭이다. 뭉치마다 빛깔과 키대를 따로 뽑는다. */
  const CLUMPS = 130;
  let f = 0;

  for (let c = 0; c < CLUMPS && f < FLOWERS; c++){
    const seed = spot();
    if (!seed) continue;

    // 뭉치 크기: 한두 송이 / 작은 뭉치 / 큰 뭉치 / 한 무더기
    const roll = rnd();
    let count, spread;
    if (roll < 0.26)      { count = 1 + (rnd() * 3 | 0);   spread = 0.2 + rnd() * 0.5; }
    else if (roll < 0.64) { count = 5 + (rnd() * 8 | 0);   spread = 0.7 + rnd() * 0.9; }
    else if (roll < 0.90) { count = 14 + (rnd() * 16 | 0); spread = 1.6 + rnd() * 1.4; }
    else                  { count = 30 + (rnd() * 26 | 0); spread = 3 + rnd() * 1.6; }

    // 한 뭉치는 대체로 한 빛깔이다. 가끔 다른 빛깔이 섞여 핀다.
    const main = RAINBOW[rnd() * RAINBOW.length | 0];
    const accent = rnd() < 0.3 ? RAINBOW[rnd() * RAINBOW.length | 0] : main;

    // 뭉치마다 키대가 다르고, 그 안에서도 들쭉날쭉하다
    const tall = 0.15 + rnd() * 0.52;
    const headSize = 0.05 + rnd() * 0.06;

    for (let i = 0; i < count && f < FLOWERS; i++){
      const a = rnd() * Math.PI * 2;
      const d = Math.pow(rnd(), 0.7) * spread;    // 가운데가 조금 더 빽빽하게
      const x = seed.x + Math.cos(a) * d;
      const z = seed.z + Math.sin(a) * d;
      if (!free(x, z, 0.35)) continue;

      const h = Math.max(0.12, tall * (0.55 + rnd() * 0.9));
      dummy.position.set(x, 0, z);
      dummy.scale.set(0.8 + rnd() * 0.5, h, 0.8 + rnd() * 0.5);
      dummy.updateMatrix();
      stems.setMatrixAt(f, dummy.matrix);

      const r = headSize * (0.72 + rnd() * 0.65);
      dummy.position.set(x, h + r * 0.5, z);
      dummy.scale.set(r, r * 0.78, r);
      dummy.updateMatrix();
      blooms.setMatrixAt(f, dummy.matrix);
      blooms.setColorAt(f, tint.setHex(rnd() < 0.22 ? accent : main));
      f++;
    }
  }
  stems.count = blooms.count = f;
  stems.instanceMatrix.needsUpdate = true;
  blooms.instanceMatrix.needsUpdate = true;
  blooms.instanceColor.needsUpdate = true;
  group.add(stems, blooms);

  // 풀포기 — 들판을 초록초록하게 만드는 잔털
  // 넓적하면 풀이 아니라 삼각형 조각처럼 보인다. 가늘고 길어야 풀날이다.
  const TUFTS = 2400;
  const tuftGeo = new THREE.ConeGeometry(0.055, 1, 5);
  tuftGeo.translate(0, 0.5, 0);
  const tufts = new THREE.InstancedMesh(
    tuftGeo, swayed(toonUnique(0xFFFFFF), 'stalk'), TUFTS);
  const TUFT_GREENS = [0x9AE385, 0xAEF09B, 0x8CD87F];

  let t = 0, tries = 0;
  while (t < TUFTS && tries++ < TUFTS * 12){
    const at = spot();
    if (!at) continue;
    const h = 0.14 + rnd() * 0.44;
    dummy.position.set(at.x, 0, at.z);
    dummy.scale.set(0.65 + rnd() * 0.6, h, 0.65 + rnd() * 0.6);
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
