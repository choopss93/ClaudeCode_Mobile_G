/*
 * 반려동물 자료.
 *
 * 품종마다 몸집·다리 길이·주둥이·귀·꼬리·털북숭이 정도를 수치로 적어 둔다.
 * actor.js 가 이 수치로 모양을 지어내므로, 품종을 더하려면 여기 한 줄만
 * 보태면 된다.
 *
 *   scale  전체 크기
 *   body   [길이, 너비]
 *   legs   다리 길이
 *   head   머리 크기
 *   muzzle 주둥이 길이
 *   ear    drop 처진귀 · prick 선귀 · fold 접힌귀 · tuft 술귀
 *   earSize 귀 크기
 *   tail   curl 말린꼬리 · plume 풍성한꼬리 · long 긴꼬리 · stub 짧은꼬리
 *   fluff  털북숭이 정도 (1.15 를 넘으면 덤불털이 붙는다)
 *
 * 품종을 더할 때는 **반드시 목록 끝에 붙인다.** 자리 번호가 반려동물 코드에
 * 그대로 박히므로, 가운데 끼우면 이미 나간 코드가 다른 품종을 가리키게 된다.
 * 한 종류당 16종까지 담을 수 있다 (코드에서 품종에 4비트를 쓴다).
 */

const DOGS = [
  { name:'말티즈',      scale:0.82, body:[0.95,0.95], legs:0.80, head:1.08, muzzle:0.62, ear:'drop',  earSize:1.05, tail:'plume', fluff:1.28 },
  { name:'푸들',        scale:0.92, body:[0.98,0.95], legs:1.05, head:1.02, muzzle:0.82, ear:'drop',  earSize:1.10, tail:'plume', fluff:1.30 },
  { name:'포메라니안',  scale:0.78, body:[0.92,1.00], legs:0.78, head:1.10, muzzle:0.58, ear:'prick', earSize:0.85, tail:'plume', fluff:1.35 },
  { name:'시바견',      scale:1.00, body:[1.00,1.00], legs:1.00, head:1.00, muzzle:0.92, ear:'prick', earSize:1.00, tail:'curl',  fluff:1.08 },
  { name:'웰시코기',    scale:0.92, body:[1.22,1.02], legs:0.52, head:1.04, muzzle:0.85, ear:'prick', earSize:1.18, tail:'stub',  fluff:1.10 },
  { name:'비글',        scale:0.96, body:[1.06,0.98], legs:0.92, head:0.98, muzzle:0.95, ear:'drop',  earSize:1.25, tail:'long',  fluff:1.00 },
  { name:'닥스훈트',    scale:0.88, body:[1.38,0.86], legs:0.48, head:0.94, muzzle:1.15, ear:'drop',  earSize:1.15, tail:'long',  fluff:1.00 },
  { name:'골든리트리버',scale:1.22, body:[1.10,1.06], legs:1.10, head:1.02, muzzle:1.05, ear:'drop',  earSize:1.05, tail:'plume', fluff:1.14 },
  { name:'치와와',      scale:0.72, body:[0.90,0.90], legs:0.82, head:1.14, muzzle:0.55, ear:'prick', earSize:1.30, tail:'long',  fluff:0.96 },
  { name:'시츄',        scale:0.84, body:[0.98,1.00], legs:0.70, head:1.08, muzzle:0.52, ear:'drop',  earSize:1.12, tail:'plume', fluff:1.26 },
  { name:'비숑',        scale:0.84, body:[0.96,1.02], legs:0.84, head:1.10, muzzle:0.58, ear:'drop',  earSize:0.95, tail:'plume', fluff:1.36 }
];

const CATS = [
  { name:'코리안숏헤어',  scale:0.94, body:[1.08,0.88], legs:1.02, head:0.96, muzzle:0.58, ear:'prick', earSize:1.05, tail:'long',  fluff:1.00 },
  { name:'러시안블루',    scale:0.94, body:[1.12,0.84], legs:1.10, head:0.92, muzzle:0.56, ear:'prick', earSize:1.12, tail:'long',  fluff:0.98 },
  { name:'페르시안',      scale:0.92, body:[1.00,1.00], legs:0.82, head:1.10, muzzle:0.40, ear:'fold',  earSize:0.82, tail:'plume', fluff:1.34 },
  { name:'샴',            scale:0.92, body:[1.14,0.82], legs:1.12, head:0.92, muzzle:0.72, ear:'prick', earSize:1.28, tail:'long',  fluff:0.96 },
  { name:'먼치킨',        scale:0.82, body:[1.04,0.92], legs:0.46, head:1.04, muzzle:0.54, ear:'prick', earSize:1.02, tail:'long',  fluff:1.08 },
  { name:'스코티시폴드',  scale:0.90, body:[1.02,0.94], legs:0.92, head:1.08, muzzle:0.52, ear:'fold',  earSize:0.78, tail:'long',  fluff:1.10 },
  { name:'벵갈',          scale:1.02, body:[1.14,0.90], legs:1.08, head:0.96, muzzle:0.66, ear:'prick', earSize:0.98, tail:'long',  fluff:0.98 },
  { name:'메인쿤',        scale:1.20, body:[1.16,1.00], legs:1.04, head:1.02, muzzle:0.70, ear:'tuft',  earSize:1.15, tail:'plume', fluff:1.30 },
  { name:'아메리칸숏헤어',scale:0.96, body:[1.06,0.94], legs:0.98, head:1.00, muzzle:0.60, ear:'prick', earSize:1.02, tail:'long',  fluff:1.02 },
  { name:'노르웨이숲',    scale:1.14, body:[1.12,0.98], legs:1.06, head:1.00, muzzle:0.66, ear:'tuft',  earSize:1.10, tail:'plume', fluff:1.32 }
];

export const KINDS = {
  dog: { label: '강아지', breeds: DOGS },
  cat: { label: '고양이', breeds: CATS }
};

// 밀키하게. 블랙도 새까맣지 않고 부드러운 숯빛이다.
export const COATS = [
  { key:'white',  label:'화이트',     base:0xFFF6EC, accent:null },
  { key:'black',  label:'블랙',       base:0x5E5866, accent:null },
  { key:'brown',  label:'브라운',     base:0xC0906A, accent:null },
  { key:'tuxedo', label:'화이트블랙', base:0xFFF6EC, accent:0x5E5866 },
  { key:'random', label:'랜덤',       random:true }
];

/* ── 직접 칠하기 ──
   모델을 돌려 가며 부위마다 색을 찍을 수 있다. 색은 **열여섯 가지**로
   묶어 둔다 — 자유로운 색을 쓰면 반려동물 코드에 담을 수가 없다.
   한 부위에 4비트씩, 여섯 부위를 3바이트에 접어 넣는다.
   밀키하게: 흰빛이 섞인 부드러운 색이고 쨍한 원색이 아니다. */
export const PAINTS = [
  { label: '크림',     hex: 0xFFF6EC },
  { label: '우유',     hex: 0xF7E7D4 },
  { label: '살구',     hex: 0xF6CBA6 },
  { label: '카라멜',   hex: 0xDCA771 },
  { label: '밤색',     hex: 0xB5825A },
  { label: '초코',     hex: 0x8C6049 },
  { label: '모래',     hex: 0xE3CFA6 },
  { label: '꿀',       hex: 0xF0BE72 },
  { label: '잿빛',     hex: 0xBFB8C2 },
  { label: '숯',       hex: 0x6E6775 },
  { label: '먹',       hex: 0x4A4350 },
  { label: '하늘',     hex: 0xA9D4EC },
  { label: '라벤더',   hex: 0xC9BCE8 },
  { label: '복숭아',   hex: 0xF7BCC4 },
  { label: '민트',     hex: 0xAEE0CB },
  { label: '레몬',     hex: 0xF6E9A8 }
];

/* 칠할 수 있는 자리. 번호가 코드에 그대로 박히므로 **끝에만** 붙인다.
   앞의 여섯은 처음부터 있던 자리라 번호를 그대로 두었다 — 자리 3 은
   이름만 "다리" 에서 "앞다리" 로 바뀌었다. */
export const PARTS = [
  { key: 'body',   label: '몸' },
  { key: 'head',   label: '머리' },
  { key: 'ear',    label: '귀' },
  { key: 'leg',    label: '앞다리' },
  { key: 'tail',   label: '꼬리' },
  { key: 'muzzle', label: '주둥이' },
  // ── 여기서부터 나중에 쪼갠 자리 ──
  { key: 'hind',   label: '뒷다리' },
  { key: 'back',   label: '등' },
  { key: 'belly',  label: '배' },
  { key: 'chest',  label: '가슴' },
  { key: 'paw',    label: '발' },
  { key: 'patch',  label: '눈 둘레' }
];

/* 처음에는 여섯 자리뿐이었다. 그때 나간 코드와 그때 저장한 아이를
   그대로 읽으려고, 옛 여섯 자리를 새 열두 자리로 펴는 길을 남겨 둔다. */
const OLD_PARTS = 6;
const GROWN = [3, 0, 0, 0, 3, 1];   // 뒷다리←앞다리 · 등배가슴←몸 · 발←앞다리 · 눈둘레←머리

/** 고른 털빛을 여섯 자리 칠로 펼친다. 편집기를 처음 열 때 쓴다. */
export function paintFromCoat(coatKey){
  const c = COATS.find(x => x.key === coatKey && !x.random) || COATS[0];
  const near = hex => {
    let best = 0, bd = Infinity;
    PAINTS.forEach((p, i) => {
      const d = Math.abs(((p.hex >> 16) & 255) - ((hex >> 16) & 255)) +
                Math.abs(((p.hex >> 8) & 255) - ((hex >> 8) & 255)) +
                Math.abs((p.hex & 255) - (hex & 255));
      if (d < bd){ bd = d; best = i; }
    });
    return best;
  };
  const base = near(c.base);
  const acc = c.accent ? near(c.accent) : base;
  //      몸    머리  귀   앞다리 꼬리 주둥이 뒷다리 등   배   가슴 발   눈둘레
  return [base, base, acc, base, acc, base, base, base, base, base, base, base];
}

/** 칠이 쓸 만한가 — 열두 자리, 모두 색 번호. 내보낼 때 쓴다. */
export function okPaint(paint){
  return Array.isArray(paint) && paint.length === PARTS.length &&
         paint.every(v => Number.isInteger(v) && v >= 0 && v < PAINTS.length);
}

/* 받아 온 칠을 지금 쓰는 모양으로 바로잡는다. 옛 여섯 자리면 펴 준다.
   **밖에서 들어오는 칠은 모두 여기를 거치게 할 것** — 코드 · 인사 ·
   이 기기에 저장해 둔 아이 모두. 안 거치면 옛 아이가 통째로 칠을 잃는다. */
export function fixPaint(paint){
  if (!Array.isArray(paint)) return null;
  const ok = v => Number.isInteger(v) && v >= 0 && v < PAINTS.length;
  if (!paint.every(ok)) return null;
  if (paint.length === PARTS.length) return paint.slice();
  if (paint.length === OLD_PARTS) return paint.concat(GROWN.map(i => paint[i]));
  return null;
}

/** 옛 코드를 읽을 때 쓰는 자리 수. */
export const PAINT_OLD = OLD_PARTS;

// 사람은 초당 3.1 만큼 걷는다. 반려동물은 그보다 늘 느려야 한다.
const PET_WALK = 1.2;

/** 품종에 따른 걷는 빠르기. 다리가 길고 몸집이 클수록 보폭이 넓다. */
export function walkSpeed(spec){
  const legs = 0.72 + spec.legs * 0.42;
  const size = 0.88 + spec.scale * 0.2;
  return PET_WALK * legs * size;
}

/*
 * 믹스견 — 두 품종을 섞는다.
 *
 * 수치는 가운데를 잡고(평균), 귀와 꼬리처럼 **고르는 것**은 한쪽씩
 * 나눠 갖는다 — 귀는 앞의 아이, 꼬리는 뒤의 아이. 평균이 없는 값이라
 * 어느 한쪽을 따라야 하는데, 서로 다른 데서 하나씩 가져와야 섞인 티가
 * 난다. 둘 다 앞의 아이를 따르면 그냥 앞의 아이로 보인다.
 */
function blend(a, b){
  const m = (x, y) => (x + y) / 2;
  return {
    name: a.name + ' × ' + b.name,
    scale: m(a.scale, b.scale),
    body: [m(a.body[0], b.body[0]), m(a.body[1], b.body[1])],
    legs: m(a.legs, b.legs),
    head: m(a.head, b.head),
    muzzle: m(a.muzzle, b.muzzle),
    ear: a.ear,                       // 귀는 앞의 아이
    earSize: m(a.earSize, b.earSize),
    tail: b.tail,                     // 꼬리는 뒤의 아이
    fluff: m(a.fluff, b.fluff)
  };
}

/** 섞을 품종이 쓸 만한 번호인가. 같은 품종끼리는 섞어도 그대로다. */
export function mixable(kind, breed, mix){
  const list = KINDS[KINDS[kind] ? kind : 'dog'].breeds;
  return Number.isInteger(mix) && mix >= 0 && mix < list.length &&
         mix !== (breed | 0);
}

/** 고른 값을 실제 모양 지시서로 바꾼다. 랜덤이면 여기서 뽑는다. */
export function resolvePet({ kind, breed, mix, coat, paint }){
  const k = KINDS[kind] ? kind : 'dog';
  const list = KINDS[k].breeds;
  const no = Math.min(Math.max(breed | 0, 0), list.length - 1);
  const b = mixable(k, no, mix) ? blend(list[no], list[mix]) : list[no];

  let c = COATS.find(x => x.key === coat) || COATS[0];
  if (c.random){
    const pick = COATS.filter(x => !x.random);
    c = pick[Math.floor(Math.random() * pick.length)];
  }

  /* 직접 칠한 아이는 털빛 대신 여섯 자리 색을 쓴다. 코 색을 정하려면
     머리 색이 짙은지 알아야 해서 그것도 함께 내어 준다. */
  const painted = fixPaint(paint);
  const headHex = painted ? PAINTS[painted[1]].hex : c.base;
  const dark = ((headHex >> 16) & 255) * 0.3 + ((headHex >> 8) & 255) * 0.59 +
               (headHex & 255) * 0.11 < 120;

  return {
    kind: k,
    breedName: b.name,
    coatKey: c.key,
    coatName: painted ? '직접 칠함' : c.label,
    base: painted ? PAINTS[painted[0]].hex : c.base,
    accent: painted ? null : c.accent,
    paint: painted,
    darkHead: dark,
    speed: walkSpeed(b),
    ...b
  };
}
