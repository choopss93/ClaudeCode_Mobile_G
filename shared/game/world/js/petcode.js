import { KINDS, COATS, mixable } from '#pets';

/*
 * 반려동물 고유 코드.
 *
 * 서버가 없으므로 코드가 반려동물을 "가리키는" 것이 아니라 그 자체를
 * "담고" 있어야 한다. 종·품종·털빛·이름을 한 줄로 접어 넣는다. 그래서
 * 코드를 받은 사람은 아무 데도 묻지 않고 같은 아이를 그대로 볼 수 있다.
 *
 * 접는 법 — 첫 바이트에 종(1비트) · 품종(4비트) · 털빛(3비트) 을 욱여넣고,
 * 뒤에 이름을 UTF-8 로 붙인 다음 통째로 32글자표로 바꾼다. 네 글자씩
 * 끊어 적어 눈으로 읽기 쉽게 한다.
 *
 * 섞은 아이(믹스견)는 품종이 둘이라 첫 바이트에 들어가지 않는다. 그래서
 * **털빛 자리에 `EXT`(7) 를 세워** 두고 바이트를 하나 더 붙인다 —
 * 섞을 품종(4비트) · 진짜 털빛(3비트). 털빛은 다섯 가지뿐이라 7 은 쓰지
 * 않던 값이고, 옛 판은 그 값을 "읽을 수 없는 코드" 로 되돌린다. 엉뚱한
 * 아이를 보여 주는 것보다 그 편이 낫다. 새 판은 옛 코드도 그대로 읽는다.
 */

// 사람이 받아 적을 코드다. 헷갈리는 글자(I · L · O · U)를 뺀 32글자만 쓴다.
// 구분자로 쓸 '-' 가 글자표에 들어 있으면 읽을 때 데이터가 잘려 나간다.
const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FIX = { O:'0', I:'1', L:'1', U:'V' };   // 흔한 오독을 바로잡아 준다

function toCode(bytes){
  let out = '', acc = 0, bits = 0;
  for (const b of bytes){
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5){
      bits -= 5;
      out += CHARS[(acc >> bits) & 31];
    }
  }
  if (bits > 0) out += CHARS[(acc << (5 - bits)) & 31];
  return out;
}

function fromCode(text){
  const out = [];
  let acc = 0, bits = 0;
  for (const raw of text.toUpperCase()){
    const ch = FIX[raw] || raw;
    const v = CHARS.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 5) | v;
    bits += 5;
    if (bits >= 8){
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return new Uint8Array(out);
}

// 털빛 자리에 세우는 깃발. 이 값이면 뒤에 바이트가 하나 더 있다.
const EXT = 7;

/** 고른 반려동물을 코드로 접는다. */
export function makeCode({ kind, breed, mix, coat, name }){
  const kindBit = kind === 'cat' ? 1 : 0;
  const breedNo = Math.max(0, Math.min(15, breed | 0));
  const coatNo = Math.max(0, COATS.findIndex(c => c.key === coat));
  const mixed = mixable(kind === 'cat' ? 'cat' : 'dog', breedNo, mix);
  const head = (kindBit << 7) | (breedNo << 3) | (mixed ? EXT : coatNo);

  const nameBytes = new TextEncoder().encode((name || '').slice(0, 12));
  const at = mixed ? 2 : 1;
  const bytes = new Uint8Array(at + nameBytes.length);
  bytes[0] = head;
  if (mixed) bytes[1] = ((mix & 15) << 3) | coatNo;
  bytes.set(nameBytes, at);

  // 네 글자씩 끊어 적어 눈으로 읽고 옮기기 쉽게
  return toCode(bytes).replace(/(.{4})(?=.)/g, '$1-');
}

/** 코드를 펼친다. 읽을 수 없으면 null. */
export function readCode(code){
  if (typeof code !== 'string') return null;
  const clean = code.trim().replace(/-/g, '');
  if (clean.length < 2) return null;

  const bytes = fromCode(clean);
  if (!bytes.length) return null;

  const head = bytes[0];
  const kind = (head >> 7) & 1 ? 'cat' : 'dog';
  const breed = (head >> 3) & 15;
  const slot = head & 7;

  let at = 1, mix = null, coatNo = slot;
  if (slot === EXT){
    if (bytes.length < 2) return null;
    mix = (bytes[1] >> 3) & 15;
    coatNo = bytes[1] & 7;
    at = 2;
  }

  if (breed >= KINDS[kind].breeds.length) return null;
  if (coatNo >= COATS.length) return null;
  if (mix !== null && !mixable(kind, breed, mix)) return null;

  let name = '';
  try { name = new TextDecoder().decode(bytes.slice(at)).trim(); } catch (_){}
  if (!name) return null;

  return { kind, breed, mix, coat: COATS[coatNo].key, name };
}

/** 한 줄에 여러 코드가 적혀 있어도 모두 읽어 낸다. */
export function readCodes(text){
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const piece of String(text).split(/[\s,]+/)){
    if (!piece) continue;
    const pet = readCode(piece);
    if (!pet) continue;
    const key = pet.kind + pet.breed + '/' + pet.mix + pet.coat + pet.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pet);
  }
  return out;
}
