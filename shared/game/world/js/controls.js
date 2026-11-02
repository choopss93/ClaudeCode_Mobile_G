/*
 * 조작: 왼쪽 아래 조이스틱을 한 손가락으로 잡고 밀면 그 방향으로 걷는다.
 * 민 만큼 빨라진다. 화면 아무 데나 끌면 카메라가 돈다.
 *
 * 조이스틱은 캔버스 위에 얹힌 별개의 요소다. 그래서 터치를 캔버스에서만
 * 들으면 조이스틱을 짚었을 때 아무 일도 일어나지 않는다 — 조이스틱이
 * 손가락을 가로채기 때문이다. 조이스틱에서 직접 듣는 이유다.
 */

const KEY_VEC = {
  KeyW:[0,1], ArrowUp:[0,1],
  KeyS:[0,-1], ArrowDown:[0,-1],
  KeyA:[-1,0], ArrowLeft:[-1,0],
  KeyD:[1,0], ArrowRight:[1,0]
};

const MAX = 30;        // 손잡이가 테두리 안에서 움직일 수 있는 거리
const DEAD = 0.12;     // 이만큼 안쪽은 손 떨림으로 보고 무시한다

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
  let grip = null;          // {id, cx, cy, dx, dy}
  const look = new Map();   // 카메라를 돌리고 있는 손가락들

  /* ── 조이스틱 ── */

  function center(){
    const r = stick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function draw(dx, dy){
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  stick.addEventListener('pointerdown', e => {
    if (grip) return;
    e.preventDefault();
    const c = center();
    grip = { id: e.pointerId, cx: c.x, cy: c.y, dx: 0, dy: 0 };
    stick.classList.add('on');
    draw(0, 0);
    try { stick.setPointerCapture(e.pointerId); } catch (_){}
  });

  stick.addEventListener('pointermove', e => {
    if (!grip || e.pointerId !== grip.id) return;
    e.preventDefault();
    let dx = e.clientX - grip.cx;
    let dy = e.clientY - grip.cy;
    const d = Math.hypot(dx, dy);
    if (d > MAX){ dx = dx / d * MAX; dy = dy / d * MAX; }
    grip.dx = dx; grip.dy = dy;
    draw(dx, dy);
  });

  function drop(e){
    if (!grip || e.pointerId !== grip.id) return;
    grip = null;
    stick.classList.remove('on');
    draw(0, 0);
  }
  stick.addEventListener('pointerup', drop);
  stick.addEventListener('pointercancel', drop);
  // 손가락을 붙잡지 못한 채 화면 밖으로 나가는 경우까지 받아 둔다
  addEventListener('pointerup', drop);
  addEventListener('pointercancel', drop);

  /* ── 카메라: 화면 아무 데나 끌면 돈다 ── */

  surface.addEventListener('pointerdown', e => {
    look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { surface.setPointerCapture(e.pointerId); } catch (_){}
  });
  surface.addEventListener('pointermove', e => {
    const prev = look.get(e.pointerId);
    if (!prev) return;
    state.yaw   -= (e.clientX - prev.x) * 0.005;
    state.pitch -= (e.clientY - prev.y) * 0.004;
    state.pitch = Math.max(0.16, Math.min(1.1, state.pitch));
    look.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const unlook = e => look.delete(e.pointerId);
  surface.addEventListener('pointerup', unlook);
  surface.addEventListener('pointercancel', unlook);

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
      x /= n; z /= n;                 // 키보드는 늘 전속력
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

  draw(0, 0);
  return { state, update, isTyping: typing };
}
