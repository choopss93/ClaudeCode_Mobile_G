/*
 * 캐릭터 — Metaversal Studio 에서 꾸미고, 게임들이 그대로 가져다 쓴다.
 *
 * 계정에는 **번호만** 담는다 ({nick, look, hair, cloth, skin}). 번호가 무슨
 * 색인지는 여기 한 곳이 안다. 그래서 색을 더할 때는 **목록 끝에만** 붙인다 —
 * 가운데 끼우면 이미 만든 캐릭터의 색이 바뀐다. (서버는 번호 31 까지 받는다.)
 *
 * 색은 무지개 정원 그림체와 같이 밝고 밀키하게.
 */

export const HAIR = [
  0xBC8966, 0x97786A, 0xD5A372, 0x81716D, 0xE1B47C, 0xA88161,   // 무지개 정원이 이름에서 뽑던 색
  0x5A4640, 0x3E3638, 0xF0D9A8, 0xE8A3A0, 0xA9B8E6, 0xB7D9B0
];
export const CLOTH = [
  0xFFABB4, 0xFFCD88, 0xFFED98, 0xACEDA5, 0x94E2F1, 0xB1BCFC, 0xE7B5F2, 0xFFB6D9,
  0xF7F3EE, 0x9AD9C8, 0xD9C3A5, 0x8F94A8
];
export const SKIN = [0xFFE9D4, 0xF6D5B8, 0xE8BE98, 0xC99A74, 0x9C6E4E];

export const LOOKS = [['short', '짧은 머리'], ['long', '긴 머리']];

export const hex = n => '#' + n.toString(16).padStart(6, '0');

/** 들어온 값을 고쳐 읽는다. 모르는 번호는 0 으로. */
export function cleanChar(c){
  c = c || {};
  const pick = (v, list) => (Number.isInteger(v) && v >= 0 && v < list.length ? v : 0);
  return {
    nick: String(c.nick || '').trim().slice(0, 12),
    look: c.look === 'long' ? 'long' : 'short',
    hair: pick(c.hair, HAIR), cloth: pick(c.cloth, CLOTH), skin: pick(c.skin, SKIN)
  };
}

/** createActor 에 넘길 색. */
export function colorsOf(c){
  c = cleanChar(c);
  return { color: CLOTH[c.cloth], hair: HAIR[c.hair], skin: SKIN[c.skin], long: c.look === 'long' };
}

/** 처음 만들 때 — 아무거나 하나 골라 준다. */
export function randomChar(){
  const r = n => Math.floor(Math.random() * n);
  return { nick: '', look: Math.random() < 0.5 ? 'short' : 'long', hair: r(6), cloth: r(8), skin: r(SKIN.length) };
}
