/**
 * EA multi-file widget flow: 3 user files -> one chat::message -> 2 generated files.
 *
 * Runs the widget against the real @cortex-suite/sdk-ui build installed in
 * node_modules (normalization, ownership projection, reconciliation) and the
 * canonical SDK fixture contracts/session_file_attachments_v1.json, copied
 * verbatim. The client is a test double for the SDK's uploadFile/downloadFile/
 * sendMessage surface; it is not physical Runtime -> SessionManager -> SDK
 * qualification.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

jest.unstable_mockModule('@cortex-suite/sdk-ui', async () => {
  const sdkUiUrl = new URL('../node_modules/@cortex-suite/sdk-ui/dist/src/index.js', import.meta.url);
  return import(sdkUiUrl.href);
});

type Descriptor = Record<string, unknown> & { file_ref: string; filename: string; content_type: string };
interface FixtureFile { descriptor: Descriptor; bytes_hex: string; sha256: string }
interface Fixture {
  session_id: string;
  client_msg_id: string;
  turn: number;
  inputs: FixtureFile[];
  outputs: FixtureFile[];
  messages: { chat_echo: Record<string, unknown>; chat_answer: Record<string, unknown> };
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/session_file_attachments_v1.json', import.meta.url), 'utf8'),
) as Fixture;

type TestMessage = {
  type: string;
  schema?: string;
  session_id?: string;
  seq?: number;
  ts?: string;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

class FileError extends Error {
  constructor(readonly code: string, message: string, readonly retryable: boolean) {
    super(message);
  }
}

// jsdom does not expose structuredClone.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bytesOf(file: FixtureFile): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(Buffer.from(file.bytes_hex, 'hex'));
}

function fileOf(input: FixtureFile): File {
  // A re-picked unchanged file has the same lastModified in the browser.
  return new File([bytesOf(input)], input.descriptor.filename, { type: input.descriptor.content_type, lastModified: 1_760_000_000_000 });
}

class FileClient {
  readonly listeners = new Set<(message: TestMessage) => void>();
  readonly sentMessages: Array<{ content: unknown; attachments?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }> = [];
  readonly uploadCalls: string[] = [];
  readonly downloadCalls: string[] = [];
  readonly failUploadOnce = new Set<string>();
  readonly failDownloads = new Map<string, FileError[]>();
  failSendCount = 0;
  sessionId = fixture.session_id;
  sessionState = 'ACTIVE';
  channelState = 'OPEN';
  accessToken: string | null = 'mock-access-token';
  cpApiUrl: string | null = null;
  private seq = 1;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async sendMessage(options: { content: unknown; attachments?: Array<Record<string, unknown>>; meta?: Record<string, unknown> }): Promise<void> {
    this.sentMessages.push(clone(options));
    if (this.failSendCount > 0) {
      this.failSendCount -= 1;
      throw new Error('Message was not sent');
    }
  }

  async uploadFile(file: File): Promise<string> {
    this.uploadCalls.push(file.name);
    if (this.failUploadOnce.delete(file.name)) {
      throw new FileError('file_transfer_interrupted', `Upload of ${file.name} was interrupted`, true);
    }
    if (file.name.endsWith('.exe')) throw new FileError('file_type_rejected', `${file.name} is not accepted`, false);
    const input = fixture.inputs.find((candidate) => candidate.descriptor.filename === file.name);
    return input?.descriptor.file_ref ?? `sf_test_${file.name.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  }

  async downloadFile(fileRef: string): Promise<Blob> {
    this.downloadCalls.push(fileRef);
    const failure = this.failDownloads.get(fileRef)?.shift();
    if (failure) throw failure;
    const output = fixture.outputs.find((candidate) => candidate.descriptor.file_ref === fileRef);
    if (!output) throw new FileError('file_not_found', 'File not found', false);
    return new Blob([bytesOf(output)], { type: output.descriptor.content_type });
  }

  onMessage(handler: (message: TestMessage) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  emit(type: string, payload: Record<string, unknown>): void {
    const message: TestMessage = {
      type,
      schema: '1.0',
      session_id: this.sessionId,
      seq: ++this.seq,
      ts: new Date(Date.UTC(2026, 9, 15, 12, 0, this.seq)).toISOString(),
      payload: clone(payload),
    };
    for (const listener of Array.from(this.listeners)) listener(message);
  }
}

function flushAsyncWork(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await flushAsyncWork();
  }
  throw new Error(`Timed out waiting for ${label}: ${document.body.firstElementChild?.firstElementChild?.shadowRoot?.querySelector('[data-testid="error-banner"]')?.textContent ?? ''}`);
}

function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function selectFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const INPUTS = fixture.inputs;
const OUTPUTS = fixture.outputs;
const INPUT_REFS = INPUTS.map((input) => input.descriptor.file_ref);
const OUTPUT_REFS = OUTPUTS.map((output) => output.descriptor.file_ref);

interface Mounted {
  client: FileClient;
  shadow: ShadowRoot;
  textarea: HTMLTextAreaElement;
  composer: HTMLFormElement;
  fileInput: HTMLInputElement;
  attachButton: HTMLButtonElement;
  chips(): HTMLElement[];
  chipNames(): string[];
  messages(role: string): HTMLElement[];
  cards(scope?: ParentNode): HTMLElement[];
}

async function mount(client = new FileClient()): Promise<Mounted> {
  const { mountCortexChat } = await import('../src/index.js');
  const target = document.createElement('div');
  document.body.appendChild(target);
  mountCortexChat({ apiKey: 'test-key', mode: 'embedded', target, client });
  await flushAsyncWork();
  const shadow = (target.firstElementChild as HTMLElement).shadowRoot!;
  const chips = () => Array.from(shadow.querySelectorAll('[data-testid="selected-file-chip"]')) as HTMLElement[];
  return {
    client,
    shadow,
    textarea: shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement,
    composer: shadow.querySelector('[data-testid="composer"]') as HTMLFormElement,
    fileInput: shadow.querySelector('[data-testid="file-input"]') as HTMLInputElement,
    attachButton: shadow.querySelector('[data-testid="attach-button"]') as HTMLButtonElement,
    chips,
    chipNames: () => chips().map((chip) => chip.querySelector('.cortex-widget__file-chip-name')?.textContent ?? ''),
    messages: (role) => Array.from(shadow.querySelectorAll(`[data-testid="transcript-message"][data-role="${role}"]`)) as HTMLElement[],
    cards: (scope: ParentNode = shadow) => Array.from(scope.querySelectorAll('[data-testid="generated-file-card"]')) as HTMLElement[],
  };
}

function typeText(view: Mounted, text: string): void {
  view.textarea.value = text;
  view.textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit(view: Mounted): void {
  view.composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

// Select [revenue.csv, extra.txt, brief.md], remove extra.txt, add appendix.bin.
function composeFixtureSelection(view: Mounted): void {
  selectFiles(view.fileInput, [fileOf(INPUTS[0]), new File(['x'], 'extra.txt', { type: 'text/plain' }), fileOf(INPUTS[1])]);
  const extra = view.chips().find((chip) => chip.textContent?.includes('extra.txt'))!;
  (extra.querySelector('[data-testid="remove-file"]') as HTMLButtonElement).click();
  selectFiles(view.fileInput, [fileOf(INPUTS[2])]);
}

function echoFor(clientMsgId: string): Record<string, unknown> {
  const echo = clone(fixture.messages.chat_echo) as { meta: { client_msg_id: string; attachments: Descriptor[] } };
  echo.meta.client_msg_id = clientMsgId;
  for (const attachment of echo.meta.attachments) attachment['message_ref'] = clientMsgId;
  return echo as unknown as Record<string, unknown>;
}

function answerWith(attachments: unknown[]): Record<string, unknown> {
  return { ...clone(fixture.messages.chat_answer), meta: { attachments } };
}

async function sendFixtureMessage(view: Mounted): Promise<string> {
  composeFixtureSelection(view);
  typeText(view, 'Compare the attached revenue files.');
  submit(view);
  await waitFor(() => view.client.sentMessages.length === 1, 'chat::message');
  return view.client.sentMessages[0].meta?.['client_msg_id'] as string;
}

const savedDownloads: Array<{ blob: Blob; url: string; filename: string }> = [];
let objectUrlSeq = 0;
const blobsByUrl = new Map<string, Blob>();

beforeEach(() => {
  document.body.innerHTML = '';
  savedDownloads.length = 0;
  blobsByUrl.clear();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: (blob: Blob) => {
      const url = `blob:widget-test/${++objectUrlSeq}`;
      blobsByUrl.set(url, blob);
      return url;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: (url: string) => { blobsByUrl.delete(url); } });
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    savedDownloads.push({ blob: blobsByUrl.get(this.href)!, url: this.href, filename: this.download });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EA multi-file composer', () => {
  it('select 3, remove 1, add 1 keeps 3 files in selection order with stable identities', async () => {
    const view = await mount();
    selectFiles(view.fileInput, [fileOf(INPUTS[0]), new File(['x'], 'extra.txt', { type: 'text/plain' }), fileOf(INPUTS[1])]);
    const idsBefore = view.chips().map((chip) => chip.dataset.fileId);
    const revenueChip = view.chips()[0];

    const extra = view.chips()[1];
    (extra.querySelector('[data-testid="remove-file"]') as HTMLButtonElement).click();
    selectFiles(view.fileInput, [fileOf(INPUTS[2])]);

    expect(view.chipNames()).toEqual(['revenue.csv', 'brief.md', 'appendix.bin']);
    expect(view.chips()).toHaveLength(3);
    // Unchanged chips keep their identity and DOM node.
    expect(view.chips()[0]).toBe(revenueChip);
    expect(view.chips()[1].dataset.fileId).toBe(idsBefore[2]);
    expect(new Set(view.chips().map((chip) => chip.dataset.fileId)).size).toBe(3);
    // Selecting the same unchanged file again does not add a duplicate.
    selectFiles(view.fileInput, [fileOf(INPUTS[0])]);
    expect(view.chips()).toHaveLength(3);
  });

  it('uploads all three in exact order and sends exactly one message with the ordered refs', async () => {
    const view = await mount();
    await sendFixtureMessage(view);

    expect(view.client.uploadCalls).toEqual(['revenue.csv', 'brief.md', 'appendix.bin']);
    expect(view.client.sentMessages).toHaveLength(1);
    expect(view.client.sentMessages[0].content).toEqual(['Compare the attached revenue files.']);
    expect(view.client.sentMessages[0].attachments!.map((ref) => ref['file_ref'])).toEqual(INPUT_REFS);
    expect(view.client.sentMessages[0].attachments![0]).toEqual({
      file_ref: 'sf_in_01HZY1', filename: 'revenue.csv', content_type: 'text/csv', size: 40,
    });
    await waitFor(() => view.chips().length === 0, 'composer cleared');
  });

  it('retries one failed upload without re-uploading the successful files', async () => {
    const view = await mount();
    view.client.failUploadOnce.add('brief.md');
    composeFixtureSelection(view);
    typeText(view, 'Compare the attached revenue files.');
    submit(view);
    await waitFor(() => view.chips()[1]?.dataset.status === 'failed', 'failed chip');

    expect(view.client.sentMessages).toHaveLength(0);
    expect(view.client.uploadCalls).toEqual(['revenue.csv', 'brief.md', 'appendix.bin']);
    expect(view.chips().map((chip) => chip.dataset.status)).toEqual(['uploaded', 'failed', 'uploaded']);
    const failed = view.chips()[1];
    expect(failed.querySelector('[data-testid="selected-file-status"]')!.textContent).toContain('interrupted');
    expect((view.shadow.querySelector('[data-testid="error-banner"]') as HTMLElement).textContent).toContain('interrupted');

    const retry = failed.querySelector('[data-testid="retry-file-upload"]') as HTMLButtonElement;
    expect(retry.hidden).toBe(false);
    expect(retry.getAttribute('aria-label')).toBe('Retry upload of brief.md');
    retry.click();
    await waitFor(() => view.chips()[1]?.dataset.status === 'uploaded', 'retried chip');
    expect(view.client.uploadCalls).toEqual(['revenue.csv', 'brief.md', 'appendix.bin', 'brief.md']);

    submit(view);
    await waitFor(() => view.client.sentMessages.length === 1, 'send');
    expect(view.client.uploadCalls).toHaveLength(4);
    expect(view.client.sentMessages[0].attachments!.map((ref) => ref['file_ref'])).toEqual(INPUT_REFS);
  });

  it('a non-retryable upload failure blocks sending until the file is removed', async () => {
    const view = await mount();
    selectFiles(view.fileInput, [fileOf(INPUTS[0]), new File(['x'], 'blocked.exe', { type: 'application/x-msdownload' })]);
    typeText(view, 'Two files');
    submit(view);
    await waitFor(() => view.chips()[1]?.dataset.status === 'failed', 'rejected chip');
    expect((view.chips()[1].querySelector('[data-testid="retry-file-upload"]') as HTMLButtonElement).hidden).toBe(true);

    submit(view);
    await flushAsyncWork();
    expect(view.client.sentMessages).toHaveLength(0);
    expect(view.client.uploadCalls).toEqual(['revenue.csv', 'blocked.exe']);

    (view.chips()[1].querySelector('[data-testid="remove-file"]') as HTMLButtonElement).click();
    submit(view);
    await waitFor(() => view.client.sentMessages.length === 1, 'send');
    expect(view.client.uploadCalls).toEqual(['revenue.csv', 'blocked.exe']);
    expect(view.client.sentMessages[0].attachments!.map((ref) => ref['file_ref'])).toEqual(['sf_in_01HZY1']);
  });

  it('a send failure after uploads reuses the same refs from the composer and the transcript retry', async () => {
    const view = await mount();
    view.client.failSendCount = 1;
    composeFixtureSelection(view);
    typeText(view, 'Compare the attached revenue files.');
    submit(view);
    await waitFor(() => view.client.sentMessages.length === 1, 'first send');
    await waitFor(() => Boolean(view.shadow.querySelector('[data-testid="message-retry-button"]')), 'failed message');

    expect(view.chipNames()).toEqual(['revenue.csv', 'brief.md', 'appendix.bin']);
    expect(view.textarea.value).toBe('Compare the attached revenue files.');

    (view.shadow.querySelector('[data-testid="message-retry-button"]') as HTMLButtonElement).click();
    await waitFor(() => view.client.sentMessages.length === 2, 'transcript retry');
    expect(view.client.sentMessages[1].attachments).toEqual(view.client.sentMessages[0].attachments);
    expect(view.client.uploadCalls).toHaveLength(3);
  });

  it('a composer resend after a failed send uploads nothing again', async () => {
    const view = await mount();
    view.client.failSendCount = 1;
    await sendFixtureMessage(view);
    await waitFor(() => Boolean(view.shadow.querySelector('[data-testid="message-retry-button"]')), 'failed message');

    submit(view);
    await waitFor(() => view.client.sentMessages.length === 2, 'resend');
    expect(view.client.uploadCalls).toEqual(['revenue.csv', 'brief.md', 'appendix.bin']);
    expect(view.client.sentMessages[1].attachments).toEqual(view.client.sentMessages[0].attachments);
  });

  it('caps the selection at 8 files and keeps input-lock and keyboard behavior', async () => {
    const view = await mount();
    const nine = Array.from({ length: 9 }, (_, i) => new File([String(i)], `f${i}.txt`, { type: 'text/plain' }));
    selectFiles(view.fileInput, nine);
    expect(view.chips()).toHaveLength(8);
    expect((view.shadow.querySelector('[data-testid="error-banner"]') as HTMLElement).textContent).toContain('up to 8 files');
    expect(view.attachButton.disabled).toBe(true);

    // Removing a chip moves focus to the next chip's remove button and re-enables attaching.
    const removeButtons = () => view.chips().map((chip) => chip.querySelector('[data-testid="remove-file"]') as HTMLButtonElement);
    expect(removeButtons()[2].getAttribute('aria-label')).toBe('Remove f2.txt');
    removeButtons()[2].focus();
    removeButtons()[2].click();
    expect(view.chips()).toHaveLength(7);
    expect(view.shadow.activeElement).toBe(removeButtons()[2]);
    expect(view.attachButton.disabled).toBe(false);
    expect((view.shadow.querySelector('[data-testid="error-banner"]') as HTMLElement).textContent).toBe('');

    // While the answer is pending the composer is locked.
    typeText(view, 'go');
    submit(view);
    await waitFor(() => view.client.sentMessages.length === 1, 'send');
    expect(view.attachButton.disabled).toBe(true);
    expect(view.textarea.disabled).toBe(true);
  });
});

describe('EA generated files', () => {
  async function answeredView(): Promise<Mounted & { clientMsgId: string }> {
    const view = await mount();
    const clientMsgId = await sendFixtureMessage(view);
    view.client.emit('chat::echo', echoFor(clientMsgId));
    // A Runtime partial of the same turn precedes the final answer.
    view.client.emit('chat::partial', { content: ['Here are'], role: 'assistant', turn: fixture.turn });
    view.client.emit('chat::answer', fixture.messages.chat_answer);
    await waitFor(() => view.cards().length === 2, 'generated file cards');
    return { ...view, clientMsgId };
  }

  it('shows 3 user files on one user message and 2 independent cards on its answer', async () => {
    const view = await answeredView();

    expect(view.messages('user')).toHaveLength(1);
    const userFiles = Array.from(view.messages('user')[0].querySelectorAll('[data-testid="message-attachment"]'));
    expect(userFiles.map((item) => item.querySelector('.cortex-widget__message-attachment-label')!.textContent))
      .toEqual(['revenue.csv', 'brief.md', 'appendix.bin']);
    expect(view.cards(view.messages('user')[0])).toHaveLength(0);

    const answers = view.messages('assistant');
    expect(answers).toHaveLength(1);
    const cards = view.cards(answers[0]);
    expect(cards.map((card) => card.dataset.fileRef)).toEqual(OUTPUT_REFS);
    expect(cards.map((card) => card.getAttribute('aria-label'))).toEqual(['Generated file delta.csv', 'Generated file summary.md']);
    expect(cards[0].textContent).toContain('text/csv');
    expect(cards[0].textContent).toContain('38 B');
    expect(cards.map((card) => card.dataset.state)).toEqual(['available', 'available']);
    expect(answers[0].textContent).toContain('Here are the regional deltas and a summary.');
  });

  it('downloads both files through client.downloadFile with exact bytes', async () => {
    const view = await answeredView();
    // Cards re-render as their download state changes; query each one fresh.
    for (const fileRef of OUTPUT_REFS) {
      (view.shadow.querySelector(`[data-download-file-ref="${fileRef}"]`) as HTMLButtonElement).click();
    }
    await waitFor(() => savedDownloads.length === 2, 'both downloads');

    expect(view.client.downloadCalls).toEqual(OUTPUT_REFS);
    expect(savedDownloads.map((download) => download.filename)).toEqual(['delta.csv', 'summary.md']);
    for (const [index, output] of OUTPUTS.entries()) {
      const bytes = await readBlob(savedDownloads[index].blob);
      expect(bytes.length).toBe(output.descriptor['size']);
      expect(sha256(bytes)).toBe(output.sha256);
      expect(savedDownloads[index].url.startsWith('blob:')).toBe(true);
    }
  });

  it('never makes wrong-owner, cross-turn or internal metadata actionable', async () => {
    const view = await mount();
    const clientMsgId = await sendFixtureMessage(view);
    view.client.emit('chat::echo', echoFor(clientMsgId));
    const [delta, summary] = OUTPUTS.map((output) => output.descriptor);
    view.client.emit('chat::answer', answerWith([
      // Runtime continue-from-WAIT re-exports the user's own inbound files.
      ...(echoFor(clientMsgId)['meta'] as { attachments: unknown[] }).attachments,
      { ...delta, file_ref: 'fi_0123456789abcdef' },
      { ...delta, file_ref: 'sf_out_cross', message_ref: '6' },
      { ...delta, file_ref: 'sf_out_user', owner_role: 'user' },
      { ...delta, file_ref: 'sf_out_snap', message_ref: 'sn_01' },
      { ...delta, download_url: 'https://evil.example/f', file_id: 'fi_x', snapshot_id: 'sn_x' },
      summary,
    ]));
    await waitFor(() => view.messages('assistant').length === 1, 'answer');
    await flushAsyncWork();

    // Only the generated outputs bound to turn 7 are downloadable. SDK UI keeps
    // the descriptor that carried extra internal fields as its 9 public fields only.
    expect(view.cards().map((card) => card.dataset.fileRef)).toEqual(OUTPUT_REFS);
    const buttons = Array.from(view.shadow.querySelectorAll('[data-download-file-ref]')) as HTMLElement[];
    expect(buttons.map((button) => button.dataset.downloadFileRef)).toEqual(OUTPUT_REFS);
    expect(view.messages('assistant')[0].textContent).not.toContain('revenue.csv');
    const html = view.shadow.innerHTML;
    for (const leaked of ['fi_', 'sn_', 'evil.example', 'sf_in_01HZY1', 'sf_out_cross', 'sf_out_user']) {
      expect(html.includes(leaked) ? leaked : null).toBeNull();
    }
    expect(view.shadow.querySelector('a[href]')).toBeNull();
  });

  it('reconnect/resync replay keeps exactly the same cards and user files', async () => {
    const view = await answeredView();
    const before = view.cards().map((card) => card.dataset.fileRef);

    // Replayed deliveries after a reconnect (new seq numbers).
    view.client.emit('chat::echo', echoFor(view.clientMsgId));
    view.client.emit('chat::answer', fixture.messages.chat_answer);
    // A later delivery without attachments never erases them.
    view.client.emit('chat::answer', { ...fixture.messages.chat_answer, meta: {} });
    await flushAsyncWork();

    expect(view.messages('user')).toHaveLength(1);
    expect(view.messages('user')[0].querySelectorAll('[data-testid="message-attachment"]')).toHaveLength(3);
    expect(view.messages('assistant')).toHaveLength(1);
    expect(view.cards().map((card) => card.dataset.fileRef)).toEqual(before);
  });

  it('an expired output cannot start a download', async () => {
    const view = await mount();
    const clientMsgId = await sendFixtureMessage(view);
    view.client.emit('chat::echo', echoFor(clientMsgId));
    const [delta, summary] = OUTPUTS.map((output) => output.descriptor);
    view.client.emit('chat::answer', answerWith([{ ...delta, state: 'expired' }, summary]));
    await waitFor(() => view.cards().length === 2, 'cards');

    const expired = view.cards()[0];
    const button = expired.querySelector('[data-testid="generated-file-download"]') as HTMLButtonElement;
    expect(expired.dataset.state).toBe('expired');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Expired');
    button.disabled = false; // a forced click still resolves the descriptor from the transcript
    button.click();
    await flushAsyncWork();
    expect(view.client.downloadCalls).toEqual([]);
    expect(savedDownloads).toEqual([]);
  });

  it('retries a network download failure and marks a server-expired file unavailable', async () => {
    const view = await answeredView();
    view.client.failDownloads.set('sf_out_01HZZ1', [new FileError('file_transfer_interrupted', 'Connection lost', true)]);
    view.client.failDownloads.set('sf_out_01HZZ2', [new FileError('file_expired', 'File expired', false)]);
    const button = (index: number) => view.cards()[index].querySelector('[data-testid="generated-file-download"]') as HTMLButtonElement;

    button(0).click();
    await waitFor(() => view.cards()[0].dataset.downloadStatus === 'failed', 'network failure');
    expect(button(0).textContent).toBe('Retry download');
    expect(button(0).disabled).toBe(false);
    expect(view.cards()[0].textContent).toContain('Connection lost');
    button(0).click();
    await waitFor(() => savedDownloads.length === 1, 'retried download');
    expect(sha256(await readBlob(savedDownloads[0].blob))).toBe(OUTPUTS[0].sha256);
    expect(view.cards()[0].dataset.downloadStatus).toBe('idle');

    button(1).click();
    await waitFor(() => view.cards()[1].dataset.downloadStatus === 'failed', 'expired failure');
    expect(button(1).disabled).toBe(true);
    expect(button(1).textContent).toBe('Unavailable');
    expect(view.client.downloadCalls).toEqual(['sf_out_01HZZ1', 'sf_out_01HZZ1', 'sf_out_01HZZ2']);
  });

  it('a zero-file message and answer render no file UI', async () => {
    const view = await mount();
    typeText(view, 'Hello');
    submit(view);
    await waitFor(() => view.client.sentMessages.length === 1, 'send');
    expect(view.client.sentMessages[0].attachments).toBeUndefined();
    view.client.emit('chat::answer', { content: ['Hi'], role: 'assistant', answer_kind: 'final', turn: 1 });
    await waitFor(() => view.messages('assistant').length === 1, 'answer');
    expect(view.shadow.querySelector('[data-testid="message-attachments"]')).toBeNull();
  });
});
