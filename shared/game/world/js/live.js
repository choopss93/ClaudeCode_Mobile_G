import { CAPACITY, PUBLIC } from '#channel';
import { connectMqtt } from '#mqtt';

/*
 * 실시간 접속.
 *
 * net.js 에 적어 둔 그 모양(onJoin / onState / onSay / onLeave)을 그대로
 * 따르는 또 하나의 구현이다. 게임 쪽 코드는 누가 사람이고 누가 거니는
 * 손님인지 묻지 않는다.
 *
 * 서버가 없으니 말을 옮겨 줄 데로 공개 MQTT 브로커를 쓴다. 가입도 열쇠도
 * 없고, 브로커가 가운데서 받아 뿌리므로 — 직접 잇는 방식(WebRTC)과 달리 —
 * 통신사 NAT 뒤의 폰끼리도 막히지 않는다. 폰에서 하는 게임이니 이쪽이 맞다.
 *
 * 반려동물은 **주인의 기기에서만 살아 있다.** 주인이 그 아이의 위치를
 * 보내고, 받은 사람은 보내온 자리에 놓기만 한다. 그래서 둘이 같은 한
 * 마리를 본다. 받은 쪽에서 따로 거닐게 하면 화면마다 다른 데 있게 된다.
 *
 * 꾸러미 (JSON 배열, 짧게)
 *   ['hi', id, 이름, 머리, 아이이름, [종, 품종, 털빛]]   들어왔음 · 4초마다 다시
 *   ['s',  id, x, z, ry, 빠르기, 아이x, 아이z, 아이ry, 아이빠르기, 반김]
 *   ['t',  id, 한 말]
 *   ['bye', id]
 */

const ROOM = 'rbgarden/';          // 토픽 앞가지
const SEND_EVERY = 1000 / 11;      // 위치를 보내는 주기 (밀리초)
const HI_EVERY = 4000;             // 다시 인사하는 주기 — 늦게 온 사람이 알아본다
const GONE_AFTER = 7000;           // 이만큼 소식이 없으면 간 것으로 본다
const RETRY = 3000;                // 끊긴 뒤 다시 잇기까지
const TRIES = 6;                   // 이만큼 해보고 안 되면 혼자 거닌다

/* 주고받는 일의 시계는 게임 시간(dt)이 아니라 **실제 시각**이다.
   느린 기기에서는 게임 시간이 느리게 흘러서, dt 를 더해 재면 상대가
   나갔는지 한참 뒤에야 깨닫고 숨도 늦게 쉬어 브로커가 끊는다. 빠른 폰과
   느린 폰이 섞이면 서로를 잘못 판단한다. */
const now = () => performance.now();

/* 가입도 열쇠도 필요 없는 공개 브로커들. 앞엣것이 쉬는 날이면 다음 것으로
   옮겨 간다 — 하나에만 기대면 그 하나가 멈출 때 정원이 통째로 조용해진다.
   주소에 #b=wss://… 를 붙이면 이 목록 대신 그 하나만 쓴다 (검사할 때). */
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
];

function round(v){ return Math.round(v * 100) / 100; }

function brokersToTry(){
  const m = /(?:^#|[#&])b=([^&]+)/.exec(location.hash || '');
  if (!m) return BROKERS;
  const url = decodeURIComponent(m[1]);
  return /^wss?:\/\//.test(url) ? [url] : BROKERS;
}

/**
 * createLiveNet({ handlers, channel, me, onStatus })
 *
 *   me  { name, look, dog, pet }   남들에게 보일 나와 내 아이
 *       pet 은 { kind, breed, coat } — **이미 뽑힌** 값이어야 한다.
 *       '랜덤' 을 그대로 보내면 받는 사람 화면에서 다른 털빛이 된다.
 */
export function createLiveNet({ handlers, channel = PUBLIC, me, onStatus }){
  const topic = ROOM + channel;
  const id = 'rb' + Math.random().toString(36).slice(2, 10);
  const peers = new Map();         // id → { last: 마지막 소식이 온 시각 }
  const brokers = brokersToTry();

  let link = null, tries = 0, wakeAt = 0, closed = false;
  let sentAt = 0, hiAt = 0, last = null;
  let status = '잇는 중';

  const mine = ['hi', id, me.name, me.look, me.dog,
                me.pet ? [me.pet.kind, me.pet.breed, me.pet.coat] : null];

  function tell(s){
    status = s;
    onStatus && onStatus(s);
  }

  function connect(){
    const url = brokers[tries % brokers.length];
    tries++;
    link = connectMqtt({ url, clientId: id, onOpen, onText, onClose });
  }

  function onOpen(){
    tries = 0;                     // 붙었으니 처음부터 다시 셀 수 있다
    link.subscribe(topic);
    link.publish(topic, JSON.stringify(mine));
    tell('이어짐');
  }

  function onText({ text }){
    let m;
    try { m = JSON.parse(text); } catch (_){ return; }
    if (!Array.isArray(m) || m.length < 2) return;

    const from = m[1];
    if (typeof from !== 'string' || from === id) return;   // 내가 보낸 것

    if (m[0] === 'hi'){
      const known = peers.get(from);
      if (known){ known.last = now(); return; }            // 이미 아는 사람
      // 자리가 찼으면 더 받지 않는다. 서른 명까지다.
      if (peers.size + 1 >= CAPACITY) return;
      peers.set(from, { last: now() });
      const spec = Array.isArray(m[5])
        ? { kind: m[5][0], breed: m[5][1], coat: m[5][2] } : null;
      handlers.onJoin(from, {
        name: typeof m[2] === 'string' ? m[2].slice(0, 12) : '친구',
        look: m[3] === 'long' ? 'long' : 'short',
        dog: typeof m[4] === 'string' ? m[4].slice(0, 12) : '친구',
        pet: spec,
        remote: true                 // 이 아이는 주인이 보내 주는 자리에 놓는다
      });
      return;
    }

    // 인사를 못 받은 사람의 소식은 흘려보낸다. 4초 안에 다시 인사해 온다.
    const p = peers.get(from);
    if (!p) return;
    p.last = now();

    if (m[0] === 's'){
      const pet = m.length > 6 && m[6] !== null
        ? { x: +m[6], z: +m[7], ry: +m[8], speed: +m[9], greet: !!m[10] } : null;
      handlers.onState(from, {
        x: +m[2] || 0, y: 0, z: +m[3] || 0, ry: +m[4] || 0, speed: +m[5] || 0, pet
      });
    } else if (m[0] === 't'){
      if (typeof m[2] === 'string') handlers.onSay(from, m[2].slice(0, 80));
    } else if (m[0] === 'bye'){
      peers.delete(from);
      handlers.onLeave(from);
    }
  }

  function onClose(why){
    // 끊겨도 정원은 그대로 거닐 수 있다. 다른 사람만 보이지 않는다.
    for (const from of [...peers.keys()]) handlers.onLeave(from);
    peers.clear();
    link = null;

    if (closed) return;
    if (tries >= TRIES){
      tell(why ? '혼자 (' + why + ')' : '혼자');
      return;
    }
    tell('다시 잇는 중');
    wakeAt = now() + RETRY;        // update 에서 때가 되면 다시 붙는다
  }

  // 창을 닫을 때 작별을 알린다. 못 보내도 7초 뒤 알아서 사라진다.
  const bye = () => {
    try { if (link) link.publish(topic, JSON.stringify(['bye', id])); } catch (_){}
  };
  addEventListener('pagehide', bye);

  connect();

  return {
    mode: 'live',
    channel,
    capacity: CAPACITY,
    get status(){ return status; },
    count(){ return peers.size + 1; },
    full(){ return this.count() >= CAPACITY; },

    /* 내 모습과 내 아이의 자리. 매 프레임 불러도 되게 여기서 솎는다. */
    sendState(s, pet){ last = [s, pet]; },

    say(text){
      if (link) link.publish(topic, JSON.stringify(['t', id, String(text).slice(0, 80)]));
    },

    update(){
      const t = now();

      if (!link){
        if (wakeAt && t >= wakeAt){ wakeAt = 0; connect(); }
        return;
      }
      link.update(t);

      for (const [from, p] of peers){
        if (t - p.last > GONE_AFTER){
          peers.delete(from);
          handlers.onLeave(from);
        }
      }

      if (t - hiAt >= HI_EVERY){
        hiAt = t;
        link.publish(topic, JSON.stringify(mine));
      }

      if (!last || t - sentAt < SEND_EVERY) return;
      sentAt = t;

      const [s, pet] = last;
      const msg = ['s', id, round(s.x), round(s.z), round(s.ry), round(s.speed)];
      if (pet){
        msg.push(round(pet.x), round(pet.z), round(pet.ry), round(pet.speed),
                 pet.greet ? 1 : 0);
      } else {
        msg.push(null);
      }
      link.publish(topic, JSON.stringify(msg));
    },

    close(){
      closed = true;
      bye();
      removeEventListener('pagehide', bye);
      if (link) link.close();
    }
  };
}
