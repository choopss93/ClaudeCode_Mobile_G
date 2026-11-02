/*
 * 바람 소리.
 *
 * 음원 파일을 두지 않고 그 자리에서 만든다. 저장소에 파일이 늘지 않고,
 * 같은 구간이 되풀이되는 티도 나지 않는다.
 *
 * 만드는 법 — 갈색 잡음(낮은 쪽이 두터운 쉬익 소리)을 저역 통과 필터로
 * 깎고, 아주 느린 흔들림 둘을 얹는다. 하나는 소리 크기를, 하나는 필터를
 * 흔들어 바람이 불었다 잦아드는 결을 만든다.
 *
 * 브라우저는 사용자가 무언가 누르기 전에는 소리를 내주지 않는다. 그래서
 * "정원으로 들어가기" 를 누르는 그 순간에 만든다.
 */

const STORE = 'rainbowGarden.sound';
const LEVEL = 0.085;          // 잔잔하게. 1 이 최대다.
const LOOP_SECONDS = 5;
const SEAM = 0.3;             // 이음매를 섞을 구간 (초)

function brownNoise(ctx){
  const len = Math.floor(ctx.sampleRate * LOOP_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);

  let last = 0;
  for (let i = 0; i < len; i++){
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;   // 낮은 쪽을 두텁게
    d[i] = last * 3.2;
  }

  // 되풀이될 때 이음매에서 "툭" 하고 튀지 않도록, 끝자락을 앞머리에 섞는다.
  const seam = Math.floor(ctx.sampleRate * SEAM);
  for (let i = 0; i < seam; i++){
    const t = i / seam;
    d[i] = d[i] * t + d[len - seam + i] * (1 - t);
  }
  return { buf, loopEnd: (len - seam) / ctx.sampleRate };
}

export function createWind(){
  let ctx = null, master = null, on = false;

  // 지난번 선택을 기억한다. 처음이면 켠 상태로 시작한다.
  let want = true;
  try {
    const saved = localStorage.getItem(STORE);
    if (saved !== null) want = saved === 'on';
  } catch (_){}

  function build(){
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    const { buf, loopEnd } = brownNoise(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = loopEnd;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.4;

    const gust = ctx.createGain();
    gust.gain.value = 1;

    master = ctx.createGain();
    master.gain.value = 0;

    src.connect(lp).connect(gust).connect(master).connect(ctx.destination);

    // 불었다 잦아드는 결 — 한 번 오가는 데 15초 남짓
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.066;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.42;
    swell.connect(swellDepth).connect(gust.gain);

    // 필터도 같이 흔들어 숨 쉬게 — 이쪽은 더 느리게 해서 결이 겹치지 않는다
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.043;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 190;
    breath.connect(breathDepth).connect(lp.frequency);

    src.start();
    swell.start();
    breath.start();
    return true;
  }

  function fade(to, seconds){
    if (!master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(to, now + seconds);
  }

  function turnOn(){
    if (!ctx && !build()) return;
    on = true;
    ctx.resume().catch(() => {});
    fade(LEVEL, 2.2);          // 느릿하게 차오르게
  }

  function turnOff(){
    on = false;
    if (!ctx) return;
    fade(0, 0.5);
    setTimeout(() => { if (!on) ctx.suspend().catch(() => {}); }, 600);
  }

  // 다른 앱으로 넘어가면 소리를 멈춘다
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (on) ctx.resume().catch(() => {});
  });

  return {
    /** 사용자가 무언가 누른 그 순간에 불러야 한다. */
    begin(){ if (want) turnOn(); },
    isOn(){ return on; },
    wanted(){ return want; },
    set(next){
      want = next;
      try { localStorage.setItem(STORE, next ? 'on' : 'off'); } catch (_){}
      next ? turnOn() : turnOff();
      return on;
    },
    toggle(){ return this.set(!want); }
  };
}
