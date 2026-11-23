/*
 * META BOT — 혼자 게임을 시작하면 함께 해 주는 봇 셋 (사용자 요청).
 *
 * 봇은 접속한 사람이 아니다. **방장의 기기 안에만** 있고, 방장이 봇 대신 고르고 둔다.
 * 그래서 방장이 나가면 봇도 함께 멈춘다 — 혼자 시작한 판에서만 오므로 그 방장이
 * 곧 그 한 사람이다. 판 꾸러미에 봇 id 와 이름이 실려 가므로 지켜보는 사람(관전)도
 * 같은 이름을 본다.
 */
export const BOT_IDS = ['metabot-1', 'metabot-2', 'metabot-3'];
export const isBot = id => typeof id === 'string' && id.startsWith('metabot-');
export const botName = id => 'META BOT ' + String(id).split('-')[1];
/** 혼자면 봇 셋을 더한 자리, 아니면 그대로. */
export const withBots = ids => (ids.length === 1 ? [...ids, ...BOT_IDS] : ids);
