import { jest } from '@jest/globals';
import { createHistoryDom } from '../src/history-dom.js';
import { HistoryController, HistoryPinStore, type HistoryControllerCallbacks } from '../src/history-controller.js';
import type { ChatMessageViewModel, HistoryClient, HistoryConversationSummary, NormalizedWidgetOptions } from '../src/types.js';

function createOptions(): NormalizedWidgetOptions {
  return {
    apiKey: 'test-key',
    mode: 'embedded',
    position: 'bottom-right',
    title: 'Ask Cortex',
    subtitle: 'Your Digital Worker is here to help.',
    placeholder: 'Write your message...',
    launcherLabel: 'Ask Cortex',
    initialOpen: false,
    controlPlaneUrl: 'https://cp.example.test',
  };
}

function createCallbacks(): jest.Mocked<HistoryControllerCallbacks> {
  return {
    getLiveSessionId: jest.fn(() => 'sess_live'),
    onOpenCurrent: jest.fn(),
    onOpenHistorical: jest.fn(),
    onStartNewChat: jest.fn(async () => {}),
    onError: jest.fn(),
  };
}

function createMemoryStorage(initial: Record<string, true> = {}): Storage {
  const data = new Map<string, string>();
  data.set('cortex-chat-widget:history-pins:v1', JSON.stringify(initial));
  return {
    get length() {
      return data.size;
    },
    clear: jest.fn(() => data.clear()),
    getItem: jest.fn((key: string) => data.get(key) ?? null),
    key: jest.fn((index: number) => Array.from(data.keys())[index] ?? null),
    removeItem: jest.fn((key: string) => {
      data.delete(key);
    }),
    setItem: jest.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
}

function createPinStore(storage: Storage | null = createMemoryStorage()): HistoryPinStore {
  return new HistoryPinStore(storage, 'cortex-chat-widget:history-pins:v1');
}

function createClient(overrides: Partial<HistoryClient> = {}): jest.Mocked<HistoryClient> {
  return {
    listConversations: jest.fn(async () => []),
    getMessages: jest.fn(async () => []),
    renameConversation: jest.fn(async () => {}),
    pinConversation: jest.fn(async () => {}),
    unpinConversation: jest.fn(async () => {}),
    deleteConversation: jest.fn(async () => {}),
    ...overrides,
  } as jest.Mocked<HistoryClient>;
}

function createSummary(sessionId: string, title: string, pinned = false, renamed = false): HistoryConversationSummary {
  return {
    session_id: sessionId,
    title,
    renamed,
    pinned,
    last_message_at: '2026-05-16T10:00:00Z',
    created_at: '2026-05-16T09:00:00Z',
  };
}

function createMessage(content: string): ChatMessageViewModel {
  return {
    id: `msg_${content}`,
    type: 'chat::answer',
    role: 'assistant',
    content,
    status: 'final',
    ts: '2026-05-16T10:00:00Z',
    meta: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('HistoryController', () => {
  it('clicking Current Chat calls onOpenCurrent and not getMessages', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient();
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');

    const currentRow = dom.shadowRoot.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    currentRow.click();
    await flushAsyncWork();

    expect(callbacks.onOpenCurrent).toHaveBeenCalledTimes(1);
    expect(client.getMessages).not.toHaveBeenCalled();
  });

  it('clicking a historical row calls getMessages and onOpenHistorical', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const messages = [createMessage('Old answer')];
    const client = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_old', 'Old Chat')]),
      getMessages: jest.fn(async () => messages),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();

    const row = dom.shadowRoot.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    row.click();
    await flushAsyncWork();

    expect(client.getMessages).toHaveBeenCalledWith('sess_old');
    expect(callbacks.onOpenHistorical).toHaveBeenCalledWith('sess_old', messages);
  });

  it('clicking header New Chat calls onStartNewChat', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    dom.newChatButton.click();
    await flushAsyncWork();

    expect(callbacks.onStartNewChat).toHaveBeenCalledTimes(1);
  });

  it('pin menu action updates local storage and never calls backend pin APIs', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const storage = createMemoryStorage({ sess_unpin: true });
    const pinStore = createPinStore(storage);
    const client = createClient({
      listConversations: jest.fn(async () => [
          createSummary('sess_pin', 'Pin me', false),
          createSummary('sess_unpin', 'Unpin me', false),
      ]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks, pinStore });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();

    const pinRow = dom.shadowRoot.querySelector('[data-session-id="sess_pin"]') as HTMLButtonElement;
    const unpinRow = dom.shadowRoot.querySelector('[data-session-id="sess_unpin"]') as HTMLButtonElement;
    const pinAction = pinRow.querySelector('[data-action="pin"]') as HTMLButtonElement;
    const unpinAction = unpinRow.querySelector('[data-action="pin"]') as HTMLButtonElement;

    expect(pinAction.textContent).toContain('Pin');
    expect(pinAction.dataset.action).toBe('pin');
    expect(unpinAction.textContent).toContain('Unpin');
    expect(unpinAction.dataset.action).toBe('pin');

    pinAction.click();
    await flushAsyncWork();
    expect(pinStore.isPinned('sess_pin')).toBe(true);
    expect(JSON.parse(storage.getItem('cortex-chat-widget:history-pins:v1') ?? '{}')).toMatchObject({
      sess_pin: true,
      sess_unpin: true,
    });
    expect(client.pinConversation).not.toHaveBeenCalled();

    const refreshedRows = dom.shadowRoot.querySelectorAll('[data-testid="history-row"]') as NodeListOf<HTMLButtonElement>;
    const refreshedUnpinAction = Array.from(refreshedRows)
      .find((row) => row.dataset.sessionId === 'sess_unpin')!
      .querySelector('[data-action="pin"]') as HTMLButtonElement;
    refreshedUnpinAction.click();
    await flushAsyncWork();
    expect(pinStore.isPinned('sess_unpin')).toBe(false);
    expect(JSON.parse(storage.getItem('cortex-chat-widget:history-pins:v1') ?? '{}')).toEqual({
      sess_pin: true,
    });
    expect(client.unpinConversation).not.toHaveBeenCalled();
  });

  it('uses local pin state for rendering and sorting, ignoring backend pinned fields', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const pinStore = createPinStore(createMemoryStorage({ sess_c: true, sess_a: true }));
    const client = createClient({
      listConversations: jest.fn(async () => [
        createSummary('sess_a', 'A local pinned, backend false', false),
        createSummary('sess_b', 'B backend pinned only', true),
        createSummary('sess_c', 'C local pinned, backend false', false),
        createSummary('sess_d', 'D unpinned', false),
      ]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks, pinStore });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();

    const rows = Array.from(dom.shadowRoot.querySelectorAll('[data-testid="history-row"]')) as HTMLButtonElement[];
    expect(rows.map((row) => row.dataset.sessionId)).toEqual(['sess_a', 'sess_c', 'sess_b', 'sess_d']);
    expect(rows.map((row) => row.dataset.pinned)).toEqual(['true', 'true', 'false', 'false']);
    expect(rows[0].querySelector('[data-testid="history-pinned-icon"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-testid="history-pinned-icon"]')).not.toBeNull();
    expect(rows[2].querySelector('[data-testid="history-pinned-icon"]')).toBeNull();
  });

  it('degrades to in-memory pin state when storage is unavailable', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const pinStore = createPinStore(null);
    const client = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_pin', 'Pin me')]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks, pinStore });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();

    const pinAction = dom.shadowRoot.querySelector('[data-action="pin"]') as HTMLButtonElement;
    pinAction.click();
    await flushAsyncWork();

    expect(pinStore.isPinned('sess_pin')).toBe(true);
    expect(client.pinConversation).not.toHaveBeenCalled();
  });

  it('runtime title updates Current Chat and persists through renameConversation', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient({
      listConversations: jest.fn(async () => []),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    controller.applyRuntimeTitle(' Contract review ');
    await flushAsyncWork();

    const currentRow = dom.shadowRoot.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    expect(currentRow.textContent).toContain('Contract review');
    expect(client.renameConversation).toHaveBeenCalledWith('sess_live', 'Contract review');
  });

  it('runtime title is ignored without liveSessionId or history client', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient();
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.applyRuntimeTitle('No live session');
    await flushAsyncWork();
    expect(client.renameConversation).not.toHaveBeenCalled();

    controller.setLiveSessionId('sess_live');
    controller.setClient(null);
    controller.applyRuntimeTitle('Local only');
    await flushAsyncWork();
    expect(client.renameConversation).not.toHaveBeenCalled();
    expect(dom.shadowRoot.textContent).toContain('Local only');
  });

  it('repeated identical runtime title does not persist repeatedly', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient();
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    controller.applyRuntimeTitle('Contract review');
    controller.applyRuntimeTitle('Contract review');
    await flushAsyncWork();

    expect(client.renameConversation).toHaveBeenCalledTimes(1);
  });

  it('matching backend item title prevents redundant runtime rename persistence', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_live', 'Contract review')]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();
    controller.applyRuntimeTitle('Contract review');
    await flushAsyncWork();

    expect(dom.shadowRoot.querySelector('[data-testid="history-current-row"]')?.textContent).toContain('Contract review');
    expect(client.renameConversation).not.toHaveBeenCalled();
  });

  it('runtime title is ignored when live conversation is already manually renamed by backend', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_live', 'Manual title', false, true)]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();
    controller.applyRuntimeTitle('Runtime title');
    await flushAsyncWork();

    expect(dom.shadowRoot.querySelector('[data-testid="history-current-row"]')?.textContent).toContain('Manual title');
    expect(client.renameConversation).not.toHaveBeenCalled();
  });

  it('manual rename of a session updates liveTitle when it becomes current and blocks later runtime title', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const client = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_live', 'New chat')]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });
    jest.spyOn(window, 'prompt').mockReturnValue('Manual title');

    controller.mount();
    controller.setClient(client);
    await controller.refresh();

    const toggle = dom.shadowRoot.querySelector('[data-testid="history-menu-toggle"]') as HTMLButtonElement;
    toggle.click();
    const renameAction = Array.from(dom.shadowRoot.querySelectorAll('.cortex-widget-history__menu-action'))
      .find((action) => action.textContent?.includes('Rename')) as HTMLButtonElement;
    renameAction.click();
    await flushAsyncWork();

    expect(client.renameConversation).toHaveBeenCalledWith('sess_live', 'Manual title');
    controller.setLiveSessionId('sess_live');
    expect(dom.shadowRoot.querySelector('[data-testid="history-current-row"]')?.textContent).toContain('Manual title');

    controller.applyRuntimeTitle('Runtime title');
    await flushAsyncWork();

    expect(dom.shadowRoot.querySelector('[data-testid="history-current-row"]')?.textContent).toContain('Manual title');
    expect(client.renameConversation).toHaveBeenCalledTimes(1);
  });

  it('ignores stale refresh responses', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const first = deferred<HistoryConversationSummary[]>();
    const second = deferred<HistoryConversationSummary[]>();
    let refreshCall = 0;
    const client = createClient({
      listConversations: jest.fn(async () => {
        refreshCall += 1;
        return refreshCall === 1 ? first.promise : second.promise;
      }),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    const firstRefresh = controller.refresh();
    const secondRefresh = controller.refresh();

    second.resolve([createSummary('sess_new', 'New Result')]);
    await secondRefresh;
    expect(dom.shadowRoot.textContent).toContain('New Result');

    first.resolve([createSummary('sess_old', 'Old Result')]);
    await firstRefresh;
    expect(dom.shadowRoot.textContent).toContain('New Result');
    expect(dom.shadowRoot.textContent).not.toContain('Old Result');
  });

  it('ignores stale historical message responses', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const first = deferred<ChatMessageViewModel[]>();
    const second = deferred<ChatMessageViewModel[]>();
    let messageCall = 0;
    const client = createClient({
      listConversations: jest.fn(async () => [
        createSummary('sess_first', 'First'),
        createSummary('sess_second', 'Second'),
      ]),
      getMessages: jest.fn(async () => {
        messageCall += 1;
        return messageCall === 1 ? first.promise : second.promise;
      }),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(client);
    await controller.refresh();

    const rows = dom.shadowRoot.querySelectorAll('[data-testid="history-row"]') as NodeListOf<HTMLButtonElement>;
    rows[0].click();
    const updatedRows = dom.shadowRoot.querySelectorAll('[data-testid="history-row"]') as NodeListOf<HTMLButtonElement>;
    updatedRows[1].click();

    const secondMessages = [createMessage('Second answer')];
    second.resolve(secondMessages);
    await flushAsyncWork();
    expect(callbacks.onOpenHistorical).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenHistorical).toHaveBeenCalledWith('sess_second', secondMessages);

    first.resolve([createMessage('First answer')]);
    await flushAsyncWork();
    expect(callbacks.onOpenHistorical).toHaveBeenCalledTimes(1);
  });

  it('setClient(null) clears stale historical selection before a new client is enabled', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const oldClient = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_old', 'Old Chat')]),
      getMessages: jest.fn(async () => [createMessage('Old answer')]),
    });
    const newClient = createClient({
      listConversations: jest.fn(async () => [createSummary('sess_new', 'New Chat')]),
    });
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setClient(oldClient);
    controller.setLiveSessionId('sess_live');
    await controller.refresh();

    const oldRow = dom.shadowRoot.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    oldRow.click();
    await flushAsyncWork();
    expect((dom.shadowRoot.querySelector('[data-testid="history-row"]') as HTMLButtonElement).dataset.active).toBe('true');

    controller.setClient(null);
    controller.setClient(newClient);
    await controller.refresh();

    const currentRow = dom.shadowRoot.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;
    const newRow = dom.shadowRoot.querySelector('[data-testid="history-row"]') as HTMLButtonElement;
    expect(currentRow.dataset.active).toBe('true');
    expect(newRow.dataset.sessionId).toBe('sess_new');
    expect(newRow.dataset.active).toBe('false');
  });

  it('destroy removes listeners and prevents later state/render updates', async () => {
    const dom = createHistoryDom();
    const callbacks = createCallbacks();
    const controller = new HistoryController({ dom, options: createOptions(), callbacks });

    controller.mount();
    controller.setLiveSessionId('sess_live');
    const currentRow = dom.shadowRoot.querySelector('[data-testid="history-current-row"]') as HTMLButtonElement;

    controller.destroy();
    currentRow.click();
    controller.setLiveSessionId('sess_after_destroy');
    await flushAsyncWork();

    expect(callbacks.onOpenCurrent).not.toHaveBeenCalled();
    expect(dom.host.isConnected).toBe(false);
    expect(dom.shadowRoot.textContent).not.toContain('sess_after_destroy');
  });
});
