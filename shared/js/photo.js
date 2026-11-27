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
const isSkin = p => p[0] > 90 && p[1] / p[0] > 0.55 && p[1] / p[0] < 0.94 && p[2] / p[0] > 0.45 && p[2] / p[0] < 0.86 && p[1] >= p[2] * 0.95
  && p[1] - p[2] < (p[0] - p[1]) * 2.2 + 20;   // 노랑 · 주황 옷을 살빛으로 읽지 않게 비율로

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

  // 바탕 — **줄마다** 양 끝 네 칸의 중앙값. 위아래로 색이 바뀌는 바탕 · 벽과 바닥 색이 다른 바탕도 바탕으로 본다
  // (한 색으로 보던 때는 바닥 · 그러데이션이 통째로 사람으로 잡혔다 — 사용자가 올린 그림들)
  const bgRow = [];
  for (let j = 0; j < H; j++){
    const R = [], G = [], B = [];
    for (let jj = Math.max(0, j - 2); jj <= Math.min(H - 1, j + 2); jj++)
      for (const i of [0, 1, 2, 3, W - 4, W - 3, W - 2, W - 1]){ const p = px(i, jj); R.push(p[0]); G.push(p[1]); B.push(p[2]); }
    bgRow.push([med(R), med(G), med(B)]);
  }
  const off = (p, j) => Math.abs(p[0] - bgRow[j][0]) + Math.abs(p[1] - bgRow[j][1]) + Math.abs(p[2] - bgRow[j][2]);
  const raw = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) raw[j * W + i] = off(px(i, j), j) > 45 ? 1 : 0;

  // 가장 큰 덩어리 하나만 사람으로 — 한 장에 여러 포즈가 있거나 글자 · 작은 조각이 있어도 주인공 하나를 고른다
  const lab = new Int32Array(W * H), sizes = [0];
  for (let s0 = 0; s0 < W * H; s0++){
    if (!raw[s0] || lab[s0]) continue;
    const id = sizes.length; let n = 0; const st = [s0]; lab[s0] = id;
    while (st.length){
      const q = st.pop(); n++;
      const qi = q % W, qj = (q / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
        const ni = qi + di, nj = qj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nq = nj * W + ni;
        if (raw[nq] && !lab[nq]){ lab[nq] = id; st.push(nq); }
      }
    }
    sizes.push(n);
  }
  let best = 0; for (let k2 = 1; k2 < sizes.length; k2++) if (sizes[k2] > (sizes[best] || 0)) best = k2;
  const mask = new Uint8Array(W * H);
  if (best) for (let q = 0; q < W * H; q++) mask[q] = lab[q] === best ? 1 : 0;
  const fg = (i, j) => i >= 0 && j >= 0 && i < W && j < H && mask[j * W + i] === 1;

  // 사람 상자
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (mask[j * W + i]){ if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  const found = best > 0 && sizes[best] > W * H * 0.03 && y1 - y0 > H * 0.3;
  if (!found){ y0 = 0; y1 = H - 1; x0 = Math.round(W * 0.2); x1 = Math.round(W * 0.8); mask.fill(1); }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cx = Math.round((x0 + x1) / 2);
  const clampJ = j => Math.max(0, Math.min(H - 1, Math.round(j)));

  // 자리 안의 점들 — 줄은 절대 위치(ja ~ jb), 칸은 [a, b] 열 범위
  function pts(ja, jb, a, b){
    const out = [];
    for (let j = clampJ(ja); j <= clampJ(jb); j++)
      for (let i = Math.max(0, Math.round(a)); i <= Math.min(W - 1, Math.round(b)); i++)
        if (fg(i, j)) out.push(px(i, j));
    return out;
  }
  const medOf = (ps, keep = () => true) => {
    const f = ps.filter(keep);
    return f.length >= 4 ? (med(f.map(p => p[0])) << 16) | (med(f.map(p => p[1])) << 8) | med(f.map(p => p[2])) : null;
  };
  const share = (ps, h) => ps.length ? ps.filter(p => dist(p, h) < 75).length / ps.length : 0;
  const skinShare = ps => ps.length ? ps.filter(isSkin).length / ps.length : 0;
  const runAt = j => { j = clampJ(j); let a = cx, b = cx; if (!fg(a, j)){ for (let d2 = 1; d2 < bw; d2++){ if (fg(cx - d2, j)){ a = b = cx - d2; break; } if (fg(cx + d2, j)){ a = b = cx + d2; break; } } }
    while (fg(a - 1, j)) a--; while (fg(b + 1, j)) b++; return [a, b]; };

  // 얼굴 — 위쪽 65% 안에서 살빛이 가장 많은 줄을 찾아 위아래로 넓힌다. 턱이 몸의 기준이다
  // (사람 비율이면 턱이 13%쯤, 아기 비율 그림이면 40% 가까이 — 고정 비율로 나누면 얼굴을 옷으로 읽는다)
  const skinRow1 = j => { let n = 0; for (let i = x0; i <= x1; i++) if (fg(i, j) && isSkin(px(i, j))) n++; return n; };
  // 세 줄의 가장 작은 값 — 노랑과 보라 경계처럼 두 색이 섞인 한 줄이 살빛으로 읽히는 것을 걸러 낸다
  const skinRow = j => Math.min(skinRow1(Math.max(y0, j - 1)), skinRow1(j), skinRow1(Math.min(y1, j + 1)));
  let jm = -1, mx = 0;
  for (let j = y0; j <= y0 + bh * 0.65; j++){ const n = skinRow(j); if (n > mx){ mx = n; jm = j; } }
  let faceTop, chin;
  if (mx >= 3){
    faceTop = jm; while (faceTop > y0 && skinRow(faceTop - 1) > mx * 0.3) faceTop--;
    chin = jm; while (chin < y1 && skinRow(chin + 1) > mx * 0.3) chin++;
  } else { faceTop = y0 + bh * 0.06; chin = y0 + bh * 0.15; }   // 얼굴이 안 보이면(뒷모습) 사람 비율로
  const L = Math.max(4, y1 - chin), Z = t => chin + L * t;
  const jf = (faceTop + chin) / 2, [ha, hb] = runAt(jf), hw = hb - ha + 1;

  const colors = { hairColor: null, skin: medOf(pts(faceTop, chin, ha + hw * 0.3, hb - hw * 0.3), isSkin),
                   topColor: null, bottomColor: null, shoesColor: null };
  const notSkin = p => !isSkin(p);

  // 몸통 — 턱 밑 6~38%, 그 줄의 몸 폭 가운데
  const [ba, bb] = runAt(Z(0.22)), bwid = bb - ba + 1;
  const mid = pts(Z(0.08), Z(0.36), ba + bwid * 0.45, bb - bwid * 0.45);
  const sides = [...pts(Z(0.08), Z(0.36), ba + bwid * 0.25, ba + bwid * 0.37), ...pts(Z(0.08), Z(0.36), bb - bwid * 0.37, bb - bwid * 0.25)];
  const midC = medOf(mid, notSkin), sideC = medOf(sides, notSkin);
  const open = midC != null && sideC != null && dist(rgb(midC), sideC) > 120;     // 앞이 열린 겉옷
  colors.topColor = open ? sideC : medOf(pts(Z(0.06), Z(0.38), ba + bwid * 0.25, bb - bwid * 0.25), notSkin);
  if (open) colors.innerColor = midC;

  // 머리 위 · 얼굴 옆 — 머리칼 · 모자 · 후드
  const above = faceTop - y0;
  const topBand = medOf(pts(y0, y0 + Math.max(1, above * 0.35), ha + hw * 0.2, hb - hw * 0.2), notSkin);
  const sideHairC = medOf([...pts(faceTop, jf, ha, ha + hw * 0.18), ...pts(faceTop, jf, hb - hw * 0.18, hb)], notSkin);
  const lowBand = medOf(pts(y0 + above * 0.55, faceTop, ha + hw * 0.2, hb - hw * 0.2), notSkin);
  const lowHair = [...pts(chin + 1, Z(0.16), ha, ha + hw * 0.22), ...pts(chin + 1, Z(0.16), hb - hw * 0.22, hb)];
  // 후드는 턱 밑 머리 폭 가장자리까지 상의 색으로 흘러내린다 — 검은 머리 + 검은 옷을 후드로 읽지 않게
  const drape = colors.topColor != null && share(lowHair, colors.topColor) > 0.35;
  const hood = drape && topBand != null && colors.topColor != null && dist(rgb(topBand), colors.topColor) < 85
            && sideHairC != null && dist(rgb(sideHairC), colors.topColor) < 85;   // 머리 위 · 얼굴 옆이 모두 상의 색 = 후드를 썼다
  let hat = null;
  // 머리칼은 **얼굴 위** 띠에서 — 얼굴 옆은 아기 비율 그림의 큰 눈이 잡혀 검게 읽혔다 (사용자가 올린 흰머리 그림)
  colors.hairColor = lowBand ?? topBand ?? sideHairC;
  if (hood){
    // 후드 속 앞머리 — 이마 자리의 살빛도 후드 색도 아닌 것
    colors.hairColor = medOf(pts(faceTop, faceTop + (chin - faceTop) * 0.3, ha + hw * 0.25, hb - hw * 0.25),
                             p => !isSkin(p) && dist(p, colors.topColor) > 60) ?? 0x241414;
  } else if (topBand != null && lowBand != null && dist(rgb(topBand), lowBand) > 90 && sideHairC != null && dist(rgb(sideHairC), lowBand) < 75){
    hat = topBand;   // 머리 꼭대기만 다른 색이고 이마 위 · 얼굴 옆은 같은 머리칼 = 모자
  }

  // 머리 길이 — 턱 밑 어깨 자리의 머리 폭 가장자리에 머리칼 색이 이어지나
  const same = colors.hairColor != null && colors.topColor != null && dist(rgb(colors.hairColor), colors.topColor) < 60 ? 0.4 : 1;
  const sideHair = [...pts(jf, chin, ha, ha + hw * 0.2), ...pts(jf, chin, hb - hw * 0.2, hb)];
  const hsLow = share(lowHair, colors.hairColor) * same, hs = share(sideHair, colors.hairColor) * same;
  const bald = !hood && colors.hairColor != null && colors.skin != null && dist(rgb(colors.hairColor), colors.skin) < 50;
  const hair = hood ? 'short' : bald ? 'none' : hsLow > 0.3 ? 'long' : hs > 0.35 ? 'mid' : 'short';

  // 소매 — 몸 폭 바깥쪽 띠 (팔)
  const armUp = [...pts(Z(0.06), Z(0.2), ba, ba + bwid * 0.14), ...pts(Z(0.06), Z(0.2), bb - bwid * 0.14, bb)];
  const armLo = [...pts(Z(0.24), Z(0.38), ba, ba + bwid * 0.14), ...pts(Z(0.24), Z(0.38), bb - bwid * 0.14, bb)];
  const upTop = share(armUp, colors.topColor), loTop = share(armLo, colors.topColor);
  const upSkin = skinShare(armUp), loSkin = skinShare(armLo);
  const sleeve = armUp.length < 6 && armLo.length < 6 ? 'short'
    : upSkin > upTop && upSkin > 0.3 ? 'none'
    : loTop >= loSkin || loTop > 0.35 ? 'long' : 'short';

  // 하의 · 다리 사이 · 종아리 · 신발
  /* 하의 색 — 몸통 바로 밑(45~62%)의 색. 그것이 상의와 같으면(긴 스웨터) 더 아래에서 상의 색도 살빛도 아닌 것을 찾되,
     45~80% 안에 15% 넘게 있을 때만 — 위아래 같은 검정 옷이면 신발 색을 하의로 잡았다 (후드 그림) */
  const nearC = medOf(pts(Z(0.45), Z(0.62), x0 + bw * 0.3, x1 - bw * 0.3), notSkin);
  colors.bottomColor = nearC;
  if (nearC != null && colors.topColor != null && dist(rgb(nearC), colors.topColor) < 60){
    const other = medOf(pts(Z(0.45), Z(0.85), x0 + bw * 0.25, x1 - bw * 0.25), p => !isSkin(p) && dist(p, colors.topColor) > 60);
    if (other != null && share(pts(Z(0.45), Z(0.8), x0 + bw * 0.25, x1 - bw * 0.25), other) > 0.15) colors.bottomColor = other;
  }
  /* 바지인가 치마인가 — 몸 가운데 세로줄이 바탕인데 양옆 가장 가까운 점이 둘 다 하의 색인 줄이 있으면 두 다리로 갈라진 바지 ·
     반바지. 치마는 하의 색 자리에서 가운데가 막혀 있고, 그 밑의 다리는 살빛이다 */
  let split = 0;
  for (let j = clampJ(Z(0.45)); j <= clampJ(Z(0.9)); j++){
    const [ra, rb] = runAt(j), c2 = cx;
    if (fg(c2, j)) continue;
    let l = c2, r = c2; while (l > x0 && !fg(l, j)) l--; while (r < x1 && !fg(r, j)) r++;
    l = Math.max(x0, l - 1); r = Math.min(x1, r + 1);     // 한 칸 더 안쪽 — 가장자리 점은 바탕과 섞인 색이다
    if (fg(l, j) && fg(r, j) && dist(px(l, j), colors.bottomColor) < 75 && dist(px(r, j), colors.bottomColor) < 75) split++;
  }
  const gap = split;
  /* 짧은가 — 하의 색이 끝나는 줄(밑단)이 몸 아래쪽 어디쯤인가. 종아리 띠를 고정 비율로 보던 때는 아기 비율 그림의
     큰 신발이 종아리 자리에 걸렸다 */
  let hem = Z(0.45), miss = 0, seen = false;
  for (let j = clampJ(Z(0.45)); j <= y1; j++){        // 위에서부터 하의 색이 이어지다 두 줄 넘게 끊기는 곳 = 밑단
    const row = pts(j, j, x0 + bw * 0.2, x1 - bw * 0.2);
    if (row.length && share(row, colors.bottomColor) > 0.35){ hem = j; seen = true; miss = 0; }
    else if (seen && ++miss > 2) break;
  }
  const short = hem < Z(0.8);
  const wideHem = (() => { const [a2, b2] = runAt(Z(0.62)); return (b2 - a2 + 1) / bw > 0.55; })();
  // 치마는 밑단이 엉덩이보다 넓게 퍼진다 — 다리 사이가 안 보이는 반바지를 치마로 읽지 않게
  const [fa, fb] = runAt(hem - 1), [pa, pb] = runAt(Z(0.45));
  const flare = (fb - fa + 1) > (pb - pa + 1) * 1.12;
  const legs = gap >= 2 ? (short ? 'shorts' : 'pants') : short ? (flare ? 'skirt' : 'shorts') : (wideHem && flare ? 'longskirt' : 'pants');
  colors.shoesColor = medOf(pts(Z(0.93), y1, x0 + bw * 0.15, x1 - bw * 0.15));
  if (hat != null) colors.hatColor = hat;
  const sameColor = colors.topColor != null && colors.bottomColor != null && dist(rgb(colors.topColor), colors.bottomColor) < 60;

  const shoeLight = colors.shoesColor != null && rgb(colors.shoesColor).reduce((a3, b3) => a3 + b3) / 3 > 170;
  const jeans = colors.bottomColor != null && (() => { const [r, g, b] = rgb(colors.bottomColor); return b > r + 15 && b > 60 && b < 200; })();

  return {
    img: cv, box: [x0, y0, x1, y1], found, mask,
    colors,
    shape: { hair, hood, hat: hat != null, sleeve, open, legs, dress: sameColor && (legs === 'skirt' || legs === 'longskirt'), shoeLight, jeans,
             girlish: hair === 'long' }   // 성별은 긴 머리로만 어림한다 — 통 넓은 반바지를 치마로 읽어 남자아이를 여자로 본 적이 있다 (남자면 치마 자리가 반바지로)
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
  c.top = dress ? okFor(g, 'top', s.sleeve === 'none' ? 33 : 16)                     // 원피스 · 나시 원피스
        : s.hood ? okFor(g, 'top', s.open ? 29 : 3)                                   // 후드를 쓴 사람 — 후디 · 집업 후디
        : okFor(g, 'top', PICK.top[s.open ? 'open' : s.sleeve][gi]);
  if (s.hat && r.colors.hatColor != null){ c.hat = okFor(g, 'hat', 2); c.hatColor = r.colors.hatColor; }   // 머리 위만 다른 색 — 캡
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
