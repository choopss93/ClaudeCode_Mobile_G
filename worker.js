// Cloudflare Worker 로 올릴 때의 문지기 (지금 쓰는 쪽). 잠금 규칙은 lock.js 한 곳에 있다.
// wrangler.jsonc 의 run_worker_first 덕분에 공개 파일까지 모든 요청이 먼저 여기로 온다.
import { guard } from './lock.js';

export default {
  fetch(request, env){
    return guard(request, env, () => env.ASSETS.fetch(request));
  }
};
