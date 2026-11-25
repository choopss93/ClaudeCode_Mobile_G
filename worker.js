// Cloudflare Worker 로 올릴 때의 문지기 (지금 쓰는 쪽).
//  - /api/…  계정 (api.js) — 누구나 쓴다. 가입 · 로그인이 여기서 일어난다.
//  - 그 밖   잠금 규칙(lock.js)을 거쳐 사이트 파일을 내준다.
// wrangler.jsonc 의 run_worker_first 덕분에 모든 요청이 먼저 여기로 온다.
import { guard } from './lock.js';
import { handleApi } from './api.js';
export { Presence } from './presence.js';   // 접속자 (Durable Object)

export default {
  fetch(request, env){
    if (new URL(request.url).pathname.startsWith('/api/')) return handleApi(request, env);
    return guard(request, env, () => env.ASSETS.fetch(request));
  }
};
