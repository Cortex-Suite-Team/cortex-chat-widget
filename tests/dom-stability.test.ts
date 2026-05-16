import { jest } from '@jest/globals';
import {
  applyChatState,
  baseChatState,
  changeInput,
  CustomClient,
  flushAsyncWork,
  mountWidget,
  resetMocks,
} from './helpers.js';
import { mountCortexChat } from '../src/index.js';
import { __getLastController, createMockChatState } from './mocks/sdk-ui.js';

function getHost(): HTMLElement {
  return document.body.firstElementChild as HTMLElement;
}

function getShadow(): ShadowRoot {
  const host = getHost();
  if (!host.shadowRoot) throw new Error('Expected shadow root');
  return host.shadowRoot;
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
  const host = document.querySelector('#history > *') as HTMLElement | null;
  if (!host?.shadowRoot) throw new Error('Expected history shadow root');
  return host.shadowRoot;
}

function getFetchMock() {
  return global.fetch as ReturnType<typeof jest.fn>;
}

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const ASSISTANT_MSG = {
  id: 'msg_a1',
  type: 'chat::answer',
  role: 'assistant' as const,
  content: 'Hello from assistant',
  status: 'final' as const,
  ts: '2026-05-16T10:00:00Z',
  meta: {},
};

const HISTORY_ITEM = {
  session_id: 'sess_hist_1',
  title: 'Original Title',
  renamed: false,
  pinned: false,
  last_message_at: '2026-05-01T00:00:00Z',
  created_at: '2026-05-01T00:00:00Z',
};

describe('DOM stability — render gating', () => {
  beforeEach(() => {
    resetMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('typing in textarea does not rebuild transcript DOM nodes', () => {
    mountWidget();
    applyChatState(baseChatState({ transcript: [ASSISTANT_MSG] }));

    const shadow = getShadow();
    const transcriptEl = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    const msgEl = transcriptEl.querySelector('[data-testid="transcript-message"]');
    expect(msgEl).not.toBeNull();

    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    changeInput(textarea, 'H');
    changeInput(textarea, 'He');
    changeInput(textarea, 'Hel');

    // Transcript DOM node is the same reference — replaceChildren was NOT called
    expect(transcriptEl.querySelector('[data-testid="transcript-message"]')).toBe(msgEl);
  });

  it('typing in textarea does not rebuild history list DOM nodes', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: { conversations: [HISTORY_ITEM] },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const historyRow = historyShadow.querySelector('[data-testid="history-row"]');
    expect(historyRow).not.toBeNull();

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    changeInput(textarea, 'H');
    changeInput(textarea, 'Hi');

    // History DOM node is the same reference — list was NOT rebuilt
    expect(historyShadow.querySelector('[data-testid="history-row"]')).toBe(historyRow);
  });

  it('incoming assistant message updates the transcript', () => {
    mountWidget();
    applyChatState(baseChatState({ transcript: [] }));

    const shadow = getShadow();
    const transcriptEl = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    expect(transcriptEl.querySelectorAll('[data-testid="transcript-message"]')).toHaveLength(0);

    applyChatState(baseChatState({ transcript: [ASSISTANT_MSG] }));
    expect(transcriptEl.querySelectorAll('[data-testid="transcript-message"]')).toHaveLength(1);
    expect(transcriptEl.textContent).toContain('Hello from assistant');
  });

  it('streaming message content update re-renders transcript', () => {
    mountWidget();
    const shadow = getShadow();
    const transcriptEl = shadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    applyChatState(baseChatState({
      transcript: [{ ...ASSISTANT_MSG, status: 'streaming', content: 'Hello' }],
    }));
    expect(transcriptEl.textContent).toContain('Hello');

    // Different content length triggers key change → transcript re-renders
    applyChatState(baseChatState({
      transcript: [{ ...ASSISTANT_MSG, status: 'streaming', content: 'Hello World' }],
    }));
    expect(transcriptEl.textContent).toContain('Hello World');
    expect(transcriptEl.textContent).not.toContain('Hello from assistant');
  });

  it('history list updates after a rename refreshes items', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({ ok: true, data: { conversations: [HISTORY_ITEM] } }))
      .mockResolvedValueOnce(mockJsonResponse({ ok: true })) // rename POST
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: { conversations: [{ ...HISTORY_ITEM, title: 'Renamed Title', renamed: true }] },
      }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    expect(historyShadow.textContent).toContain('Original Title');

    const menuToggle = historyShadow.querySelector('[data-testid="history-menu-toggle"]') as HTMLButtonElement;
    menuToggle.click();

    const renameBtn = Array.from(historyShadow.querySelectorAll('.cortex-widget-history__menu-action'))
      .find((el) => el.textContent === 'Rename') as HTMLButtonElement;
    jest.spyOn(window, 'prompt').mockReturnValue('Renamed Title');
    renameBtn.click();
    await flushAsyncWork();
    await flushAsyncWork();

    expect(historyShadow.textContent).toContain('Renamed Title');
    expect(historyShadow.textContent).not.toContain('Original Title');
  });

  it('clicking a different historical session loads read-only transcript', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: { conversations: [
          { session_id: 'sess_old', title: 'Old Chat', renamed: false, pinned: false, last_message_at: '2026-05-10T10:00:00Z', created_at: '2026-05-10T09:00:00Z' },
        ] },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          session_id: 'sess_old',
          messages: [{ id: 'm1', type: 'chat::answer', role: 'assistant', content: 'Historical answer', status: 'final', ts: '2026-05-10T10:00:00Z', meta: {} }],
        },
      }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    // Live session is sess_mock; history has sess_old (different)
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const row = historyShadow.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    expect(row.dataset.sessionId).toBe('sess_old');
    row.click();
    await flushAsyncWork();

    expect(getFetchMock()).toHaveBeenCalledTimes(2);

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const transcriptEl = chatShadow.querySelector('[data-testid="transcript"]') as HTMLElement;

    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toContain('read-only');
    expect(transcriptEl.textContent).toContain('Historical answer');
  });
});

describe('live session selection', () => {
  beforeEach(() => {
    resetMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getLiveSessionId uses connection.sessionId, not client.sessionId', async () => {
    // client.sessionId differs from connection.sessionId; clicking client.sessionId row goes historical
    installTargets();
    const client = new CustomClient();
    client.sessionId = 'sess_client_only'; // NOT in connection

    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: { conversations: [
          { session_id: 'sess_client_only', title: 'Client Only', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' },
        ] },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: { session_id: 'sess_client_only', messages: [] },
      }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
      client,
    });

    // connection.sessionId is 'sess_mock' (from createMockChatState), NOT 'sess_client_only'
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const row = historyShadow.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    expect(row.dataset.sessionId).toBe('sess_client_only');
    row.click();
    await flushAsyncWork();

    // getMessages WAS called — treated as historical, not live
    expect(getFetchMock()).toHaveBeenCalledTimes(2);

    // Composer is disabled (historical mode)
    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it('clicking the live session sets viewMode=live (row marked active, textarea enabled)', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: { conversations: [
        { session_id: 'sess_mock', title: 'Live Session', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' },
      ] },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    // createMockChatState sets connection.sessionId = 'sess_mock'
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const liveRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(liveRow.dataset.sessionId).toBe('sess_mock');
    liveRow.click();
    await flushAsyncWork();

    // No getMessages call
    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).not.toContain('read-only');
  });

  it('clicking the live session does not call getMessages', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: { conversations: [
        { session_id: 'sess_mock', title: 'Live', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' },
      ] },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });
    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const liveRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    liveRow.click();
    await flushAsyncWork();

    // Only the initial list fetch — no getMessages call
    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('clicking live session preserves live transcript', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: { conversations: [
        { session_id: 'sess_mock', title: 'Live', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' },
      ] },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });
    __getLastController()!.setState(createMockChatState({
      transcript: [ASSISTANT_MSG],
    }));
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const liveRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    liveRow.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    const transcriptEl = chatShadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    expect(transcriptEl.textContent).toContain('Hello from assistant');
  });

  it('clicking live session with empty transcript shows live empty view, not historical read-only', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: { conversations: [
        { session_id: 'sess_mock', title: 'Live Empty', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' },
      ] },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });
    // Live session with empty transcript
    __getLastController()!.setState(createMockChatState({
      transcript: [],
    }));
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const liveRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    liveRow.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;

    // Must be live mode — composer enabled, no read-only placeholder
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).not.toContain('read-only');
  });

  it('after viewing historical session, clicking live session restores live mode', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: { conversations: [
          { session_id: 'sess_old', title: 'Old Chat', renamed: false, pinned: false, last_message_at: '2026-05-10T10:00:00Z', created_at: '2026-05-10T09:00:00Z' },
          { session_id: 'sess_mock', title: 'Live', renamed: false, pinned: false, last_message_at: '2026-05-16T10:00:00Z', created_at: '2026-05-16T09:00:00Z' },
        ] },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: { session_id: 'sess_old', messages: [{ id: 'm1', type: 'chat::answer', role: 'assistant', content: 'Old answer', status: 'final', ts: '2026-05-10T10:00:00Z', meta: {} }] },
      }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });
    __getLastController()!.setState(createMockChatState({
      transcript: [ASSISTANT_MSG],
    }));
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const oldRow = historyShadow.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    expect(oldRow.dataset.sessionId).toBe('sess_old');
    const liveRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;

    // Go to historical
    oldRow.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    let textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);

    // Re-query after history re-render (viewMode change invalidates history key → replaceChildren)
    const liveRowAfter = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;

    // Go back to live
    liveRowAfter.click();
    await flushAsyncWork();

    textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).not.toContain('read-only');

    // Live transcript still present
    const transcriptEl = chatShadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    expect(transcriptEl.textContent).toContain('Hello from assistant');
  });
});
