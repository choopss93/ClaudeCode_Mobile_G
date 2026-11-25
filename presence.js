/*
 * 접속자 — 누가 지금 Metaversal Studio 에 있는지 (마스터 계정의 마이페이지가 본다).
 *
 * Durable Object 하나(세상에 하나뿐)가 모은다. 사용자 요청으로 **계속 저장하고, 백엔드에
 * 암호화해 둔다** — 이 객체의 SQLite 저장소에 적되, 내용은 모두 AES-GCM 으로 잠근 글이다.
 *   열쇠 = HKDF(SESSION_SECRET, 'metaversal-presence') — 비밀은 Worker 설정에만 있고 저장소에는
 *   없다. 저장소를 통째로 들여다봐도 아이디 · 있는 곳 · 시각을 읽을 수 없다.
 *   SESSION_SECRET 을 바꾸면 예전 기록은 못 읽는다 (읽지 못한 줄은 건너뛴다).
 *
 * 표 둘
 *   cur(k, data)  지금 있는 창 하나 = 한 줄. data = 잠근 {id, state, place, since, seen}
 *   log(n, data)  들어옴 · 바뀜 · 나감 기록. n 이 차례(시각도 잠가 두었다). data = 잠근 {id, ev, state, place, at}
 * 저장소 쓰기를 아끼려고 40초마다 오는 인사에는 적지 않는다 — 상태가 바뀔 때와, 마지막 소식(seen)이
 * 2분 넘게 묵었을 때만 적는다. 기록은 LOG_MAX 줄까지 두고 오래된 것부터 지운다.
 */
import { DurableObject } from 'cloudflare:workers';

const GONE_AFTER = 100 * 1000;    // 이만큼 소식이 없으면 나간 것으로 본다 (인사는 40초마다)
const SEEN_SAVE = 120 * 1000;     // 마지막 소식은 이만큼 묵었을 때만 다시 적는다
const LOG_MAX = 200000;

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u => btoa(String.fromCharCode(...u));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export class Presence extends DurableObject {
  constructor(ctx, env){
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.tabs = new Map();          // k → { id, state, place, since, seen, saved }
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS cur (k TEXT PRIMARY KEY, data TEXT NOT NULL)');
      this.sql.exec('CREATE TABLE IF NOT EXISTS log (n INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL)');
      this.key = await this.makeKey(env.SESSION_SECRET || '');
      for (const row of this.sql.exec('SELECT k, data FROM cur').toArray()){
        const r = await this.open(row.data);
        if (r) this.tabs.set(row.k, { ...r, saved: r.seen });
        else this.sql.exec('DELETE FROM cur WHERE k = ?', row.k);
      }
    });
  }
  async makeKey(secret){
    const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('metaversal'), info: enc.encode('metaversal-presence') },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async seal(obj){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, enc.encode(JSON.stringify(obj))));
    return b64(iv) + '.' + b64(ct);
  }
  async open(text){
    try {
      const [iv, ct] = String(text).split('.');
      return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, this.key, unb64(ct))));
    } catch (_){ return null; }
  }
  async saveCur(k, r){
    r.saved = r.seen;
    const { id, state, place, since, seen } = r;
    this.sql.exec('INSERT OR REPLACE INTO cur (k, data) VALUES (?, ?)', k, await this.seal({ id, state, place, since, seen }));
  }
  async addLog(r, ev, at){
    this.sql.exec('INSERT INTO log (data) VALUES (?)', await this.seal({ id: r.id, ev, state: r.state, place: r.place, at }));
    if (Math.random() < 0.01) this.sql.exec('DELETE FROM log WHERE n <= (SELECT MAX(n) FROM log) - ?', LOG_MAX);
  }
  async drop(k, r, at){
    this.tabs.delete(k);
    this.sql.exec('DELETE FROM cur WHERE k = ?', k);
    await this.addLog(r, 'out', at);
  }
  async prune(now){
    for (const [k, r] of [...this.tabs]) if (now - r.seen > GONE_AFTER) await this.drop(k, r, r.seen);
  }

  async fetch(request){
    const now = Date.now();
    await this.prune(now);
    const url = new URL(request.url);

    if (url.pathname === '/ping' && request.method === 'POST'){
      const b = await request.json().catch(() => ({}));
      const k = b.id + '|' + b.tab;
      const prev = this.tabs.get(k);
      if (b.gone){ if (prev) await this.drop(k, prev, now); return new Response('ok'); }
      if (!prev){
        const r = { id: b.id, state: b.state, place: b.place, since: now, seen: now };
        this.tabs.set(k, r); await this.saveCur(k, r); await this.addLog(r, 'in', now);
      } else if (prev.state !== b.state || prev.place !== b.place){
        Object.assign(prev, { state: b.state, place: b.place, since: now, seen: now });
        await this.saveCur(k, prev); await this.addLog(prev, 'change', now);
      } else {
        prev.seen = now;
        if (now - prev.saved > SEEN_SAVE) await this.saveCur(k, prev);
      }
      return new Response('ok');
    }

    if (url.pathname === '/log'){
      // 기록 — 최근 것부터 limit 줄. before 를 주면 그보다 앞의 것
      const limit = Math.min(500, Math.max(1, +url.searchParams.get('limit') || 200));
      const before = +url.searchParams.get('before') || Number.MAX_SAFE_INTEGER;
      const rows = this.sql.exec('SELECT n, data FROM log WHERE n < ? ORDER BY n DESC LIMIT ?', before, limit).toArray();
      const list = [];
      for (const row of rows){ const r = await this.open(row.data); if (r) list.push({ n: row.n, ...r }); }
      const total = this.sql.exec('SELECT COUNT(*) AS c FROM log').one().c;
      return Response.json({ now, total, list });
    }

    // 지금 있는 사람 — 계정마다 하나로 묶는다 (게임 중인 창이 있으면 그것)
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
