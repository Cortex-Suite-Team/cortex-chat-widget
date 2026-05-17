import { jest } from '@jest/globals';
import { flushAsyncWork, resetMocks } from './helpers.js';
import { mountCortexChat } from '../src/index.js';
import { __getLastController, createMockChatState } from './mocks/sdk-ui.js';
import { renderHistoryList } from '../src/history-renderer.js';
import { historyStyles } from '../src/styles/history.js';
import type { HistoryDom } from '../src/types.js';

const ASSISTANT_MSG = {
  id: 'msg_a1',
  type: 'chat::answer',
  role: 'assistant' as const,
  content: 'Live message',
  status: 'final' as const,
  ts: '2026-05-16T10:00:00Z',
  meta: {},
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function installTargets() {
  const history = document.createElement('div');
  history.id = 'history';
  const chat = document.createElement('div');
  chat.id = 'chat';
  document.body.append(history, chat);
}

function getChatShadow(): ShadowRoot {
  const host = document.querySelector('#chat > *') as HTMLElement | null;
  if (!host?.shadowRoot) {
    throw new Error('Expected chat shadow root');
  }
  return host.shadowRoot;
}

function getHistoryShadow(): ShadowRoot {
  const chatShadow = getChatShadow();
  const host = chatShadow.querySelector('[data-testid="widget-history-slot"] > *') as HTMLElement | null;
  if (!host?.shadowRoot) {
    throw new Error('Expected history shadow root');
  }
  return host.shadowRoot;
}

function getFetchMock(): any {
  return global.fetch as any;
}

function createHistoryItems(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const itemNumber = index + 1;
    return {
      session_id: `s${itemNumber}`,
      title: `Scroll Test ${itemNumber}`,
      renamed: false,
      pinned: false,
      last_message_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };
  });
}

describe('history stability', () => {
  beforeEach(() => {
    resetMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clicking the current live session row does not call getMessages and leaves composer enabled', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: {
        conversations: [
          { session_id: 'sess_mock', title: 'Live Chat', renamed: false, pinned: false, last_message_at: '2026-05-11T10:00:00Z', created_at: '2026-05-11T09:00:00Z' },
        ],
      },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    // sess_mock is the live session (createMockChatState default)
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    const historyShadow = getHistoryShadow();
    const liveRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(liveRow.dataset.sessionId).toBe('sess_mock');
    liveRow.click();
    await flushAsyncWork();

    // No getMessages fetch — total stays at 1
    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    // Composer stays enabled — not in historical/read-only mode
    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  it('clicking a different historical session calls getMessages and renders read-only view', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [
            { session_id: 'sess_hist', title: 'Old Chat', renamed: false, pinned: false, last_message_at: '2026-05-10T10:00:00Z', created_at: '2026-05-10T09:00:00Z' },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          session_id: 'sess_hist',
          messages: [
            { id: 'm1', type: 'chat::answer', role: 'assistant', content: 'Historical message', status: 'final', ts: '2026-05-10T10:00:00Z', meta: {} },
          ],
        },
      }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    // Live session is 'sess_mock'; history list has 'sess_hist' (different)
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const row = historyShadow.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    expect(row.dataset.sessionId).toBe('sess_hist');
    row.click();
    await flushAsyncWork();

    // Two fetches: list + getMessages
    expect(getFetchMock()).toHaveBeenCalledTimes(2);

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const transcript = chatShadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toContain('read-only');
    expect(transcript.textContent).toContain('Historical message');
  });

  it('renderHistoryList restores scrollTop after replaceChildren', () => {
    const list = document.createElement('div');
    const status = document.createElement('div');
    const dom = { list, status } as unknown as HistoryDom;

    const items = createHistoryItems(20);
    const state = {
      kind: 'loaded' as const,
      items,
      liveSessionId: null,
      liveSelected: false,
      selectedHistoricalSessionId: null,
      menuSessionId: null,
    };

    // Initial render
    renderHistoryList(dom, state);

    // Simulate user having scrolled the panel
    Object.defineProperty(list, 'scrollTop', { value: 120, writable: true, configurable: true });
    expect(list.scrollTop).toBe(120);

    // Background re-render (e.g. after rename)
    renderHistoryList(dom, state);

    // scrollTop must be restored to pre-render value
    expect(list.scrollTop).toBe(120);
  });

  it('renderHistoryList preserves scrollTop when historical selection changes', () => {
    const list = document.createElement('div');
    const status = document.createElement('div');
    const dom = { list, status } as unknown as HistoryDom;
    const items = createHistoryItems(20);

    renderHistoryList(dom, {
      kind: 'loaded',
      items,
      liveSessionId: 's_live',
      liveSelected: true,
      selectedHistoricalSessionId: null,
      menuSessionId: null,
    });

    Object.defineProperty(list, 'scrollTop', { value: 180, writable: true, configurable: true });

    renderHistoryList(dom, {
      kind: 'loaded',
      items,
      liveSessionId: 's_live',
      liveSelected: false,
      selectedHistoricalSessionId: 's12',
      menuSessionId: null,
    });

    expect(list.scrollTop).toBe(180);
  });

  it('renderHistoryList preserves scrollTop when menuSessionId changes', () => {
    const list = document.createElement('div');
    const status = document.createElement('div');
    const dom = { list, status } as unknown as HistoryDom;
    const items = createHistoryItems(20);

    renderHistoryList(dom, {
      kind: 'loaded',
      items,
      liveSessionId: 's_live',
      liveSelected: false,
      selectedHistoricalSessionId: 's5',
      menuSessionId: null,
    });

    Object.defineProperty(list, 'scrollTop', { value: 240, writable: true, configurable: true });

    renderHistoryList(dom, {
      kind: 'loaded',
      items,
      liveSessionId: 's_live',
      liveSelected: false,
      selectedHistoricalSessionId: 's5',
      menuSessionId: 's14',
    });

    expect(list.scrollTop).toBe(240);
    const openMenuRow = list.querySelector('[data-session-id="s14"]') as HTMLElement;
    expect(openMenuRow.dataset.menuOpen).toBe('true');
  });

  it('history list is styled as the scroll container', () => {
    expect(historyStyles).toMatch(/\.cortex-widget-history__panel\s*{[^}]*height:\s*100%/s);
    expect(historyStyles).toMatch(/\.cortex-widget-history__panel\s*{[^}]*display:\s*flex/s);
    expect(historyStyles).toMatch(/\.cortex-widget-history__panel\s*{[^}]*flex-direction:\s*column/s);
    expect(historyStyles).toMatch(/\.cortex-widget-history__header\s*{[^}]*flex:\s*0 0 auto/s);
    expect(historyStyles).toMatch(/\.cortex-widget-history__list\s*{[^}]*flex:\s*1/s);
    expect(historyStyles).toMatch(/\.cortex-widget-history__list\s*{[^}]*min-height:\s*0/s);
    expect(historyStyles).toMatch(/\.cortex-widget-history__list\s*{[^}]*overflow-y:\s*auto/s);
  });
});

describe('Current Chat row', () => {
  beforeEach(() => {
    resetMocks();
    (global as unknown as { fetch: unknown }).fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function getFetchMock() {
    return global.fetch as ReturnType<typeof jest.fn>;
  }

  function installTargets() {
    const history = document.createElement('div');
    history.id = 'history';
    const chat = document.createElement('div');
    chat.id = 'chat';
    document.body.append(history, chat);
  }

  function getChatShadow(): ShadowRoot {
    const host = document.querySelector('#chat > *') as HTMLElement | null;
    if (!host?.shadowRoot) throw new Error('Expected chat shadow root');
    return host.shadowRoot;
  }

  function getHistoryShadow(): ShadowRoot {
    const chatShadow = getChatShadow();
    const host = chatShadow.querySelector('[data-testid="widget-history-slot"] > *') as HTMLElement | null;
    if (!host?.shadowRoot) throw new Error('Expected history shadow root');
    return host.shadowRoot;
  }

  function mockJson(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }

  it('renders Current Chat row when liveSessionId is present', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({
      ok: true,
      data: { conversations: [{ session_id: 'sess_mock', title: 'Live Chat', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' }] },
    }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement | null;
    expect(currentRow).not.toBeNull();
    expect(currentRow!.dataset.sessionId).toBe('sess_mock');
  });

  it('Current Chat row has data-live-current="true"', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(currentRow).not.toBeNull();
    expect(currentRow.dataset.liveCurrent).toBe('true');
  });

  it('Current Chat row is active in live mode and visible when historyState is empty', async () => {
    installTargets();
    // Backend returns empty list — historyState becomes 'empty'
    getFetchMock().mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    // Visible despite empty history
    const currentRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(currentRow).not.toBeNull();
    expect(currentRow.dataset.active).toBe('true');

    currentRow.click();
    await flushAsyncWork();

    const updatedCurrentRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(updatedCurrentRow.dataset.active).toBe('true');
    expect(historyShadow.querySelector('[data-testid="history-draft-row"]')).toBeNull();
  });

  it('duplicate history item with same session_id as live is not rendered twice', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({
      ok: true,
      data: { conversations: [{ session_id: 'sess_mock', title: 'My Chat', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' }] },
    }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const allWithSessionId = historyShadow.querySelectorAll('[data-session-id="sess_mock"]');
    expect(allWithSessionId).toHaveLength(1);
    expect(historyShadow.querySelector('[data-testid="history-current-row"]')).not.toBeNull();
    expect(historyShadow.querySelector('[data-testid="history-row"][data-session-id="sess_mock"]')).toBeNull();
  });

  it('Current Chat row renders even when history API returns empty conversations list', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement | null;
    expect(currentRow).not.toBeNull();
    expect(currentRow!.dataset.sessionId).toBe('sess_mock');
  });

  it('clicking Current Chat row does not call getMessages', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({
      ok: true,
      data: { conversations: [{ session_id: 'sess_mock', title: 'Live', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' }] },
    }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    currentRow.click();
    await flushAsyncWork();

    // Only the initial list fetch — no getMessages call
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('clicking Current Chat row keeps live transcript visible', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState({ transcript: [ASSISTANT_MSG] }));
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    currentRow.click();
    await flushAsyncWork();

    const transcriptEl = getChatShadow().querySelector('[data-testid="transcript"]') as HTMLElement;
    expect(transcriptEl.textContent).toContain('Live message');
  });

  it('clicking a historical row still loads read-only transcript', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [{ session_id: 'sess_hist', title: 'Old Chat', renamed: false, pinned: false, last_message_at: '2026-05-10T10:00:00Z', created_at: '2026-05-10T09:00:00Z' }] } }))
      .mockResolvedValueOnce(mockJson({ ok: true, data: { session_id: 'sess_hist', messages: [{ id: 'm1', type: 'chat::answer', role: 'assistant', content: 'Old answer', status: 'final', ts: '2026-05-10T10:00:00Z', meta: {} }] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const histRow = getHistoryShadow().querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    expect(histRow.dataset.sessionId).toBe('sess_hist');
    histRow.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toContain('read-only');
    expect(chatShadow.querySelector('[data-testid="transcript"]')!.textContent).toContain('Old answer');
  });

  it('header New Chat button starts a fresh live chat and keeps Current Chat selected', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();

    // First go live via Current Chat row
    const currentRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    currentRow.click();
    await flushAsyncWork();
    expect(historyShadow.querySelector('[data-testid="history-current-row"]')!.getAttribute('data-active')).toBe('true');

    const firstController = __getLastController()!;

    const newChatBtn = historyShadow.querySelector('[data-testid="history-new-chat"]') as HTMLButtonElement;
    newChatBtn.click();
    await flushAsyncWork();

    expect(firstController.destroyCalls).toBe(1);
    expect(__getLastController()).not.toBe(firstController);
    expect(historyShadow.querySelector('[data-testid="history-draft-row"]')).toBeNull();
    expect(historyShadow.querySelector('[data-testid="history-current-row"]')!.getAttribute('data-active')).toBe('true');

    const textarea = getChatShadow().querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
  });

  it('does not render legacy scrollable draft row', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJson({ ok: true, data: { conversations: [] } }));

    mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target: '#chat', historyTarget: '#history', controlPlaneUrl: 'https://cp.example.test' });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    expect(historyShadow.querySelector('[data-testid="history-draft-row"]')).toBeNull();
  });
});
