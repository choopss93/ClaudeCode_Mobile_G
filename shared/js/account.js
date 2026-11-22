/*
 * 계정 도우미 — 이 기기에 로그인 표를 두고, 서버(/api/…)와 이야기한다.
 *
 * 이 기기에 남는 것은 로그인 표(token)와 내 캐릭터의 사본뿐이다. 비밀번호는
 * 남기지 않는다. 같은 사이트(주소)의 페이지끼리는 이 저장을 함께 본다 —
 * 그래서 게임들이 따로 묻지 않고 내 캐릭터를 꺼내 쓴다.
 */

const KEY = 'metaversal';
const API = '/api/';

export function readAccount(){
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || 'null');
    return a && a.token && a.user ? a : null;
  } catch (_){ return null; }
}
function keep(a){
  try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY); } catch (_){}
  return a;
}
export const logout = () => keep(null);

async function call(path, { method = 'POST', body, token } = {}){
  let res, data = {};
  try {
    res = await fetch(API + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Session': token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    data = await res.json().catch(() => ({}));
  } catch (_){
    throw new Error('서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || '잠시 뒤에 다시 해 주세요'), { status: res.status });
  return data;
}

export const checkId = id => call('check', { body: { id } });
export async function signup(id, pw){ const d = await call('signup', { body: { id, pw } }); return keep({ token: d.token, user: d.user }); }
export async function login(id, pw){ const d = await call('login', { body: { id, pw } }); return keep({ token: d.token, user: d.user }); }

/** 서버에서 내 계정을 다시 받아 사본을 고친다. 표가 낡았으면 로그아웃한다. */
export async function refresh(){
  const a = readAccount();
  if (!a) return null;
  try {
    const d = await call('me', { method: 'GET', token: a.token });
    return keep({ token: a.token, user: d.user });
  } catch (e){
    if (e.status === 401 || e.status === 404) return keep(null);
    return a;                     // 잠깐 끊긴 것이면 사본으로 버틴다
  }
}
export async function saveChar(char){
  const a = readAccount();
  if (!a) throw new Error('다시 로그인해 주세요');
  const d = await call('me', { method: 'PUT', token: a.token, body: { char } });
  return keep({ token: a.token, user: d.user });
}
