/*
 * 접속 알림 — 로그인한 사람의 창이 서버에 "여기 있어요" 를 보낸다 (/api/ping).
 * 마스터 계정의 마이페이지 '접속자' 가 이것을 모아 본다 (presence.js · api.js).
 *
 *   trackPresence(() => ({ state: 'game' | 'wait', place: '어디' }))
 *     → 40초마다, 그리고 상태가 바뀌었을 때(.update()) 알린다.
 *     창을 가리면(다른 앱) 나간 것으로 알리고, 다시 보이면 다시 알린다.
 * 로그인하지 않은 손님은 알리지 않는다 — 아이디가 없다.
 */
import { readAccount } from './account.js?v=s6';

const EVERY = 40 * 1000;

export function trackPresence(get){
  const tab = Math.random().toString(36).slice(2, 10);
  let last = '';
  function send(gone){
    const a = readAccount();
    if (!a) return;
    let s = {};
    try { s = get() || {}; } catch (_){}
    last = s.state + '|' + s.place + '|' + a.token;
    fetch('/api/ping', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Session': a.token },
      body: JSON.stringify({ tab, state: s.state, place: s.place, gone: !!gone })
    }).catch(() => {});
  }
  send();
  setInterval(() => { if (document.visibilityState === 'visible') send(); }, EVERY);
  document.addEventListener('visibilitychange', () => send(document.visibilityState !== 'visible'));
  addEventListener('pagehide', () => send(true));
  return {
    /** 상태가 바뀌었을 수 있다 — 바뀌었으면 바로 알린다 */
    update(){
      let s = {};
      try { s = get() || {}; } catch (_){}
      const a = readAccount();
      if (a && s.state + '|' + s.place + '|' + a.token !== last) send();
    }
  };
}
