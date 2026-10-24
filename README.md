# 작업 공간 4개

용도별로 네 개의 공간을 폴더로 나눈 저장소입니다.

GitHub Pages는 브랜치 **하나**만 서빙하므로, 공간을 브랜치로 쪼개면 하나만 열립니다.
폴더로 나누면 폴더 이름이 그대로 주소가 되어 네 공간이 전부 무료로 열립니다.

## 공간

| | 폴더 | 용도 |
| --- | --- | --- |
| 1 | `design/` | **아토믹 디자인** — 공통 토큰·컴포넌트를 눈으로 확인하는 레퍼런스 |
| 2 | `my/` | **MY** — 개인용 도구와 기록 |
| 3 | `shared/` | **공용** — 여러 사람이 같이 쓰는 공유 서비스 |
| 4 | `etc/` | **기타** — 실험, 잠깐 쓰고 버릴 것 |

## 구조

```
index.html          허브 — 네 공간으로 가는 링크
assets/base.css     네 공간이 함께 쓰는 토큰과 원자 (단일 출처)
design/index.html   1 · 아토믹 디자인 레퍼런스
my/index.html       2 · 개인
shared/index.html   3 · 공용
etc/index.html      4 · 기타
.nojekyll           Pages의 Jekyll 처리를 끔
README.md
```

## 공통 스타일을 고치는 순서

모양은 `assets/base.css` 한 곳에만 있습니다. 공간 페이지는 강조색(`--accent`)만 덮어씁니다.

1. `assets/base.css` 를 고친다
2. `design/` 을 열어 토큰과 조각이 의도대로 보이는지 확인한다 (라이트/다크 토글 있음)
3. 새 조각을 만들었으면 `design/index.html` 에 한 칸 추가해 둔다

`design/` 의 색 견본은 실제 적용된 CSS 변수 값을 읽어 그리므로, base.css를 고치면 따라 바뀝니다.

### base.css 가 제공하는 것

- **토큰** — `--bg` `--surface` `--surface-2` `--ink` `--muted` `--faint` `--line` `--accent` `--accent-ink` `--accent-soft` `--radius` `--shadow`
- **원자** — `.btn` (`.primary` `.ghost` `.sm`), `.pill` + `.dot` (`.live` `.warn` `.off`), `.field`, `kbd`, 포커스 링
- **분자** — `.card`, `.empty`, `.panel`, `.stack`, `.row-inline`
- **유기체** — `.wrap`, `header`, `.spaces`, `footer`, `.back`

라이트/다크 자동 전환(`prefers-color-scheme`), `data-theme` 수동 지정,
노치 대응(`safe-area-inset`), `prefers-reduced-motion` 존중이 모두 들어 있습니다.

## 주소

Pages를 켜면 이렇게 열립니다.

| 공간 | 주소 |
| --- | --- |
| 허브 | `https://choopss93.github.io/ClaudeCode_Mobile_G/` |
| 1 아토믹 디자인 | `.../ClaudeCode_Mobile_G/design/` |
| 2 MY | `.../ClaudeCode_Mobile_G/my/` |
| 3 공용 | `.../ClaudeCode_Mobile_G/shared/` |
| 4 기타 | `.../ClaudeCode_Mobile_G/etc/` |

## Pages 켜는 방법

저장소 **Settings → Pages** 에서

1. Source: `Deploy from a branch`
2. Branch: `main` / 폴더는 `/ (root)`
3. Save

1~2분 뒤 위 주소로 열립니다.

> Pages로 올린 페이지는 주소를 아는 누구나 볼 수 있습니다.
> `my/` 도 비공개가 아니므로, 비밀로 둘 내용은 올리지 마세요.

## 공간 이름 바꾸기

폴더 이름이 주소이므로, 폴더를 바꾸면 주소도 바뀝니다.
폴더 이름을 고치고 `index.html`(허브)의 링크 네 개만 같이 맞춰 주면 됩니다.
