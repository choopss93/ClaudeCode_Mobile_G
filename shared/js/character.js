/*
 * 캐릭터 (v4 · 블록 캐릭터) — Metaversal Studio 에서 꾸미고, 무지개 정원이 그대로 짓는다.
 *
 * 사용자가 준 블렌더 모델(핑크 소녀)의 결을 따른 둥근 상자 캐릭터. 맨몸 위에 머리칼 · 상의 · 하의 · 신발 · 소품을 덧입힌다.
 * - **남녀를 고르고, 남녀마다 고를 수 있는 종류가 다르다** (사용자 요청 — 머리부터 상하의 · 소품까지, OPTIONS).
 * - **처음엔 아무것도 고르지 않은 맨몸** (사용자 요청) — 모든 종류가 0(없음)에서 시작한다.
 * - 종류와 색은 한 칸에서 함께 고른다 (상의 칸 안에 종류 + 색). **색은 모두 컬러피커** (사용자 요청) — 24비트 색 그대로 담는다.
 *
 * 계정에는 **번호만** 담는다 ({v:4, nick, ...KEYS}). 종류는 0~63, 색은 0~0xFFFFFF. 모양은 game/world/js/blocky.js 가 짓는다.
 * 종류는 **목록 끝에만** 붙인다 (번호가 계정과 접속 인사에 박혀 있다) — 남녀 목록(OPTIONS)에는 번호로 넣는다.
 * 예전 판(v 가 4 가 아닌 것)은 **버린다** — cleanChar 가 null 을 돌려줘 다시 만들게 한다.
 */

export const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

export const GENDERS = ['남자', '여자'];
export const HAIRS   = ['없음', '긴 생머리', '단발', '짧은 머리', '묶은 머리', '스포츠', '양갈래', '투블럭', '댄디'];
export const TOPS    = ['없음', '맨투맨', '티셔츠', '후디', '셔츠', '민소매', '재킷', '패딩', '크롭티', '블라우스'];
export const BOTTOMS = ['없음', '카고', '청바지', '반바지', '치마', '조거', '와이드', '롱스커트'];
export const SHOES   = ['없음', '부츠', '운동화', '하이탑', '샌들', '로퍼', '메리제인'];
export const HATS    = ['없음', '헤드폰', '캡', '비니', '버킷햇', '리본', '머리띠'];
export const FACES   = ['없음', '안경', '선글라스', '마스크'];
export const NECKS   = ['없음', '목걸이', '체인', '목도리', '넥타이', '초커'];
export const BACKS   = ['없음', '백팩', '크로스백', '허리가방', '숄더백'];
export const FINISHES = ['유광', '무광'];          // 겉면 — 색 위에 투명 유리 코팅을 얹을지 (사용자 요청)

/* 남녀마다 보이는 종류 (번호, 보일 차례대로). 성별을 바꾸면 그쪽에 없는 것은 없음(0)으로 돌린다 (fitGender) */
export const OPTIONS = [
  { hair: [0, 3, 5, 7, 8, 2], top: [0, 2, 1, 3, 4, 5, 6, 7], bottom: [0, 1, 2, 3, 5, 6], shoes: [0, 1, 2, 3, 4, 5],
    hat: [0, 1, 2, 3, 4], face: [0, 1, 2, 3], neck: [0, 2, 3, 4], back: [0, 1, 2, 3] },
  { hair: [0, 1, 2, 3, 4, 6], top: [0, 1, 2, 3, 8, 9, 6, 7], bottom: [0, 1, 2, 3, 4, 7, 6], shoes: [0, 1, 2, 3, 4, 6],
    hat: [0, 1, 2, 3, 5, 6], face: [0, 1, 2, 3], neck: [0, 1, 3, 5], back: [0, 1, 2, 4] }
];

const COLOR = 0xFFFFFF;
/* 저장 · 전송 순서. [열쇠, 최댓값]. **끝에만 붙인다** — 접속 인사가 이 순서의 배열이다. */
export const KEYS = [
  ['gender', 1], ['skin', COLOR], ['lip', COLOR], ['hair', HAIRS.length - 1], ['hairColor', COLOR],
  ['top', TOPS.length - 1], ['topColor', COLOR], ['bottom', BOTTOMS.length - 1], ['bottomColor', COLOR],
  ['shoes', SHOES.length - 1], ['shoesColor', COLOR], ['hat', HATS.length - 1], ['hatColor', COLOR],
  ['face', FACES.length - 1], ['faceColor', COLOR], ['neck', NECKS.length - 1], ['neckColor', COLOR],
  ['back', BACKS.length - 1], ['backColor', COLOR], ['finish', FINISHES.length - 1]
];

/* 처음 모습 = 아무것도 고르지 않은 맨몸. 색은 고를 때 처음 보일 값 (원본 핑크 소녀의 색) */
export function blankChar(gender = 0){
  return { v: 4, nick: '', gender, skin: 0xFADDD2, lip: 0xC25E4E, hair: 0, hairColor: 0x241414,
    top: 0, topColor: 0xFAB3CC, bottom: 0, bottomColor: 0x2A2B2F, shoes: 0, shoesColor: 0x24191B,
    hat: 0, hatColor: 0xE25D37, face: 0, faceColor: 0x2A2B2F, neck: 0, neckColor: 0xD9B45A,
    back: 0, backColor: 0x55585E, finish: 0 };
}

/** 성별에 없는 종류는 없음으로 */
export function fitGender(c){
  const o = OPTIONS[c.gender] || OPTIONS[0];
  for (const k in o) if (!o[k].includes(c[k])) c[k] = 0;
  return c;
}

export function cleanChar(c){
  if (!c || typeof c !== 'object' || c.v !== 4) return null;     // 예전 판은 버린다
  const d = blankChar(), out = { v: 4, nick: String(c.nick || '').slice(0, 16) };
  for (const [k, max] of KEYS){
    const n = c[k];
    out[k] = Number.isInteger(n) && n >= 0 && n <= max ? n : d[k];
  }
  return fitGender(out);
}

/** 접속 인사에 싣는 배열 — 앞에 판 번호 4. 옛 판 클라이언트는 읽지 않는다 */
export const packChar = c => [4, ...KEYS.map(([k]) => c[k])];
export function unpackChar(a){
  if (!Array.isArray(a) || a[0] !== 4) return null;
  const c = { v: 4 };
  KEYS.forEach(([k], i) => { c[k] = a[i + 1]; });
  return cleanChar(c);
}

/** 옛 판 클라이언트가 읽는 [옷, 머리, 피부] 색 */
export const colorsOf = c => [c.top ? c.topColor : c.skin, c.hair ? c.hairColor : c.skin, c.skin];
/** 옛 판 클라이언트의 머리 길이 (긴 생머리 · 단발 · 양갈래면 long) */
export const longOf = c => [1, 2, 6].includes(c.hair);
