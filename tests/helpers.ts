import type { ChatState, CortexTransportMessage } from './mocks/sdk-ui.js';
import { __getLastController, __resetSdkUiMock, createMockChatState } from './mocks/sdk-ui.js';
import { __getLastSdkBrowserClient, __resetSdkBrowserMock } from './mocks/sdk-browser.js';
import type { CortexChatWidgetOptions } from '../src/index.js';
import type { WidgetClientLike } from '../src/types.js';
import { mountCortexChat } from '../src/index.js';

export class CustomClient implements WidgetClientLike {
  readonly listeners = new Set<(message: CortexTransportMessage) => void>();
  readonly sentMessages: Array<{ content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }> = [];
  readonly uploadedAttachments: File[] = [];
  readonly uploadedFiles: File[] = [];
  sessionMeta: Record<string, unknown> | null = null;
  sessionState = 'ACTIVE';
  channelState = 'OPEN';
  sessionId = 'sess_custom';
  accessToken: string | null = 'mock-access-token';
  cpApiUrl: string | null = null;
  uploadAttachmentImpl?: (file: File) => Promise<string>;
  uploadFileImpl?: (file: File) => Promise<string>;

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}

  async sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<void> {
    this.sentMessages.push(options);
  }

  onMessage(handler: (message: CortexTransportMessage) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async uploadAttachment(file: File): Promise<string> {
    this.uploadedAttachments.push(file);
    if (!this.uploadAttachmentImpl) {
      throw new Error('uploadAttachment unavailable');
    }
    return this.uploadAttachmentImpl(file);
  }

  async uploadFile(file: File): Promise<string> {
    this.uploadedFiles.push(file);
    if (!this.uploadFileImpl) {
      throw new Error('uploadFile unavailable');
    }
    return this.uploadFileImpl(file);
  }

  emit(message: CortexTransportMessage): void {
    for (const listener of Array.from(this.listeners)) {
      listener(message);
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

export function resetMocks(): void {
  document.body.innerHTML = '';
  __resetSdkBrowserMock();
  __resetSdkUiMock();
}

export function mountWidget(
  options: Partial<CortexChatWidgetOptions> = {},
) {
  const widget = mountCortexChat({
    apiKey: 'test-key',
    ...options,
  });

  const controller = __getLastController();
  if (!controller) {
    throw new Error('Expected mock controller');
  }

  const autoClient = __getLastSdkBrowserClient();
  return {
    widget,
    controller,
    autoClient,
  };
}

export function applyChatState(nextState: ChatState): void {
  const controller = __getLastController();
  if (!controller) {
    throw new Error('Expected mock controller');
  }
  controller.setState(nextState);
}

export function baseChatState(overrides: Partial<ChatState> = {}): ChatState {
  return createMockChatState(overrides);
}

export function changeInput(
  textarea: HTMLTextAreaElement,
  value: string,
): void {
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function submitComposer(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

export function setFileInput(fileInput: HTMLInputElement, file: File): void {
  Object.defineProperty(fileInput, 'files', {
    configurable: true,
    value: [file],
  });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function flushAsyncWork(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}
