import * as THREE from 'three';
import { toon, toonUnique, swayed, RAINBOW } from '#look';

// 정원은 모든 접속자에게 똑같아야 하므로 난수를 고정 씨앗으로 돌린다.
function seeded(seed){
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export const WORLD_RADIUS = 44;   // 거닐 맛이 나도록 넓게

/* 무지개 다리 — 정원으로 들어서는 길.
   처음 들어서면 여기 바깥 끝에 서 있고, 앞으로 쭉 건너가면 들판이다.
   카메라가 처음 보는 쪽이 -Z 이므로 다리는 +Z 쪽에 둔다. 그래야 가만히
   앞으로만 밀어도 정원 쪽으로 걷는다. */
export const BRIDGE = {
  half: 2.1,                        // 난간 사이 반너비
  near: WORLD_RADIUS - 3,           // 들판 쪽 끝 — 잔디에 조금 걸친다
  far:  WORLD_RADIUS + 22,          // 바깥 끝 — 작은 섬에 닿는다
  gap: 0.16                         // 산울타리를 터 놓는 각도
};

/* 다리 뒤의 아주 작은 섬. 여기서 시작한다.
   안개가 끼어 있고, 사람만 올 수 있다 — 반려동물은 들판에서 논다. */
export const ISLE = { x: 0, z: BRIDGE.far + 4, r: 5.2 };

/** 처음 서는 자리. 작은 섬 위, 다리를 마주 보고 선다. */
export const START = { x: 0, z: ISLE.z + 2 };

const SEA_Y = -0.9;               // 구름 바다 바닥 판의 높이
const SEA_REACH = 128;            // 구름을 까는 범위 — 안개가 지우는 거리까지만

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

  // 들판은 구름 바다에 뜬 섬이다. 울타리 너머는 땅이 아니라 구름이므로
  // 바깥 들판 평면을 두지 않는다. 대신 섬에 두께를 줘서, 가장자리에서
  // 내려다보면 밑이 있는 땅으로 보이게 한다.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(WORLD_RADIUS, WORLD_RADIUS * 0.56, 7, 56),
    toon(0x8FCE82)
  );
  body.position.y = -3.5;
  group.add(body);

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

  // 그 자리에 심어도 되는지.
  function free(x, z, pad){
    const d = Math.hypot(x, z);
    if (d < 5.2) return false;             // 가운데 모이는 자리는 비워 둔다
    for (const c of colliders){
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return false;
    }
    return true;
  }

  /* 들판 어디에 설지 고른다. 섬 안에만 심는다 — 울타리 너머는 구름이라
     거기 심으면 꽃이 허공에 뜬다. */
  function spot(){
    const ang = rnd() * Math.PI * 2;
    const dist = 5.2 + rnd() * (WORLD_RADIUS - 6);
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

  /* ── 바깥 울타리: 둥근 산울타리 ──
     다리가 닿는 자리는 터 놓는다. 막아 두면 다 건너와서 벽을 만난다.
     토러스는 각도 0 에서 시작하므로, 먼저 제자리에서 돌려 트인 곳을
     +Z 쪽(= 지역 각도 -π/2)에 오게 한 뒤 눕힌다. */
  const hedgeAt = new THREE.Group();
  const hedge = new THREE.Mesh(
    new THREE.TorusGeometry(WORLD_RADIUS, 0.75, 7, 64, Math.PI * 2 - BRIDGE.gap),
    toon(0x94DE83)
  );
  hedge.rotation.z = -Math.PI / 2 + BRIDGE.gap / 2;
  hedgeAt.add(hedge);
  hedgeAt.rotation.x = -Math.PI / 2;
  hedgeAt.position.y = 0.45;
  group.add(hedgeAt);

  /* ── 무지개 다리 · 작은 섬 · 구름 바다 ── */
  group.add(makeBridge());
  group.add(makeIsle());
  group.add(makeCloudSea());
  group.add(makeHaze());

  return { group, colliders, radius: WORLD_RADIUS, bridge: BRIDGE, isle: ISLE };
}

/* 무지개 다리. 바닥은 땅에 닿게 두고, 난간과 양옆의 구름으로 "건너는
   것" 처럼 보이게 한다. 바닥을 띄우면 사람·반려동물·다른 접속자의 높이를
   모두 따로 다뤄야 해서, 얻는 것에 비해 손댈 데가 너무 많아진다. */
function makeBridge(){
  const g = new THREE.Group();
  const len = BRIDGE.far - BRIDGE.near;
  const midZ = (BRIDGE.far + BRIDGE.near) / 2;
  const w = BRIDGE.half * 2;

  // 일곱 빛깔을 길이 방향으로 나란히 깐다
  const bandW = w / RAINBOW.length;
  RAINBOW.forEach((c, i) => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(bandW, 0.16, len), toon(c));
    band.position.set(-BRIDGE.half + bandW * (i + 0.5), 0.05, midZ);
    g.add(band);
  });

  // 난간 — 가로대 둘에 기둥을 세운다. 흰색으로 두어 무지개는 바닥에만.
  for (const side of [-1, 1]){
    for (const y of [0.72, 0.46]){
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, len), toon(0xFFFFFF));
      rail.position.set(side * BRIDGE.half, y, midZ);
      g.add(rail);
    }
  }

  const dummy = new THREE.Object3D();
  const posts = Math.max(2, Math.round(len / 2.4)) + 1;
  const post = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.84, 6), toon(0xFFFFFF), posts * 2);
  let n = 0;
  for (let i = 0; i < posts; i++){
    const z = BRIDGE.near + (len * i) / (posts - 1);
    for (const side of [-1, 1]){
      dummy.position.set(side * BRIDGE.half, 0.42, z);
      dummy.updateMatrix();
      post.setMatrixAt(n++, dummy.matrix);
    }
  }
  post.instanceMatrix.needsUpdate = true;
  g.add(post);

  return g;
}

/* 다리 뒤의 아주 작은 섬 — 여기서 시작한다.
   안개가 낮게 깔려 있고, 들판이 저 멀리 보인다. */
function makeIsle(){
  const g = new THREE.Group();
  // ball · rod 은 createWorld 안에만 있다. 여기서는 따로 만든다.
  const ball = new THREE.SphereGeometry(1, 12, 9);
  const rod  = new THREE.CylinderGeometry(1, 1, 1, 6);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLE.r, ISLE.r * 0.5, 4.4, 28), toon(0x8FCE82));
  body.position.set(ISLE.x, -2.2, ISLE.z);
  g.add(body);

  const top = new THREE.Mesh(new THREE.CircleGeometry(ISLE.r, 28), toon(0xBEE8AE));
  top.rotation.x = -Math.PI / 2;
  top.position.set(ISLE.x, 0.01, ISLE.z);
  g.add(top);

  // 작은 꽃 몇 송이. 많이 두면 들판처럼 보여서 몇 송이만.
  const rnd = seeded(31337);
  for (let i = 0; i < 7; i++){
    const a = rnd() * Math.PI * 2;
    const d = 1.4 + rnd() * (ISLE.r - 2.2);
    const x = ISLE.x + Math.cos(a) * d, z = ISLE.z + Math.sin(a) * d;
    const stem = new THREE.Mesh(rod, toon(0x79C06A));
    stem.position.set(x, 0.13, z); stem.scale.set(0.03, 0.26, 0.03);
    g.add(stem);
    const head = new THREE.Mesh(ball, toon(RAINBOW[Math.floor(rnd() * RAINBOW.length)]));
    head.position.set(x, 0.28, z); head.scale.set(0.1, 0.07, 0.1);
    g.add(head);
  }

  /* 안개 — 낮게 깔린 뽀얀 기운. 비치는 재질이라 겹칠수록 짙어진다.
     깊이를 쓰지 않아야(depthWrite:false) 서로 지우지 않는다. */
  for (let i = 0; i < 9; i++){
    const a = rnd() * Math.PI * 2;
    const d = rnd() * ISLE.r;
    const r = 1.6 + rnd() * 2.4;
    const mist = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({
      color: 0xFFFFFF, transparent: true, opacity: 0.1, depthWrite: false
    }));
    // 낮게 깔아야 안개다. 높이 띄우면 섬 전체가 뿌옇게 바래 보인다.
    mist.position.set(ISLE.x + Math.cos(a) * d, 0.12 + rnd() * 0.26,
                      ISLE.z + Math.sin(a) * d);
    mist.scale.set(r, r * 0.2, r);
    mist.renderOrder = 2;
    g.add(mist);
  }

  return g;
}

/* 구름 바다 — 섬도 다리도 이 위에 떠 있다.
   바닥 판 하나로 빈틈을 막고, 그 위에 덩이를 흩뿌린다. 같은 모양이
   천 개가 넘으므로 반드시 InstancedMesh 로 묶는다.

   두 번에 나눠 뿌린다.
   - 가장자리: 뭍과 닿는 자리. 작은 덩이를 촘촘히, 꼭대기를 땅보다 조금
     높게 둬서 뭉게뭉게해 보이게 한다. 여기가 제일 눈에 많이 띈다.
   - 먼바다: 넓은 바깥. 큰 덩이를 성기게, 꼭대기를 낮춰 멀리 깔린
     구름판처럼 보이게 한다.
   한 번에 고르게 뿌리면 — 넓이에 비례해 뽑히므로 — 정작 눈앞의
   가장자리가 성겨서 허연 벌판처럼 보인다. 한 번 그렇게 만들어 봤다. */
function makeCloudSea(){
  const g = new THREE.Group();
  const rnd = seeded(77215);

  /* 덩이 사이로 보이는 빈틈을 메운다. 덩이보다 조금만 아래에 두고 색은
     순백으로 — 조금만 어두워도 평평한 면이라 잿빛으로 도드라진다. */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(SEA_REACH + 14, 48), toon(0xFFFFFF));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = SEA_Y;
  g.add(floor);

  // 뭍에서 얼마나 떨어졌는지
  function offLand(x, z){
    const a = Math.hypot(x, z) - WORLD_RADIUS;
    const b = Math.hypot(x - ISLE.x, z - ISLE.z) - ISLE.r;
    const onBridgeZ = z > BRIDGE.near - 1 && z < BRIDGE.far + 1;
    const c = onBridgeZ ? Math.abs(x) - BRIDGE.half : Infinity;
    return Math.min(a, b, c);
  }

  // 작은 섬 뒤쪽은 구름이 아니라 안개다 (makeHaze). 거기엔 두지 않는다.
  const behind = z => z >= ISLE.z - 0.5;

  // 가장자리 한 자리. rnd()*rnd() 를 쓰면 뭍에 바짝 붙은 쪽이 촘촘해진다.
  function rimSpot(){
    const r = rnd();
    if (r < 0.45){                                   // 들판 섬 둘레
      const a = rnd() * Math.PI * 2;
      const out = WORLD_RADIUS + 0.5 + rnd() * rnd() * 17;
      return [Math.cos(a) * out, Math.sin(a) * out];
    }
    if (r < 0.8){                                    // 다리 양옆
      const side = rnd() < 0.5 ? -1 : 1;
      const z = BRIDGE.near - 1.5 + rnd() * (BRIDGE.far - BRIDGE.near + 3);
      const out = BRIDGE.half + 0.45 + rnd() * rnd() * 15;
      return [side * out, z];
    }
    const a = rnd() * Math.PI * 2;                   // 작은 섬 둘레
    const out = ISLE.r + 0.45 + rnd() * rnd() * 11;
    return [ISLE.x + Math.cos(a) * out, ISLE.z + Math.sin(a) * out];
  }

  const RIM = 1100, OPEN = 1500;
  const puff = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 9, 7), toon(0xFFFFFF), RIM + OPEN);
  const dummy = new THREE.Object3D();
  let n = 0;

  function place(x, z, r, top){
    // 꼭대기를 기준으로 놓는다. 가운데를 기준으로 하면 큰 덩이가 땅 위로
    // 솟아올라 섬을 가린다.
    dummy.position.set(x, top - r * 0.55, z);
    dummy.scale.set(r, r * 0.55, r);
    dummy.updateMatrix();
    puff.setMatrixAt(n++, dummy.matrix);
  }

  for (let i = 0, tries = 0; i < RIM && tries < RIM * 20; tries++){
    const [x, z] = rimSpot();
    if (offLand(x, z) < 0.4 || behind(z)) continue;
    place(x, z, 0.75 + rnd() * 1.7, 0.34 - rnd() * 0.9);
    i++;
  }

  for (let i = 0, tries = 0; i < OPEN && tries < OPEN * 20; tries++){
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * SEA_REACH;          // 넓은 바깥까지 고르게
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const off = offLand(x, z);
    if (off < 1.2 || behind(z)) continue;
    /* 멀수록 높이 쌓는다. 다 같은 높이로 깔면 위에서 내려다보는 꼴이 되어
       연잎이 떠 있는 못처럼 보인다 — 한 번 그렇게 만들어 봤다. 멀리서
       솟아올라야 사방이 구름으로 둘러싸인 것이 된다. */
    place(x, z, Math.min(6.5, 1.8 + off * 0.09 + rnd() * 2.4),
          -0.25 - rnd() * 1 + Math.min(2.8, off * 0.045));
    i++;
  }

  puff.count = n;
  puff.instanceMatrix.needsUpdate = true;
  g.add(puff);

  return g;
}

/* 작은 섬 뒤쪽의 안개.
   구름처럼 덩이로 두면 "넘어갈 데가 있나" 싶어 보인다. 저쪽은 갈 수 없는
   곳이니 아예 뿌옇게 지워 버리는 편이 낫다.

   비치는 흰 막을 여러 겹 겹친다. 한 겹을 짙게 하면 벽처럼 딱딱해지고,
   옅은 겹을 포개면 멀수록 자연스럽게 짙어져 안개가 된다.
   - 다리 쪽(-Z)은 비워 둔다. 거기는 건너갈 길이라 가리면 안 된다.
   - 깊이를 쓰지 않아야(depthWrite:false) 겹끼리 서로 지우지 않는다.
   - 빛을 받는 재질(toonUnique)이라야 밤에 같이 어두워진다. 안 그러면
     깜깜한 밤에 흰 벽만 환하게 남는다. */
function makeHaze(){
  const g = new THREE.Group();
  /* 낮게 두면 안개 **위로** 하늘이 보여 가로줄이 생긴다. 넉넉히 높인다. */
  const H = 30;
  const ARC = Math.PI;                // 반 바퀴, 섬 뒤쪽만
  const SHELLS = [7, 10, 14, 19, 25, 33, 43];

  SHELLS.forEach((r, i) => {
    // 겹마다 끝나는 각도를 조금씩 어긋나게 — 같은 자리에서 끝나면
    // 가장자리가 포개져 세로줄로 도드라진다.
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, H, 28, 1, true,
                                 -Math.PI / 2 - i * 0.05, ARC + i * 0.1),
      toonUnique(0xFFFFFF, {
        transparent: true,
        opacity: 0.22 + i * 0.02,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    m.position.set(ISLE.x, H / 2 - 6, ISLE.z);
    m.renderOrder = 3;
    g.add(m);
  });

  /* 바닥 쪽 — 겹 사이로 아래가 들여다보이지 않게 뿌연 바닥을 깐다 */
  /* 원판은 실린더와 각도 기준이 다르다. 눕히고 나면 +Z 쪽 반원은
     thetaStart = -π 다 (실린더는 -π/2). 같은 값을 쓰면 엉뚱한 쪽이 덮인다. */
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(46, 36, -Math.PI, ARC),
    toonUnique(0xFFFFFF, { transparent: true, opacity: 0.9, depthWrite: false })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ISLE.x, -0.75, ISLE.z);
  floor.renderOrder = 2;
  g.add(floor);

  return g;
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
  /* 걸을 수 있는 데는 세 곳뿐이다 — 들판 섬, 무지개 다리, 다리 뒤의 작은
     섬. 나머지는 전부 구름이다.

     어느 곳에도 속하지 않으면 **가장 가까운 곳의 가장자리**로 되민다.
     곳마다 따로 따지면 경계에서 엉킨다 — 예전에 z 만 보고 다리라고 판단해
     들판 저쪽 끝에 선 사람이 다리 입구로 끌려간 적이 있다. */
  const edge = world.radius - bodyRadius - 0.8;
  const here = [];

  const dg = Math.hypot(x, z);
  if (dg <= edge) return { x, z };
  here.push({ x: (x / dg) * edge, z: (z / dg) * edge });

  const b = world.bridge;
  if (b){
    const lim = b.half - bodyRadius - 0.1;
    const bx = Math.max(-lim, Math.min(lim, x));
    const bz = Math.max(b.near, Math.min(b.far, z));
    if (bx === x && bz === z) return { x, z };
    here.push({ x: bx, z: bz });
  }

  const isle = world.isle;
  if (isle){
    const lim = isle.r - bodyRadius - 0.4;
    const di = Math.hypot(x - isle.x, z - isle.z);
    if (di <= lim) return { x, z };
    if (di > 1e-6){
      here.push({ x: isle.x + ((x - isle.x) / di) * lim,
                  z: isle.z + ((z - isle.z) / di) * lim });
    }
  }

  let best = here[0], bd = Infinity;
  for (const c of here){
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd){ bd = d; best = c; }
  }
  return best;
}
