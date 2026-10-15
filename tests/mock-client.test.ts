import { jest } from '@jest/globals';

jest.unstable_mockModule('@cortex-suite/sdk-ui', async () => {
  const sdkUiUrl = new URL('../node_modules/@cortex-suite/sdk-ui/dist/src/index.js', import.meta.url);
  return import(sdkUiUrl.href);
});

type MockEnvelope = Record<string, any>;
type MockClient = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onMessage(handler: (message: MockEnvelope) => void): () => void;
  sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<void>;
  uploadFile(file: File): Promise<string>;
  downloadFile(fileRef: string): Promise<Blob>;
};

async function loadMockClientFactory(): Promise<() => MockClient> {
  // @ts-expect-error Example fixture is plain JS and intentionally has no bundled typings.
  const module = await import('../example/mock-client.js');
  return (module as { createMockCortexClient: () => MockClient }).createMockCortexClient;
}

function readText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

const URL_KEYS = ['download_url', 'download_mint_url', 'url', 'href'];

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

describe('example mock client follows the public file contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function sendWithFiles(content: string, files: File[], clientMsgId = 'cli_demo_1') {
    const createMockCortexClient = await loadMockClientFactory();
    const client = createMockCortexClient();
    const messages: MockEnvelope[] = [];
    client.onMessage((message: MockEnvelope) => messages.push(message));
    await client.connect();
    const refs: string[] = [];
    for (const file of files) refs.push(await client.uploadFile(file));
    await client.sendMessage({ content: [content], attachments: refs.map((fileRef) => ({ file_ref: fileRef })), meta: { client_msg_id: clientMsgId } });
    jest.runAllTimers();
    return { client, messages, refs };
  }

  it('confirms user files on the echo bound to client_msg_id', async () => {
    const files = [new File(['plan'], 'plan-4.md', { type: 'text/markdown' }), new File(['a,b'], 'data.csv', { type: 'text/csv' })];
    const { messages, refs } = await sendWithFiles('', files);

    expect(refs).toEqual(['sf_mock_1_plan-4-md', 'sf_mock_2_data-csv']);
    for (const ref of refs) expect(ref).toMatch(/^sf_[A-Za-z0-9][A-Za-z0-9_-]*$/);
    const echo = messages.find((message) => message.type === 'chat::echo');
    expect(echo?.payload).toEqual({
      role: 'user',
      content: [''],
      meta: {
        client_msg_id: 'cli_demo_1',
        attachments: files.map((file, index) => ({
          file_ref: refs[index],
          filename: file.name,
          content_type: file.type,
          size: file.size,
          state: 'available',
          owner_role: 'user',
          direction: 'inbound',
          message_ref: 'cli_demo_1',
          message_ref_kind: 'client_msg_id',
        })),
      },
    });
  });

  it('streams Runtime-shaped partials and answers with a generated file bound to the turn', async () => {
    const { client, messages } = await sendWithFiles('Please check this', [new File(['contract'], 'contract.pdf', { type: 'application/pdf' })]);

    const partials = messages.filter((message) => message.type === 'chat::partial');
    const answer = messages.find((message) => message.type === 'chat::answer')!;
    expect(partials.length).toBeGreaterThan(0);
    for (const partial of partials) {
      expect(partial.payload).toEqual({ role: 'assistant', turn: 1, content: [expect.any(String)] });
    }
    expect(partials.map((partial) => partial.payload.content[0]).join('')).toBe('Echo: Please check this');
    expect(answer.payload).toMatchObject({ role: 'assistant', turn: 1, answer_kind: 'final', content: ['Echo: Please check this'] });

    const [output] = answer.payload.meta.attachments;
    expect(output).toEqual({
      file_ref: 'sf_mock_out_1',
      filename: 'received-files-1.txt',
      content_type: 'text/plain',
      size: expect.any(Number),
      state: 'available',
      owner_role: 'assistant',
      direction: 'outbound',
      message_ref: '1',
      message_ref_kind: 'turn',
    });
    const blob = await client.downloadFile(output.file_ref);
    const text = await readText(blob);
    expect(text).toBe('Received files:\ncontract.pdf (8 bytes)\n');
    expect(blob.size).toBe(output.size);
  });

  it('never emits URLs, turn_id or user files on the answer', async () => {
    const { messages } = await sendWithFiles('x', [new File(['1'], 'one.txt', { type: 'text/plain' })]);
    const keys = collectKeys(messages.map((message) => message.payload));
    for (const key of [...URL_KEYS, 'turn_id', 'file_id', 'snapshot_id']) {
      expect(keys.has(key) ? key : null).toBeNull();
    }
    const answer = messages.find((message) => message.type === 'chat::answer')!;
    expect(answer.payload.meta.attachments.every((file: MockEnvelope) => file.owner_role === 'assistant')).toBe(true);
  });

  it('downloads only generated files and forgets them on disconnect', async () => {
    const { client, refs, messages } = await sendWithFiles('x', [new File(['1'], 'one.txt', { type: 'text/plain' })]);
    const outputRef = messages.find((message) => message.type === 'chat::answer')!.payload.meta.attachments[0].file_ref;
    await expect(client.downloadFile(refs[0])).rejects.toMatchObject({ code: 'file_not_found' });
    await client.disconnect();
    await expect(client.downloadFile(outputRef)).rejects.toMatchObject({ code: 'file_not_found' });
  });

  it('answers a text-only message without files and preserves client_msg_id', async () => {
    const { messages } = await sendWithFiles('Test', [], 'client-test-1');
    const echo = messages.find((message) => message.type === 'chat::echo');
    expect(echo?.payload).toEqual({ role: 'user', content: ['Test'], meta: { client_msg_id: 'client-test-1' } });
    const answer = messages.find((message) => message.type === 'chat::answer')!;
    expect(answer.payload.meta.attachments).toBeUndefined();
  });
});

describe('example mock client drives the widget end to end', () => {
  it('uploads two files, shows the generated card and downloads it through downloadFile', async () => {
    const createMockCortexClient = await loadMockClientFactory();
    const client = createMockCortexClient();
    const downloadSpy = jest.spyOn(client, 'downloadFile');
    const saved: Array<{ blob: Blob; filename: string }> = [];
    const blobs = new Map<string, Blob>();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => {
        const url = `blob:demo/${blobs.size + 1}`;
        blobs.set(url, blob);
        return url;
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ blob: blobs.get(this.href)!, filename: this.download });
    });

    const { mountCortexChat } = await import('../src/index.js');
    const target = document.createElement('div');
    document.body.appendChild(target);
    const widget = mountCortexChat({ apiKey: 'demo', mode: 'embedded', target, client: client as never });
    const shadow = (target.firstElementChild as HTMLElement).shadowRoot!;
    const fileInput = shadow.querySelector('[data-testid="file-input"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['a'], 'a.txt', { type: 'text/plain' }), new File(['bb'], 'b.txt', { type: 'text/plain' })],
    });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    (shadow.querySelector('[data-testid="composer"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const card = await new Promise<HTMLElement>((resolve, reject) => {
      const started = Date.now();
      const poll = () => {
        const found = shadow.querySelector('[data-testid="generated-file-card"]') as HTMLElement | null;
        if (found) resolve(found);
        else if (Date.now() - started > 5000) {
          const banner = shadow.querySelector('[data-testid="error-banner"]')?.textContent;
          reject(new Error(`generated file card did not appear (error banner: ${banner})`));
        }
        else window.setTimeout(poll, 20);
      };
      poll();
    });

    const userFiles = Array.from(shadow.querySelectorAll('[data-role="user"] .cortex-widget__message-attachment-label'))
      .map((element) => element.textContent);
    expect(userFiles).toEqual(['a.txt', 'b.txt']);
    expect(card.getAttribute('aria-label')).toBe('Generated file received-files-1.txt');

    (card.querySelector('[data-testid="generated-file-download"]') as HTMLButtonElement).click();
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    expect(downloadSpy).toHaveBeenCalledWith('sf_mock_out_1');
    expect(saved.map((entry) => entry.filename)).toEqual(['received-files-1.txt']);
    expect(await readText(saved[0].blob)).toBe('Received files:\na.txt (1 bytes)\nb.txt (2 bytes)\n');
    widget.destroy();
  });
});
