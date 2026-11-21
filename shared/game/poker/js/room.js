import { connectMqtt } from '../../world/js/mqtt.js';

/*
 * 방 — 한 판을 함께 하는 사람들 (최대 4명).
 *
 * 무지개 정원과 같은 공개 MQTT 브로커로 말을 주고받는다. 서버가 없으므로
 * **방장**이 판을 돌린다 — 카드를 섞고, 시간을 재고, 점수를 낸다. 방장은
 * 따로 정하지 않고 모두가 같은 잣대로 따진다: 가장 먼저 들어온 사람
 * (같으면 id 가 작은 쪽). 방장이 나가면 다음 사람이 바로 이어받는다.
 *
 * 그래서 꾸러미는 모두가 다 받아 둔다. 방장이 바뀌어도 새 방장이 이미
 * 판의 카드와 사람들이 고른 칸을 알고 있다.
 *
 * 꾸러미 (JSON)
 *   {t:'hi', id, name, at, comm}               들어왔음 · 3초마다 다시 (comm = 그 사람이 방장일 때 쓸 가운데 장수)
 *   {t:'rd', n, seats, grid, comm, el, tie, scores, names}
 *                                               판 시작 · 판이 도는 동안 2초마다 다시
 *                                               (el = 시작한 뒤 지난 밀리초)
 *   {t:'pk', id, n, p:[칸, 칸]}                 고른 칸 · 바뀔 때와 1초마다
 *   {t:'rs', n, rows, tie, scores, names}       결과 · 다음 판까지 2초마다 다시
 *   {t:'bye', id}
 *
 * QoS 0 이라 꾸러미가 빠질 수 있다. 그래서 중요한 것은 되풀이해 보낸다.
 */

export const MAX_SEATS = 4;
const HI_EVERY = 3000;
const GONE_AFTER = 8000;
const TOPIC = 'mempoker/';

export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
];

function brokersToTry(){
  const m = /(?:^#|[#&])b=([^&]+)/.exec(location.hash || '');
  if (!m) return BROKERS;
  const url = decodeURIComponent(m[1]);
  return /^wss?:\/\//.test(url) ? [url] : BROKERS;
}

export function makeId(){
  const r = new Uint32Array(2);
  crypto.getRandomValues(r);
  return r[0].toString(36) + r[1].toString(36);
}

/**
 * joinRoom({ room, me:{id,name,at}, onMessage, onPeers, onStatus })
 */
export function joinRoom({ room, me, onMessage, onPeers, onStatus }){
  const topic = TOPIC + room;
  const peers = new Map();          // id → { name, at, seen }
  let client = null, alive = true, tries = 0, lastHi = 0;
  const list = brokersToTry();

  function send(obj){ client && client.ready && client.publish(topic, JSON.stringify(obj)); }
  const hi = () => { lastHi = performance.now(); send({ t: 'hi', id: me.id, name: me.name, at: me.at, comm: me.comm }); };

  function open(){
    const url = list[tries % list.length];
    onStatus('wait', '연결하는 중…');
    client = connectMqtt({
      url,
      clientId: 'mp_' + me.id + '_' + Math.floor(Math.random() * 1e6),
      onOpen(){
        tries = 0;
        client.subscribe(topic);
        onStatus('live', '연결됨');
        hi();
      },
      onText({ text }){
        let m;
        try { m = JSON.parse(text); } catch (_){ return; }
        if (!m || typeof m !== 'object' || m.id === me.id && m.t !== 'rd' && m.t !== 'rs') return;
        if (m.t === 'hi'){
          const known = peers.has(m.id);
          peers.set(m.id, { name: String(m.name || '').slice(0, 12) || '손님', at: +m.at || 0, comm: +m.comm || 0, seen: performance.now() });
          if (!known){ hi(); onPeers(); }      // 새로 온 사람이 나를 바로 알게
          return;
        }
        if (m.t === 'bye'){
          if (peers.delete(m.id)) onPeers();
          return;
        }
        if (m.id && peers.has(m.id)) peers.get(m.id).seen = performance.now();
        onMessage(m);
      },
      onClose(why){
        if (!alive) return;
        tries++;
        onStatus('off', (why || '연결이 끊겼어요') + ' · 다시 잇는 중');
        setTimeout(() => alive && open(), 2500);
      }
    });
  }
  open();

  const tick = setInterval(() => {
    const t = performance.now();
    client && client.update(t);
    if (t - lastHi >= HI_EVERY) hi();
    let changed = false;
    for (const [id, p] of peers) if (t - p.seen > GONE_AFTER){ peers.delete(id); changed = true; }
    if (changed) onPeers();
  }, 500);

  function leave(){
    if (!alive) return;
    send({ t: 'bye', id: me.id });
    alive = false;
    clearInterval(tick);
    client && client.close();
  }
  addEventListener('pagehide', leave);

  return {
    peers,
    send,
    leave,
    /** 들어온 순서대로 줄 세운 사람들. 앞의 넷이 자리에 앉고 맨 앞이 방장이다. */
    order(){
      const all = [{ id: me.id, name: me.name, at: me.at }, ...[...peers].map(([id, p]) => ({ id, name: p.name, at: p.at }))];
      return all.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    },
    present(id){ return id === me.id || peers.has(id); }
  };
}
