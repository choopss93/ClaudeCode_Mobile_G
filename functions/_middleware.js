// Cloudflare Pages 로 올릴 때의 문지기. 잠금 규칙은 ../lock.js 한 곳에 있다.
import { guard } from '../lock.js';

export const onRequest = ({ request, env, next }) => guard(request, env, () => next());
