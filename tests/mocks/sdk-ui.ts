type Listener = (state: ChatState) => void;

export type ChatMessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'processed' | 'failed';

export interface CortexTransportMessage {
  type: string;
  schema?: string;
  session_id?: string;
  seq?: number;
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  ts?: string;
  [key: string]: unknown;
}

export type SendMessageResult =
  | { ok: true; messageId: string; clientMsgId: string }
  | { ok: false; messageId: string; clientMsgId: string; error: string };

export type ChatActorKind = 'user' | 'operator' | 'digital_worker' | 'system';

export interface ChatActor {
  kind: ChatActorKind;
  id?: string | null;
  name: string;
  title?: string | null;
  subtitle?: string | null;
  avatarUrl?: string | null;
}

export interface ChatMessageViewModel {
  id: string;
  seq?: number | null;
  type: string;
  role: 'user' | 'assistant' | 'system' | 'operator' | 'escalation' | 'error';
  content: unknown;
  status?: 'streaming' | 'final' | 'error';
  ts?: string | null;
  meta?: Record<string, unknown>;
  actor?: ChatActor | null;
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

export type QuestionType = 'select' | 'radio' | 'text' | 'boolean' | 'date' | 'email';

export interface QuestionField {
  key: string;
  label: string;
  type: QuestionType;
  required: boolean;
  options: QuestionOption[];
}

export interface QuestionState {
  question_ref: string;
  question_id?: string;
  input_type: string;
  allow_reply: boolean;
  questions?: QuestionField[];
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

export interface ChatAuthState {
  state: 'none' | 'required' | 'submitting' | 'denied' | 'accepted';
  message?: string;
  method?: 'login_password';
}

export interface ChatState {
  session: ChatSessionState;
  connection: {
    channelState: string;
    sessionState: string;
    sessionId: string | null;
    isSessionReady: boolean;
    isConnected: boolean;
    isStale: boolean;
  };
  transcript: ChatMessageViewModel[];
  input: {
    locked: boolean;
    reason?: string;
  };
  auth: ChatAuthState;
  escalation: EscalationState | null;
  lastError: ChatErrorViewModel | null;
  activeQuestion: QuestionState | null;
  workerState: WorkerState;
}

export type RenderedChatContent =
  | { format: 'html'; html: string; kind: 'assistant_markdown' }
  | {
    format: 'text';
    text: string;
    style: 'plain' | 'preformatted';
    kind: 'plain_text' | 'structured_fallback';
  };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toTextualContent(source: unknown): string | null {
  if (typeof source === 'string') {
    return source;
  }
  if (isStringArray(source)) {
    return source.join('\n');
  }
  if (source === null || source === undefined) {
    return '';
  }
  return null;
}

function toStructuredText(source: unknown): string {
  if (source === null || source === undefined) {
    return '';
  }
  try {
    return JSON.stringify(source, null, 2);
  } catch {
    return String(source);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderAssistantMarkdown(source: unknown): string {
  const text = toTextualContent(source) ?? '';
  return `<p>${escapeHtml(text)}</p>\n`;
}

export function renderUserText(source: unknown): string {
  return toTextualContent(source) ?? toStructuredText(source);
}

export function renderChatMessageContent(message: ChatMessageViewModel): RenderedChatContent {
  const text = toTextualContent(message.content);
  if (
    message.role === 'assistant'
    && message.type === 'chat::answer'
    && message.status === 'final'
    && text !== null
  ) {
    return {
      format: 'html',
      html: renderAssistantMarkdown(message.content),
      kind: 'assistant_markdown',
    };
  }

  if (text !== null) {
    return {
      format: 'text',
      text: renderUserText(message.content),
      style: 'plain',
      kind: 'plain_text',
    };
  }

  return {
    format: 'text',
    text: toStructuredText(message.content),
    style: 'preformatted',
    kind: 'structured_fallback',
  };
}

export interface CortexClientLike {
  connect(): Promise<void>;
  disconnect?(): Promise<void>;
  sendMessage(options: { content: unknown; attachments?: unknown[]; meta?: Record<string, unknown> }): Promise<void>;
  onMessage(handler: (message: CortexTransportMessage) => void): () => void;
  sessionId?: string | null;
  sessionMeta?: Record<string, unknown> | null;
  sessionContext?: {
    sessionId: string;
    identity?: Record<string, unknown> | null;
    correspondent?: ChatCorrespondent | null;
  } | null;
  sessionState?: string;
  channelState?: string;
  accessToken?: string | null;
  cpApiUrl?: string | null;
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
  readonly loginCalls: Array<{ login: string; password: string }> = [];
  connectCalls = 0;
  disconnectCalls = 0;
  destroyCalls = 0;
  nextSendError: Error | null = null;
  nextRetryError: Error | null = null;
  nextLoginResult: { ok: boolean; error?: string } = { ok: true };

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
  async submitLogin(credentials: { login: string; password: string }): Promise<{ ok: boolean; error?: string }> {
    this.loginCalls.push({ login: credentials.login, password: credentials.password });
    return this.nextLoginResult;
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

export function createChatController(_options: { client: CortexClientLike; debug?: boolean }): MockChatController {
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
      sessionId: 'sess_mock',
      isSessionReady: true,
      isConnected: true,
      isStale: false,
      ...(overrides.connection ?? {}),
    },
    transcript: overrides.transcript ?? [],
    input: {
      locked: false,
      ...(overrides.input ?? {}),
    },
    auth: overrides.auth ?? { state: 'none' },
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
