/*
 * 계정 — Metaversal Studio 의 아이디 · 비밀번호 · 캐릭터.
 *
 * 개인정보는 받지 않는다. 아이디와 비밀번호, 그리고 꾸민 캐릭터뿐이다.
 * 계정은 Cloudflare KV(`ACCOUNTS`)에 둔다 — 밖에서 보이지 않고 어느 기기에서나
 * 같은 계정으로 들어온다. Git 저장소에는 두지 않는다 (저장소가 공개라 다 보인다).
 *
 *   POST /api/check   {id}            쓸 수 있는 아이디인가
 *   POST /api/signup  {id, pw, char}  만들기 → {token, user}
 *   POST /api/login   {id, pw}        들어가기 → {token, user}
 *   GET  /api/me                       내 계정 (X-Session 머리글에 token)
 *   PUT  /api/me      {char}          캐릭터 고치기
 *
 * 비밀번호는 소금을 친 PBKDF2-SHA256 해시로만 둔다. 원래 글자는 어디에도
 * 남지 않는다 — 잊으면 되찾을 수 없다.
 *
 * 로그인 표(token)는 KV 에 적지 않고 서명으로 만든다 (`SESSION_SECRET`).
 * 무료 KV 는 하루 쓰기가 1000번이라, 들어올 때마다 적으면 금방 찬다.
 *
 * 머리글은 `Authorization` 이 아니라 `X-Session` 을 쓴다. 잠긴 페이지의
 * 비밀번호(Basic 인증)가 `Authorization` 을 쓰기 때문이다.
 */

const ID_RE = /^[a-z0-9_]{3,16}$/;
const ITER = 10000;   // 무료 Worker 는 요청마다 CPU 10ms 까지다. 계정마다 횟수를 적어 두어
                      // 나중에 올려도 옛 계정이 그대로 들어온다 (user.iter).
const TOKEN_DAYS = 60;
const enc = new TextEncoder();

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

function json(data, status = 200){
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
const fail = (msg, status = 400) => json({ error: msg }, status);

/* 같은 곳에서 아이디 · 비밀번호를 마구 넣어 보는 것을 늦춘다. 워커 하나의 기억에만
   두는 가벼운 막이다 — KV 에 적으면 하루 쓰기 한도를 금방 쓴다. */
const tries = new Map();
function tooMany(ip){
  const now = Date.now(), t = tries.get(ip) || { n: 0, at: now };
  if (now - t.at > 10 * 60 * 1000){ t.n = 0; t.at = now; }
  t.n++;
  tries.set(ip, t);
  if (tries.size > 5000) tries.clear();
  return t.n > 30;
}

async function hashPw(pw, salt, iterations = ITER){
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}
function sameBytes(a, b){
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function hmac(secret, text){
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
async function makeToken(env, id){
  const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
  return `${id}.${exp}.${b64u(await hmac(env.SESSION_SECRET, `${id}.${exp}`))}`;
}
async function readToken(env, token){
  const [id, exp, sig] = String(token || '').split('.');
  if (!id || !exp || !sig || !ID_RE.test(id) || +exp < Date.now() / 1000) return null;
  let given;
  try { given = fromB64u(sig); } catch (_){ return null; }
  return sameBytes(given, await hmac(env.SESSION_SECRET, `${id}.${exp}`)) ? id : null;
}

/* 캐릭터 — 값만 담는다. 색 번호가 무슨 색인지는 화면 쪽(shared/js/character.js)이 안다. */
function cleanChar(c){
  if (!c || typeof c !== 'object') return null;
  const nick = String(c.nick || '').trim().slice(0, 12);
  if (!nick) return null;
  const n = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);
  return { nick, look: c.look === 'long' ? 'long' : 'short', hair: n(c.hair, 31), cloth: n(c.cloth, 31), skin: n(c.skin, 7) };
}
const publicUser = u => ({ id: u.id, char: u.char });

async function body(request){
  try { return await request.json(); } catch (_){ return {}; }
}

export async function handleApi(request, env){
  if (!env.ACCOUNTS || !env.SESSION_SECRET) return fail('계정 서버가 아직 준비되지 않았어요', 503);
  const path = new URL(request.url).pathname;
  const method = request.method;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (path === '/api/check' && method === 'POST'){
    const id = String((await body(request)).id || '').toLowerCase();
    if (!ID_RE.test(id)) return json({ ok: false, why: '영문 소문자 · 숫자 · _ 로 3~16자예요' });
    const taken = !!(await env.ACCOUNTS.get('user:' + id));
    return json(taken ? { ok: false, why: '이미 있는 아이디예요' } : { ok: true });
  }

  if (path === '/api/signup' && method === 'POST'){
    if (tooMany(ip)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const b = await body(request);
    const id = String(b.id || '').toLowerCase();
    const pw = String(b.pw || '');
    const char = cleanChar(b.char);
    if (!ID_RE.test(id)) return fail('아이디는 영문 소문자 · 숫자 · _ 로 3~16자예요');
    if (pw.length < 6 || pw.length > 64) return fail('비밀번호는 6~64자예요');
    if (!char) return fail('캐릭터 이름을 적어 주세요');
    if (await env.ACCOUNTS.get('user:' + id)) return fail('이미 있는 아이디예요', 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user = { id, salt: b64u(salt), hash: b64u(await hashPw(pw, salt)), iter: ITER, char, created: Date.now() };
    await env.ACCOUNTS.put('user:' + id, JSON.stringify(user));
    return json({ token: await makeToken(env, id), user: publicUser(user) }, 201);
  }

  if (path === '/api/login' && method === 'POST'){
    if (tooMany(ip)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const b = await body(request);
    const id = String(b.id || '').toLowerCase();
    const raw = ID_RE.test(id) && await env.ACCOUNTS.get('user:' + id);
    const user = raw ? JSON.parse(raw) : null;
    // 아이디가 없을 때도 같은 말을 한다 — 어느 아이디가 있는지 알려 주지 않는다
    if (!user || !sameBytes(fromB64u(user.hash), await hashPw(String(b.pw || ''), fromB64u(user.salt), user.iter || ITER)))
      return fail('아이디나 비밀번호가 맞지 않아요', 401);
    return json({ token: await makeToken(env, id), user: publicUser(user) });
  }

  if (path === '/api/me'){
    const id = await readToken(env, request.headers.get('X-Session'));
    if (!id) return fail('다시 로그인해 주세요', 401);
    const raw = await env.ACCOUNTS.get('user:' + id);
    if (!raw) return fail('계정을 찾을 수 없어요', 404);
    const user = JSON.parse(raw);
    if (method === 'GET') return json({ user: publicUser(user) });
    if (method === 'PUT'){
      const char = cleanChar((await body(request)).char);
      if (!char) return fail('캐릭터 이름을 적어 주세요');
      user.char = char;
      await env.ACCOUNTS.put('user:' + id, JSON.stringify(user));
      return json({ user: publicUser(user) });
    }
  }

  return fail('없는 길이에요', 404);
}
