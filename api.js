/*
 * 계정 — Metaversal Studio 의 아이디 · 비밀번호 · 캐릭터.
 *
 * 개인정보는 받지 않는다. 아이디와 비밀번호, 그리고 꾸민 캐릭터뿐이다.
 * 계정은 Cloudflare KV(`ACCOUNTS`)에 둔다 — 밖에서 보이지 않고 어느 기기에서나
 * 같은 계정으로 들어온다. Git 저장소에는 두지 않는다 (저장소가 공개라 다 보인다).
 *
 *   POST /api/check   {id}            쓸 수 있는 아이디인가
 *   POST /api/signup  {id, pw}        만들기 → {token, user}  (캐릭터는 나중에 PUT /api/me)
 *   POST /api/login   {id, pw}        들어가기 → {token, user}
 *   GET  /api/me                       내 계정 (X-Session 머리글에 token)
 *   PUT  /api/me      {char}          캐릭터 고치기
 *   POST /api/logout-all               계정열쇠를 바꿔 모든 기기의 로그인을 끊는다
 *   POST /api/recover {id, code, pw}  복구 코드로 비밀번호 새로 정하기 → {token, user, recovery}
 *   POST /api/recovery-new              복구 코드 새로 만들기 (예전 코드는 못 쓴다) → {recovery}
 *
 * 복구 코드 — 이메일 없이 비밀번호를 되찾는 길. 가입할 때 한 번만 보여 주는
 * 16자리(약 78비트)이고, 서버에는 해시로만 둔다. 한 번 쓰면 새 코드로 바뀐다.
 *
 * 비밀번호는 소금을 친 PBKDF2-SHA256 해시로만 둔다. 원래 글자는 어디에도
 * 남지 않는다 — 잊으면 되찾을 수 없다.
 *
 * 로그인 표(token)는 KV 에 적지 않고 서명으로 만든다. 무료 KV 는 하루 쓰기가
 * 1000번이라, 들어올 때마다 적으면 금방 찬다.
 *   표 = `아이디.만료.일련번호.서명`
 *   서명 = HMAC-SHA256(SESSION_SECRET, `아이디.만료.일련번호.계정열쇠`)
 * - **계정열쇠(user.key)** 는 가입할 때 만드는 그 계정만의 256비트 무작위 값이다.
 *   서버(KV)에만 있고 밖으로 내보내지 않는다. 표가 이 열쇠와 맞아야만 통과하므로,
 *   열쇠를 바꾸면(`POST /api/logout-all`) 그 계정의 모든 표가 한꺼번에 무효가 된다.
 *   사이트 공용 비밀(SESSION_SECRET)이 새어도 계정열쇠 없이는 표를 지을 수 없다.
 * - 일련번호는 표마다 새로 뽑는 128비트 무작위 값이다.
 *
 * 머리글은 `Authorization` 이 아니라 `X-Session` 을 쓴다. 잠긴 페이지의
 * 비밀번호(Basic 인증)가 `Authorization` 을 쓰기 때문이다.
 */

/* 아이디는 **대문자**로 받고 적고 쓴다 (사용자 요청). 무엇을 쳐 와도 대문자로 펴서 본다.
   대문자로 바꾸기 전에 만든 계정은 소문자 열쇠(`user:choo`)에 있다 — getUser 가 찾아
   대문자 자리로 옮겨 준다. 그래서 중복 확인도 두 자리를 다 본다. */
const ID_RE = /^[A-Z0-9_]{3,16}$/;
const normId = v => String(v || '').trim().toUpperCase();
const ID_WHY = '아이디는 영문 대문자 · 숫자 · _ 로 3~16자예요';
const ITER = 10000;   // 무료 Worker 는 요청마다 CPU 10ms 까지다. 계정마다 횟수를 적어 두어
                      // 나중에 올려도 옛 계정이 그대로 들어온다 (user.iter).
const TOKEN_DAYS = 30;
const enc = new TextEncoder();

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

function json(data, status = 200){
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
               'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
  });
}
const fail = (msg, status = 400) => json({ error: msg }, status);

/* 같은 곳에서 아이디 · 비밀번호를 마구 넣어 보는 것을 늦춘다. 워커 하나의 기억에만
   두는 가벼운 막이다 — KV 에 적으면 하루 쓰기 한도를 금방 쓴다. */
const tries = new Map();
function tooMany(key, limit = 30){
  const now = Date.now(), t = tries.get(key) || { n: 0, at: now };
  if (now - t.at > 10 * 60 * 1000){ t.n = 0; t.at = now; }
  t.n++;
  tries.set(key, t);
  if (tries.size > 5000) tries.clear();
  return t.n > limit;
}
const newKey = () => b64u(crypto.getRandomValues(new Uint8Array(32)));   // 계정열쇠 256비트

/* 복구 코드 — 사람이 받아 적으므로 헷갈리는 글자(0 · 1 · I · L · O · U)를 뺀다 */
const REC_CHARS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
function newRecovery(){
  const r = crypto.getRandomValues(new Uint8Array(16));
  let out = '';
  for (let i = 0; i < 16; i++){ out += REC_CHARS[r[i] % REC_CHARS.length]; if (i % 4 === 3 && i < 15) out += '-'; }
  return out;
}
const cleanRecovery = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
async function recHash(id, code){
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(`rec:${id}:${cleanRecovery(code)}`)));
}
/* 복구 코드는 만들 때의 아이디로 해시해 둔다 (user.recId). 아이디를 바꾸거나 대문자로
   옮겨도 이미 받아 둔 코드가 그대로 맞는다. */
async function setRecovery(user){
  const recovery = newRecovery();
  user.recId = user.id;
  user.rec = await recHash(user.id, recovery);
  return recovery;
}
async function recOk(user, code){
  return !!user.rec && sameBytes(fromB64u(user.rec), fromB64u(await recHash(user.recId || user.id, code)));
}

/** 계정 읽기 — 대문자 자리에 없으면 옛 소문자 자리를 찾아 대문자로 옮긴다. */
async function getUser(env, id){
  if (!ID_RE.test(id)) return null;
  const raw = await env.ACCOUNTS.get('user:' + id);
  if (raw) return JSON.parse(raw);
  const low = id.toLowerCase();
  if (low === id) return null;
  const old = await env.ACCOUNTS.get('user:' + low);
  if (!old) return null;
  const user = JSON.parse(old);
  user.recId = user.recId || user.id;          // 옛 복구 코드는 소문자 아이디로 해시돼 있다
  user.id = id;
  await env.ACCOUNTS.put('user:' + id, JSON.stringify(user));
  await env.ACCOUNTS.delete('user:' + low);
  return user;
}
const saveUser = (env, user) => env.ACCOUNTS.put('user:' + user.id, JSON.stringify(user));

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
async function makeToken(env, user){
  const exp = Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400;
  const nonce = b64u(crypto.getRandomValues(new Uint8Array(16)));
  const body = `${user.id}.${exp}.${nonce}`;
  return `${body}.${b64u(await hmac(env.SESSION_SECRET, `${body}.${user.key}`))}`;
}
/** 표를 읽어 그 계정을 돌려준다. 만료 · 서명 · 계정열쇠가 하나라도 안 맞으면 null. */
async function readToken(env, token){
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [id, exp, nonce, sig] = parts;
  if (!ID_RE.test(id) || !/^\d+$/.test(exp) || +exp < Date.now() / 1000 || nonce.length < 20) return null;
  const user = await getUser(env, id);
  if (!user || !user.key || user.id !== id) return null;
  let given;
  try { given = fromB64u(sig); } catch (_){ return null; }
  return sameBytes(given, await hmac(env.SESSION_SECRET, `${id}.${exp}.${nonce}.${user.key}`)) ? user : null;
}

/* 캐릭터 — 번호만 담는다. 번호가 무엇인지는 화면 쪽(shared/js/character.js)이 안다.
   {nick, gender:'m'|'f', face, expr, hair, top, bottom, skin} — 예전 판(look · cloth)으로
   온 것도 받아서 새 판으로 고쳐 둔다. */
function cleanChar(c){
  if (!c || typeof c !== 'object') return null;
  const nick = String(c.nick || '').trim().slice(0, 12);
  if (!nick) return null;
  const n = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);
  const gender = c.gender === 'f' || c.gender === 'm' ? c.gender : (c.look === 'long' ? 'f' : 'm');
  return { nick, gender, face: n(c.face, 31), expr: n(c.expr, 31), hair: n(c.hair, 31),
           top: n(Number.isInteger(c.top) ? c.top : c.cloth, 31), bottom: n(c.bottom, 31), skin: n(c.skin, 7) };
}
const publicUser = u => ({ id: u.id, char: u.char || null });   // 열쇠 · 해시는 절대 내보내지 않는다

async function body(request){
  try { return await request.json(); } catch (_){ return {}; }
}

export async function handleApi(request, env){
  /* 서버 시각 — Metaversal Studio 의 모든 화면이 이 시계 하나를 쓴다 (shared/js/clock.js).
     폰마다 시계가 달라도 모두 같은 시간대(밤낮)와 같은 순서를 보게 하려는 것이다.
     계정 저장소가 없어도 답한다. */
  if (new URL(request.url).pathname === '/api/time') return json({ now: Date.now() });
  if (!env.ACCOUNTS || !env.SESSION_SECRET) return fail('계정 서버가 아직 준비되지 않았어요', 503);
  const path = new URL(request.url).pathname;
  const method = request.method;
  const ip = request.headers.get('CF-Connecting-IP') || 'local';

  if (path === '/api/check' && method === 'POST'){
    if (tooMany(ip, 120)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const id = normId((await body(request)).id);
    if (!ID_RE.test(id)) return json({ ok: false, id, why: ID_WHY });
    const taken = !!(await getUser(env, id));
    return json(taken ? { ok: false, id, why: '이미 있는 아이디예요' } : { ok: true, id });
  }

  if (path === '/api/signup' && method === 'POST'){
    if (tooMany(ip)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const b = await body(request);
    const id = normId(b.id);
    const pw = String(b.pw || '');
    const char = cleanChar(b.char);
    if (!ID_RE.test(id)) return fail(ID_WHY);
    if (pw.length < 6 || pw.length > 64) return fail('비밀번호는 6~64자예요');
    // 캐릭터는 가입 때 만들지 않는다 — 무지개 정원에 처음 들어가기 직전에 만든다 (char: null)
    if (await getUser(env, id)) return fail('이미 있는 아이디예요', 409);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const user = { id, salt: b64u(salt), hash: b64u(await hashPw(pw, salt)), iter: ITER,
                   key: newKey(), char, created: Date.now() };
    const recovery = await setRecovery(user);
    await saveUser(env, user);
    // 복구 코드는 이때 한 번만 내보낸다 — 서버에는 해시만 남는다
    return json({ token: await makeToken(env, user), user: publicUser(user), recovery }, 201);
  }

  if (path === '/api/login' && method === 'POST'){
    if (tooMany(ip)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const b = await body(request);
    const id = normId(b.id);
    // 한 아이디에 비밀번호를 마구 넣어 보는 것도 막는다 (어디서 오든)
    if (tooMany('id:' + id, 10)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const user = await getUser(env, id);
    // 아이디가 없을 때도 같은 말을 한다 — 어느 아이디가 있는지 알려 주지 않는다
    if (!user || !sameBytes(fromB64u(user.hash), await hashPw(String(b.pw || ''), fromB64u(user.salt), user.iter || ITER)))
      return fail('아이디나 비밀번호가 맞지 않아요', 401);
    if (!user.key){                       // 계정열쇠가 생기기 전에 만든 계정 — 지금 만들어 준다
      user.key = newKey();
      await saveUser(env, user);
    }
    return json({ token: await makeToken(env, user), user: publicUser(user) });
  }

  if (path === '/api/recover' && method === 'POST'){
    if (tooMany(ip)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const b = await body(request);
    const id = normId(b.id);
    if (tooMany('rec:' + id, 5)) return fail('잠시 뒤에 다시 해 주세요', 429);
    const pw = String(b.pw || '');
    if (pw.length < 6 || pw.length > 64) return fail('새 비밀번호는 6~64자예요');
    const user = await getUser(env, id);
    if (!user || !(await recOk(user, b.code)))
      return fail('아이디나 복구 코드가 맞지 않아요', 401);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    Object.assign(user, { salt: b64u(salt), hash: b64u(await hashPw(pw, salt)), iter: ITER,
                          key: newKey() });                     // 열쇠도 바꿔 다른 기기는 끊는다
    const recovery = await setRecovery(user);  // 쓴 코드는 버리고 새 코드를 준다
    await saveUser(env, user);
    return json({ token: await makeToken(env, user), user: publicUser(user), recovery });
  }

  if (path === '/api/me' || path === '/api/logout-all' || path === '/api/recovery-new' || path === '/api/rename'){
    const user = await readToken(env, request.headers.get('X-Session'));
    if (!user) return fail('다시 로그인해 주세요', 401);
    if (path === '/api/logout-all' && method === 'POST'){
      user.key = newKey();                 // 열쇠를 바꾸면 그 계정의 모든 표가 무효
      await saveUser(env, user);
      return json({ ok: true });
    }
    if (path === '/api/recovery-new' && method === 'POST'){
      const recovery = await setRecovery(user);
      await saveUser(env, user);
      return json({ recovery });
    }
    /* 아이디 바꾸기 — 지금 비밀번호를 한 번 더 받는다. 새 아이디가 비어 있어야 하고,
       옮긴 뒤 옛 자리는 지운다. 표에 아이디가 들어 있으므로 새 표를 주고, 다른 기기의
       옛 표는 더는 맞지 않아 다시 로그인하게 된다. 복구 코드는 그대로 쓴다 (recId). */
    if (path === '/api/rename' && method === 'POST'){
      if (tooMany(ip) || tooMany('rn:' + user.id, 10)) return fail('잠시 뒤에 다시 해 주세요', 429);
      const b = await body(request);
      const id = normId(b.id);
      if (!ID_RE.test(id)) return fail(ID_WHY);
      if (!sameBytes(fromB64u(user.hash), await hashPw(String(b.pw || ''), fromB64u(user.salt), user.iter || ITER)))
        return fail('비밀번호가 맞지 않아요', 401);
      if (id === user.id) return fail('지금 쓰는 아이디예요');
      if (await getUser(env, id)) return fail('이미 있는 아이디예요', 409);
      const oldId = user.id;
      user.recId = user.recId || oldId;
      user.id = id;
      user.key = newKey();
      await saveUser(env, user);
      await env.ACCOUNTS.delete('user:' + oldId);
      return json({ token: await makeToken(env, user), user: publicUser(user) });
    }
    const id = user.id;
    if (method === 'GET') return json({ user: publicUser(user) });
    if (method === 'PUT'){
      const char = cleanChar((await body(request)).char);
      if (!char) return fail('캐릭터 이름을 적어 주세요');
      user.char = char;
      await saveUser(env, user);
      return json({ user: publicUser(user) });
    }
  }

  return fail('없는 길이에요', 404);
}
