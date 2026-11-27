/*
 * 캐릭터 (새 판 · v2) — Metaversal Studio 에서 만들고, 무지개 정원이 그대로 짓는다.
 *
 * 만드는 차례 (사용자 요청):
 *   1. 스타일 넷 — 스트리트 치비 · 미니멀 후드 · 어반 후디 · 롱레그 패션
 *   2. 성별 — 남자 · 여자 · 무지(기계 같은 하이브리드)
 *   3. 얼굴 — 얼굴이 있는 스타일은 얼굴 크기 · 피부 · 헤어 · 이마 · 눈썹 · 눈 · 미간 · 코 · 인중 · 입 · 입술색 · 턱,
 *             얼굴 없는 스타일(미니멀 후드 · 어반 후디)은 얼굴색(30색) · 눈 있음/없음 · 눈 모양 · 눈빛
 *   4. 옷 — 상의 · 하의 · 신발 · 모자 · 소품 (색은 30색)
 *   5. 몸 — 근육 · 몸길이 · 팔길이 · 다리길이 (밀대)
 *
 * 계정에는 **번호만** 담는다 ({v:2, nick, ...KEYS}). 번호가 무엇인지는 여기 한 곳이 알고,
 * 모양은 game/world/js/avatar.js 가 짓는다. 고를 거리는 **목록 끝에만** 붙인다
 * (번호가 계정과 접속 인사에 박혀 있다). 서버는 번호 0~63 만 받는다 — 목록은 64 를 넘기지 말 것.
 *
 * 예전 판(v 없음)은 **버린다** (사용자 요청) — cleanChar 가 null 을 돌려줘 다시 만들게 한다.
 */

export const hex = n => '#' + n.toString(16).padStart(6, '0');

export const STYLES = [
  { name: '스트리트 치비', sub: '큰 머리 · 뾰족 머리 · 재킷', face: true },
  { name: '미니멀 후드',   sub: '하얗고 매끈한 · 얼굴 없음', face: false },
  { name: '어반 후디',     sub: '후디 · 비니 · 빛나는 눈',   face: false },
  { name: '롱레그 패션',   sub: '긴 다리 · 패딩 · 캡',       face: true }
];
export const hasFace = c => STYLES[c.style].face;

export const GENDERS = [['m', '남자'], ['f', '여자'], ['x', '무지']];   // 무지 = 기계 같은 하이브리드

/* 30색 — 얼굴색 · 옷 색이 함께 쓴다. 흰색 · 검정 꼭 (사용자 요청). */
export const PALETTE = [
  0xFFFFFF, 0xF2F2F0, 0xC9CBD0, 0x8E9197, 0x55585E, 0x2A2B2F, 0x111113,
  0xFF5A5F, 0xF59AA0, 0xFFC3CF, 0xFF8A3D, 0xFFB98A, 0xFFD84D, 0xFFF0A8,
  0xB7E36A, 0x4FBF6A, 0x2E7D52, 0x9FE3D0, 0x34B8B0, 0x7FD3F7, 0x3D8BF2,
  0x26408F, 0xB9A7F5, 0x7D5CE0, 0xE59AF0, 0xB0478F, 0xC9A47E, 0x8A5A3C,
  0x4E3527, 0xE8DCC2
];
export const SKINS = [
  0xFFEDE0, 0xFBDCC4, 0xF2C9A5, 0xE0AE84, 0xC48A62, 0x9A6644, 0x6E4630,
  0xD9DEE6, 0x9AA3AF, 0xBFE8DD                                   // 뒤의 셋은 하이브리드 결 (은빛 · 강철 · 민트)
];
export const HAIR_COLORS = [0x2A2321, 0x5B3A29, 0x8C5A35, 0xD9A55B, 0xF2DC9B, 0xC9C9CF,
                            0xFFFFFF, 0x5BCB6B, 0x3D8BF2, 0xF59AA0, 0xB9A7F5, 0xFF5A5F];
export const EYE_COLORS = [0x2A2321, 0x6B4A33, 0x3D8BF2, 0x4FBF6A, 0x8E9197, 0x7D5CE0, 0xE0474C, 0xD9A23B];
export const GLOWS = [0xFFFFFF, 0x7FE8FF, 0x6BFFB0, 0xFFE45C, 0xFF6B6B, 0xFF8AE0, 0xB28CFF, 0xFFA64D];
export const LIPS = [null, 0xF2A0A8, 0xFF8C78, 0xE0474C, 0xA63A5C, 0xD9A08A, 0x8A5A48, 0xFFC3CF];   // 0 = 피부 그대로

/* 고를 거리 — 이름만 여기, 모양은 avatar.js 가 kind 를 보고 짓는다 */
const L = (...names) => names;
export const HAIRS   = L('삭발', '짧은 머리', '뾰족 머리', '투블럭', '단발 보브', '긴 생머리', '포니테일', '양갈래',
                         '뽀글 곱슬', '똥머리', '웨이브 장발', '모히칸');
export const BROWS   = L('기본', '두꺼운', '가는', '올라간', '처진', '짧은', '일자', '없음');
export const EYES    = L('동글', '반짝', '가는 눈', '처진 눈', '올라간 눈', '반달', '졸린 눈', '고양이 눈');
export const NOSES   = L('점', '동글', '오똑', '작은', '넓은', '없음');
export const MOUTHS  = L('미소', '활짝', '일자', '오', '시무룩', '메롱', '고양이 입', '이 보이게');
export const CHINS   = L('동글', '뾰족', '각진', '넓은', '갸름');
export const LIP_NAMES = L('피부색', '핑크', '코랄', '레드', '베리', '누드', '브라운', '베이비');
export const EYE_SHAPES = L('동그라미', '세로 알약', '가로 슬릿', '반달', '네모', 'X', '하트', '별');
export const TOPS    = L('티셔츠', '후디', '재킷', '패딩', '맨투맨', '민소매', '바람막이', '셔츠');
export const BOTTOMS = L('반바지', '조거', '청바지', '카고', '치마', '레깅스 + 워머', '와이드', '트레이닝');
export const SHOES   = L('운동화', '하이탑', '부츠', '슬립온', '맨발');
export const HATS    = L('없음', '비니', '캡', '후드 쓰기', '버킷햇', '헤드폰');
export const ACCS    = L('없음', '체인', '크로스백', '백팩', '목도리');

/* 저장 · 전송 순서. [열쇠, 최댓값]. 밀대는 0~20. **끝에만 붙인다** — 접속 인사가 이 순서의 배열이다. */
export const SLIDER = 20;
export const KEYS = [
  ['style', STYLES.length - 1], ['gender', 2], ['head', SLIDER], ['skin', SKINS.length - 1],
  ['hair', HAIRS.length - 1], ['hairColor', HAIR_COLORS.length - 1], ['forehead', SLIDER],
  ['brow', BROWS.length - 1], ['eye', EYES.length - 1], ['eyeColor', EYE_COLORS.length - 1],
  ['glabella', SLIDER], ['nose', NOSES.length - 1], ['philtrum', SLIDER], ['mouth', MOUTHS.length - 1],
  ['lip', LIPS.length - 1], ['chin', CHINS.length - 1],
  ['eyesOn', 1], ['eyeShape', EYE_SHAPES.length - 1], ['glow', GLOWS.length - 1], ['faceColor', PALETTE.length - 1],
  ['top', TOPS.length - 1], ['topColor', PALETTE.length - 1], ['bottom', BOTTOMS.length - 1],
  ['bottomColor', PALETTE.length - 1], ['shoes', SHOES.length - 1], ['shoesColor', PALETTE.length - 1],
  ['hat', HATS.length - 1], ['acc', ACCS.length - 1],
  ['muscle', SLIDER], ['torso', SLIDER], ['arm', SLIDER], ['leg', SLIDER],
  ['hatColor', PALETTE.length - 1], ['accColor', PALETTE.length - 1]
];

/* 스타일마다 처음 입는 옷 — 참고 그림의 느낌 그대로 시작한다 */
const P = c => PALETTE.indexOf(c);
export const STYLE_PRESET = [
  { top: 2, topColor: P(0x4FBF6A), bottom: 0, bottomColor: P(0x2A2B2F), shoes: 0, shoesColor: P(0xFFFFFF), hat: 0, acc: 0, hatColor: P(0x2A2B2F), accColor: P(0xFFD84D),
    hair: 2, hairColor: 7, faceColor: 0 },
  { top: 1, topColor: P(0xFFFFFF), bottom: 1, bottomColor: P(0xFFFFFF), shoes: 4, shoesColor: P(0xFFFFFF), hat: 3, acc: 0, hatColor: P(0xFFFFFF), accColor: P(0xC9CBD0),
    hair: 0, faceColor: P(0xFFFFFF), eyesOn: 1, eyeShape: 2, glow: 0 },
  { top: 1, topColor: P(0x111113), bottom: 7, bottomColor: P(0x55585E), shoes: 1, shoesColor: P(0xFF5A5F), hat: 1, acc: 1, hatColor: P(0x2A2B2F), accColor: P(0xC9CBD0),
    hair: 0, faceColor: P(0x111113), eyesOn: 1, eyeShape: 0, glow: 1 },
  { top: 3, topColor: P(0xFFF0A8), bottom: 5, bottomColor: P(0x2A2B2F), shoes: 0, shoesColor: P(0xF2F2F0), hat: 2, acc: 2, hatColor: P(0x2A2B2F), accColor: P(0x8A5A3C),
    hair: 5, hairColor: 1, faceColor: 0 }
];

const MID = SLIDER / 2;
export function blankChar(style = 0, gender = 'm'){
  const c = { v: 2, nick: '' };
  for (const [k] of KEYS) c[k] = 0;
  Object.assign(c, { style, gender: ['m', 'f', 'x'].indexOf(gender) < 0 ? 0 : ['m', 'f', 'x'].indexOf(gender),
    head: MID, forehead: MID, glabella: MID, philtrum: MID, muscle: MID, torso: MID, arm: MID, leg: MID,
    skin: 1, eyesOn: 1, eyeColor: 0, lip: 0 }, STYLE_PRESET[style]);
  return c;
}

/* 안에서는 gender 를 0 · 1 · 2 로 다룬다 (계정에도 그렇게). 화면에 보일 때만 남자 · 여자 · 무지. */
export function cleanChar(c){
  if (!c || typeof c !== 'object' || c.v !== 2) return null;     // 예전 판은 버린다
  const out = { v: 2, nick: String(c.nick || '').slice(0, 16) };
  for (const [k, max] of KEYS){
    const n = c[k];
    out[k] = Number.isInteger(n) && n >= 0 && n <= max ? n : (k === 'eyesOn' ? 1 : 0);
  }
  return out;
}

/** 접속 인사에 싣는 배열 · 받은 배열을 캐릭터로 */
export const packChar = c => KEYS.map(([k]) => c[k]);
export function unpackChar(a){
  if (!Array.isArray(a) || a.length < KEYS.length - 4) return null;
  const c = { v: 2 };
  KEYS.forEach(([k], i) => { c[k] = a[i]; });
  return cleanChar(c);
}

/** 옛 판 클라이언트가 읽는 [옷, 머리, 피부] 색 */
export function colorsOf(c){
  const face = hasFace(c) ? SKINS[c.skin] : PALETTE[c.faceColor];
  return [PALETTE[c.topColor], HAIR_COLORS[c.hairColor], face];
}

export function randomChar(){
  const r = n => Math.floor(Math.random() * n);
  const c = blankChar(r(STYLES.length), ['m', 'f', 'x'][r(3)]);
  if (hasFace(c)){
    c.skin = r(7); c.eye = r(EYES.length); c.brow = r(7); c.mouth = r(3);
    c.hair = c.gender === 1 ? [4, 5, 6, 7, 9, 10][r(6)] : [1, 2, 3, 8, 11][r(5)];
    c.hairColor = r(HAIR_COLORS.length);
  }
  return c;
}
