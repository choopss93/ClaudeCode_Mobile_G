/*
 * 채널 — 한 정원에 함께 있는 사람들의 묶음.
 *
 * 누구나 들어오는 "열린 정원" 이 기본이고, 내 채널을 만들면 코드가 하나
 * 생긴다. 그 코드를 받은 사람이 같은 채널로 들어온다. 한 채널에는 서른
 * 명까지.
 *
 * 코드는 사람이 받아 적는 것이므로 반려동물 코드와 같은 32글자표를 쓴다 —
 * 헷갈리는 글자(I · L · O · U)를 뺐고, 잘못 적어도 바로잡아 읽는다.
 */

const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FIX = { O:'0', I:'1', L:'1', U:'V' };
const LEN = 6;

export const CAPACITY = 30;
export const PUBLIC = 'OPEN';
export const PUBLIC_LABEL = '열린 정원';

/** 새 채널 코드를 뽑는다. */
export function makeChannel(){
  let out = '';
  const r = new Uint8Array(LEN);
  (crypto && crypto.getRandomValues)
    ? crypto.getRandomValues(r)
    : r.forEach((_, i) => { r[i] = Math.floor(Math.random() * 256); });
  for (let i = 0; i < LEN; i++) out += CHARS[r[i] % CHARS.length];
  return out;
}

/** 적어 넣은 코드를 바로잡아 읽는다. 읽을 수 없으면 null. */
export function readChannel(text){
  if (!text) return null;
  let out = '';
  for (const raw of String(text).toUpperCase()){
    const ch = FIX[raw] || raw;
    if (CHARS.indexOf(ch) >= 0) out += ch;
  }
  if (out === PUBLIC) return PUBLIC;
  return out.length === LEN ? out : null;
}

/** 보기 좋게 끊어 적는다. */
export function showChannel(id){
  if (!id || id === PUBLIC) return PUBLIC_LABEL;
  return id.replace(/(.{3})(?=.)/g, '$1-');
}

/** 주소에 담긴 채널. 링크를 그대로 보내도 같은 채널로 들어온다. */
export function channelFromHash(){
  const m = /(?:^#|[#&])c=([0-9A-Za-z]+)/.exec(location.hash || '');
  return m ? readChannel(m[1]) : null;
}

/** 지금 채널을 주소에 적어 둔다. 링크 한 줄로 초대가 된다. */
export function writeChannelToHash(id){
  const keep = (location.hash || '').replace(/(^#|&)c=[0-9A-Za-z]*/g, '').replace(/^#&?/, '');
  const next = id && id !== PUBLIC ? 'c=' + id : '';
  const hash = [next, keep].filter(Boolean).join('&');
  try {
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  } catch (_){}
}

/** 초대 링크. */
export function inviteLink(id){
  return location.origin + location.pathname + (id && id !== PUBLIC ? '#c=' + id : '');
}
