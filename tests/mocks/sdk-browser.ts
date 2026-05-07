type MessageHandler = (message: Record<string, unknown>) => void;

interface CortexClientOptions {
  apiKey: string;
  authUrl?: string;
  onMessage: (message: Record<string, unknown>) => void;
}

declare global {
  // eslint-disable-next-line no-var
  var __cortexChatWidgetSdkBrowserInstances__: CortexClient[] | undefined;
}

const instances = globalThis.__cortexChatWidgetSdkBrowserInstances__ ??= [];

export class CortexClient {
  static reset() {
    instances.length = 0;
  }

  static getLastInstance(): CortexClient | undefined {
    return instances.at(-1);
  }

  readonly options: CortexClientOptions;
  readonly sentMessages: Array<{ content: unknown; attachments?: unknown[] }> = [];
  readonly uploads: File[] = [];
  readonly uploadFiles: File[] = [];
  readonly listeners = new Set<MessageHandler>();
  connectCalls = 0;
  disconnectCalls = 0;
  uploadAttachmentCalls = 0;
  uploadFileCalls = 0;
  sessionState = 'ACTIVE';
  channelState = 'OPEN';
  sessionId = 'sess_mock';
  uploadAttachmentEnabled = true;
  uploadFileEnabled = true;

  constructor(options: CortexClientOptions) {
    this.options = options;
    instances.push(this);
  }

  onMessage(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  async sendMessage(options: { content: unknown; attachments?: unknown[] }): Promise<void> {
    this.sentMessages.push(options);
  }

  async uploadAttachment(file: File): Promise<string> {
    this.uploadAttachmentCalls += 1;
    this.uploads.push(file);
    return `attachment:${file.name}`;
  }

  async uploadFile(file: File): Promise<string> {
    this.uploadFileCalls += 1;
    this.uploadFiles.push(file);
    return `file:${file.name}`;
  }

  emit(message: Record<string, unknown>): void {
    this.options.onMessage(message);
    for (const listener of Array.from(this.listeners)) {
      listener(message);
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

export function __resetSdkBrowserMock(): void {
  CortexClient.reset();
}

export function __getLastSdkBrowserClient(): CortexClient | undefined {
  return CortexClient.getLastInstance();
}
