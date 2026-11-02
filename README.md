# 작업 공간 4개

용도별로 네 개의 공간을 폴더로 나눈 저장소입니다.

GitHub Pages는 브랜치 **하나**만 서빙하므로, 공간을 브랜치로 쪼개면 하나만 열립니다.
폴더로 나누면 폴더 이름이 그대로 주소가 되어 네 공간이 전부 무료로 열립니다.

## 공간

| | 폴더 | 용도 |
| --- | --- | --- |
| 1 | `design/` | **아토믹 디자인** — 공통 토큰·컴포넌트를 눈으로 확인하는 레퍼런스 |
| 2 | `my/` | **MY** — 개인. 안에 `admin/`(어드민) · `front/`(프론트) |
| 3 | `shared/` | **공용** — 여러 사람이 같이 쓰는 공유 서비스. 안에 `game/`(게임) |
| 4 | `etc/` | **기타** — 실험, 잠깐 쓰고 버릴 것 |

## 구조

```
index.html          허브 — 네 공간으로 가는 링크
assets/base.css     네 공간이 함께 쓰는 토큰과 원자 (단일 출처)
design/index.html   1 · 아토믹 디자인 레퍼런스
design/refs/        1 · 확인하고 작업할 원본 자료
my/index.html       2 · 개인 (허브)
my/admin/index.html 2 · 어드민 — 데이터를 넣고 고치는 쪽
my/front/index.html 2 · 프론트 — 사용자에게 보이는 쪽
shared/index.html   3 · 공용 (허브)
shared/game/index.html        3 · 게임 (목록)
shared/game/world/            3 · 무지개 정원 — 강아지와 거니는 힐링 게임
  index.html                    시작 화면, UI
  manifest.webmanifest          홈 화면에 추가할 때 쓰는 정보
  icon-180.png, icon-512.png    홈 화면 아이콘
  js/look.js                    그림체 (토온 음영 · 바닥 그림자 · 색)
  js/world.js                   들판 (고정 씨앗 — 모두 같은 들판)
  js/actor.js                   캐릭터와 강아지
  js/controls.js                네 방향 점프 입력 · 카메라
  js/net.js                     접속 자리 (지금은 손님 둘만)
  js/main.js                    루프와 조립
  js/vendor/                    Three.js r160 (MIT)
etc/index.html      4 · 기타
.nojekyll           Pages의 Jekyll 처리를 끔
README.md
CLAUDE.md           작업 규칙
```

## 1번은 "확인하고 작업하는" 자리

저장해 두고 확인한 뒤 작업할 자료는 1번(`design/`)에 둡니다.
원본 자료는 `design/refs/`, 레퍼런스 페이지는 `design/index.html` 입니다.
자세한 작업 규칙은 [CLAUDE.md](CLAUDE.md) 에 있습니다.

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
| 2 어드민 | `.../ClaudeCode_Mobile_G/my/admin/` |
| 2 프론트 | `.../ClaudeCode_Mobile_G/my/front/` |
| 3 공용 | `.../ClaudeCode_Mobile_G/shared/` |
| 3 게임 | `.../ClaudeCode_Mobile_G/shared/game/` |
| 3 무지개 정원 | `.../ClaudeCode_Mobile_G/shared/game/world/` |
| 4 기타 | `.../ClaudeCode_Mobile_G/etc/` |

## Pages 켜는 방법

저장소 **Settings → Pages** 에서

1. Source: `Deploy from a branch`
2. Branch: `main` / 폴더는 `/ (root)`
3. Save

1~2분 뒤 위 주소로 열립니다.

### 열리지 않고 404 가 뜬다면

**Pages 가 보는 브랜치부터 확인하세요.** 이 저장소는 한동안 `gh-pages`
브랜치를 서빙하도록 설정돼 있었습니다. 그래서 `main` 에 아무리 올려도
공개되지 않고 404 가 났습니다.

- 저장소 **Actions** 탭 → `pages build and deployment` 실행 목록을 보고,
  마지막 배포가 언제인지와 어느 브랜치였는지 확인합니다
- 내가 올린 뒤로 배포가 없거나 다른 브랜치라면 그게 원인입니다
- **Settings → Pages → Branch** 를 `main` / `/ (root)` 로 바꿔 주세요

브랜치를 바꾼 뒤에도 폰에서 404 가 남아 있으면 브라우저가 앞서 받은
404 를 기억하고 있는 것입니다. 사파리는 주소창을 길게 눌러 새로고침하거나
**개인정보 보호 탭**에서 열면 새로 받아 옵니다.

> Pages로 올린 페이지는 주소를 아는 누구나 볼 수 있습니다.
> `my/` 도 비공개가 아니므로, 비밀로 둘 내용은 올리지 마세요.

## 무지개 정원

`shared/game/world/` — 강아지와 함께 정원을 거니는 힐링 게임입니다.
(폴더 이름 `world/` 는 이름을 정하기 전에 만든 것이라 주소와 다릅니다.
바꾸면 주소도 바뀝니다.)

- 시작할 때 **본인 이름**과 **강아지 이름**을 적습니다. 본인 이름이
  캐릭터 이름이 되고, 둘 다 이 기기에 저장돼 다음에 다시 채워집니다.
- **둥근 조이스틱**으로 어느 방향이든 걸어다닙니다. 화면 왼쪽 아무 데나
  손가락을 대면 그 자리에 조이스틱이 생기고, 민 방향으로 민 만큼 빠르게
  걷습니다. 오른쪽을 끌면 카메라가 돕니다.
- 강아지는 멀어지면 깡충깡충 따라옵니다.
- 적은 말이 머리 위 말풍선으로 뜹니다.
- 캐릭터는 머리가 크고 몸이 작습니다 — 얼굴 지름이 몸 높이의 두 배
  (`actor.js` 의 `HEAD_R` 과 `BODY_H`).
- 배경은 초록 들판에 들꽃이 **뭉쳐서** 핀 모습입니다. 고르게 흩뿌리면
  색종이를 뿌린 것처럼 보여, 뭉치 56 군데를 잡고 그 안에 모아 심습니다.
  한두 송이만 선 자리, 작은 뭉치, 큰 뭉치, 한 무더기가 섞이고 사이사이는
  그냥 풀밭입니다. 뭉치마다 빛깔과 키대를 따로 뽑고, 그 안에서도 키가
  들쭉날쭉합니다.
- 들꽃과 풀포기는 **인스턴스로 묶어** 그리기 세 번이면 끝납니다 —
  하나씩 그리면 폰이 버팁니다.
- 들꽃과 풀은 **바람에 살랑입니다.** 천 송이가 넘어 매 프레임 자리를
  다시 계산할 수 없으므로, 자리는 그대로 두고 그래픽카드가 그리면서
  휘게 합니다 (`look.js` 의 `swayed`). CPU 는 시간 하나만 올려 줍니다.
  흔들림을 싫어하는 설정(`prefers-reduced-motion`)이면 멈춥니다.
- 들판은 울타리 너머로도 이어집니다. 거기서 끊으면 정원이 하늘에 뜬
  접시처럼 보입니다. 멀리는 안개가 하늘빛으로 지웁니다.
- 그림체는 토온 음영에 발밑 그림자 하나. 그림자 맵을 쓰지 않아 폰에서도
  가볍습니다.

### 폰에서 하는 게임입니다

- 세로 화면이 기본입니다. 세로일 때 시야를 넓혀(FOV 62) 앞이 보이게 합니다.
- 화면 비율은 **캔버스가 실제로 차지한 크기**를 재서 맞춥니다. `innerHeight`
  로 재면 아이폰 사파리에서 주소창이 움직이는 동안 화면이 늘어나 보입니다.
- 화면 왼쪽을 밀어 걷고, 오른쪽을 끌어 둘러봅니다.
- 주소창이 접히고 펴져도 잘리지 않게 `100dvh` 를 씁니다.
- 말을 적을 때 **소프트 키보드가 올라오면 대화창이 그 위로 올라오고**,
  방향 패드는 잠시 비켜섭니다 (`visualViewport` 로 가려진 높이를 잽니다).
- 홈 화면에 추가하면 주소창 없이 앱처럼 열립니다
  (`manifest.webmanifest`, `icon-180.png`, `icon-512.png`).
- 그리는 밀도는 폰에서 1.75 배로 제한합니다.

### 폰에서 여는 법

1. 폰 브라우저에서 `https://choopss93.github.io/ClaudeCode_Mobile_G/shared/game/world/` 를 엽니다
2. **아이폰** — 공유 버튼 → `홈 화면에 추가`
   **안드로이드** — 메뉴 → `홈 화면에 추가` 또는 `앱 설치`
3. 홈 화면 아이콘으로 열면 주소창 없이 전체 화면으로 뜹니다

**지금은 혼자 플레이입니다.** GitHub Pages 는 정적 파일만 서빙하므로
플레이어끼리 위치와 말을 주고받으려면 실시간 연결을 바깥에서 빌려와야
합니다. 그 자리는 `js/net.js` 에 미리 뚫어 두었습니다 — 임시 캐릭터
세 명이 `onJoin` / `onState` / `onSay` 라는, 진짜 접속자가 쓰게 될
통로로 들어옵니다.

접속을 붙일 때는 `createLocalNet` 과 같은 모양의 객체를 하나 더 만들어
`js/main.js` 에서 바꿔 끼우면 됩니다. 게임 쪽 코드는 건드리지 않습니다.

```js
createXxxNet({ world, handlers }) => {
  mode,                    // 화면에 표시할 접속 상태
  sendState({x, z, ry}),   // 내 위치를 남에게 알림
  say(text),               // 내 말풍선을 남에게 알림
  update(dt)
}
```

Three.js 는 CDN 대신 `js/vendor/` 에 넣었습니다. 바깥 서비스가 멈춰도
게임이 열리고, 인터넷 없이 로컬에서도 그대로 돕니다.

## 공간 이름 바꾸기

폴더 이름이 주소이므로, 폴더를 바꾸면 주소도 바뀝니다.
폴더 이름을 고치고 `index.html`(허브)의 링크 네 개만 같이 맞춰 주면 됩니다.
