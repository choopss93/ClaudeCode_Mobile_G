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
export const HAIRS   = ['없음', '긴 생머리', '단발', '짧은 머리', '묶은 머리', '스포츠', '양갈래', '투블럭', '댄디',
                        '웨이브', '포니테일', '똥머리', '히메컷', '울프컷', '리젠트', '장발', '곱슬', '삭발', '가르마',
                        '숏컷', '레이어드', '허쉬컷', '보브', '땋은 양갈래', '땋은 머리', '만두 머리', '하프업', '사이드 포니', '긴 웨이브',
                        '모히칸', '언더컷', '아프로', '올백', '쉼표머리', '가일컷', '숏 울프', '드레드', '단발 웨이브', '긴 머리(이마)', '시스루뱅'];
export const TOPS    = ['없음', '맨투맨', '티셔츠', '후디', '셔츠', '민소매', '재킷', '패딩', '크롭티', '블라우스',
                        '니트', '가디건', '스트라이프 티', '폴로', '트렌치코트', '조끼', '원피스', '유니폼', '하와이안',
                        '터틀넥', '롱슬리브', '반팔 셔츠', '체크 셔츠', '데님 재킷', '라이더 재킷', '블레이저', '롱코트', '야구점퍼', '바람막이',
                        '집업 후디', '오프숄더', '탱크탑', '튜브탑', '나시 원피스', '크롭 후디', '오버핏 티', '니트 조끼', '코치 재킷', '아노락', '셔츠 원피스'];
export const BOTTOMS = ['없음', '카고', '청바지', '반바지', '치마', '조거', '와이드', '롱스커트',
                        '슬랙스', '플리츠', '미니스커트', '멜빵바지', '7부 바지', '레깅스', '스웻팬츠', '트레이닝',
                        '부츠컷', '찢어진 청바지', '카고 반바지', '버뮤다', '스키니진', '배기 바지', '체크 바지', '테니스 스커트', 'A라인 스커트',
                        '머메이드 스커트', '데님 스커트', '조거 반바지', '하이웨스트', '치노', '와이드 슬랙스', '롱 플리츠', '바이커 쇼츠'];
export const SHOES   = ['없음', '부츠', '운동화', '하이탑', '샌들', '로퍼', '메리제인'];
export const HATS    = ['없음', '헤드폰', '캡', '비니', '버킷햇', '리본', '머리띠'];
export const FACES   = ['없음', '안경', '선글라스', '마스크'];
export const NECKS   = ['없음', '목걸이', '체인', '목도리', '넥타이', '초커'];
export const BACKS   = ['없음', '백팩', '크로스백', '허리가방', '숄더백'];
export const FINISHES = ['유광', '무광'];          // 겉면 — 색 위에 투명 유리 코팅을 얹을지 (사용자 요청)

/* 남녀마다 보이는 종류 (번호, 보일 차례대로). 성별을 바꾸면 그쪽에 없는 것은 없음(0)으로 돌린다 (fitGender) */
export const OPTIONS = [
  { hair: [0, 17, 5, 3, 30, 7, 8, 33, 34, 32, 14, 18, 13, 35, 15, 16, 31, 36, 29, 2, 19],
    top: [0, 2, 20, 35, 12, 13, 19, 1, 10, 3, 29, 4, 21, 22, 18, 5, 31, 15, 36, 11, 6, 23, 24, 25, 37, 27, 28, 38, 7, 14, 26, 17],
    bottom: [0, 2, 20, 17, 16, 8, 22, 29, 30, 1, 5, 14, 15, 6, 21, 3, 18, 19, 27, 12, 11, 28],
    shoes: [0, 1, 2, 3, 4, 5], hat: [0, 1, 2, 3, 4], face: [0, 1, 2, 3], neck: [0, 2, 3, 4], back: [0, 1, 2, 3] },
  { hair: [0, 1, 38, 20, 39, 2, 22, 37, 19, 21, 3, 4, 10, 27, 6, 23, 24, 11, 25, 26, 9, 28, 12, 13, 16, 18, 31],
    top: [0, 2, 20, 35, 12, 8, 32, 31, 30, 9, 13, 19, 1, 10, 3, 34, 29, 11, 22, 15, 36, 16, 33, 39, 6, 23, 24, 25, 27, 28, 38, 7, 14, 26, 18],
    bottom: [0, 2, 20, 17, 16, 28, 8, 30, 1, 6, 21, 3, 18, 27, 32, 12, 13, 14, 15, 11, 4, 10, 23, 26, 9, 24, 7, 31, 25],
    shoes: [0, 1, 2, 3, 4, 6], hat: [0, 1, 2, 3, 5, 6], face: [0, 1, 2, 3], neck: [0, 1, 3, 5], back: [0, 1, 2, 4] }
];

const COLOR = 0xFFFFFF;
export const SLIDER = 20;                       // 체형 밀대 0~20, 10 이 기본
export const BODY = [['leg', '다리 길이', '짧게', '길게'], ['arm', '팔 길이', '짧게', '길게'], ['torso', '상체 길이', '짧게', '길게'], ['fat', '살찜', '마름', '통통']];
/* 저장 · 전송 순서. [열쇠, 최댓값]. **끝에만 붙인다** — 접속 인사가 이 순서의 배열이다. */
export const KEYS = [
  ['gender', 1], ['skin', COLOR], ['lip', COLOR], ['hair', HAIRS.length - 1], ['hairColor', COLOR],
  ['top', TOPS.length - 1], ['topColor', COLOR], ['bottom', BOTTOMS.length - 1], ['bottomColor', COLOR],
  ['shoes', SHOES.length - 1], ['shoesColor', COLOR], ['hat', HATS.length - 1], ['hatColor', COLOR],
  ['face', FACES.length - 1], ['faceColor', COLOR], ['neck', NECKS.length - 1], ['neckColor', COLOR],
  ['back', BACKS.length - 1], ['backColor', COLOR], ['finish', FINISHES.length - 1],
  ['leg', SLIDER], ['arm', SLIDER], ['torso', SLIDER], ['fat', SLIDER]      // 체형 밀대 (사용자 요청) — 끝에 붙였다
];

/* 처음 모습 = 아무것도 고르지 않은 맨몸. 색은 고를 때 처음 보일 값 (원본 핑크 소녀의 색) */
export function blankChar(gender = 0){
  return { v: 4, nick: '', gender, skin: 0xFADDD2, lip: 0xC25E4E, hair: 0, hairColor: 0x241414,
    top: 0, topColor: 0xFAB3CC, bottom: 0, bottomColor: 0x2A2B2F, shoes: 0, shoesColor: 0x24191B,
    hat: 0, hatColor: 0xE25D37, face: 0, faceColor: 0x2A2B2F, neck: 0, neckColor: 0xD9B45A,
    back: 0, backColor: 0x55585E, finish: 0, leg: 10, arm: 10, torso: 10, fat: 10 };
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
  if (typeof c.mid === 'string' && MID_RE.test(c.mid)) out.mid = c.mid;   // 사진으로 만든 모델 (blocky.js 의 modelOf · 서버 gen.js)
  return fitGender(out);
}
export const MID_RE = /^[a-z0-9]{12}$/;

/** 접속 인사에 싣는 배열 — 앞에 판 번호 4. 옛 판 클라이언트는 읽지 않는다 */
/* 사진 모델 번호(mid)는 **끝에** 붙인다 — 옛 판은 그 자리를 읽지 않고 종류 · 색으로 그린다 */
export const packChar = c => [4, ...KEYS.map(([k]) => c[k]), ...(c.mid ? [c.mid] : [])];
export function unpackChar(a){
  if (!Array.isArray(a) || a[0] !== 4) return null;
  const c = { v: 4 };
  KEYS.forEach(([k], i) => { c[k] = a[i + 1]; });
  if (typeof a[KEYS.length + 1] === 'string') c.mid = a[KEYS.length + 1];
  return cleanChar(c);
}

/** 옛 판 클라이언트가 읽는 [옷, 머리, 피부] 색 */
export const colorsOf = c => [c.top ? c.topColor : c.skin, c.hair ? c.hairColor : c.skin, c.skin];
/** 옛 판 클라이언트의 머리 길이 (긴 생머리 · 단발 · 양갈래면 long) */
export const longOf = c => [1, 2, 6].includes(c.hair);
