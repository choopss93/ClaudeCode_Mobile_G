/*
 * 카드와 족보.
 *
 * 카드 한 장은 0~51 의 숫자 하나다. 무늬 = c / 13, 숫자 = c % 13 + 1
 * (1 = A, 11 = J, 12 = Q, 13 = K). 숫자 하나로 두면 꾸러미가 짧다.
 *
 * 족보는 고른 두 장 + 깔린 두 장, **네 장**으로 낸다. 시간 안에 못 고르면
 * 가진 장수(2~3장)로 낸다. 스트레이트 · 플러시 · 풀하우스는 다섯 장이
 * 있어야 되므로 네 장 판에서는 나오지 않는다 — 포카드 · 트리플 · 투페어 ·
 * 원페어 · 하이카드로 겨룬다.
 */

export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['스페이드', '하트', '다이아', '클로버'];
const FACE = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

export const suitOf = c => Math.floor(c / 13);
export const numOf  = c => c % 13 + 1;
export const isRed  = c => suitOf(c) === 1 || suitOf(c) === 2;
export const label  = c => FACE[numOf(c)] || String(numOf(c));
export const cellName = i => 'ABCDEFGHIJKLMNOP'[i];

/** 52장을 섞는다. */
export function shuffled(){
  const d = Array.from({ length: 52 }, (_, i) => i);
  const r = new Uint32Array(52);
  crypto.getRandomValues(r);
  for (let i = 51; i > 0; i--){
    const j = r[i] % (i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const HANDS = ['하이카드', '원페어', '투페어', '트리플', '스트레이트',
               '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

/**
 * 족보를 잰다. 돌려주는 key 는 앞에서부터 견주면 되는 숫자 목록이다
 * ([족보, 견줄 숫자들…]). 포커에서 A 는 가장 높고, A-2-3-4-5 에서만
 * 가장 낮다.
 */
export function evaluate(cards){
  const hi = c => (numOf(c) === 1 ? 14 : numOf(c));
  const n = cards.length;
  const count = new Map();
  for (const c of cards) count.set(hi(c), (count.get(hi(c)) || 0) + 1);
  // 많이 겹친 것부터, 같으면 높은 숫자부터
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ranks = groups.map(g => g[0]);
  const shape = groups.map(g => g[1]).join('');

  const flush = n === 5 && cards.every(c => suitOf(c) === suitOf(cards[0]));
  let straight = 0;
  if (n === 5 && groups.length === 5){
    const s = [...ranks].sort((a, b) => b - a);
    if (s[0] - s[4] === 4) straight = s[0];
    else if (s.join() === '14,5,4,3,2') straight = 5;   // A-2-3-4-5
  }

  let cat;
  if (straight && flush) cat = 8;
  else if (shape.startsWith('4')) cat = 7;   // 네 장 판에서는 '4', 다섯 장이면 '41'
  else if (shape === '32') cat = 6;
  else if (flush) cat = 5;
  else if (straight) cat = 4;
  else if (shape.startsWith('3')) cat = 3;
  else if (shape.startsWith('22')) cat = 2;
  else if (shape.startsWith('2')) cat = 1;
  else cat = 0;

  const key = straight ? [cat, straight] : [cat, ...ranks];
  let name = HANDS[cat];
  if (cat === 8 && straight === 14) name = '로열 스트레이트 플러시';
  return { key, cat, name };
}

/** a 가 높으면 양수, 낮으면 음수, 같으면 0. */
export function compare(a, b){
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++){
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}
