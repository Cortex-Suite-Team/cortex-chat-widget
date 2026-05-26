const CORTEX_CHAT_WIDGET_VERSION = '0.1.0';

function isBundleDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const queryDebug = params.get('debug');
    if (queryDebug === 'true' || queryDebug === '1') {
      return true;
    }
    return window.localStorage.getItem('cortex_debug') === '1';
  } catch {
    return false;
  }
}

console.log('[cortex widget bundle loaded]', {
  source: 'cortex-chat-widget',
  version: CORTEX_CHAT_WIDGET_VERSION,
  ts: new Date().toISOString(),
});

if (isBundleDebugEnabled()) {
  console.debug('[cortex widget bundle loaded]', {
    source: 'cortex-chat-widget',
    version: CORTEX_CHAT_WIDGET_VERSION,
    ts: new Date().toISOString(),
    href: typeof window !== 'undefined' ? window.location.href : undefined,
  });
}

export { mountCortexChat } from './mount.js';

export type {
  CortexChatWidgetError,
  CortexChatWidgetHandle,
  CortexChatWidgetOptions,
  CortexChatWidgetState,
} from './types.js';
