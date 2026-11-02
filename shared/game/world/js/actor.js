import * as THREE from 'three';

// 캐릭터는 외부 모델 파일 없이 기본 도형만으로 만든다.
// 내려받을 것이 없으니 바로 뜨고, 색만 바꿔 사람을 구분한다.
export function createActor({ color = 0x4F93D9 } = {}){
  const group = new THREE.Group();

  const skinMat = new THREE.MeshLambertMaterial({ color: 0xF0C9A0 });
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const legMat  = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.55) });
  // 팔이 몸통과 같은 색이면 한 덩어리로 보인다. 살짝 어둡게 해 구분한다.
  const armMat  = new THREE.MeshLambertMaterial({ color: new THREE.Color(color).multiplyScalar(0.82) });

  function part(geo, mat, x, y, z){
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  }

  // 다리와 팔은 관절에서 돌아야 하므로, 형상을 아래로 내려 축을 위쪽 끝에 둔다.
  const legGeo = new THREE.BoxGeometry(0.22, 0.62, 0.24);
  legGeo.translate(0, -0.31, 0);
  const armGeo = new THREE.BoxGeometry(0.17, 0.55, 0.18);
  armGeo.translate(0, -0.275, 0);

  const legL = part(legGeo, legMat, -0.14, 0.72, 0);
  const legR = part(legGeo, legMat,  0.14, 0.72, 0);
  const armL = part(armGeo, armMat, -0.36, 1.30, 0);
  const armR = part(armGeo, armMat,  0.36, 1.30, 0);

  part(new THREE.BoxGeometry(0.56, 0.64, 0.30), bodyMat, 0, 1.04, 0);
  const head = part(new THREE.SphereGeometry(0.23, 16, 12), skinMat, 0, 1.53, 0);

  // 코 — 어느 쪽을 보고 있는지 한눈에 알 수 있게. 모델은 +Z 를 향한다.
  part(new THREE.BoxGeometry(0.1, 0.1, 0.1), skinMat, 0, 1.5, 0.22);

  const HEAD_TOP = 1.82;   // 말풍선을 띄울 높이
  let phase = 0;

  return {
    group,
    head,
    headTop: HEAD_TOP,

    // speed: 초당 이동 거리. 걸을수록 팔다리가 빨리 움직인다.
    update(dt, speed){
      const moving = speed > 0.15;
      phase += dt * (moving ? 2.1 + speed * 1.5 : 1.6);
      const swing = moving ? Math.sin(phase) * 0.62 : Math.sin(phase) * 0.04;
      legL.rotation.x =  swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x =  swing * 0.8;
      group.position.y = moving ? Math.abs(Math.sin(phase)) * 0.055 : 0;
    },

    dispose(){
      group.traverse(o => { if (o.isMesh){ o.geometry.dispose(); o.material.dispose(); } });
    }
  };
}

// 이름이 같으면 늘 같은 색이 나오도록.
export function colorFor(name){
  const PALETTE = [
    0x4F93D9, 0xE0804F, 0x5FA86B, 0xB569B5,
    0xD9B23F, 0x50AFA8, 0xD4606B, 0x7E6FD1
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
