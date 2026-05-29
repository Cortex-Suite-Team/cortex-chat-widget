import { jest } from '@jest/globals';
import { changeInput, CustomClient, flushAsyncWork, resetMocks, submitComposer } from './helpers.js';
import { mountCortexChat } from '../src/index.js';
import { __getLastController, createMockChatState } from './mocks/sdk-ui.js';

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
  return { history, chat };
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

function setupHistoryFetch(conversations: unknown[] = []) {
  getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: {} }));
  getFetchMock().mockResolvedValueOnce(mockJsonResponse({
    ok: true,
    data: { conversations },
  }));
}

describe('widget history', () => {
  beforeEach(() => {
    resetMocks();
    window.localStorage.clear();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call history API when historyTarget is absent', async () => {
    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: document.body.appendChild(document.createElement('div')),
    });

    await flushAsyncWork();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fails clearly when historyTarget is provided without controlPlaneUrl', () => {
    installTargets();

    expect(() => {
      mountCortexChat({
        apiKey: 'test-key',
        mode: 'embedded',
        target: '#chat',
        historyTarget: '#history',
      });
    }).toThrow('historyTarget requires controlPlaneUrl');
  });

  it('renders history panel, preserves backend order, pinned state, and menu actions', async () => {
    installTargets();
    window.localStorage.setItem('cortex-chat-widget:history-pins:v1', JSON.stringify({ sess_b: true }));
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: {
        conversations: [
          { session_id: 'sess_b', title: 'Bravo', renamed: false, pinned: false, last_message_at: '2026-05-11T10:00:00Z', created_at: '2026-05-11T09:00:00Z' },
          { session_id: 'sess_a', title: 'Alpha', renamed: false, pinned: false, last_message_at: '2026-05-10T10:00:00Z', created_at: '2026-05-10T09:00:00Z' },
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

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const titles = Array.from(historyShadow.querySelectorAll('[data-testid="history-row-title"]')).map((el) => el.textContent);
    expect(titles).toEqual(['Bravo', 'Alpha']);
    expect(historyShadow.textContent).not.toContain('2026');
    expect(historyShadow.textContent).not.toContain('preview');

    const rows = historyShadow.querySelectorAll('[data-testid="history-row"]') as NodeListOf<HTMLButtonElement>;
    expect(rows[0].dataset.pinned).toBe('true');
    expect(rows[1].dataset.pinned).toBe('false');
    expect(rows[0].querySelector('[data-testid="history-pinned-icon"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="history-pinned-icon"]')).toBeNull();

    const pinnedToggle = rows[0].querySelector('[data-testid="history-menu-toggle"]') as HTMLButtonElement;
    pinnedToggle.click();

    const menu = historyShadow.querySelector('[data-testid="history-menu"]') as HTMLElement;
    expect(menu.textContent).toContain('Unpin');
    expect(menu.textContent).toContain('Rename');
    expect(menu.textContent).toContain('Delete');
    expect(menu.querySelectorAll('[data-testid="history-menu-action-icon"]')).toHaveLength(3);
    const pinnedPinAction = menu.querySelector('[data-action="pin"]') as HTMLButtonElement;
    expect(pinnedPinAction.textContent).toContain('Unpin');
    expect(pinnedPinAction.dataset.action).toBe('pin');

    pinnedToggle.click();
    const unpinnedToggle = rows[1].querySelector('[data-testid="history-menu-toggle"]') as HTMLButtonElement;
    unpinnedToggle.click();

    const unpinnedPinAction = rows[1].querySelector('[data-action="pin"]') as HTMLButtonElement;
    expect(unpinnedPinAction.textContent).toContain('Pin');
    expect(unpinnedPinAction.dataset.action).toBe('pin');
  });

  it('clicking a history row loads read-only transcript and disables composer', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [
            { session_id: 'sess_hist', title: 'Existing chat', renamed: false, pinned: false, last_message_at: '2026-05-11T10:00:00Z', created_at: '2026-05-11T09:00:00Z' },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          session_id: 'sess_hist',
          messages: [
            { id: 'm1', type: 'chat::answer', role: 'assistant', content: 'Earlier answer', status: 'final', ts: '2026-05-11T10:00:00Z', meta: {} },
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

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const row = historyShadow.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    row.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    const transcript = chatShadow.querySelector('[data-testid="transcript"]') as HTMLElement;
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const sendButton = chatShadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;

    expect(transcript.textContent).toContain('Earlier answer');
    expect(textarea.disabled).toBe(true);
    expect(sendButton.disabled).toBe(true);
    expect(textarea.placeholder).toContain('read-only');
  });

  it('header new chat starts a fresh live chat, and send does not trigger additional history refresh', async () => {
    installTargets();
    const client = new CustomClient();
    client.uploadAttachmentImpl = async (file) => `attachment:${file.name}`;
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: {
        conversations: [
          { session_id: 'sess_hist', title: 'Existing chat', renamed: false, pinned: false, last_message_at: '2026-05-11T10:00:00Z', created_at: '2026-05-11T09:00:00Z' },
        ],
      },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
      client,
    });

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const firstController = __getLastController()!;
    const historyShadow = getHistoryShadow();
    const newChatButton = historyShadow.querySelector('[data-testid="history-new-chat"]') as HTMLButtonElement;
    expect(historyShadow.querySelector('[data-testid="history-draft-row"]')).toBeNull();
    newChatButton.click();
    await flushAsyncWork();

    expect(firstController.sendCalls).toHaveLength(0);
    expect(firstController.destroyCalls).toBe(1);
    const nextController = __getLastController()!;
    expect(nextController).not.toBe(firstController);
    expect(nextController.connectCalls).toBe(1);

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = chatShadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    changeInput(textarea, 'Start a new chat');
    submitComposer(form);
    await flushAsyncWork();

    expect(nextController.sendCalls).toHaveLength(1);
    // Send must NOT trigger a history refresh — only the initial session-ready load fires.
    expect(getFetchMock().mock.calls.filter((call: any[]) => String(call[0]).includes('/api/chat/conversations/'))).toHaveLength(1);
  });

  it('sending while history is mounted stays in live mode and does not refresh conversations', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: {
        conversations: [
          { session_id: 'sess_hist', title: 'Existing chat', renamed: false, pinned: false, last_message_at: '2026-05-11T10:00:00Z', created_at: '2026-05-11T09:00:00Z' },
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

    const controller = __getLastController()!;
    controller.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const currentRow = historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    currentRow.click();
    await flushAsyncWork();
    expect((historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement).dataset.active).toBe('true');

    const chatShadow = getChatShadow();
    const textarea = chatShadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const form = chatShadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    changeInput(textarea, 'Continue current chat');
    submitComposer(form);
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(1);
    expect((historyShadow.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement).dataset.active).toBe('true');
    expect(textarea.placeholder).not.toContain('read-only');
    expect(getFetchMock().mock.calls.filter((call: any[]) => String(call[0]).includes('/api/chat/conversations/'))).toHaveLength(1);
  });

  it.each([
    ['payload.meta.chat_title', { type: 'chat::answer', payload: { meta: { chat_title: 'Contract review' } } }],
    ['meta.chat_title', { type: 'chat::answer', meta: { chat_title: 'Contract review' } }],
    ['payload.payload.meta.chat_title', { type: 'chat::answer', payload: { payload: { meta: { chat_title: 'Contract review' } } } }],
  ])('runtime title from %s updates Current Chat title and persists rename', async (_label, rawMessage) => {
    installTargets();
    const client = new CustomClient();
    setupHistoryFetch([]);

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
      client,
    });

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    client.emit(rawMessage as any);
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(currentRow.textContent).toContain('Contract review');

    const renameCalls = getFetchMock().mock.calls.filter((call: any[]) => String(call[0]).includes('/rename/'));
    expect(renameCalls).toHaveLength(1);
    expect(renameCalls[0][0]).toContain('/api/chat/conversations/sess_mock/rename/');
    expect(JSON.parse(renameCalls[0][1].body)).toEqual({ title: 'Contract review' });
  });

  it('blank and non-string runtime chat_title values are ignored', async () => {
    installTargets();
    const client = new CustomClient();
    setupHistoryFetch([]);

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
      client,
    });

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    client.emit({ type: 'chat::answer', payload: { meta: { chat_title: '   ' } } } as any);
    client.emit({ type: 'chat::answer', meta: { chat_title: 42 } } as any);
    await flushAsyncWork();

    const currentRow = getHistoryShadow().querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(currentRow.textContent).toContain('Current chat');
    expect(getFetchMock().mock.calls.filter((call: any[]) => String(call[0]).includes('/rename/'))).toHaveLength(0);
  });

  it('delete removes item after backend success', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [
            { session_id: 'sess_delete', title: 'Delete me', renamed: false, pinned: false, last_message_at: '2026-05-11T10:00:00Z', created_at: '2026-05-11T09:00:00Z' },
          ],
        },
      }))
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [],
        },
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
    const toggle = historyShadow.querySelector('[data-testid="history-menu-toggle"]') as HTMLButtonElement;
    toggle.click();
    const deleteButton = Array.from(historyShadow.querySelectorAll('.cortex-widget-history__menu-action'))
      .find((el) => (el as HTMLElement).textContent === 'Delete') as HTMLButtonElement;
    deleteButton.click();
    await flushAsyncWork();
    await flushAsyncWork();

    // After deleting the only history item, the Current Chat row remains visible
    // (live session still exists), so "No chats yet" is not shown.
    expect(historyShadow.querySelectorAll('[data-testid="history-row"]')).toHaveLength(0);
    expect(historyShadow.querySelector('[data-testid="history-current-row"]')).not.toBeNull();
  });

  it('syncs dark theme classes to history shadow root when theme background is dark', async () => {
    installTargets();
    getFetchMock().mockResolvedValueOnce(mockJsonResponse({
      ok: true,
      data: {
        conversations: [],
      },
    }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
      theme: {
        backgroundColor: '#111827',
        textColor: '#f8fafc',
      },
    });

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const historyShadow = getHistoryShadow();
    const historyRoot = historyShadow.querySelector('.cortex-widget-history') as HTMLElement;
    const historyHost = getChatShadow().querySelector('[data-testid="widget-history-slot"] > *') as HTMLElement;

    expect(historyRoot.classList.contains('cortex-widget-history--dark')).toBe(true);
    expect(historyRoot.classList.contains('cortex-widget-history--light')).toBe(false);
    expect(historyHost.style.getPropertyValue('--cortex-background-color')).toBe('#111827');
  });

  it('history chat::question with actor renders worker name and title', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [
            { session_id: 'sess_w', title: 'Worker chat', renamed: false, pinned: false, last_message_at: '2026-05-20T10:00:00Z', created_at: '2026-05-20T09:00:00Z' },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          session_id: 'sess_w',
          messages: [
            {
              id: 'audit:10',
              type: 'chat::question',
              role: 'worker',
              content: ['Which plan do you need?'],
              status: 'final',
              ts: '2026-05-20T10:00:00Z',
              actor: { kind: 'digital_worker', id: 'proj_1', name: 'Interactive Worker', title: 'Digital worker', avatar_url: '/static/avatar.png' },
              meta: {},
            },
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

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const row = getHistoryShadow().querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    row.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    const actorName = chatShadow.querySelector('[data-testid="actor-name"]') as HTMLElement | null;
    expect(actorName).not.toBeNull();
    expect(actorName!.textContent).toBe('Interactive Worker');
    expect(chatShadow.querySelector('[data-testid="actor-missing"]')).toBeNull();
  });

  it('history chat::answer with actor renders worker actor on answer message', async () => {
    installTargets();
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [
            { session_id: 'sess_ans', title: 'Answer chat', renamed: false, pinned: false, last_message_at: '2026-05-20T10:00:00Z', created_at: '2026-05-20T09:00:00Z' },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          session_id: 'sess_ans',
          messages: [
            {
              id: 'audit:20',
              type: 'chat::answer',
              role: 'assistant',
              content: 'Here is the answer.',
              status: 'final',
              ts: '2026-05-20T10:01:00Z',
              actor: { kind: 'digital_worker', name: 'Interactive Worker', title: 'Digital worker' },
              meta: {},
            },
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

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const row = getHistoryShadow().querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    row.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    const actorName = chatShadow.querySelector('[data-testid="actor-name"]') as HTMLElement | null;
    expect(actorName).not.toBeNull();
    expect(actorName!.textContent).toBe('Interactive Worker');
  });

  it('history message without actor shows debug missing-actor marker, not a fallback name', async () => {
    installTargets();
    window.localStorage.setItem('cortex_debug', '1');
    getFetchMock()
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          conversations: [
            { session_id: 'sess_noactor', title: 'Old chat', renamed: false, pinned: false, last_message_at: '2026-05-01T10:00:00Z', created_at: '2026-05-01T09:00:00Z' },
          ],
        },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        ok: true,
        data: {
          session_id: 'sess_noactor',
          messages: [
            {
              id: 'audit:30',
              type: 'chat::answer',
              role: 'assistant',
              content: 'An old answer.',
              status: 'final',
              ts: '2026-05-01T10:00:00Z',
              actor: null,
              meta: {},
            },
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

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const row = getHistoryShadow().querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    row.click();
    await flushAsyncWork();

    const chatShadow = getChatShadow();
    expect(chatShadow.querySelector('[data-testid="actor-name"]')).toBeNull();
    const missingMarker = chatShadow.querySelector('[data-testid="actor-missing"]') as HTMLElement | null;
    expect(missingMarker).not.toBeNull();
    expect(missingMarker!.textContent).toContain('unknown actor');
  });
});
