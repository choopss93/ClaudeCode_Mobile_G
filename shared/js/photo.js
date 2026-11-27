/* 사진으로 캐릭터 만들기 (사용자 요청 — "이미지를 올리면 비슷하게 옷도 입히고 색상도 넣어서").
   서버도 그림 알아보기 모델도 없으므로 사진의 **색 덩어리 모양**으로 어림한다. 사진은 이 기기 안에서만 읽고 어디에도 보내지 않는다.

   1. 사진을 긴 변 160px 로 줄이고, 가장자리 색을 바탕으로 본다. 바탕과 다른 점(전경)이 모인 상자 = 사람.
   2. 상자의 높이 비율로 자리를 나눈다 — 머리칼 0~6% · 얼굴 6~15% · 상의 24~42% · 하의 56~80% · 신발 94~100%.
      자리마다 전경 점의 중앙값이 그 색이다.
   3. 모양은 색이 어디까지 이어지는지로 가린다.
      - 머리 길이: 턱 아래 어깨 자리(15~32%)의 머리 옆에 머리칼 색이 얼마나 있나 → 긴 · 중간 · 짧은 · 없음(살빛)
      - 소매: 상자 바깥쪽 세로 띠(팔)의 위팔 · 아래팔이 상의 색인가 살빛인가 → 긴팔 · 반팔 · 민소매
      - 겉옷: 몸통 가운데 띠와 양옆의 색이 크게 다르면 앞이 열린 겉옷(재킷 · 가디건)
      - 하의: 다리 사이(가운데 세로 띠)가 바탕이면 바지 · 아니면 치마, 종아리가 살빛이면 짧은 것
      - 원피스: 여자 · 치마 모양 · 상의와 하의 색이 같으면
   종류 번호는 남녀 목록(OPTIONS)에 있는 것만 고른다. */
import { OPTIONS, HAIRS, TOPS, BOTTOMS, SHOES } from './character.js?v=c9';

const N = 160;

function loadImage(file){
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('사진을 읽지 못했어요.')); };
    img.src = url;
  });
}
const med = a => { if (!a.length) return null; a.sort((x, y) => x - y); return a[a.length >> 1]; };
const rgb = h => [h >> 16 & 255, h >> 8 & 255, h & 255];
const dist = (p, h) => { if (h == null) return 999; const q = rgb(h); return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); };
const isSkin = p => p[0] > 90 && p[0] >= p[1] && p[1] >= p[2] * 0.85 && p[0] - p[2] > 15 && p[0] - p[2] < 130;

/** 사진 파일 → { img(작게 줄인 캔버스), box, colors, shape, found } */
export async function readPhoto(file){
  if (!file || !/^image\//.test(file.type)) throw new Error('사진 파일을 골라 주세요.');
  const img = await loadImage(file);
  const k = N / Math.max(img.naturalWidth, img.naturalHeight);
  const W = Math.max(8, Math.round(img.naturalWidth * k)), H = Math.max(8, Math.round(img.naturalHeight * k));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const px = (i, j) => { const o = (j * W + i) * 4; return [d[o], d[o + 1], d[o + 2]]; };

  // 바탕 = 가장자리 색의 중앙값
  const er = [], eg = [], eb = [];
  const edge = (i, j) => { const p = px(i, j); er.push(p[0]); eg.push(p[1]); eb.push(p[2]); };
  for (let i = 0; i < W; i++){ edge(i, 0); edge(i, 1); edge(i, H - 2); edge(i, H - 1); }
  for (let j = 0; j < H; j++){ edge(0, j); edge(1, j); edge(W - 2, j); edge(W - 1, j); }
  const bg = [med(er), med(eg), med(eb)];
  const mask = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++){
    const p = px(i, j);
    mask[j * W + i] = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 45 ? 1 : 0;   // 45 — 흰 옷 · 흰 벽처럼 비슷한 색도 사람으로 잡게
  }
  const fg = (i, j) => i >= 0 && j >= 0 && i < W && j < H && mask[j * W + i] === 1;

  // 사람 상자
  const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (mask[j * W + i]){ rows[j]++; cols[i]++; }
  const span = (arr, need) => { const a = arr.findIndex(v => v >= need); let b = arr.length - 1; while (b > a && arr[b] < need) b--; return a < 0 ? null : [a, b]; };
  let ys = span(rows, Math.max(2, W * 0.04)), xs = span(cols, Math.max(2, H * 0.04));
  const found = !!(ys && xs && ys[1] - ys[0] > H * 0.35 && xs[1] - xs[0] > W * 0.12);
  if (!found){ ys = [0, H - 1]; xs = [Math.round(W * 0.2), Math.round(W * 0.8)]; }
  const [y0, y1] = ys, [x0, x1] = xs, bh = y1 - y0 + 1, bw = x1 - x0 + 1;
  const cx = (x0 + x1) / 2;
  const Y = t => Math.round(y0 + bh * t);

  // 자리 안의 점들 — [위, 아래] 높이 비율 · [왼, 오른] 가로 비율(상자 기준)
  function pts(t, b, l, r, need = true){
    const out = [];
    for (let j = Y(t); j <= Y(b) && j < H; j++)
      for (let i = Math.round(x0 + bw * l); i <= Math.round(x0 + bw * r) && i < W; i++)
        if (!found || !need || fg(i, j)) out.push(px(i, j));
    return out;
  }
  const medOf = (ps, keep = () => true) => {
    const f = ps.filter(keep);
    return f.length >= 4 ? (med(f.map(p => p[0])) << 16) | (med(f.map(p => p[1])) << 8) | med(f.map(p => p[2])) : null;
  };
  const share = (ps, h) => ps.length ? ps.filter(p => dist(p, h) < 75).length / ps.length : 0;
  const skinShare = ps => ps.length ? ps.filter(isSkin).length / ps.length : 0;

  // 머리 폭 — 얼굴 높이(10%)에서 가운데 전경 줄의 폭
  const runAt = j => { let a = Math.round(cx), b = a; while (fg(a - 1, j)) a--; while (fg(b + 1, j)) b++; return [a, b]; };
  const [ha, hb] = runAt(Y(0.1)); const headW = Math.max(3, hb - ha + 1);
  const hl = (ha - x0) / bw, hr = (hb - x0) / bw;

  const colors = {
    hairColor: medOf(pts(0, 0.06, hl + 0.05, hr - 0.05)),
    skin: medOf(pts(0.06, 0.15, 0.5 - (hr - hl) * 0.3, 0.5 + (hr - hl) * 0.3), isSkin),
    topColor: null,
    bottomColor: medOf(pts(0.56, 0.72, 0.3, 0.7)),
    shoesColor: medOf(pts(0.94, 1, 0.2, 0.8))
  };

  // 상의 — 몸통 가운데 띠와 양옆 띠
  const mid = pts(0.26, 0.44, 0.44, 0.56), sides = [...pts(0.26, 0.44, 0.24, 0.36), ...pts(0.26, 0.44, 0.64, 0.76)];
  const midC = medOf(mid), sideC = medOf(sides);
  const open = midC != null && sideC != null && dist(rgb(midC), sideC) > 120;     // 앞이 열린 겉옷
  colors.topColor = open ? sideC : medOf(pts(0.24, 0.42, 0.28, 0.72));
  if (open) colors.innerColor = midC;

  // 머리 길이 — 턱 아래 어깨 자리, 머리 폭 안이되 목 바깥
  const sideHair = [...pts(0.15, 0.3, hl, hl + (hr - hl) * 0.28), ...pts(0.15, 0.3, hr - (hr - hl) * 0.28, hr)];
  const lowHair = [...pts(0.3, 0.42, hl - 0.02, hl + (hr - hl) * 0.25), ...pts(0.3, 0.42, hr - (hr - hl) * 0.25, hr + 0.02)];
  const hs = share(sideHair, colors.hairColor) * (dist(rgb(colors.hairColor ?? 0), colors.topColor) < 60 ? 0.4 : 1);
  const hsLow = share(lowHair, colors.hairColor) * (dist(rgb(colors.hairColor ?? 0), colors.topColor) < 60 ? 0.4 : 1);
  const topIsSkin = colors.hairColor != null && colors.skin != null && dist(rgb(colors.hairColor), colors.skin) < 50;   // 머리 위가 살빛 — 금발을 살빛으로 잘못 보지 않게 얼굴 색과 견준다
  const hair = topIsSkin ? 'none' : hsLow > 0.22 ? 'long' : hs > 0.3 ? 'mid' : 'short';

  // 소매 — 상자 바깥쪽 띠 (팔)
  const armUp = [...pts(0.24, 0.34, 0, 0.16), ...pts(0.24, 0.34, 0.84, 1)];
  const armLo = [...pts(0.38, 0.5, 0, 0.16), ...pts(0.38, 0.5, 0.84, 1)];
  const upTop = share(armUp, colors.topColor), loTop = share(armLo, colors.topColor);
  const upSkin = skinShare(armUp), loSkin = skinShare(armLo);
  const sleeve = armUp.length < 6 && armLo.length < 6 ? 'short'
    : upSkin > upTop && upSkin > 0.3 ? 'none'
    : loTop >= loSkin || loTop > 0.35 ? 'long' : 'short';

  // 하의 — 다리 사이 · 종아리
  const gapPts = pts(0.66, 0.76, 0.47, 0.53, false);     // 가랑이 바로 밑 — 바지 · 반바지는 여기서 갈라지고, 치마는 덮고 있다
  const gap = gapPts.length ? gapPts.filter(p => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) <= 45).length / gapPts.length : 0;
  const shin = pts(0.8, 0.92, 0.25, 0.75);
  const shinSkin = skinShare(shin), shinBottom = share(shin, colors.bottomColor);
  const short = shinSkin > shinBottom && shinSkin > 0.25;
  const wideHem = (() => { const [a, b] = runAt(Y(0.74)); return (b - a + 1) / bw > 0.55; })();
  const legs = gap > 0.45 ? (short ? 'shorts' : 'pants') : (short ? 'skirt' : (wideHem ? 'longskirt' : 'pants'));
  const sameColor = colors.topColor != null && colors.bottomColor != null && dist(rgb(colors.topColor), colors.bottomColor) < 60;

  const shoeLight = colors.shoesColor != null && rgb(colors.shoesColor).reduce((a, b) => a + b) / 3 > 170;
  const jeans = colors.bottomColor != null && (() => { const [r, g, b] = rgb(colors.bottomColor); return b > r + 15 && b > 60 && b < 200; })();

  return {
    img: cv, box: [x0, y0, x1, y1], found,
    colors,
    shape: { hair, sleeve, open, legs, dress: sameColor && (legs === 'skirt' || legs === 'longskirt'), shoeLight, jeans,
             girlish: hair === 'long' || legs === 'skirt' || legs === 'longskirt' }
  };
}

/* 어림한 모양 → 그 성별 목록 안의 종류 번호 */
const PICK = {
  hair: { long: [1, 15], mid: [2, 8], short: [19, 3], none: [19, 17] },        // [여자, 남자]
  top: { long: [1, 1], short: [2, 2], none: [31, 5], open: [11, 6], dress: [16, 1] },
  bottom: { pants: [8, 8], jeans: [2, 2], shorts: [3, 3], skirt: [10, 3], longskirt: [7, 6] }
};
const okFor = (g, k, n) => (OPTIONS[g] || OPTIONS[0])[k].includes(n) ? n : 0;

/** 읽은 사진 → 캐릭터. base 의 성별 · 체형 · 소품은 그대로 둔다 */
export function charFromPhoto(base, r){
  const c = { ...base }, g = c.gender === 1 ? 1 : 0, gi = g === 1 ? 0 : 1, s = r.shape;
  c.hair = okFor(g, 'hair', PICK.hair[s.hair][gi]);
  const dress = g === 1 && s.dress;
  c.top = dress ? okFor(g, 'top', s.sleeve === 'none' ? 33 : 16) : okFor(g, 'top', PICK.top[s.open ? 'open' : s.sleeve][gi]);   // 원피스 · 나시 원피스
  const bk = s.legs === 'pants' && s.jeans ? 'jeans' : s.legs;
  c.bottom = dress ? 0 : okFor(g, 'bottom', PICK.bottom[bk][gi]);
  c.shoes = okFor(g, 'shoes', s.shoeLight ? 2 : (g === 1 ? 6 : 5)) || 2;
  for (const k of ['hairColor', 'skin', 'topColor', 'bottomColor', 'shoesColor']) if (r.colors[k] != null) c[k] = r.colors[k];
  if (dress && r.colors.bottomColor != null) c.topColor = r.colors.topColor;
  return c;
}

/** 화면에 적을 한 줄 — '머리 긴 생머리 · 상의 맨투맨 · 하의 청바지 · 신발 운동화' */
export const summary = c => [['머리', HAIRS[c.hair]], ['상의', TOPS[c.top]], ['하의', BOTTOMS[c.bottom]], ['신발', SHOES[c.shoes]]]
  .filter(([, v]) => v && v !== '없음').map(([k, v]) => `${k} <b>${v}</b>`).join(' · ');
