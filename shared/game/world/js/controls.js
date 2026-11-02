/*
 * 조작: 앞뒤양옆 네 방향 점프만.
 *
 * 누른 방향은 한 번 소비되고 사라진다. 뛰는 중에 들어온 입력은 하나만
 * 기억해 뒀다가 착지하는 순간 이어서 뛴다 — 연달아 누르면 리듬이 끊기지
 * 않는다.
 */

const KEY_DIR = {
  KeyW:'f', ArrowUp:'f',
  KeyS:'b', ArrowDown:'b',
  KeyA:'l', ArrowLeft:'l',
  KeyD:'r', ArrowRight:'r'
};

function typing(){
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

export function createControls(surface, { pad } = {}){
  const state = { yaw: 0, pitch: 0.5, dist: 6.2 };
  let queued = null;

  function push(dir){ queued = dir; }

  /* ── 키보드 ── */
  addEventListener('keydown', e => {
    if (typing() || e.repeat) return;
    const dir = KEY_DIR[e.code];
    if (dir){ e.preventDefault(); push(dir); }
  });

  /* ── 화면 위 방향 패드 ── */
  if (pad){
    for (const btn of pad.querySelectorAll('button[data-dir]')){
      // pointerdown 으로 받아야 누르는 즉시 뛴다
      btn.addEventListener('pointerdown', e => {
        e.preventDefault();
        push(btn.dataset.dir);
        btn.classList.add('on');
      });
      const off = () => btn.classList.remove('on');
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    }
  }

  /* ── 카메라: 끌어서 돌리기 ── */
  const drag = new Map();
  surface.addEventListener('pointerdown', e => {
    drag.set(e.pointerId, { x: e.clientX, y: e.clientY });
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', e => {
    const prev = drag.get(e.pointerId);
    if (!prev) return;
    state.yaw   -= (e.clientX - prev.x) * 0.005;
    state.pitch -= (e.clientY - prev.y) * 0.004;
    state.pitch = Math.max(0.16, Math.min(1.1, state.pitch));
    drag.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  const drop = e => drag.delete(e.pointerId);
  surface.addEventListener('pointerup', drop);
  surface.addEventListener('pointercancel', drop);

  /* ── 거리 ── */
  function zoom(delta){
    state.dist = Math.max(3.5, Math.min(12, state.dist + delta));
  }
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

  return {
    state,
    /** 기다리던 방향을 꺼내 쓴다. 꺼내면 비워진다. */
    takeHop(){
      const d = queued;
      queued = null;
      return d;
    },
    isTyping: typing
  };
}

/** 'f' | 'b' | 'l' | 'r' 을 카메라가 보는 방향 기준의 x, z 로. */
export function dirToVector(dir, yaw){
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  switch (dir){
    case 'f': return { x: -sin, z: -cos };
    case 'b': return { x:  sin, z:  cos };
    case 'l': return { x: -cos, z:  sin };
    case 'r': return { x:  cos, z: -sin };
  }
  return { x: 0, z: 0 };
}
