/*
 * 아주 작은 MQTT 3.1.1 — 웹소켓 위로.
 *
 * 왜 직접 짰나 — 실시간으로 서로를 보려면 말을 옮겨 줄 데가 필요한데,
 * 이 게임에는 서버가 없다. 공개 MQTT 브로커는 가입도 열쇠도 없이 쓸 수
 * 있어서 정적 페이지에 딱 맞다. 다만 공식 클라이언트(mqtt.js)는 번들이
 * 150KB 가 넘는다. 우리가 쓰는 것은 다섯 가지 꾸러미뿐이니(연결 · 구독 ·
 * 발행 · 숨쉬기 · 작별) 그것만 짜면 2KB 로 끝난다. 소리를 음원 파일 대신
 * 그 자리에서 굽는 것과 같은 결이다.
 *
 * 쓰지 않는 것 — QoS 1·2, 유언(will), 보관(retain), 세션 이어받기.
 * 위치는 매 순간 새로 보내므로 한 번 빠뜨려도 다음 것이 덮는다. 그래서
 * QoS 0 이면 충분하고, 재전송은 오히려 늦은 위치를 되살려 해가 된다.
 */

const CONNECT = 1, CONNACK = 2, PUBLISH = 3, SUBSCRIBE = 8,
      SUBACK = 9, PINGREQ = 12, PINGRESP = 13, DISCONNECT = 14;

const KEEPALIVE = 50;        // 초. 브로커는 1.5배까지 기다려 준다.
const PING_EVERY = 20000;    // 넉넉히 미리 숨을 쉬어 끊기지 않게 (밀리초)
                             // 게임 시간이 아니라 실제 시각으로 센다 —
                             // 느린 기기에서 숨을 늦게 쉬면 브로커가 끊는다.

const enc = new TextEncoder();
const dec = new TextDecoder();

/* 남은 길이는 128진법으로 적는다 (한 바이트에 7비트씩, 최상위 비트는 "더 있다") */
function putLen(n){
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 128;
    out.push(b);
  } while (n > 0);
  return out;
}

/* 문자열은 길이 2바이트를 앞에 붙여 적는다 */
function putStr(s){
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function frame(type, flags, body){
  return new Uint8Array([(type << 4) | flags, ...putLen(body.length), ...body]);
}

/**
 * 브로커에 붙는다.
 *
 *   url      웹소켓 주소 (wss://…/mqtt)
 *   clientId 브로커 안에서 나를 가리키는 이름 — 겹치면 서로 쫓아낸다
 *   onOpen   붙어서 쓸 수 있게 된 때
 *   onText   { topic, text } 가 올 때마다
 *   onClose  끊긴 때 (처음부터 못 붙은 때도 포함)
 */
export function connectMqtt({ url, clientId, onOpen, onText, onClose }){
  let ws, ping = 0, alive = true, ready = false;
  let buf = new Uint8Array(0);
  let subId = 1;

  try {
    ws = new WebSocket(url, 'mqtt');     // 브로커는 'mqtt' 하위 프로토콜을 요구한다
  } catch (_){
    setTimeout(() => onClose && onClose('주소가 잘못되었어요'), 0);
    return { ok: false, publish(){}, subscribe(){}, close(){} };
  }
  ws.binaryType = 'arraybuffer';

  function send(bytes){
    if (ws.readyState === 1) ws.send(bytes);
  }

  ws.onopen = () => {
    const body = [
      ...putStr('MQTT'), 4,            // 프로토콜 이름과 판(3.1.1)
      0x02,                            // 깨끗한 세션. 유언도 열쇠도 없다.
      KEEPALIVE >> 8, KEEPALIVE & 255,
      ...putStr(clientId)
    ];
    send(frame(CONNECT, 0, body));
  };

  ws.onmessage = ev => {
    // 꾸러미가 웹소켓 조각에 걸쳐 올 수 있다. 이어 붙여 두고 읽는다.
    const add = new Uint8Array(ev.data);
    const next = new Uint8Array(buf.length + add.length);
    next.set(buf); next.set(add, buf.length);
    buf = next;

    for (;;){
      if (buf.length < 2) return;

      // 남은 길이 읽기
      let len = 0, mul = 1, i = 1;
      for (;;){
        if (i >= buf.length) return;           // 길이가 아직 다 안 왔다
        const b = buf[i++];
        len += (b & 127) * mul;
        if (!(b & 128)) break;
        mul *= 128;
        if (mul > 128 * 128 * 128) { close('꾸러미를 읽지 못했어요'); return; }
      }
      if (buf.length < i + len) return;        // 몸통이 아직 다 안 왔다

      const type = buf[0] >> 4;
      const body = buf.subarray(i, i + len);
      buf = buf.subarray(i + len);

      if (type === CONNACK){
        // 두 번째 바이트가 0 이 아니면 거절이다
        if (body.length >= 2 && body[1] !== 0){
          close('브로커가 받아주지 않았어요 (' + body[1] + ')');
          return;
        }
        ready = true;
        ping = performance.now();     // 여기서부터 센다
        onOpen && onOpen();
      } else if (type === PUBLISH){
        const tlen = (body[0] << 8) | body[1];
        const topic = dec.decode(body.subarray(2, 2 + tlen));
        // QoS 0 이므로 꾸러미 번호가 없다. 나머지가 곧 내용이다.
        const text = dec.decode(body.subarray(2 + tlen));
        onText && onText({ topic, text });
      }
      // SUBACK · PINGRESP 는 받기만 하고 할 일이 없다
    }
  };

  function close(why){
    if (!alive) return;
    alive = false; ready = false;
    try {
      if (ws.readyState === 1) ws.send(frame(DISCONNECT, 0, []));
      ws.close();
    } catch (_){}
    onClose && onClose(why || '');
  }

  ws.onerror = () => close('브로커에 붙지 못했어요');
  ws.onclose = () => close('연결이 끊겼어요');

  return {
    ok: true,
    get ready(){ return ready; },

    subscribe(topic){
      const id = subId++ & 0xFFFF;
      send(frame(SUBSCRIBE, 0x02, [id >> 8, id & 255, ...putStr(topic), 0]));
    },

    publish(topic, text){
      if (!ready) return;
      send(frame(PUBLISH, 0, [...putStr(topic), ...enc.encode(text)]));
    },

    /* 매 프레임 불러 준다 (performance.now() 값을 넘긴다).
       숨을 쉬지 않으면 브로커가 끊는다. */
    update(t){
      if (!ready) return;
      if (t - ping >= PING_EVERY){
        ping = t;
        send(frame(PINGREQ, 0, []));
      }
    },

    close(){ close(''); }
  };
}
