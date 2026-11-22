import * as THREE from 'three';

/*
 * Metaversal Studio 로고 — 3D 로 천천히 돈다.
 *
 * 금빛 입체 'M' 둘레를 고리 두 줄이 서로 엇갈려 돌고, 고리마다 작은 위성이
 * 하나씩 달려 있다. 뒤에는 은은한 그물 지구와 별가루. 색은 첫 화면 제목의
 * 그라데이션(밝은 금 → 금 → 연보라)과 같은 결이다.
 *
 * 글꼴 파일을 받지 않으려고 'M' 은 꼭짓점을 직접 찍어 밀어 올린다(ExtrudeGeometry).
 */

export function createLogo(){
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);

  // 빛 — 정면 따뜻한 빛, 옆에서 보라 · 하늘색 테두리 빛
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const key = new THREE.DirectionalLight(0xFFF2D6, 2.2); key.position.set(1.5, 2, 3); scene.add(key);
  const rimA = new THREE.PointLight(0xC9A2FF, 9, 8, 1.4); rimA.position.set(-2, 0.6, -0.6); scene.add(rimA);
  const rimB = new THREE.PointLight(0x7FE3FF, 7, 8, 1.4); rimB.position.set(2.1, -0.8, -0.4); scene.add(rimB);

  // M — 바깥 꼭짓점을 차례로 (가운데가 위로 파인 모양)
  const P = [[-0.5,-0.5],[-0.5,0.5],[-0.29,0.5],[0,0.1],[0.29,0.5],[0.5,0.5],[0.5,-0.5],[0.3,-0.5],[0.3,0.14],[0,-0.24],[-0.3,0.14],[-0.3,-0.5]];
  const shape = new THREE.Shape();
  shape.moveTo(P[0][0], P[0][1]);
  for (const [x, y] of P.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const mGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 6, curveSegments: 4 });
  mGeo.center();
  const gold = new THREE.MeshStandardMaterial({ color: 0xE9BE63, metalness: 0.55, roughness: 0.28, emissive: 0x3A2508, emissiveIntensity: 0.35 });
  const M = new THREE.Mesh(mGeo, gold);
  M.scale.setScalar(0.92);
  root.add(M);

  // 그물 지구
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.98, 3),
    new THREE.MeshBasicMaterial({ color: 0xB79BE8, wireframe: true, transparent: true, opacity: 0.14 }));
  root.add(globe);

  // 고리 두 줄과 위성
  const rings = [];
  for (const [color, tiltX, tiltZ, speed, r] of [[0xE7B5F2, 1.15, 0.35, 0.7, 1.12], [0x8FE6F2, 1.9, -0.55, -0.5, 1.24]]){
    const pivot = new THREE.Group();
    pivot.rotation.set(tiltX, 0, tiltZ);
    root.add(pivot);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 12, 160),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.4 }));
    pivot.add(ring);
    const spinner = new THREE.Group();
    pivot.add(spinner);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16),
      new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: color, emissiveIntensity: 0.9 }));
    moon.position.x = r;
    spinner.add(moon);
    rings.push({ spinner, speed });
  }

  // 별가루
  const N = 140, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++){
    const a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1), d = 1.6 + Math.random() * 1.4;
    pos.set([Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d * 0.7, Math.sin(b) * Math.sin(a) * d - 0.6], i * 3);
  }
  const starsGeo = new THREE.BufferGeometry();
  starsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xFFF1D0, size: 0.022, transparent: true, opacity: 0.8 }));
  scene.add(stars);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  camera.position.set(0, 0.15, 4.2);
  camera.lookAt(0, 0, 0);

  let t = 0;
  return {
    scene, camera,
    /** spin — 손가락으로 돌린 만큼(라디안). 가만두면 저절로 천천히 돈다. */
    update(dt, spin){
      t += dt;
      root.rotation.y = spin;
      root.rotation.x = Math.sin(t * 0.6) * 0.08;
      M.position.y = Math.sin(t * 1.2) * 0.04;                     // 살짝 떠 있는 느낌
      globe.rotation.y -= dt * 0.15;
      for (const r of rings) r.spinner.rotation.z += dt * r.speed;
      stars.rotation.y += dt * 0.02;
    },
    fit(aspect){
      camera.aspect = aspect;
      // 좁은 자리에서도 고리까지 다 들어오게 물러난다
      camera.position.z = Math.max(3.9, 3.9 / Math.min(1, aspect));
      camera.updateProjectionMatrix();
    }
  };
}
