/*
 * 잠금 — 사이트 전체 앞에 서는 문지기. Cloudflare 의 Worker(`worker.js`)와
 * Pages(`functions/_middleware.js`) 가 둘 다 이 한 곳을 부른다.
 *
 * 공개하는 것은 3번 공간(`/shared/`)과 그 페이지들이 쓰는 공용 스타일
 * (`/assets/base.css`) 뿐이다. 나머지 — 허브(`/`) · 1번 `design/` ·
 * 2번 `my/` · 4번 `etc/` · 작업 규칙 같은 파일 — 는 비밀번호를 대야 내준다.
 *
 * 화면에서 숨기는 것이 아니라 **서버가 파일을 내주지 않는다.** 그래서
 * 주소를 알아도, 파일 이름을 짐작해도 열리지 않는다.
 *
 * 비밀번호는 여기에 적지 않는다. Cloudflare 의 프로젝트 설정 →
 * 변수와 비밀(Variables and Secrets) 에 `SITE_PASSWORD` 로 넣는다.
 * 비워 두면 열어 주지 않고 잠근 채로 둔다 — 실수로 다 열리는 것보다 낫다.
 *
 * 브라우저가 띄우는 기본 로그인 창(Basic 인증)을 쓴다. 이름 칸은 아무거나
 * 적어도 되고 비밀번호만 본다. 한 번 넣으면 그 브라우저를 닫을 때까지 기억한다.
 */

const PUBLIC = [/^\/shared(\/|$)/, /^\/assets\/base\.css$/];

function isPublic(path){
  // 거꾸로 올라가거나 인코딩한 빗금으로 빠져나가려는 주소는 공개로 치지 않는다
  if (/%2f|%5c|\.\.|\\/i.test(path)) return false;
  return PUBLIC.some(re => re.test(path));
}

async function same(a, b){
  // 걸린 시간으로 비밀번호를 짐작하지 못하게, 해시끼리 끝까지 견준다
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map(s => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

function locked(text, status = 401){
  return new Response(text, {
    status,
    headers: {
      'WWW-Authenticate': 'Basic realm="private", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}

/**
 * guard(request, env, serve)
 *   serve() — 통과했을 때 실제 파일을 내주는 함수 (Worker 는 env.ASSETS.fetch,
 *             Pages 는 next). 둘의 차이는 여기까지만 안다.
 */
export async function guard(request, env, serve){
  const path = new URL(request.url).pathname;
  if (isPublic(path)) return serve();

  const secret = env && env.SITE_PASSWORD;
  if (!secret) return locked('잠겨 있어요 (비밀번호가 아직 설정되지 않았어요)', 503);

  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Basic ')){
    let pass = '';
    try {
      const raw = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), c => c.charCodeAt(0)));
      pass = raw.slice(raw.indexOf(':') + 1);
    } catch (_){}
    if (pass && await same(pass, secret)){
      const res = await serve();
      // 잠긴 페이지는 캐시에 남기지 않고 검색에도 올리지 않는다
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, no-store');
      out.headers.set('X-Robots-Tag', 'noindex');
      return out;
    }
  }
  return locked('비밀번호가 필요해요');
}
