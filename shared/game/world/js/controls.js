// 조작: 키보드 + 마우스 드래그 + 모바일 터치.
// 왼쪽 절반을 끌면 이동(조이스틱), 오른쪽 절반을 끌면 카메라가 돈다.

const MOVE_KEYS = {
  KeyW:[0,1], ArrowUp:[0,1],
  KeyS:[0,-1], ArrowDown:[0,-1],
  KeyA:[-1,0], ArrowLeft:[-1,0],
  KeyD:[1,0], ArrowRight:[1,0]
};

function typing(){
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

export function createControls(surface, { joystick } = {}){
  const keys = new Set();
  let run = false;

  const state = {
    move: { x: 0, z: 0 },   // x = 좌우, z = 앞뒤 (카메라 기준)
    run: false,
    yaw: 0,
    pitch: 0.42,
    dist: 7.5
  };

  /* ── 키보드 ── */
  addEventListener('keydown', e => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') run = true;
    if (typing()) return;
    if (MOVE_KEYS[e.code]){ keys.add(e.code); e.preventDefault(); }
  });
  addEventListener('keyup', e => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') run = false;
    keys.delete(e.code);
  });
  // 창을 벗어나면 키가 눌린 채로 남는다.
  addEventListener('blur', () => { keys.clear(); run = false; });

  /* ── 포인터: 카메라 회전 / 조이스틱 ── */
  const cam = new Map();   // pointerId -> {x, y}
  let stick = null;        // {id, ox, oy, dx, dy}
  const STICK_MAX = 46;

  function isLeftHalf(e){
    return e.clientX < innerWidth * 0.5;
  }

  surface.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && isLeftHalf(e)){
      if (stick) return;
      stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      showStick(e.clientX, e.clientY, 0, 0);
    } else {
      cam.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    surface.setPointerCapture(e.pointerId);
  });

  surface.addEventListener('pointermove', e => {
    if (stick && e.pointerId === stick.id){
      let dx = e.clientX - stick.ox;
      let dy = e.clientY - stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > STICK_MAX){ dx = dx / d * STICK_MAX; dy = dy / d * STICK_MAX; }
      stick.dx = dx; stick.dy = dy;
      showStick(stick.ox, stick.oy, dx, dy);
      return;
    }
    const prev = cam.get(e.pointerId);
    if (!prev) return;
    state.yaw   -= (e.clientX - prev.x) * 0.005;
    state.pitch -= (e.clientY - prev.y) * 0.004;
    state.pitch = Math.max(0.06, Math.min(1.15, state.pitch));
    cam.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });

  function release(e){
    if (stick && e.pointerId === stick.id){ stick = null; hideStick(); }
    cam.delete(e.pointerId);
  }
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);

  /* ── 거리 조절 ── */
  surface.addEventListener('wheel', e => {
    e.preventDefault();
    state.dist = Math.max(3.2, Math.min(14, state.dist + Math.sign(e.deltaY) * 0.7));
  }, { passive: false });

  // 두 손가락 벌리기
  let pinch = 0;
  surface.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) { pinch = 0; return; }
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (pinch) state.dist = Math.max(3.2, Math.min(14, state.dist - (d - pinch) * 0.02));
    pinch = d;
  }, { passive: true });
  surface.addEventListener('touchend', () => { pinch = 0; });

  /* ── 조이스틱 그리기 ── */
  function showStick(ox, oy, dx, dy){
    if (!joystick) return;
    joystick.hidden = false;
    joystick.style.left = ox + 'px';
    joystick.style.top  = oy + 'px';
    joystick.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function hideStick(){
    if (joystick) joystick.hidden = true;
  }

  /* ── 매 프레임 입력 모으기 ── */
  function update(){
    let x = 0, z = 0;
    for (const code of keys){
      const [kx, kz] = MOVE_KEYS[code];
      x += kx; z += kz;
    }
    if (stick){
      x += stick.dx / STICK_MAX;
      z += -stick.dy / STICK_MAX;
    }
    const len = Math.hypot(x, z);
    if (len > 1){ x /= len; z /= len; }
    state.move.x = x;
    state.move.z = z;
    state.run = run || (stick ? Math.hypot(stick.dx, stick.dy) > STICK_MAX * 0.92 : false);
    return state;
  }

  return { state, update, isTyping: typing };
}
