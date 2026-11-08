import * as THREE from 'three';
import { createPet } from '#actor';
import { PAINTS, PARTS, okPaint, fixSprays, SPRAY_MAX, SPRAY_BITS } from '#pets';

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
/* 아래쪽으로도 조금 내려다볼 수 있어야 **배**를 칠한다. 0 에서 막으면
   눈높이 위로만 보게 되어 배가 영영 안 보인다. */
const MIN_TILT = -0.55, MAX_TILT = 0.9;

export function createPaintEditor({ canvas, onPaint, onSpray }){
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
  let mode = 'spray';        // 'part' 부위 칠하기 · 'spray' 뿌리기
  let big = 0;               // 자국 크기 — 보통 · 크게
  let sprays = [];

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
    pet = createPet({ ...spec, paint, sprays });
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
      if (mode === 'spray'){
        /* 어디든 몸에 닿기만 하면 뿌린다 — 눈·코 위에도. 자리는
           몸통 상자 안의 몇 할인지로 적고, **적을 때 쓰는 만큼만**
           남긴다. 그래야 지금 보는 자리와 코드에 담기는 자리가 같다. */
        if (hit.object.userData.spray) continue;   // 자국은 뚫고 지나간다
        // 눈과 코는 덮지 않는다. 그 자리를 찍으면 아무 일도 하지 않는다.
        if (hit.object.userData.noPaint){
          if (onSpray) onSpray(null, sprays.length, 'eye');
          return;
        }
        if (sprays.length >= SPRAY_MAX){
          if (onSpray) onSpray(null, sprays.length, 'full');
          return;
        }
        const b = pet.box;
        const p = pet.inner.worldToLocal(hit.point.clone());
        const steps = (1 << SPRAY_BITS) - 1;
        const q = (v, lo, hi) =>
          Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo || 1))) * steps) / steps;
        sprays.push({ x: q(p.x, b.min.x, b.max.x),
                      y: q(p.y, b.min.y, b.max.y),
                      z: q(p.z, b.min.z, b.max.z),
                      ci: color, big });
        build();
        if (onSpray) onSpray(color, sprays.length, 'ok');
        return;
      }
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
    setSpec(next, firstPaint, firstSprays){
      spec = next;
      if (okPaint(firstPaint)) paint = firstPaint.slice();
      else if (!okPaint(paint)) paint = PARTS.map(() => 0);
      sprays = fixSprays(firstSprays) || [];
      build();
    },

    setMode(m){ mode = m === 'part' ? 'part' : 'spray'; },
    getMode(){ return mode; },
    setBig(v){ big = v ? 1 : 0; },
    getBig(){ return big; },
    getSprays(){ return sprays.map(s => ({ ...s })); },
    /** 방금 뿌린 것을 되돌린다. 뿌리기는 한 번에 자국이 남으니 필요하다. */
    undo(){
      if (!sprays.length) return false;
      sprays.pop();
      build();
      return true;
    },
    clearSprays(){ if (sprays.length){ sprays = []; build(); } },
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
