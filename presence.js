/*
 * 접속자 — 누가 지금 Metaversal Studio 에 있는지 (마스터 계정의 마이페이지가 본다).
 *
 * Durable Object 하나가 기억에만 들고 있다. KV 는 하루 쓰기 1000번이라 1분마다 오는
 * 인사를 적을 수 없고, 워커는 요청마다 다른 곳에서 돌아 기억을 나눠 갖지 못한다.
 * 이 객체는 세상에 하나뿐이라 모두가 같은 목록을 본다. 저장하지 않으므로 객체가 쉬다
 * 깨어나면 비어 있다가, 40초 안에 오는 인사로 다시 채워진다.
 *
 * 기록 하나 = 계정 하나의 창(tab) 하나. 같은 계정이 창을 여럿 열면 게임 중인 창을 앞세운다.
 *   { id, tab, state:'game'|'wait', place, since(상태가 바뀐 때), seen(마지막 인사) }
 */
const GONE_AFTER = 100 * 1000;     // 이만큼 소식이 없으면 나간 것으로 본다 (인사는 40초마다)

export class Presence {
  constructor(){ this.tabs = new Map(); }
  async fetch(request){
    const now = Date.now();
    for (const [k, r] of this.tabs) if (now - r.seen > GONE_AFTER) this.tabs.delete(k);
    const url = new URL(request.url);
    if (url.pathname === '/ping' && request.method === 'POST'){
      const b = await request.json().catch(() => ({}));
      const key = b.id + '|' + b.tab;
      if (b.gone){ this.tabs.delete(key); return new Response('ok'); }
      const prev = this.tabs.get(key);
      const same = prev && prev.state === b.state && prev.place === b.place;
      this.tabs.set(key, { id: b.id, state: b.state, place: b.place, since: same ? prev.since : now, seen: now });
      return new Response('ok');
    }
    // 목록 — 계정마다 하나로 묶는다 (게임 중인 창이 있으면 그것)
    const by = new Map();
    for (const r of this.tabs.values()){
      const o = by.get(r.id);
      if (!o || (r.state === 'game' && o.state !== 'game') || (r.state === o.state && r.seen > o.seen)) by.set(r.id, r);
    }
    const list = [...by.values()].map(({ id, state, place, since, seen }) => ({ id, state, place, since, seen }))
      .sort((a, b) => b.since - a.since);
    return Response.json({ now, list });
  }
}
