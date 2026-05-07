import { jest } from '@jest/globals';

type MockEnvelope = Record<string, any>;
type MockClient = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (message: MockEnvelope) => void): () => void;
  sendMessage(options: { content: unknown; attachments?: unknown[] }): Promise<void>;
  uploadAttachment(file: File): Promise<string>;
};

async function loadMockClientFactory(): Promise<() => MockClient> {
  // @ts-expect-error Example fixture is plain JS and intentionally has no bundled typings.
  const module = await import('../example/mock-client.js');
  return (module as { createMockCortexClient: () => MockClient }).createMockCortexClient;
}

function ensureUrlApi(method: 'createObjectURL' | 'revokeObjectURL'): void {
  if (typeof URL[method] === 'function') {
    return;
  }

  Object.defineProperty(URL, method, {
    configurable: true,
    writable: true,
    value: () => undefined,
  });
}

function flushTimers() {
  jest.runAllTimers();
}

describe('example mock client attachments', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    ensureUrlApi('createObjectURL');
    ensureUrlApi('revokeObjectURL');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('emits structured user and assistant attachments for attachment-only messages', async () => {
    const createMockCortexClient = await loadMockClientFactory();
    const client = createMockCortexClient();
    const messages: MockEnvelope[] = [];
    const file = new File(['plan'], 'plan-4.md', { type: 'text/markdown' });

    const createObjectUrlSpy = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:plan-4');

    client.onMessage((message: MockEnvelope) => {
      messages.push(message);
    });

    await client.connect();
    const attachmentId = await client.uploadAttachment(file);
    await client.sendMessage({ content: '', attachments: [attachmentId] });
    flushTimers();

    expect(createObjectUrlSpy).toHaveBeenCalledWith(file);

    const userMessage = messages.find((message) => message.type === 'chat::message');
    expect(userMessage?.payload).toMatchObject({
      role: 'user',
      content: '',
      attachments: [{
        file_id: attachmentId,
        filename: 'plan-4.md',
        content_type: 'text/markdown',
        size: file.size,
        download_url: 'blob:plan-4',
      }],
    });

    const finalAnswer = messages.find((message) => message.type === 'chat::answer');
    expect(finalAnswer?.payload).toMatchObject({
      role: 'assistant',
      answer_kind: 'final',
      content: 'I received your file.',
      attachments: [{
        file_id: attachmentId,
        filename: 'plan-4.md',
        content_type: 'text/markdown',
        size: file.size,
        download_url: 'blob:plan-4',
      }],
    });
    expect(finalAnswer?.payload.content).not.toContain('[attachment only message]');
    expect(finalAnswer?.payload.content).not.toContain('Mock attachments received');
  });

  it('echoes text while preserving structured assistant attachments', async () => {
    const createMockCortexClient = await loadMockClientFactory();
    const client = createMockCortexClient();
    const messages: MockEnvelope[] = [];
    const file = new File(['contract'], 'contract.pdf', { type: 'application/pdf' });

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:contract');

    client.onMessage((message: MockEnvelope) => {
      messages.push(message);
    });

    await client.connect();
    const attachmentId = await client.uploadAttachment(file);
    await client.sendMessage({ content: 'Please check this', attachments: [attachmentId] });
    flushTimers();

    const finalAnswer = messages.find((message) => message.type === 'chat::answer');
    expect(finalAnswer?.payload).toMatchObject({
      content: 'Echo: Please check this',
      attachments: [{
        file_id: attachmentId,
        filename: 'contract.pdf',
        download_url: 'blob:contract',
      }],
    });
  });

  it('revokes attachment object urls on disconnect', async () => {
    const createMockCortexClient = await loadMockClientFactory();
    const client = createMockCortexClient();
    const file = new File(['artifact'], 'artifact.txt', { type: 'text/plain' });
    const revokeSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:artifact');

    await client.connect();
    await client.uploadAttachment(file);
    await client.disconnect();

    expect(revokeSpy).toHaveBeenCalledWith('blob:artifact');
  });
});
