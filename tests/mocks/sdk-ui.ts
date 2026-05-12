type Listener = (state: ChatState) => void;

export type ChatMessageDeliveryStatus = 'sending' | 'sent' | 'failed';

export type SendMessageResult =
  | { ok: true; messageId: string; clientMsgId: string }
  | { ok: false; messageId: string; clientMsgId: string; error: string };

export interface ChatMessageViewModel {
  id: string;
  seq?: number | null;
  type: string;
  role: 'user' | 'assistant' | 'system' | 'operator' | 'escalation' | 'error';
  content: unknown;
  status?: 'streaming' | 'final' | 'error';
  ts?: string | null;
  meta?: Record<string, unknown>;
  clientMsgId?: string;
  deliveryStatus?: ChatMessageDeliveryStatus;
  retryable?: boolean;
  sendError?: string;
  originalPayload?: {
    content: unknown;
    attachments?: unknown[];
    meta?: Record<string, unknown>;
  };
}

export interface ChatErrorViewModel {
  code: string;
  message: string;
  source?: string;
  details?: Record<string, unknown>;
}

export interface EscalationState {
  escalationId: string;
  reason?: string;
  message?: string;
  content?: unknown;
  allowedActions: Array<'continue' | 'operator_input' | 'reply_user'>;
  waitToken?: string;
  status: 'pending' | 'replied' | 'expired' | 'cancelled';
}

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionState {
  question_id: string;
  input_type: string;
  allow_reply: boolean;
  options: QuestionOption[];
  turn_id?: string | null;
}

export interface WorkerState {
  state: 'idle' | 'working' | 'waiting' | 'error';
  label?: string;
  expiresAt?: number;
  canRetry?: boolean;
  correlation_id?: string;
}

export interface ChatCorrespondent {
  kind?: string;
  id?: string | null;
  name: string;
  title?: string | null;
  subtitle?: string | null;
  avatarUrl?: string | null;
}

export interface ChatSessionState {
  correspondent: ChatCorrespondent | null;
}

export interface ChatState {
  session: ChatSessionState;
  connection: {
    channelState: string;
    sessionState: string;
    isConnected: boolean;
    isStale: boolean;
  };
  transcript: ChatMessageViewModel[];
  input: {
    locked: boolean;
    reason?: string;
  };
  escalation: EscalationState | null;
  lastError: ChatErrorViewModel | null;
  activeQuestion: QuestionState | null;
  workerState: WorkerState;
}

export interface CortexClientLike {
  connect(): Promise<void>;
  disconnect?(): Promise<void>;
  sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<void>;
  onMessage(handler: (message: Record<string, unknown>) => void): () => void;
  sessionId?: string | null;
  sessionMeta?: Record<string, unknown> | null;
  sessionState?: string;
  channelState?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __cortexChatWidgetSdkUiControllers__: MockChatController[] | undefined;
}

const controllers = globalThis.__cortexChatWidgetSdkUiControllers__ ??= [];

export class MockChatController {
  state: ChatState = createMockChatState();
  readonly subscribers = new Set<Listener>();
  readonly sendCalls: Array<{ content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }> = [];
  connectCalls = 0;
  disconnectCalls = 0;
  destroyCalls = 0;
  nextSendError: Error | null = null;
  nextRetryError: Error | null = null;

  getState(): ChatState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
  }

  async sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<SendMessageResult> {
    this.sendCalls.push(options);
    if (this.nextSendError) {
      const error = this.nextSendError;
      this.nextSendError = null;
      return { ok: false, messageId: 'client:mock', clientMsgId: 'mock', error: error.message };
    }
    return { ok: true, messageId: 'client:mock', clientMsgId: 'mock' };
  }

  async retryMessage(_messageId: string): Promise<SendMessageResult | null> {
    if (this.nextRetryError) {
      const error = this.nextRetryError;
      this.nextRetryError = null;
      return { ok: false, messageId: _messageId, clientMsgId: 'mock', error: error.message };
    }
    return { ok: true, messageId: _messageId, clientMsgId: 'mock' };
  }
  async replyToUser(): Promise<void> {}
  async returnToWorker(): Promise<void> {}
  async continueWorker(): Promise<void> {}

  destroy(): void {
    this.destroyCalls += 1;
    this.subscribers.clear();
  }

  setState(nextState: ChatState): void {
    this.state = nextState;
    for (const listener of Array.from(this.subscribers)) {
      listener(nextState);
    }
  }
}

export function createChatController(_options: { client: CortexClientLike }): MockChatController {
  const controller = new MockChatController();
  controllers.push(controller);
  return controller;
}

export function createMockChatState(
  overrides: Partial<ChatState> = {},
): ChatState {
  return {
    session: overrides.session ?? { correspondent: null },
    connection: {
      channelState: 'OPEN',
      sessionState: 'ACTIVE',
      isConnected: true,
      isStale: false,
      ...(overrides.connection ?? {}),
    },
    transcript: overrides.transcript ?? [],
    input: {
      locked: false,
      ...(overrides.input ?? {}),
    },
    escalation: overrides.escalation ?? null,
    lastError: overrides.lastError ?? null,
    activeQuestion: overrides.activeQuestion ?? null,
    workerState: overrides.workerState ?? { state: 'idle' },
  };
}

export function __resetSdkUiMock(): void {
  controllers.length = 0;
}

export function __getLastController(): MockChatController | undefined {
  return controllers.at(-1);
}
