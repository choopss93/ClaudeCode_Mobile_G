/*
 * 캐릭터 (v3 · 블록 캐릭터) — Metaversal Studio 에서 꾸미고, 무지개 정원이 그대로 짓는다.
 *
 * 사용자가 준 블렌더 모델(핑크 소녀)이 바탕이다. 예전 캐릭터(스타일 · 성별 · 얼굴 · 몸 밀대)는 버렸다 (사용자 요청 —
 * '이전 캐릭터 선택은 빠져야 한다'). 꾸미는 것은 이 캐릭터 기준 — 피부 · 입 · 헤어 · 머리색 · 옷 색 · 헤드폰 · 목걸이 · 겉면(유광 · 무광).
 *
 * 계정에는 **번호만** 담는다 ({v:3, nick, ...KEYS}). 모양은 game/world/js/blocky.js 가 짓는다.
 * 고를 거리 · 색은 **목록 끝에만** 붙인다 (번호가 계정과 접속 인사에 박혀 있다). 서버는 번호 0~63 만 받는다.
 * 예전 판(v 가 3 이 아닌 것)은 **버린다** — cleanChar 가 null 을 돌려줘 다시 만들게 한다.
 */

export const hex = n => '#' + n.toString(16).padStart(6, '0');

/* 30색 — 옷 · 헤드폰 색. 원본의 분홍 · 검정 · 주황이 들어 있다 (흰색 · 검정 꼭) */
export const PALETTE = [
  0xFFFFFF, 0xF2F2F0, 0xC9CBD0, 0x8E9197, 0x55585E, 0x2A2B2F, 0x190D0D,
  0xFF5A5F, 0xFAB3CC, 0xFFC3CF, 0xE25D37, 0xFFB98A, 0xFFD84D, 0xFFF0A8,
  0xB7E36A, 0x4FBF6A, 0x2E7D52, 0x9FE3D0, 0x34B8B0, 0x7FD3F7, 0x3D8BF2,
  0x26408F, 0xB9A7F5, 0x7D5CE0, 0xE59AF0, 0xB0478F, 0xC9A47E, 0x8A5A3C,
  0x4E3527, 0xE8DCC2
];
export const SKINS = [0xFADDD2, 0xFFEDE0, 0xF2C9A5, 0xE0AE84, 0xC48A62, 0x9A6644, 0x6E4630, 0xD9DEE6, 0x9AA3AF, 0xBFE8DD];
export const LIPS = [0xC25E4E, 0xF2A0A8, 0xFF8C78, 0xE0474C, 0xA63A5C, 0xD9A08A, 0x8A5A48, 0xFFC3CF];
export const HAIR_COLORS = [0x241414, 0x5B3A29, 0x8C5A35, 0xD9A55B, 0xF2DC9B, 0xC9C9CF,
                            0xFFFFFF, 0x5BCB6B, 0x3D8BF2, 0xF59AA0, 0xB9A7F5, 0xFF5A5F];
export const HAIRS = ['긴 생머리', '단발', '짧은 머리', '묶은 머리'];
export const ONOFF = ['없음', '있음'];
export const FINISHES = ['유광', '무광'];          // 겉면 — 색 위에 투명 유리 코팅을 얹을지 (사용자 요청)

/* 저장 · 전송 순서. [열쇠, 최댓값]. **끝에만 붙인다** — 접속 인사가 이 순서의 배열이다. */
export const KEYS = [
  ['skin', SKINS.length - 1], ['lip', LIPS.length - 1], ['hair', HAIRS.length - 1], ['hairColor', HAIR_COLORS.length - 1],
  ['topColor', PALETTE.length - 1], ['bottomColor', PALETTE.length - 1], ['shoesColor', PALETTE.length - 1],
  ['phones', 1], ['phonesColor', PALETTE.length - 1], ['necklace', 1],
  ['finish', FINISHES.length - 1]                // 유광 · 무광 (사용자 요청) — 끝에 붙였다
];

/* 처음 모습 = 원본 그대로 (분홍 맨투맨 · 검정 카고 · 검정 부츠 · 주황 헤드폰 · 목걸이) */
export function blankChar(){
  return { v: 3, nick: '', skin: 0, lip: 0, hair: 0, hairColor: 0, topColor: 8, bottomColor: 6, shoesColor: 6,
           phones: 1, phonesColor: 10, necklace: 1, finish: 0 };
}

export function cleanChar(c){
  if (!c || typeof c !== 'object' || c.v !== 3) return null;     // 예전 판은 버린다
  const d = blankChar(), out = { v: 3, nick: String(c.nick || '').slice(0, 16) };
  for (const [k, max] of KEYS){
    const n = c[k];
    out[k] = Number.isInteger(n) && n >= 0 && n <= max ? n : d[k];
  }
  return out;
}

/** 접속 인사에 싣는 배열 — 앞에 판 번호 3. 옛 판 클라이언트는 길이가 짧아 읽지 않는다 */
export const packChar = c => [3, ...KEYS.map(([k]) => c[k])];
export function unpackChar(a){
  if (!Array.isArray(a) || a[0] !== 3) return null;
  const c = { v: 3 };
  KEYS.forEach(([k], i) => { c[k] = a[i + 1]; });
  return cleanChar(c);
}

/** 옛 판 클라이언트가 읽는 [옷, 머리, 피부] 색 */
export const colorsOf = c => [PALETTE[c.topColor], HAIR_COLORS[c.hairColor], SKINS[c.skin]];
/** 옛 판 클라이언트의 머리 길이 (긴 머리 · 단발이면 long) */
export const longOf = c => c.hair <= 1;
