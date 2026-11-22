/*
 * 캐릭터 — Metaversal Studio 에서 꾸미고, 게임들이 그대로 가져다 쓴다.
 *
 * 남자 · 여자를 먼저 고르고, 그에 따라 얼굴 · 헤어 · 상의 · 하의를 **8가지씩**
 * 고른다. 피부색은 둘이 같다. 계정에는 **번호만** 담는다:
 *   {nick, gender:'m'|'f', face, expr, hair, top, bottom, skin}
 * 번호가 무엇인지는 여기 한 곳이 안다 (모양은 game/world/js/outfit.js 가 짓는다).
 * 그래서 고를 거리를 더할 때는 **목록 끝에만** 붙인다 — 가운데 끼우면 이미
 * 만든 캐릭터가 다른 옷을 입게 된다. (서버는 번호 31 까지 받는다.)
 *
 * 색은 무지개 정원 그림체와 같이 밝고 밀키하게.
 */

export const GENDERS = [['m', '남자'], ['f', '여자']];
export const SKIN = [0xFFE9D4, 0xF6D5B8, 0xE8BE98, 0xC99A74, 0x9C6E4E];

/* 얼굴 — 생김새. eyes: 눈 모양, mark: 볼의 점 · 주근깨. 여자 얼굴에는 속눈썹이 붙는다. */
const FACE_SET = [
  ['동글 눈', 'dot'],
  ['반짝 눈', 'sparkle'],
  ['큰 눈',   'big'],
  ['작은 눈', 'small'],
  ['세로 눈', 'tall'],
  ['반달 눈', 'calm'],
  ['주근깨',  'dot', 'freckle'],
  ['점',      'dot', 'mole']
];
export const FACES = {
  m: FACE_SET.map(([name, eyes, mark]) => ({ name, eyes, mark: mark || null, brow: true })),
  f: FACE_SET.map(([name, eyes, mark]) => ({ name, eyes, mark: mark || null, lash: true }))
};

/* 표정 — 기분. mouth: 입, eyes: 눈을 바꾸는 표정이면 그 모양(없으면 얼굴의 눈 그대로),
   brow: 눈썹 기울기(+ 올라감 · − 처짐). 남녀가 같다. */
const EXPR_SET = [
  { name: '미소',     mouth: 'smile' },
  { name: '활짝',     mouth: 'grin',   eyes: 'happy' },
  { name: '윙크',     mouth: 'grin',   eyes: 'wink' },
  { name: '졸림',     mouth: 'flat',   eyes: 'sleepy' },
  { name: '놀람',     mouth: 'o',      eyes: 'surprised', brow: 0.25 },
  { name: '고양이 입', mouth: 'cat' },
  { name: '메롱',     mouth: 'tongue', eyes: 'wink' },
  { name: '시무룩',   mouth: 'frown',  brow: -0.35 }
];
export const EXPRS = { m: EXPR_SET, f: EXPR_SET };

/* 헤어 — kind: 모양, color: 머리색 */
export const HAIRS = {
  m: [
    { name: '숏컷',    kind: 'short',   color: 0x6B4A3A },
    { name: '가르마',  kind: 'part',    color: 0x3E3638 },
    { name: '뾰족',    kind: 'spiky',   color: 0xD5A372 },
    { name: '곱슬',    kind: 'curly',   color: 0x81716D },
    { name: '바가지',  kind: 'bowl',    color: 0x5A4640 },
    { name: '올백',    kind: 'back',    color: 0x2F2A2C },
    { name: '더듬이',  kind: 'ahoge',   color: 0xE1B47C },
    { name: '상투',    kind: 'bun',     color: 0x97786A }
  ],
  f: [
    { name: '생머리',  kind: 'long',    color: 0x5A4640 },
    { name: '단발',    kind: 'bob',     color: 0x3E3638 },
    { name: '포니테일', kind: 'pony',    color: 0xBC8966 },
    { name: '트윈테일', kind: 'twin',    color: 0xE8A3A0 },
    { name: '똥머리',  kind: 'topbun',  color: 0x6B4A3A },
    { name: '땋은머리', kind: 'braid',   color: 0xF0D9A8 },
    { name: '웨이브',  kind: 'wave',    color: 0xA88161 },
    { name: '숏컷+핀', kind: 'pin',     color: 0x2F2A2C, accent: 0xFFB6D9 }
  ]
};

/* 상의 — color: 몸, sleeve: 팔(맨팔이면 null → 피부), kind: 덧붙는 모양, accent: 덧붙는 색 */
export const TOPS = {
  m: [
    { name: '티셔츠',   color: 0xF7F3EE, sleeve: 0xF7F3EE, kind: 'plain' },
    { name: '후드티',   color: 0x94E2F1, sleeve: 0x94E2F1, kind: 'hood',   accent: 0x7FCBDB },
    { name: '셔츠',     color: 0xB1BCFC, sleeve: 0xB1BCFC, kind: 'shirt',  accent: 0xFFFFFF },
    { name: '줄무늬',   color: 0xF7F3EE, sleeve: 0xF7F3EE, kind: 'stripe', accent: 0x8FA6E8 },
    { name: '조끼',     color: 0xF7F3EE, sleeve: 0xF7F3EE, kind: 'vest',   accent: 0xC9A27A },
    { name: '집업',     color: 0xACEDA5, sleeve: 0xACEDA5, kind: 'zip',    accent: 0x6E8A6A },
    { name: '민소매',   color: 0xFFCD88, sleeve: null,     kind: 'plain' },
    { name: '니트',     color: 0xE7B5F2, sleeve: 0xE7B5F2, kind: 'knit',   accent: 0xD39FE0 }
  ],
  f: [
    { name: '리본 블라우스', color: 0xFFFFFF, sleeve: 0xFFFFFF, kind: 'ribbon', accent: 0xFF9CA8 },
    { name: '퍼프 소매',   color: 0xFFB6D9, sleeve: 0xFFB6D9, kind: 'puff' },
    { name: '세일러',     color: 0xFFFFFF, sleeve: 0xFFFFFF, kind: 'sailor', accent: 0x8FA6E8 },
    { name: '가디건',     color: 0xFFED98, sleeve: 0xFFED98, kind: 'cardigan', accent: 0xFFFFFF },
    { name: '줄무늬',     color: 0xFFFFFF, sleeve: 0xFFFFFF, kind: 'stripe', accent: 0xFF9CA8 },
    { name: '후드티',     color: 0xE7B5F2, sleeve: 0xE7B5F2, kind: 'hood',   accent: 0xD39FE0 },
    { name: '민소매',     color: 0xACEDA5, sleeve: null,     kind: 'plain' },
    { name: '니트',       color: 0x94E2F1, sleeve: 0x94E2F1, kind: 'knit',   accent: 0x7FCBDB }
  ]
};

/* 하의 — kind: shorts · pants · skirt · long(긴 치마) · overall(멜빵) · leggings,
   color: 옷, leg: 다리(발) 색 — 바지면 바지색, 치마 · 반바지면 양말색 */
export const BOTTOMS = {
  m: [
    { name: '반바지',   kind: 'shorts',  color: 0x8FA6E8, leg: 0xFFFFFF },
    { name: '긴바지',   kind: 'pants',   color: 0x6E7590, leg: 0x6E7590 },
    { name: '청바지',   kind: 'pants',   color: 0x7FA0D6, leg: 0x7FA0D6 },
    { name: '카고',     kind: 'cargo',   color: 0xC9B48A, leg: 0xC9B48A },
    { name: '멜빵바지', kind: 'overall', color: 0x7FA0D6, leg: 0x7FA0D6 },
    { name: '트레이닝', kind: 'track',   color: 0x4E4A58, leg: 0x4E4A58, accent: 0xFFFFFF },
    { name: '슬랙스',   kind: 'pants',   color: 0x3E3A44, leg: 0x3E3A44 },
    { name: '체크 반바지', kind: 'shorts', color: 0xD9C3A5, leg: 0x8F94A8 }
  ],
  f: [
    { name: '미니 치마',  kind: 'skirt',   color: 0x8FA6E8, leg: 0xFFFFFF },
    { name: '롱 치마',    kind: 'long',    color: 0xFFCD88, leg: 0xFFFFFF },
    { name: '반바지',     kind: 'shorts',  color: 0xD9C3A5, leg: 0xFFFFFF },
    { name: '청바지',     kind: 'pants',   color: 0x7FA0D6, leg: 0x7FA0D6 },
    { name: '멜빵 치마',  kind: 'overall-skirt', color: 0xFFABB4, leg: 0xFFFFFF },
    { name: '플레어 치마', kind: 'flare',  color: 0xACEDA5, leg: 0xFFFFFF },
    { name: '레깅스',     kind: 'pants',   color: 0x4E4A58, leg: 0x4E4A58 },
    { name: '체크 치마',  kind: 'skirt',   color: 0xE8A3A0, leg: 0x4E4A58, accent: 0xFFFFFF }
  ]
};

export const PARTS = [['face', '얼굴', FACES], ['expr', '표정', EXPRS], ['hair', '헤어', HAIRS], ['top', '상의', TOPS], ['bottom', '하의', BOTTOMS]];

export const hex = n => '#' + n.toString(16).padStart(6, '0');

/** 들어온 값을 고쳐 읽는다. 모르는 번호는 0. 예전 판(look · cloth)도 읽는다. */
export function cleanChar(c){
  c = c || {};
  const gender = c.gender === 'f' || c.gender === 'm' ? c.gender : (c.look === 'long' ? 'f' : 'm');
  const pick = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : 0);
  return {
    nick: String(c.nick || '').trim().slice(0, 12),
    gender,
    face: pick(c.face, 8),
    expr: pick(c.expr, 8),
    hair: pick(c.hair, 8),
    top: pick(Number.isInteger(c.top) ? c.top : c.cloth, 8),
    bottom: pick(c.bottom, 8),
    skin: pick(c.skin, SKIN.length)
  };
}

/** 이 캐릭터의 모든 모양과 색 — outfit.js 가 받아 짓는다. */
export function resolveChar(c){
  c = cleanChar(c);
  const g = c.gender;
  return { gender: g, skin: SKIN[c.skin], face: FACES[g][c.face], expr: EXPRS[g][c.expr], hair: HAIRS[g][c.hair],
           top: TOPS[g][c.top], bottom: BOTTOMS[g][c.bottom] };
}

/** 대표 색 세 가지 [옷, 머리, 피부] — 이 캐릭터를 모르는 옛 판에 보내는 몫. */
export function colorsOf(c){
  const r = resolveChar(c);
  return [r.top.color, r.hair.color, r.skin];
}

/** 처음 만들 때 — 아무거나 하나 골라 준다. */
export function randomChar(){
  const r = n => Math.floor(Math.random() * n);
  return { nick: '', gender: Math.random() < 0.5 ? 'm' : 'f', face: r(8), expr: r(8), hair: r(8), top: r(8), bottom: r(8), skin: r(SKIN.length) };
}
