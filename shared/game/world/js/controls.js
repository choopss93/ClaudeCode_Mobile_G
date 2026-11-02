/*
 * 조작: 둥근 조이스틱으로 어느 방향이든 걸어다닌다.
 *
 * 손가락은 화면 왼쪽 아무 데나 대면 그 자리에 조이스틱이 생기고, 민
 * 방향으로 걷는다. 많이 밀수록 빨리 걷는다. 오른쪽을 끌면 카메라가 돈다.
 * 마우스는 왼쪽 아래 조이스틱을 끌거나 WASD 를 쓴다.
 */

const KEY_VEC = {
  KeyW:[0,1], ArrowUp:[0,1],
  KeyS:[0,-1], ArrowDown:[0,-1],
  KeyA:[-1,0], ArrowLeft:[-1,0],
  KeyD:[1,0], ArrowRight:[1,0]
};

const MAX = 40;          // 손잡이가 벗어날 수 있는 거리 (테두리 안에 머물 만큼)
const DEAD = 0.14;       // 이만큼 안쪽은 흔들림으로 보고 무시한다

function typing(){
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

export function createControls(surface, { stick, knob } = {}){
  const state = {
    move: { x: 0, z: 0 },   // 카메라 기준 좌우 · 앞뒤. 길이가 곧 속도(0~1)
    yaw: 0,
    pitch: 0.5,
    dist: 6.2
  };

  const keys = new Set();
  let grip = null;        // {id, cx, cy, dx, dy} — 조이스틱을 쥐고 있는 손가락
  const look = new Map(); // 카메라를 돌리고 있는 손가락들

  /* ── 조이스틱 ── */

  function homeCenter(){
    stick.style.left = '';
    stick.style.top = '';
    const r = stick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function placeAt(x, y){
    stick.style.left = x + 'px';
    stick.style.top = y + 'px';
  }

  function drawKnob(dx, dy){
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function take(e, cx, cy){
    grip = { id: e.pointerId, cx, cy, dx: 0, dy: 0 };
    stick.classList.add('on');
    drawKnob(0, 0);
  }

  function release(){
    grip = null;
    stick.classList.remove('on');
    homeCenter();          // 제자리로 돌아간다
    drawKnob(0, 0);
  }

  surface.addEventListener('pointerdown', e => {
    if (!grip){
      // 손가락은 왼쪽 아무 데나. 짚은 자리에 조이스틱이 생긴다.
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.5){
        placeAt(e.clientX, e.clientY);
        take(e, e.clientX, e.clientY);
        surface.setPointerCapture(e.pointerId);
        return;
      }
      // 마우스는 왼쪽 아래 제자리 조이스틱을 잡아 끈다
      const h = homeCenter();
      if (Math.hypot(e.clientX - h.x, e.clientY - h.y) < MAX * 1.5){
        take(e, h.x, h.y);
        surface.setPointerCapture(e.pointerId);
        return;
      }
    }
    look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    surface.setPointerCapture(e.pointerId);
  });

  surface.addEventListener('pointermove', e => {
    if (grip && e.pointerId === grip.id){
      let dx = e.clientX - grip.cx;
      let dy = e.clientY - grip.cy;
      const d = Math.hypot(dx, dy);
      if (d > MAX){ dx = dx / d * MAX; dy = dy / d * MAX; }
      grip.dx = dx; grip.dy = dy;
      drawKnob(dx, dy);
      return;
    }
    const prev = look.get(e.pointerId);
    if (!prev) return;
    state.yaw   -= (e.clientX - prev.x) * 0.005;
    state.pitch -= (e.clientY - prev.y) * 0.004;
    state.pitch = Math.max(0.16, Math.min(1.1, state.pitch));
    look.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });

  function letGo(e){
    if (grip && e.pointerId === grip.id) release();
    look.delete(e.pointerId);
  }
  surface.addEventListener('pointerup', letGo);
  surface.addEventListener('pointercancel', letGo);

  /* ── 키보드 ── */
  addEventListener('keydown', e => {
    if (typing() || e.repeat) return;
    if (KEY_VEC[e.code]){ keys.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());   // 창을 벗어나면 눌린 채 남는다

  /* ── 거리 ── */
  function zoom(d){ state.dist = Math.max(3.5, Math.min(12, state.dist + d)); }
  surface.addEventListener('wheel', e => {
    e.preventDefault();
    zoom(Math.sign(e.deltaY) * 0.8);
  }, { passive: false });

  let pinch = 0;
  surface.addEventListener('touchmove', e => {
    if (e.touches.length !== 2){ pinch = 0; return; }
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (pinch) zoom(-(d - pinch) * 0.02);
    pinch = d;
  }, { passive: true });
  surface.addEventListener('touchend', () => { pinch = 0; });

  /* ── 매 프레임 ── */
  function update(){
    let x = 0, z = 0;

    for (const code of keys){
      const [kx, kz] = KEY_VEC[code];
      x += kx; z += kz;
    }
    if (x || z){
      const n = Math.hypot(x, z);
      x /= n; z /= n;            // 키보드는 늘 전속력
    }

    if (grip){
      const gx = grip.dx / MAX;
      const gz = -grip.dy / MAX;      // 화면 위쪽이 앞이다
      if (Math.hypot(gx, gz) > DEAD){ x = gx; z = gz; }
    }

    const len = Math.hypot(x, z);
    if (len > 1){ x /= len; z /= len; }
    state.move.x = x;
    state.move.z = z;
    return state;
  }

  homeCenter();
  drawKnob(0, 0);

  return { state, update, isTyping: typing };
}
