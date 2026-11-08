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
export function resolvePet({ kind, breed, mix, coat }){
  const k = KINDS[kind] ? kind : 'dog';
  const list = KINDS[k].breeds;
  const no = Math.min(Math.max(breed | 0, 0), list.length - 1);
  const b = mixable(k, no, mix) ? blend(list[no], list[mix]) : list[no];

  let c = COATS.find(x => x.key === coat) || COATS[0];
  if (c.random){
    const pick = COATS.filter(x => !x.random);
    c = pick[Math.floor(Math.random() * pick.length)];
  }

  return {
    kind: k,
    breedName: b.name,
    coatKey: c.key,
    coatName: c.label,
    base: c.base,
    accent: c.accent,
    speed: walkSpeed(b),
    ...b
  };
}
