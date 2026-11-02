/*
 * 풀이 바람에 흩날리는 소리.
 *
 * 음원 파일을 두지 않고 그 자리에서 만든다. 저장소에 파일이 늘지 않고,
 * 같은 구간이 되풀이되는 티도 나지 않는다.
 *
 * 낮게 웅웅대는 바람 소리와는 결이 다르다. 풀잎 소리는 잎이 하나하나
 * 스치는 "사락" 이 수없이 겹친 것이라, 매끈한 잡음으로는 안 난다. 그래서
 * 아주 짧은 알갱이 수천 개를 미리 구워 넣고, 낮은 쪽을 깎아 잎 스치는
 * 대역(700Hz~2.6kHz 언저리)만 남긴다. 돌릴 때는 되풀이만 하면 된다.
 *
 * 브라우저는 사용자가 무언가 누르기 전에는 소리를 내주지 않는다. 그래서
 * "정원으로 들어가기" 를 누르는 그 순간에 만든다.
 */

const STORE = 'rainbowGarden.sound';
const LEVEL = 0.07;           // 잔잔하게. 높은 소리는 같은 크기도 더 크게 들린다.
const LOOP_SECONDS = 6;
const SEAM = 0.35;            // 이음매를 섞을 구간 (초)

function rustleBuffer(ctx){
  const len = Math.floor(ctx.sampleRate * LOOP_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);

  // 바탕 — 아주 옅은 쉬 소리. 알갱이 사이를 메워 끊기지 않게 한다.
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.12;

  // 알갱이 — 잎이 한 번 스치는 소리. 짧게 치고 빠르게 잦아든다.
  const grains = Math.floor(len / 26);
  for (let g = 0; g < grains; g++){
    const at = Math.floor(Math.random() * (len - 320));
    const dur = 24 + Math.floor(Math.random() * 170);
    // 제곱해서 뽑으면 대부분 작고 가끔 도드라진다 — 실제 풀숲이 그렇다
    const amp = Math.pow(Math.random(), 2.2) * 0.9;
    for (let i = 0; i < dur; i++){
      const fade = 1 - i / dur;
      d[at + i] += (Math.random() * 2 - 1) * amp * fade * fade;
    }
  }

  // 넘치지 않게 전체를 눌러 준다
  let peak = 0;
  for (let i = 0; i < len; i++){ const v = Math.abs(d[i]); if (v > peak) peak = v; }
  if (peak > 0){
    const k = 0.9 / peak;
    for (let i = 0; i < len; i++) d[i] *= k;
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

    const { buf, loopEnd } = rustleBuffer(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = loopEnd;

    // 낮은 쪽을 걷어낸다. 남기면 바람이 웅웅대는 소리가 되어 버린다.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 560;
    hp.Q.value = 0.5;

    // 너무 쨍한 쪽을 깎는다. 필터 하나로는 기울기가 완만해 위쪽이 남고,
    // 그러면 풀잎이 아니라 백색소음처럼 들린다. 둘을 이어 두 배로 깎는다.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.Q.value = 0.6;

    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 2800;
    lp2.Q.value = 0.5;

    const gust = ctx.createGain();
    gust.gain.value = 1;

    master = ctx.createGain();
    master.gain.value = 0;

    src.connect(hp).connect(lp).connect(lp2).connect(gust).connect(master).connect(ctx.destination);

    // 바람이 한 번 지나가는 결 — 오가는 데 15초 남짓
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.066;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.5;
    swell.connect(swellDepth).connect(gust.gain);

    // 세게 불 때 잎 소리가 함께 밝아지도록 — 주기를 달리해 결이 겹치지 않게
    const bright = ctx.createOscillator();
    bright.frequency.value = 0.049;
    const brightDepth = ctx.createGain();
    brightDepth.gain.value = 750;
    bright.connect(brightDepth).connect(lp.frequency);

    src.start();
    swell.start();
    bright.start();
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
