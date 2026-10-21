type Listener = (state: ChatState) => void;

// S21 controller surface, used by widget DOM tests with an authenticated mock client.
export function createHumanAssistanceController(options: {
  client: {
    humanAssistanceRequests: Array<{ request_id: string; question: string; options: Array<{ id: string; label: string }>; allow_text: boolean; deadline_at: string }>;
    onHumanAssistance(handler: (event: { type: string; payload: any }) => void): () => void;
    replyHumanAssistance(payload: unknown): Promise<void>;
  };
}) {
  type Request = typeof options.client.humanAssistanceRequests[number];
  type Card = { request: Request; optionId: string | null; text: string; status: string; clientReplyId: string | null; error?: string; reason?: string };
  const cards = new Map<string, Card>();
  const submissions = new Map<string, any>();
  const listeners = new Set<(cards: Card[]) => void>();
  const emit = () => listeners.forEach((listener) => listener([...cards.values()].map((card) => ({ ...card }))));
  const add = (request: Request) => {
    if (!cards.has(request.request_id)) { cards.set(request.request_id, { request, optionId: null, text: '', status: 'pending', clientReplyId: null }); emit(); }
  };
  const unsubscribe = options.client.onHumanAssistance((event) => {
    if (event.type === 'human_assistance::request') { add(event.payload); return; }
    const card = cards.get(event.payload.request_id);
    if (!card) return;
    if (['resolved', 'expired', 'revoked'].includes(event.payload.status)) card.status = event.payload.status;
    else if (event.payload.client_reply_id === card.clientReplyId) {
      if (event.payload.status === 'reply_accepted') card.status = 'accepted';
      if (event.payload.status === 'reply_rejected') { card.status = 'rejected'; card.reason = event.payload.reason; }
    }
    emit();
  });
  options.client.humanAssistanceRequests.forEach(add);
  const pending = (id: string) => {
    const card = cards.get(id);
    if (!card || card.status !== 'pending' || Date.now() >= Date.parse(card.request.deadline_at)) throw Error('inactive request');
    return card;
  };
  const send = async (card: Card, payload: any) => {
    card.status = 'sent'; card.error = undefined; emit();
    try { await options.client.replyHumanAssistance(payload); }
    catch (error) { card.error = (error as Error).message; emit(); throw error; }
  };
  const begin = (id: string, action: 'answer' | 'refuse') => {
    const card = pending(id);
    if (action === 'answer' && !card.optionId && !card.text.trim()) throw Error('empty answer');
    const payload = { requestId: id, clientReplyId: `reply_${submissions.size + 1}`, action,
      ...(action === 'answer' && card.optionId ? { optionId: card.optionId } : {}),
      ...(action === 'answer' && card.text.trim() ? { text: card.text.trim() } : {}) };
    card.clientReplyId = payload.clientReplyId;
    submissions.set(id, payload);
    return send(card, payload);
  };
  return {
    getCards: () => [...cards.values()],
    subscribe: (listener: (cards: Card[]) => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    selectOption: (id: string, optionId: string | null) => { const card = pending(id); if (optionId && !card.request.options.some((option) => option.id === optionId)) throw Error('invalid option'); card.optionId = optionId; emit(); },
    setText: (id: string, value: string) => { const card = pending(id); if (!card.request.allow_text || value.length > 4096) throw Error('invalid text'); card.text = value; emit(); },
    submit: (id: string) => begin(id, 'answer'),
    refuse: (id: string) => begin(id, 'refuse'),
    retry: (id: string) => { const card = cards.get(id); const payload = submissions.get(id); if (!card || !payload || card.status !== 'sent' || !card.error) throw Error('retry unavailable'); return send(card, payload); },
    reset: () => { cards.clear(); emit(); },
    destroy: () => { unsubscribe(); cards.clear(); listeners.clear(); },
  };
}

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
  transcript: readonly ChatMessageViewModel[];
  transcriptRevision: number;
  transcriptMutation: {
    type: 'message_added' | 'message_updated';
    index: number;
    message: ChatMessageViewModel;
  } | null;
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
    transcriptRevision: overrides.transcriptRevision ?? 0,
    transcriptMutation: overrides.transcriptMutation ?? null,
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function parseRawActor(raw: unknown): ChatActor | null {
  if (!isRecord(raw)) return null;
  const kindRaw = asNonEmptyString(raw['kind']);
  const name = asNonEmptyString(raw['name']);
  const kindMap: Record<string, ChatActorKind> = {
    operator: 'operator',
    human_operator: 'operator',
    digital_worker: 'digital_worker',
    user: 'user',
    system: 'system',
  };
  const resolvedKind = kindRaw ? (kindMap[kindRaw] ?? null) : null;
  if (!resolvedKind || !name) return null;
  return {
    kind: resolvedKind,
    id: asNonEmptyString(raw['id']) ?? null,
    name,
    title: asNonEmptyString(raw['title']) ?? null,
    subtitle: asNonEmptyString(raw['subtitle']) ?? null,
    avatarUrl: asNonEmptyString(raw['avatarUrl']) ?? asNonEmptyString(raw['avatar_url']) ?? null,
  };
}

export function __resetSdkUiMock(): void {
  controllers.length = 0;
}

export function __getLastController(): MockChatController | undefined {
  return controllers.at(-1);
}
