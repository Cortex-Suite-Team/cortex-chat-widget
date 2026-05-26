import { jest } from '@jest/globals';

jest.unstable_mockModule('@cortex-suite/sdk-ui', async () => {
  const sdkUiUrl = new URL('../node_modules/@cortex-suite/sdk-ui/dist/src/index.js', import.meta.url);
  return import(sdkUiUrl.href);
});

type TestMessage = {
  type: string;
  schema?: string;
  session_id?: string;
  seq?: number;
  ts?: string;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

class ReconciliationClient {
  readonly listeners = new Set<(message: TestMessage) => void>();
  readonly sentMessages: Array<{ content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }> = [];
  sessionId = 'sess_widget_echo';
  sessionState = 'ACTIVE';
  channelState = 'OPEN';
  accessToken: string | null = 'mock-access-token';
  cpApiUrl: string | null = null;

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<void> {
    this.sentMessages.push(options);
  }

  onMessage(handler: (message: TestMessage) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  emit(message: TestMessage): void {
    for (const listener of Array.from(this.listeners)) {
      listener(message);
    }
  }
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('widget echo reconciliation integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('send plus matching chat::echo leaves one confirmed outgoing bubble', async () => {
    const { mountCortexChat } = await import('../src/index.js');
    const target = document.createElement('div');
    const client = new ReconciliationClient();
    document.body.appendChild(target);

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target,
      client,
    });
    await flushAsyncWork();

    const host = target.firstElementChild as HTMLElement;
    const shadow = host.shadowRoot!;
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const composer = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;

    textarea.value = 'Test';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushAsyncWork();

    expect(client.sentMessages).toHaveLength(1);
    const clientMsgId = client.sentMessages[0].meta?.['client_msg_id'];
    expect(typeof clientMsgId).toBe('string');
    expect(shadow.querySelectorAll('[data-testid="transcript-message"]')).toHaveLength(1);

    client.emit({
      type: 'chat::echo',
      schema: '1.0',
      session_id: client.sessionId,
      seq: 2,
      ts: '2026-05-14T18:35:10.000Z',
      payload: {
        role: 'user',
        content: ['Test'],
        meta: {
          client_msg_id: clientMsgId,
        },
      },
    });
    await flushAsyncWork();

    const messages = shadow.querySelectorAll('[data-testid="transcript-message"]');
    const status = shadow.querySelector('[data-testid="message-delivery-status"]') as HTMLElement;
    expect(messages).toHaveLength(1);
    expect((messages[0] as HTMLElement).dataset.role).toBe('user');
    expect(status.dataset.status).toBe('processed');
    expect(shadow.textContent).toContain('Test');
  });
});
