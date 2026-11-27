/* 사진으로 캐릭터 만들기 (사용자 요청) — 서버도 그림 알아보기 모델도 없으므로 **색만** 뽑는다.
   온몸이 나온 사진을 작게 줄여, 가장자리 색을 바탕으로 보고 그와 다른 자리(사람)의 상자를 찾은 뒤
   그 상자의 높이 비율로 머리칼 · 얼굴 · 상의 · 하의 · 신발 자리를 나눠 가운데 색(중앙값)을 잰다.
   사진은 이 기기 안에서만 읽고 어디에도 보내거나 남기지 않는다. 종류(머리 모양 · 옷 모양)는 꾸미기에서 고른다. */
import { OPTIONS } from './character.js?v=c9';

const N = 160;                                   // 긴 변을 이만큼으로 줄여 잰다

function loadImage(file){
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('사진을 읽지 못했어요.')); };
    img.src = url;
  });
}

const med = a => { if (!a.length) return null; a.sort((x, y) => x - y); return a[a.length >> 1]; };
const toHex = ([r, g, b]) => (r << 16) | (g << 8) | b;

/** 사진 파일 → { colors: { hairColor, skin, topColor, bottomColor, shoesColor }, found } */
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
  for (let i = 0; i < W; i++) for (const j of [0, 1, H - 2, H - 1]){ const p = px(i, j); er.push(p[0]); eg.push(p[1]); eb.push(p[2]); }
  for (let j = 0; j < H; j++) for (const i of [0, 1, W - 2, W - 1]){ const p = px(i, j); er.push(p[0]); eg.push(p[1]); eb.push(p[2]); }
  const bg = [med(er), med(eg), med(eb)];
  const fg = (i, j) => { const p = px(i, j); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 70; };

  // 사람 상자 — 전경 점이 줄 · 칸마다 조금이라도 모인 범위
  const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (fg(i, j)){ rows[j]++; cols[i]++; }
  const span = (arr, need) => { let a = arr.findIndex(v => v >= need), b = arr.length - 1; while (b > a && arr[b] < need) b--; return a < 0 ? null : [a, b]; };
  let ys = span(rows, Math.max(2, W * 0.04)), xs = span(cols, Math.max(2, H * 0.04));
  const found = !!(ys && xs && ys[1] - ys[0] > H * 0.35 && xs[1] - xs[0] > W * 0.12);
  if (!found){ ys = [0, H - 1]; xs = [Math.round(W * 0.2), Math.round(W * 0.8)]; }   // 못 찾으면 가운데를 사람으로 본다
  const [y0, y1] = ys, [x0, x1] = xs, bh = y1 - y0 + 1, bw = x1 - x0 + 1;

  // 자리마다 전경 점의 중앙값 — [위 비율, 아래 비율, 가로 가운데 폭 비율]
  function zone(t, b, wide, skinOnly){
    const R = [], G = [], B = [];
    const ja = Math.round(y0 + bh * t), jb = Math.round(y0 + bh * b);
    const ia = Math.round(x0 + bw * (0.5 - wide / 2)), ib = Math.round(x0 + bw * (0.5 + wide / 2));
    for (let j = ja; j <= jb && j < H; j++) for (let i = ia; i <= ib && i < W; i++){
      if (found && !fg(i, j)) continue;
      const p = px(i, j);
      if (skinOnly && !(p[0] > 90 && p[0] >= p[1] && p[1] >= p[2] * 0.85 && p[0] - p[2] > 15)) continue;
      R.push(p[0]); G.push(p[1]); B.push(p[2]);
    }
    return R.length >= 4 ? toHex([med(R), med(G), med(B)]) : null;
  }
  const colors = {
    hairColor: zone(0, 0.06, 0.5),
    skin: zone(0.06, 0.15, 0.4, true),
    topColor: zone(0.24, 0.42, 0.45),
    bottomColor: zone(0.56, 0.8, 0.4),
    shoesColor: zone(0.94, 1, 0.6)
  };
  return { colors, found };
}

/** 뽑은 색을 캐릭터에 입힌다. 종류가 비어 있으면 그 성별의 첫 종류를 골라 둔다 (색이 보이도록) */
export function applyPhoto(base, colors){
  const c = { ...base };
  const o = OPTIONS[c.gender] || OPTIONS[0];
  for (const k of ['hair', 'top', 'bottom', 'shoes']) if (!c[k]) c[k] = o[k][1];
  for (const k in colors) if (colors[k] != null) c[k] = colors[k];
  return c;
}
