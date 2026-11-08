import { KINDS, COATS, PARTS, PAINT_OLD, SPRAY_MAX, SPRAY_BITS,
         mixable, okPaint, fixPaint, fixSprays } from '#pets';

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
 * 섞은 아이(믹스견)와 직접 칠한 아이는 첫 바이트에 들어가지 않는다.
 * 그래서 **털빛 자리에 `EXT`(7) 를 세워** 두고 바이트를 더 붙인다.
 *
 *   둘째 바이트 — 칠했나(1비트) · 섞을 품종(4비트) · 진짜 털빛(3비트)
 *   칠했으면 뒤에 부위마다 4비트씩 (지금은 열두 자리라 6바이트)
 *
 * 칠할 자리가 여섯에서 열둘로 늘면서 **깃발을 하나 더 만들었다.** 털빛
 * 자리의 `EXT2`(6) 가 지금 판이고, `EXT1`(7) 은 여섯 자리이던 옛 판이다.
 * 옛 코드는 그대로 읽어 열두 자리로 펴 준다 (`fixPaint`). 같은 깃발에
 * 길이만 바꿨다면 옛 코드가 엉뚱한 아이가 됐을 것이다.
 *
 * **섞지 않았으면 섞을 품종 자리에 제 품종을 적는다.** 같은 품종끼리는
 * 섞이지 않으므로(`mixable`) "섞지 않음" 이라는 뜻이 된다. 따로 깃발을
 * 세울 자리가 없어서 그렇게 했다.
 *
 * 털빛은 다섯 가지뿐이라 7 은 쓰지 않던 값이고, 옛 판은 그 값을 "읽을 수
 * 없는 코드" 로 되돌린다. 엉뚱한 아이를 보여 주는 것보다 그 편이 낫다.
 * 새 판은 옛 코드도 그대로 읽는다.
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

/* 털빛 자리에 세우는 깃발. 이 값이면 뒤에 바이트가 더 있다.
   털빛은 다섯 가지뿐이라 5·6·7 은 쓰지 않던 값이다. */
const EXT1 = 7;              // 옛 판 — 칠이 여섯 자리
const EXT2 = 6;              // 칠이 PARTS.length 자리
const EXT3 = 5;              // 거기에 뿌린 자국까지
const PAINT_BYTES = Math.ceil(PARTS.length / 2);
const SPRAY_STEPS = (1 << SPRAY_BITS) - 1;

/* 자국 하나를 3바이트에 접는다 — 자리 6+6+6 · 색 4 · 크기 1 (한 비트 남음) */
function packSpray(s){
  const q = v => Math.round(Math.max(0, Math.min(1, v)) * SPRAY_STEPS);
  const v = (q(s.x) << 18) | (q(s.y) << 12) | (q(s.z) << 6) |
            ((s.ci & 15) << 2) | ((s.big ? 1 : 0) << 1);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function unpackSpray(a, b, c){
  const v = (a << 16) | (b << 8) | c;
  return { x: ((v >> 18) & 63) / SPRAY_STEPS,
           y: ((v >> 12) & 63) / SPRAY_STEPS,
           z: ((v >> 6) & 63) / SPRAY_STEPS,
           ci: (v >> 2) & 15,
           big: (v >> 1) & 1 };
}

/** 고른 반려동물을 코드로 접는다. */
export function makeCode({ kind, breed, mix, coat, paint, sprays, name }){
  const kindBit = kind === 'cat' ? 1 : 0;
  const breedNo = Math.max(0, Math.min(15, breed | 0));
  const coatNo = Math.max(0, COATS.findIndex(c => c.key === coat));
  const mixed = mixable(kind === 'cat' ? 'cat' : 'dog', breedNo, mix);
  // 옛 여섯 자리로 들어와도 펴서 담는다 — 그냥 버리면 칠이 사라진다
  const fixed = fixPaint(paint);
  const painted = okPaint(fixed);
  const dots = (fixSprays(sprays) || []).slice(0, SPRAY_MAX);
  const ext = mixed || painted || dots.length;
  const slot = dots.length ? EXT3 : EXT2;
  const head = (kindBit << 7) | (breedNo << 3) | (ext ? slot : coatNo);

  const nameBytes = new TextEncoder().encode((name || '').slice(0, 12));
  let at = ext ? 2 : 1;
  if (ext && painted) at += PAINT_BYTES;
  if (dots.length) at += 1 + dots.length * 3;

  const bytes = new Uint8Array(at + nameBytes.length);
  bytes[0] = head;
  if (ext){
    // 섞지 않았으면 제 품종을 적어 "섞지 않음" 을 뜻하게 한다
    bytes[1] = (painted ? 128 : 0) |
               (((mixed ? mix : breedNo) & 15) << 3) | coatNo;
    let i = 2;
    if (painted){
      for (let k = 0; k < PAINT_BYTES; k++){
        bytes[i++] = ((fixed[k * 2] & 15) << 4) | ((fixed[k * 2 + 1] ?? 0) & 15);
      }
    }
    if (dots.length){
      // 윗 네 비트는 나중에 쓸 자리로 비워 둔다
      bytes[i++] = dots.length & 15;
      for (const s of dots){
        const [a, b, c] = packSpray(s);
        bytes[i++] = a; bytes[i++] = b; bytes[i++] = c;
      }
    }
  }
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

  let at = 1, mix = null, coatNo = slot, paint = null, sprays = null;
  if (slot === EXT1 || slot === EXT2 || slot === EXT3){
    if (bytes.length < 2) return null;
    const b1 = bytes[1];
    const m = (b1 >> 3) & 15;
    mix = mixable(kind, breed, m) ? m : null;   // 제 품종이면 섞지 않은 것
    coatNo = b1 & 7;
    at = 2;
    if (b1 & 128){
      // 옛 판(EXT1)은 여섯 자리라 3바이트였다
      const n = slot === EXT1 ? Math.ceil(PAINT_OLD / 2) : PAINT_BYTES;
      const many = slot === EXT1 ? PAINT_OLD : PARTS.length;
      if (bytes.length < 2 + n) return null;
      const raw = [];
      for (let i = 0; i < n; i++){
        raw.push((bytes[2 + i] >> 4) & 15, bytes[2 + i] & 15);
      }
      paint = fixPaint(raw.slice(0, many));     // 옛 자리면 여기서 펴진다
      if (!paint) return null;
      at = 2 + n;
    }
    if (slot === EXT3){
      if (bytes.length < at + 1) return null;
      const many = bytes[at] & 15;
      at += 1;
      if (bytes.length < at + many * 3) return null;
      const out = [];
      for (let i = 0; i < many; i++){
        out.push(unpackSpray(bytes[at], bytes[at + 1], bytes[at + 2]));
        at += 3;
      }
      sprays = fixSprays(out);
    }
  }

  if (breed >= KINDS[kind].breeds.length) return null;
  if (coatNo >= COATS.length) return null;

  let name = '';
  try { name = new TextDecoder().decode(bytes.slice(at)).trim(); } catch (_){}
  if (!name) return null;

  return { kind, breed, mix, coat: COATS[coatNo].key, paint, sprays, name };
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
    const key = pet.kind + pet.breed + '/' + pet.mix + pet.coat +
                (pet.paint || []).join('') +
                (pet.sprays || []).map(s => [s.x, s.y, s.z, s.ci, s.big].join()).join(';') +
                pet.name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pet);
  }
  return out;
}
