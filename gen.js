/*
 * 사진으로 캐릭터 만들기 (사용자 요청) — 올린 사진을 Claude 가 보고, 블록 캐릭터 위에 덧입힐
 * 머리 · 상하의 · 신발 · 소품을 **둥근 상자 조각 목록**으로 그려 준다. 서버(api.js)가 부른다.
 *
 *   POST /api/gen    {img}        사진(JPEG base64, 긴 변 640px)으로 모델 하나 짓기 — 횟수 하나를 쓴다
 *   GET  /api/gens   [?all=1]     내 모델 목록과 남은 횟수 (마스터는 all=1 로 모두)
 *   GET  /api/gimg   ?id          올린 사진 (그 사람 · 마스터만)
 *   POST /api/ghide  {id, hidden} 숨기기 · 다시 보이기 (지우기는 없다 — 사용자 요청)
 *   GET  /api/model  ?id          모델 조각 (누구나 — 정원에서 남들 화면에도 그 모습이 보여야 한다)
 *   POST /api/credit {id, add}    횟수 충전 (마스터만 — 결제를 붙이기 전까지)
 *   POST /api/gdel   {id}         모델 · 사진 지우기 (**마스터만** — 마스터의 마이페이지에서만, 사용자 요청). 회원은 숨기기만 된다
 *
 * 횟수: 회원마다 무료 2번(FREE) + 충전한 만큼 (user.gen = {used, extra}). 4,900원에 5번은 결제를 붙이면
 * /api/credit 과 같은 자리에 더한다. 만든 모델은 **올린 사람과 마스터만 입을 수 있다** (PUT /api/me 가 따진다).
 *
 * 저장(KV): `gmod:<id>` 모델 · `gimg:<id>` 사진(작게 줄인 JPEG). 계정에는 모델 번호 목록만 (user.gens).
 * Claude API 열쇠는 Worker 비밀 `ANTHROPIC_API_KEY` — 저장소에는 없다.
 */

export const FREE = 2;
const MODEL = 'claude-opus-5-5';
const ID_OK = /^[a-z0-9]{12}$/;
const GROUPS = ['head', 'body', 'armL', 'armR', 'legL', 'legR'];
const MAX_PARTS = 160;

const newId = () => { const a = crypto.getRandomValues(new Uint8Array(12)), s = 'abcdefghijkmnpqrstuvwxyz23456789'; return [...a].map(v => s[v % s.length]).join(''); };
export const left = user => FREE + ((user.gen && user.gen.extra) | 0) - ((user.gen && user.gen.used) | 0);

/* 블록 캐릭터의 맨몸 — Claude 가 이 좌표에 맞춰 옷을 지을 수 있게 숫자로 일러 준다 (game/world/js/blocky.js 의 build 와 같은 값) */
const SYSTEM = `You turn a photo or illustration of a person/character into clothing, hair and accessories for a chunky "blocky" 3D toy character.
The output is a list of rounded boxes that are layered over a fixed bare body. Recreate what the person in the image wears as faithfully as the box style allows:
hair shape and color, hat/cap, glasses, top (with sleeves, hood, zipper, collar, pockets, stripes, logos as small flat boxes), bottom (pants/shorts/skirt with hems, stripes),
socks, shoes (soles, laces, color blocks), and held items or accessories (cup, bag, necklace...). Use several boxes per garment to show detail and color blocking.

COORDINATES (meters). +Y up, ground at y=0, total height 1.34. The character faces +Z (the face is on the +Z side).
x<0 is the side that appears on the LEFT of a front-view photo; x>0 appears on the RIGHT.
Each part: {g, c, x, y, z, w, h, d, r, rz} — g = group, c = color "#RRGGBB", (x,y,z) = box CENTER, (w,h,d) = full size along x,y,z, r = corner rounding (0.004..0.06, <= half the smallest size), rz = rotation about Z in radians (usually 0).

BARE BODY (already exists, skin colored; do not redraw it). Values for gender 0 (male) / gender 1 (female):
- head: cube 0.32 centered (0, 1.12, 0); spans x -0.16..0.16, y 0.96..1.28, z -0.16..0.16. Face is the +Z side (z=0.16): eyes at y=1.083, x=±0.062; mouth y=1.025. Keep the face (z>0.15, y 0.99..1.13, |x|<0.12) clear except bangs/fringe above y=1.13, or glasses.
- neck: (0, 0.95, 0) size 0.08.
- torso: x ±0.18 / ±0.16, y 0.58..0.935, z -0.1..0.1. pelvis: y 0.48..0.6.
- arms hang straight down: arm center x = -0.24 / -0.22 (left) and +0.24 / +0.22 (right); arm spans y 0.56..0.93, width 0.10 / 0.09; hand = cube 0.075 at y 0.52.
- legs: center x = ±0.095 / ±0.085, span y 0.06..0.52, width 0.145 / 0.13; feet: y 0..0.07, z -0.07..0.12, x = leg center ±0.06.

GROUPS (parts move with their group, so choose correctly):
- "head": hair, hats, glasses, earrings — anything on the head.
- "body": everything on the torso and pelvis, including hoods, skirts, dresses and jacket hems (the body does not bend).
- "armL"/"armR": sleeves, cuffs, gloves, and items held in that hand (x must stay near that arm: left arm x<0, right arm x>0).
- "legL"/"legR": pant legs, shorts legs, socks, shoes of that leg (x<0 left, x>0 right).

RULES: clothes must sit 0.005-0.04 outside the body surface so skin does not poke through (e.g. a sweatshirt torso about x ±0.195, z ±0.115, y 0.57..0.945;
a sleeve about 0.13 wide around the arm; pant legs about 0.16 wide). Hair covers the head top/back/sides (top around y 1.25..1.31) and may hang below.
Shoes enclose the feet (y 0..0.1). Keep everything within |x|<0.6, -0.02<y<1.6, |z|<0.5. Mirror left/right pairs. Use 30-${MAX_PARTS} parts.
Pick gender 0 or 1 from the image (it changes body width). Give skin and hairColor as hex. name: a short Korean name for the look (<= 12 chars). summary: one short Korean sentence.
If the image has several poses/views of the same character, use the main front view. If there is no person, still return your best guess.`;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['name', 'summary', 'gender', 'skin', 'hairColor', 'parts'],
  properties: {
    name: { type: 'string' }, summary: { type: 'string' },
    gender: { type: 'integer', enum: [0, 1] },
    skin: { type: 'string' }, hairColor: { type: 'string' },
    parts: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['g', 'c', 'x', 'y', 'z', 'w', 'h', 'd', 'r', 'rz'],
      properties: { g: { type: 'string', enum: GROUPS }, c: { type: 'string' },
        x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' },
        w: { type: 'number' }, h: { type: 'number' }, d: { type: 'number' }, r: { type: 'number' }, rz: { type: 'number' } } } }
  }
};

const hexInt = s => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s || '').trim()); return m ? parseInt(m[1], 16) : null; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number.isFinite(+v) ? +v : 0));
/* 받은 조각을 믿지 않는다 — 무리 · 색 · 범위를 다 바로잡고, 못 쓰는 것은 버린다 */
export function cleanModel(m){
  if (!m || !Array.isArray(m.parts)) return null;
  const parts = [];
  for (const p of m.parts.slice(0, MAX_PARTS)){
    const c = hexInt(p && p.c);
    if (!p || !GROUPS.includes(p.g) || c == null) continue;
    const w = clamp(p.w, 0.004, 0.8), h = clamp(p.h, 0.004, 0.8), d = clamp(p.d, 0.004, 0.8);
    const r4 = v => Math.round(v * 10000) / 10000;
    parts.push([p.g, c, r4(clamp(p.x, -0.6, 0.6)), r4(clamp(p.y, -0.02, 1.6)), r4(clamp(p.z, -0.5, 0.5)), r4(w), r4(h), r4(d),
                r4(clamp(p.r, 0.002, Math.min(w, h, d) / 2)), r4(clamp(p.rz, -3.2, 3.2))]);
  }
  if (parts.length < 3) return null;
  return { name: String(m.name || '').slice(0, 16), summary: String(m.summary || '').slice(0, 80), gender: m.gender === 1 ? 1 : 0,
           skin: hexInt(m.skin) ?? 0xFADDD2, hairColor: hexInt(m.hairColor) ?? 0x241414, parts };
}

async function askClaude(env, b64){
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01',
               'anthropic-beta': 'server-side-fallback-2026-07-01' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      fallbacks: 'default',            // 안전 분류기가 거절하면 서버가 알맞은 모델로 다시 한다
      system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        { type: 'text', text: 'Build the character outfit from this image.' }
      ] }]
    })
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out) throw new Error((out && out.error && out.error.message) || `AI 서버 오류 (${res.status})`);
  if (out.stop_reason === 'refusal') throw new Error('이 사진으로는 만들 수 없어요');
  if (out.stop_reason === 'max_tokens') throw new Error('모델이 너무 길어 끝맺지 못했어요 — 다시 해 주세요');
  const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let parsed = null; try { parsed = JSON.parse(text); } catch (_){}
  const m = cleanModel(parsed);
  if (!m) throw new Error('모델을 읽지 못했어요 — 다시 해 주세요');
  return m;
}

const busy = new Set();   // 같은 사람이 한꺼번에 여럿 돌리지 못하게 (워커 기억 — 가벼운 막)

/** api.js 가 부른다. 반환이 null 이면 이 길이 아니다 */
export async function handleGen(request, env, ctx, { path, method, readUser, saveUser, getUser, isAdmin, json, fail, body }){
  if (path === '/api/model' && method === 'GET'){
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!ID_OK.test(id)) return fail('없는 모델이에요', 404);
    const m = await env.ACCOUNTS.get('gmod:' + id, 'json');
    if (!m) return fail('없는 모델이에요', 404);
    return new Response(JSON.stringify({ id, gender: m.gender, skin: m.skin, hairColor: m.hairColor, parts: m.parts }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400, immutable' } });
  }
  if (!['/api/gen', '/api/gens', '/api/gimg', '/api/ghide', '/api/credit', '/api/gdel'].includes(path)) return null;
  const user = await readUser();
  if (!user) return fail('다시 로그인해 주세요', 401);
  const admin = isAdmin(user.id);

  if (path === '/api/credit' && method === 'POST'){
    if (!admin) return fail('마스터만 할 수 있어요', 403);
    const b = await body(request);
    const target = await getUser(env, String(b.id || '').trim().toUpperCase());
    const add = Math.round(+b.add);
    if (!target) return fail('없는 아이디예요', 404);
    if (!Number.isInteger(add) || add < -100 || add > 100 || !add) return fail('충전할 횟수를 다시 적어 주세요');
    target.gen = target.gen || { used: 0, extra: 0 };
    target.gen.extra = Math.max(0, (target.gen.extra | 0) + add);
    await saveUser(env, target);
    return json({ ok: true, id: target.id, left: left(target) });
  }

  /* 지우기 — 마스터만. 모델 · 사진을 지우고, 올린 사람의 목록에서 빼고, 그 모델을 입고 있었으면 벗긴다 (일반 꾸미기로 돌아간다) */
  if (path === '/api/gdel' && method === 'POST'){
    if (!admin) return fail('마스터만 지울 수 있어요', 403);
    const id = String((await body(request)).id || '');
    if (!ID_OK.test(id)) return fail('없는 모델이에요', 404);
    const m = await env.ACCOUNTS.get('gmod:' + id, 'json');
    if (!m) return fail('없는 모델이에요', 404);
    await env.ACCOUNTS.delete('gmod:' + id);
    await env.ACCOUNTS.delete('gimg:' + id);
    const owner = await getUser(env, m.owner);
    if (owner){
      owner.gens = (owner.gens || []).filter(x => x !== id);
      if (owner.char && owner.char.mid === id) delete owner.char.mid;
      await saveUser(env, owner);
    }
    if (user.char && user.char.mid === id && (!owner || owner.id !== user.id)){ delete user.char.mid; await saveUser(env, user); }
    return json({ ok: true, id });
  }

  if (path === '/api/gens' && method === 'GET'){
    const all = admin && new URL(request.url).searchParams.get('all') === '1';
    let ids = (user.gens || []).slice();
    if (all){
      ids = []; let cursor;
      do { const l = await env.ACCOUNTS.list({ prefix: 'gmod:', cursor, limit: 1000 }); ids.push(...l.keys.map(k => k.name.slice(5))); cursor = l.list_complete ? null : l.cursor; } while (cursor && ids.length < 3000);
    }
    const items = [];
    for (const id of ids.slice(0, 200)){
      const m = await env.ACCOUNTS.get('gmod:' + id, 'json');
      if (m) items.push({ id, owner: m.owner, at: m.at, name: m.name, summary: m.summary, gender: m.gender, hidden: !!m.hidden });
    }
    items.sort((a, b) => b.at - a.at);
    return json({ left: left(user), free: FREE, used: (user.gen && user.gen.used) | 0, extra: (user.gen && user.gen.extra) | 0, items });
  }

  if (path === '/api/gimg' && method === 'GET'){
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!ID_OK.test(id)) return fail('없는 사진이에요', 404);
    const m = await env.ACCOUNTS.get('gmod:' + id, 'json');
    if (!m || (m.owner !== user.id && !admin)) return fail('볼 수 없어요', 403);
    const img = await env.ACCOUNTS.get('gimg:' + id, 'arrayBuffer');
    if (!img) return fail('없는 사진이에요', 404);
    return new Response(img, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' } });
  }

  if (path === '/api/ghide' && method === 'POST'){
    const b = await body(request);
    const id = String(b.id || '');
    if (!ID_OK.test(id)) return fail('없는 모델이에요', 404);
    const m = await env.ACCOUNTS.get('gmod:' + id, 'json');
    if (!m || (m.owner !== user.id && !admin)) return fail('바꿀 수 없어요', 403);
    m.hidden = !!b.hidden;
    await env.ACCOUNTS.put('gmod:' + id, JSON.stringify(m));
    return json({ ok: true, id, hidden: m.hidden });
  }

  if (path === '/api/gen' && method === 'POST'){
    if (!env.ANTHROPIC_API_KEY) return fail('사진으로 만들기가 아직 준비되지 않았어요 (AI 열쇠가 없어요)', 503);
    if (left(user) <= 0) return fail('남은 횟수가 없어요 — 추가 구매 후 다시 해 주세요', 402);
    if (busy.has(user.id)) return fail('이미 만드는 중이에요 — 잠시만 기다려 주세요', 429);
    const b = await body(request);
    const b64 = String(b.img || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(b64) || b64.length < 1000 || b64.length > 900000) return fail('사진을 다시 골라 주세요');
    busy.add(user.id);
    /* 1~2분 걸린다 — 기다리는 동안 빈칸을 흘려 연결을 살려 두고, 끝나면 JSON 한 덩어리를 보낸다.
       손님이 창을 닫아도 일은 끝까지 마치고 목록에 남긴다 (ctx.waitUntil). */
    const { readable, writable } = new TransformStream();
    const w = writable.getWriter(), te = new TextEncoder();
    const beat = setInterval(() => { w.write(te.encode(' ')).catch(() => {}); }, 8000);
    const job = (async () => {
      let out;
      try {
        const m = await askClaude(env, b64);
        const id = newId();
        const fresh = (await getUser(env, user.id)) || user;      // 그 사이에 바뀐 계정 위에 적는다
        if (left(fresh) <= 0) throw new Error('남은 횟수가 없어요');
        await env.ACCOUNTS.put('gimg:' + id, Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)));
        await env.ACCOUNTS.put('gmod:' + id, JSON.stringify({ ...m, id, owner: fresh.id, at: Date.now(), hidden: false }));
        fresh.gen = fresh.gen || { used: 0, extra: 0 };
        fresh.gen.used = (fresh.gen.used | 0) + 1;
        fresh.gens = [id, ...(fresh.gens || [])].slice(0, 500);
        await saveUser(env, fresh);
        out = { ok: true, left: left(fresh), model: { id, name: m.name, summary: m.summary, gender: m.gender, skin: m.skin, hairColor: m.hairColor, parts: m.parts } };
      } catch (err){
        out = { error: err.message || '만들지 못했어요' };
      } finally { busy.delete(user.id); clearInterval(beat); }
      try { await w.write(te.encode(JSON.stringify(out))); await w.close(); } catch (_){}
    })();
    if (ctx && ctx.waitUntil) ctx.waitUntil(job);
    return new Response(readable, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return fail('없는 길이에요', 404);
}

/** 캐릭터에 입힌 모델 번호를 따진다 — 올린 사람과 마스터만 입는다. 아니면 벗긴다 */
export async function checkMid(env, user, char, isAdmin){
  if (!char || !char.mid) return char;
  if (!ID_OK.test(char.mid)){ delete char.mid; return char; }
  const m = await env.ACCOUNTS.get('gmod:' + char.mid, 'json');
  if (!m || (m.owner !== user.id && !isAdmin(user.id))) delete char.mid;
  return char;
}
