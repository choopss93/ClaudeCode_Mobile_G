# 작업 공간 4개

한 브랜치 안에서 공간 네 개를 폴더로 나눈 구조입니다.
GitHub Pages는 브랜치 **하나**만 서빙하므로, 공간을 브랜치로 쪼개면 하나만 열립니다.
폴더로 나누면 폴더 이름이 그대로 주소가 되어 네 공간이 전부 무료로 열립니다.

## 구조

```
index.html          허브 — 공간 4개로 가는 링크
assets/base.css     네 공간이 함께 쓰는 공통 스타일
space-1/index.html  공간 1 (초록)
space-2/index.html  공간 2 (파랑)
space-3/index.html  공간 3 (금색)
space-4/index.html  공간 4 (자주)
.nojekyll           Pages의 Jekyll 처리를 끔
```

## 주소

Pages를 켜면 이렇게 열립니다.

| 공간 | 주소 |
| --- | --- |
| 허브 | `https://choopss93.github.io/ClaudeCode_Mobile_G/` |
| 공간 1 | `.../ClaudeCode_Mobile_G/space-1/` |
| 공간 2 | `.../ClaudeCode_Mobile_G/space-2/` |
| 공간 3 | `.../ClaudeCode_Mobile_G/space-3/` |
| 공간 4 | `.../ClaudeCode_Mobile_G/space-4/` |

## Pages 켜는 방법

저장소 **Settings → Pages** 에서

1. Source: `Deploy from a branch`
2. Branch: `main` / 폴더는 `/ (root)`
3. Save

1~2분 뒤 위 주소로 열립니다.

## 공간 이름 바꾸기

폴더 이름이 주소이므로, 폴더를 바꾸면 주소도 바뀝니다.
폴더 이름을 고치고 `index.html`(허브)의 링크 네 개만 같이 맞춰 주면 됩니다.
