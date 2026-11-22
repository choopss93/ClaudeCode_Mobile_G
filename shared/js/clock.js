/*
 * 서버 시계 — Metaversal Studio 의 모든 화면이 쓰는 시각 하나 (사용자 요청:
 * "서버 시간은 전부 동일하게, 사용자들이 서로 같은 것을 보고 있어야 한다").
 *
 * 폰 시계는 사람마다 몇 초에서 몇 시간까지 어긋나고, 사는 곳마다 시간대도 다르다.
 * 그래서 시각이 필요한 곳은 Date.now() 대신 serverNow() 를 쓰고, 시간대는 늘
 * 한국 시간(KST, UTC+9)으로 본다.
 *
 * 서버(/api/time)에 몇 번 물어 왕복이 가장 짧았던 답으로 어긋남(offset)을 잰다.
 * 가는 데와 오는 데 반씩 걸렸다고 보고 가운데 시각에 맞춘다. 5분마다 다시 잰다.
 * 서버에 닿지 못하면(github.io 주소 등) 폰 시계를 그대로 쓴다.
 */

const KST = 9 * 3600 * 1000;
const SAMPLES = 3;
const AGAIN = 5 * 60 * 1000;
let offset = 0;
let synced = false;
let pending = null;

/** 서버 기준 지금 시각(밀리초). */
export const serverNow = () => Date.now() + offset;
/** 서버 시계에 맞췄는가. */
export const clockSynced = () => synced;
/** 한국 시간 기준 몇 시인가 (0~24, 분은 소수로). */
export function seoulHour(ms = serverNow()){
  const h = ((ms + KST) / 3600000) % 24;
  return h < 0 ? h + 24 : h;
}

async function sampleOnce(){
  const t0 = Date.now();
  const res = await fetch('/api/time', { cache: 'no-store' });
  const t1 = Date.now();
  if (!res.ok) throw new Error('time ' + res.status);
  const { now } = await res.json();
  if (!Number.isFinite(now)) throw new Error('time');
  return { rtt: t1 - t0, off: now - (t0 + t1) / 2 };
}

/** 서버 시계에 맞춘다. 여러 곳에서 불러도 한 번만 돈다. */
export function syncClock(){
  if (pending) return pending;
  pending = (async () => {
    let best = null;
    for (let i = 0; i < SAMPLES; i++){
      try {
        const s = await sampleOnce();
        if (!best || s.rtt < best.rtt) best = s;
      } catch (_){ break; }
    }
    if (best){ offset = best.off; synced = true; }
    return synced;
  })().finally(() => { pending = null; });
  return pending;
}

syncClock();
setInterval(syncClock, AGAIN);
