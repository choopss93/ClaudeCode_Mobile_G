import * as THREE from 'three';

// 맵은 모든 접속자에게 똑같아야 하므로, 난수를 고정 씨앗으로 돌린다.
// 나중에 접속 기능을 붙여도 서로 다른 맵이 생기지 않는다.
function seeded(seed){
  let s = seed >>> 0;
  return function(){
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const WORLD_RADIUS = 34;

export function createWorld(){
  const rnd = seeded(20260101);
  const group = new THREE.Group();
  const colliders = [];   // {x, z, r} — 원형 충돌체

  function add(mesh, cast = true, receive = false){
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    group.add(mesh);
    return mesh;
  }

  /* ── 바닥 ── */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS, 64),
    new THREE.MeshLambertMaterial({ color: 0x7FA866 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  /* ── 가운데 광장과 분수 ── */
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshLambertMaterial({ color: 0xC9C2AC })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  group.add(plaza);

  const basin = add(new THREE.Mesh(
    new THREE.CylinderGeometry(2.4, 2.6, 0.7, 24),
    new THREE.MeshLambertMaterial({ color: 0xAEA893 })
  ), true, true);
  basin.position.y = 0.35;

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(2.1, 2.1, 0.12, 24),
    new THREE.MeshLambertMaterial({ color: 0x6FAFC9 })
  );
  water.position.y = 0.68;
  group.add(water);

  const spout = add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.3, 1.5, 12),
    new THREE.MeshLambertMaterial({ color: 0xAEA893 })
  ));
  spout.position.y = 1.2;
  colliders.push({ x: 0, z: 0, r: 2.8 });

  /* ── 건물 ── */
  const WALLS = [0xD8CDBA, 0xCBD6D2, 0xE0C9B6, 0xC6CBD9, 0xDCD3C0];
  const ROOFS = [0x9C5B46, 0x6B7F6A, 0x8A6E4F, 0x5E6B80, 0xA2714E];

  for (let i = 0; i < 9; i++){
    const ang = (i / 9) * Math.PI * 2 + rnd() * 0.25;
    const dist = 16 + rnd() * 10;
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;

    const w = 3.4 + rnd() * 2.6;
    const d = 3.4 + rnd() * 2.6;
    const h = 3 + rnd() * 2.4;
    const pick = Math.floor(rnd() * WALLS.length);

    const body = add(new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: WALLS[pick] })
    ), true, true);
    body.position.set(x, h / 2, z);
    body.rotation.y = -ang;

    const roof = add(new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(w, d) * 0.82, 1.8, 4),
      new THREE.MeshLambertMaterial({ color: ROOFS[pick] })
    ));
    roof.position.set(x, h + 0.9, z);
    roof.rotation.y = -ang + Math.PI / 4;

    // 문 — 어디가 앞인지 알아볼 수 있게
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x6B4F3A })
    );
    const inward = ang + Math.PI;
    door.position.set(
      x + Math.cos(inward) * (d / 2 + 0.02),
      0.8,
      z + Math.sin(inward) * (d / 2 + 0.02)
    );
    door.lookAt(0, 0.8, 0);
    group.add(door);

    colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
  }

  /* ── 나무 ── */
  for (let i = 0; i < 26; i++){
    const ang = rnd() * Math.PI * 2;
    const dist = 11 + rnd() * (WORLD_RADIUS - 14);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;

    // 건물과 겹치면 건너뛴다
    let clash = false;
    for (const c of colliders){
      if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + 1.6) ** 2){ clash = true; break; }
    }
    if (clash) continue;

    const th = 1.4 + rnd() * 1.1;
    const trunk = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.24, th, 7),
      new THREE.MeshLambertMaterial({ color: 0x7A5438 })
    ));
    trunk.position.set(x, th / 2, z);

    const r = 1.1 + rnd() * 0.7;
    const leaf = add(new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 0),
      new THREE.MeshLambertMaterial({ color: rnd() > 0.5 ? 0x4E7F43 : 0x5C8F4A })
    ));
    leaf.position.set(x, th + r * 0.62, z);
    leaf.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);

    colliders.push({ x, z, r: 0.55 });
  }

  /* ── 바깥 담 ── */
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(WORLD_RADIUS, WORLD_RADIUS, 1.6, 64, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xB9B3A0, side: THREE.DoubleSide })
  );
  wall.position.y = 0.8;
  wall.receiveShadow = true;
  group.add(wall);

  return { group, colliders, radius: WORLD_RADIUS };
}

// 맵 안에 머무르게 하고, 건물·나무를 통과하지 못하게 밀어낸다.
export function resolve(world, x, z, bodyRadius = 0.4){
  for (const c of world.colliders){
    const dx = x - c.x;
    const dz = z - c.z;
    const min = c.r + bodyRadius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6){
      const d = Math.sqrt(d2);
      x = c.x + (dx / d) * min;
      z = c.z + (dz / d) * min;
    }
  }
  const edge = world.radius - bodyRadius - 0.3;
  const d = Math.hypot(x, z);
  if (d > edge){
    x = (x / d) * edge;
    z = (z / d) * edge;
  }
  return { x, z };
}
