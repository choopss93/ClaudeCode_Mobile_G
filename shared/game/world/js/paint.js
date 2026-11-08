import * as THREE from 'three';
import { createPet } from '#actor';
import { PAINTS, PARTS, okPaint } from '#pets';

/*
 * 직접 칠하기 편집기.
 *
 * 작은 화면 하나에 아이를 띄워 두고, 끌어서 돌려 가며 부위를 눌러 색을
 * 찍는다. 게임 화면과 **따로 도는 작은 장면**이라 시작 화면에서만 쓰고,
 * 정원으로 들어갈 때 닫는다 (`dispose`) — WebGL 화면 둘을 계속 열어 두면
 * 폰이 버겁다.
 *
 * 매 프레임 그리지 않는다. 돌리거나 칠할 때만 다시 그린다 — 가만히 있는
 * 시작 화면에서 60프레임을 돌릴 까닭이 없다.
 */

const DRAG = 7;          // 이만큼 끌면 "돌린 것" 으로 보고 칠하지 않는다
const MIN_TILT = 0.05, MAX_TILT = 0.85;

export function createPaintEditor({ canvas, onPaint }){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xE9F5E2);     // 연한 잔디빛

  /* 빛은 정원의 낮과 같은 짜임이다. 여기서 더 밝게 두면 칠한 색이
     실제 정원에서 더 어둡게 보여 속은 기분이 든다. */
  scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xD6F5C4, 1.35));
  const sun = new THREE.DirectionalLight(0xFFFBF0, 1.0);
  sun.position.set(2.5, 4, 3);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
  const pivot = new THREE.Group();
  scene.add(pivot);

  let spin = 0.6, tilt = 0.32, dist = 1.7;
  let spec = null, pet = null;
  let color = 0;
  let paint = null;

  function frame(){
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 240;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const aim = new THREE.Vector3(0, pet ? pet.headTop * 0.42 : 0.3, 0);
    camera.position.set(Math.sin(spin) * Math.cos(tilt) * dist,
                        aim.y + Math.sin(tilt) * dist,
                        Math.cos(spin) * Math.cos(tilt) * dist);
    camera.lookAt(aim);
    renderer.render(scene, camera);
  }

  /** 아이를 다시 짓는다. 품종이 바뀌거나 색을 찍을 때마다 부른다. */
  function build(){
    if (pet) pivot.remove(pet.group);
    /* 재질은 `toon` 이 빛깔마다 하나씩 나눠 주고 모양은 돌려 쓰므로,
       버릴 것이 없다. 그냥 떼어 내면 된다. */
    pet = createPet({ ...spec, paint });
    pivot.add(pet.group);
    // 큰 품종은 조금 물러서서 본다 — 화면 밖으로 넘치면 칠할 수가 없다
    dist = 0.9 + pet.headTop * 1.5;
    // 그림자 방울은 여기서 거슬린다 — 바닥이 없는 화면이다
    pet.group.traverse(o => { if (o.isMesh && o.material && o.material.map) o.visible = false; });
    // 서 있는 모습으로 한 번 세워 둔다
    pet.update(0.016, 0);
    frame();
  }

  /* ── 손가락 ── */
  let id = null, ox = 0, oy = 0, moved = 0;

  canvas.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; ox = e.clientX; oy = e.clientY; moved = 0;
    canvas.setPointerCapture(id);
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    moved = Math.max(moved, Math.hypot(dx, dy));
    spin -= dx * 0.011;
    tilt = Math.min(MAX_TILT, Math.max(MIN_TILT, tilt + dy * 0.006));
    ox = e.clientX; oy = e.clientY;
    frame();
  });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  canvas.addEventListener('pointerup', e => {
    if (e.pointerId !== id) return;
    canvas.releasePointerCapture(id);
    id = null;
    if (moved > DRAG || !pet) return;      // 돌린 것이지 찍은 것이 아니다

    const b = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - b.left) / b.width) * 2 - 1,
            -((e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(pivot.children, true)){
      const part = hit.object.userData.part;
      if (part === undefined) continue;     // 눈·코는 칠하지 않는다
      if (paint[part] === color) return;
      paint[part] = color;
      build();
      if (onPaint) onPaint(part, color);
      return;
    }
  });

  canvas.addEventListener('pointercancel', () => {
    if (id !== null){ try { canvas.releasePointerCapture(id); } catch (_){} }
    id = null;
  });

  const watch = new ResizeObserver(() => frame());
  watch.observe(canvas);

  return {
    /** 어떤 아이를 칠할 것인가 (품종 · 섞을 품종). */
    setSpec(next, firstPaint){
      spec = next;
      if (okPaint(firstPaint)) paint = firstPaint.slice();
      else if (!okPaint(paint)) paint = PARTS.map(() => 0);
      build();
    },
    setColor(i){ color = Math.max(0, Math.min(PAINTS.length - 1, i | 0)); },
    getColor(){ return color; },
    getPaint(){ return paint ? paint.slice() : null; },
    setPaint(arr){ if (okPaint(arr)){ paint = arr.slice(); build(); } },
    turn(by){ spin += by; frame(); },
    draw: frame,

    dispose(){
      watch.disconnect();
      renderer.dispose();
    }
  };
}
