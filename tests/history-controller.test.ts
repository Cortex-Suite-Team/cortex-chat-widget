import { jest } from '@jest/globals';
import { createHistoryDom } from '../src/history-dom.js';
import { HistoryController, type HistoryControllerCallbacks } from '../src/history-controller.js';
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

function createSummary(sessionId: string, title: string): HistoryConversationSummary {
  return {
    session_id: sessionId,
    title,
    renamed: false,
    pinned: false,
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
