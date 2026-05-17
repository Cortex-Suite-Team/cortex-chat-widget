import { createChatController, type ChatController, type ChatState } from '@cortex-suite/sdk-ui';
import { createDebugLogger } from './debug.js';
import { createWidgetError, toWidgetError } from './errors.js';
import { createHistoryClient } from './history-client.js';
import { HistoryController } from './history-controller.js';
import { createHistoryDom } from './history-dom.js';
import {
  getMessageFlags,
  isTerminalSessionState,
} from './message-flags.js';
import { applyResolvedTheme, renderWidget } from './renderer.js';
import type {
  ChatMessageViewModel,
  ChatViewMode,
  CortexChatWidgetHandle,
  CortexChatWidgetOptions,
  CortexChatWidgetState,
  InternalWidgetState,
  NormalizedWidgetOptions,
  WidgetClientLike,
  WidgetDom,
} from './types.js';

const EMPTY_CHAT_STATE: ChatState = {
  session: {
    correspondent: null,
  },
  connection: {
    channelState: 'CLOSED',
    sessionState: 'CREATED',
    sessionId: null,
    isSessionReady: false,
    isConnected: false,
    isStale: false,
  },
  transcript: [],
  input: {
    locked: false,
  },
  auth: { state: 'none' },
  escalation: null,
  lastError: null,
  activeQuestion: null,
  workerState: { state: 'idle' },
};

const MAX_RUNTIME_CHAT_TITLE_LENGTH = 120;

function cloneChatState(state: ChatState): ChatState {
  return {
    session: {
      correspondent: state.session.correspondent ? { ...state.session.correspondent } : null,
    },
    connection: { ...state.connection },
    transcript: [...state.transcript],
    input: { ...state.input },
    auth: { ...state.auth },
    escalation: state.escalation ? { ...state.escalation } : null,
    lastError: state.lastError ? { ...state.lastError } : null,
    activeQuestion: state.activeQuestion
      ? { ...state.activeQuestion, options: [...state.activeQuestion.options] }
      : null,
    workerState: { ...state.workerState },
  };
}

function summarizeSendPayload(payload: {
  content?: unknown;
  attachments?: unknown[];
  meta?: Record<string, unknown>;
}) {
  return {
    contentKind: Array.isArray(payload.content) ? 'array' : typeof payload.content,
    contentLength: Array.isArray(payload.content) ? payload.content.length : undefined,
    hasAttachments: Boolean(payload.attachments?.length),
    attachmentCount: payload.attachments?.length ?? 0,
    metaKeys: payload.meta ? Object.keys(payload.meta) : [],
    clientMsgId:
      payload.meta && typeof payload.meta.client_msg_id === 'string'
        ? payload.meta.client_msg_id
        : undefined,
  };
}

export class ChatWidget {
  private readonly options: NormalizedWidgetOptions;
  private readonly dom: WidgetDom;
  private readonly mountTarget: HTMLElement;
  private readonly historyTarget?: HTMLElement;
  private readonly createClient: () => WidgetClientLike;
  private readonly debug;
  private client!: WidgetClientLike;
  private controller!: ChatController;
  private liveChatState: ChatState = EMPTY_CHAT_STATE;
  private historicalTranscript: ChatMessageViewModel[] = [];
  private chatView: ChatViewMode = { kind: 'live' };
  private historyController: HistoryController | null = null;
  private historyClientKey: string | null = null;
  private liveConnected = false;
  private liveConnectPromise: Promise<void> | null = null;
  private lastTranscriptRenderKey = '';
  private mounted = false;
  private readonly domCleanup = new Set<() => void>();
  private unsubscribeController: (() => void) | null = null;
  private unsubscribeRawMessages: (() => void) | null = null;
  private readonly ui: InternalWidgetState = {
    isOpen: false,
    isReady: false,
    isDestroyed: false,
    isAwaitingAnswer: false,
    isTyping: false,
    isUploading: false,
    attachmentsAvailable: false,
    selectedFile: null,
    selectedFileValue: null,
    cachedUploadedAttachmentId: null,
    cachedUploadedFile: null,
    draftText: '',
    error: null,
  };

  private readonly onTextareaInput = () => {
    this.ui.draftText = this.dom.textarea.value;
    this.resizeComposerTextarea();
    this.notifyAndRender();
  };

  private readonly onTextareaKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.handleSend();
    }
  };

  private readonly onComposerSubmit = (event: Event) => {
    event.preventDefault();
    void this.handleSend();
  };

  private readonly onAttachClick = () => {
    if (
      !this.ui.attachmentsAvailable
      || this.ui.isUploading
      || this.ui.isAwaitingAnswer
      || this.getDisplayedChatState().input.locked
    ) {
      return;
    }
    this.dom.fileInput.click();
  };

  private readonly onFileChange = () => {
    const file = this.dom.fileInput.files?.[0] ?? null;
    if (!this.ui.attachmentsAvailable || !file) {
      this.dom.fileInput.value = '';
      return;
    }
    this.setSelectedFile(file);
    this.notifyAndRender();
  };

  private readonly onRemoveFile = () => {
    this.clearSelectedFile();
    this.notifyAndRender();
  };

  private readonly onAuthSubmitClick = () => {
    void this.handleLoginSubmit();
  };

  private readonly onAuthPasswordKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.handleLoginSubmit();
    }
  };

  private readonly onLauncherClick = () => {
    if (this.options.mode !== 'floating') {
      return;
    }
    this.setOpen(!this.ui.isOpen);
  };

  private readonly onTranscriptClick = (event: MouseEvent) => {
    void this.handleTranscriptClick(event);
  };

  constructor(args: {
    options: NormalizedWidgetOptions;
    dom: WidgetDom;
    mountTarget: HTMLElement;
    historyTarget?: HTMLElement;
    createClient: () => WidgetClientLike;
  }) {
    this.options = args.options;
    this.dom = args.dom;
    this.mountTarget = args.mountTarget;
    this.historyTarget = args.historyTarget;
    this.createClient = args.createClient;
    this.debug = createDebugLogger(args.options.debug);
    this.ui.isOpen = args.options.mode === 'embedded' ? true : args.options.initialOpen;
  }

  mount(): CortexChatWidgetHandle {
    if (this.mounted) {
      return this.createHandle();
    }
    this.mounted = true;
    this.initializeLiveRuntime();
    this.bindDomListeners();

    this.mountTarget.appendChild(this.dom.host);
    if (this.options.mode === 'embedded' && this.historyTarget) {
      const historyDom = createHistoryDom();
      this.dom.shell.setAttribute('data-has-history', 'true');
      this.dom.historySlot.appendChild(historyDom.host);
      this.historyController = new HistoryController({
        dom: historyDom,
        options: this.options,
        debug: this.debug,
        callbacks: {
          getLiveSessionId: () => this.getLiveSessionId(),
          onOpenCurrent: () => this.showLive(),
          onOpenHistorical: (sessionId, messages) => this.showHistoricalTranscript(sessionId, messages),
          onStartNewChat: () => this.startNewChat(),
          onError: (error, code, message) => this.handleHistoryError(error, code, message),
        },
      });
      this.historyController.mount();
      applyResolvedTheme(historyDom.host, historyDom.root, this.options.theme, {
        dark: 'cortex-widget-history--dark',
        light: 'cortex-widget-history--light',
      });
    }

    this.ui.isReady = true;
    this.notifyAndRender();
    this.resizeComposerTextarea();
    this.options.onReady?.();

    if (this.options.mode === 'embedded' || this.ui.isOpen) {
      void this.ensureConnected().catch((error) => {
        this.resolveRuntimeError(error);
        this.notifyAndRender();
      });
    }

    return this.createHandle();
  }

  async destroy(): Promise<void> {
    if (this.ui.isDestroyed) {
      return;
    }

    this.ui.isDestroyed = true;
    this.ui.isAwaitingAnswer = false;
    this.ui.isTyping = false;
    this.ui.isUploading = false;
    this.historyController?.destroy();
    this.historyController = null;
    this.teardownLiveListeners();
    for (const dispose of Array.from(this.domCleanup)) {
      dispose();
      this.domCleanup.delete(dispose);
    }
    const disconnectPromise = this.controller.disconnect();
    this.controller.destroy();
    this.dom.host.remove();
    try {
      await disconnectPromise;
    } catch {}
  }

  showLive(): void {
    if (this.ui.isDestroyed) {
      return;
    }
    this.chatView = { kind: 'live' };
    this.historicalTranscript = [];
    this.ui.error = null;
    this.notifyAndRender();
  }

  showHistoricalTranscript(sessionId: string, messages: ChatMessageViewModel[]): void {
    if (this.ui.isDestroyed) {
      return;
    }
    this.chatView = { kind: 'historical', sessionId };
    this.historicalTranscript = [...messages];
    this.ui.isAwaitingAnswer = false;
    this.ui.isTyping = false;
    this.clearDraftComposer();
    this.clearSelectedFile();
    this.notifyAndRender();
  }

  async startNewChat(): Promise<void> {
    if (this.ui.isDestroyed) {
      return;
    }
    this.chatView = { kind: 'live' };
    this.historicalTranscript = [];
    this.ui.error = null;
    this.ui.isAwaitingAnswer = false;
    this.ui.isTyping = false;
    this.clearDraftComposer();
    await this.resetLiveSession();
    this.historyClientKey = null;
    this.historyController?.setClient(null);
    if (this.options.mode === 'embedded' || this.ui.isOpen) {
      await this.ensureConnected();
    }
    this.historyController?.setLiveSessionId(this.getLiveSessionId());
    this.notifyAndRender();
  }

  getLiveSessionId(): string | null {
    return this.liveChatState.connection.sessionId;
  }

  private createHandle(): CortexChatWidgetHandle {
    return {
      destroy: () => {
        void this.destroy();
      },
      open: () => this.setOpen(true),
      close: () => this.setOpen(false),
      toggle: () => {
        if (this.options.mode === 'embedded') {
          return;
        }
        this.setOpen(!this.ui.isOpen);
      },
      getState: () => this.getPublicState(),
    };
  }

  private initializeLiveRuntime(): void {
    this.client = this.options.client ?? this.createClient();
    this.controller = createChatController({
      client: this.client,
      mode: 'end_user',
      debug: this.options.debug,
    });
    this.liveChatState = this.controller.getState();
    this.ui.attachmentsAvailable = typeof this.client.uploadAttachment === 'function'
      || typeof this.client.uploadFile === 'function';
    this.bindControllerListeners();
  }

  private bindControllerListeners(): void {
    this.unsubscribeController = this.controller.subscribe((nextState: ChatState) => {
      this.liveChatState = nextState;
      this.maybeEnableHistory(nextState);
      if (nextState.lastError) {
        this.ui.error = null;
        this.ui.isAwaitingAnswer = false;
        this.ui.isTyping = false;
        this.ui.isUploading = false;
      }
      if (isTerminalSessionState(nextState.connection.sessionState)) {
        this.ui.isAwaitingAnswer = false;
        this.ui.isTyping = false;
        this.ui.isUploading = false;
      }
      if (this.chatView.kind !== 'historical') {
        this.notifyAndRender();
      } else {
        this.historyController?.setLiveSessionId(this.getLiveSessionId());
      }
    });

    this.unsubscribeRawMessages = this.client.onMessage((message) => {
      const runtimeTitle = this.extractRuntimeChatTitle(message);
      if (runtimeTitle) {
        this.historyController?.applyRuntimeTitle(runtimeTitle);
      }
      const flags = getMessageFlags(message);
      if (flags.startTyping) {
        this.ui.isTyping = true;
      }
      if (flags.stopTyping) {
        this.ui.isTyping = false;
      }
      if (flags.finalAnswer) {
        this.ui.isAwaitingAnswer = false;
        this.ui.isTyping = false;
        this.ui.isUploading = false;
        this.ui.error = null;
      }
      if (flags.isQuestion) {
        this.ui.isAwaitingAnswer = false;
        this.ui.isTyping = false;
      }
      if (this.chatView.kind !== 'historical') {
        this.notifyAndRender();
      }
    });
  }

  private bindDomListeners(): void {
    this.dom.textarea.addEventListener('input', this.onTextareaInput);
    this.dom.textarea.addEventListener('keydown', this.onTextareaKeyDown);
    this.dom.composer.addEventListener('submit', this.onComposerSubmit);
    this.dom.attachButton.addEventListener('click', this.onAttachClick);
    this.dom.fileInput.addEventListener('change', this.onFileChange);
    this.dom.fileChipRemove.addEventListener('click', this.onRemoveFile);
    this.dom.authSubmitButton.addEventListener('click', this.onAuthSubmitClick);
    this.dom.authPasswordInput.addEventListener('keydown', this.onAuthPasswordKeyDown);
    this.dom.launcher.addEventListener('click', this.onLauncherClick);
    this.dom.transcript.addEventListener('click', this.onTranscriptClick);

    this.domCleanup.add(() => this.dom.textarea.removeEventListener('input', this.onTextareaInput));
    this.domCleanup.add(() => this.dom.textarea.removeEventListener('keydown', this.onTextareaKeyDown));
    this.domCleanup.add(() => this.dom.composer.removeEventListener('submit', this.onComposerSubmit));
    this.domCleanup.add(() => this.dom.attachButton.removeEventListener('click', this.onAttachClick));
    this.domCleanup.add(() => this.dom.fileInput.removeEventListener('change', this.onFileChange));
    this.domCleanup.add(() => this.dom.fileChipRemove.removeEventListener('click', this.onRemoveFile));
    this.domCleanup.add(() => this.dom.authSubmitButton.removeEventListener('click', this.onAuthSubmitClick));
    this.domCleanup.add(() => this.dom.authPasswordInput.removeEventListener('keydown', this.onAuthPasswordKeyDown));
    this.domCleanup.add(() => this.dom.launcher.removeEventListener('click', this.onLauncherClick));
    this.domCleanup.add(() => this.dom.transcript.removeEventListener('click', this.onTranscriptClick));
  }

  private teardownLiveListeners(): void {
    if (this.unsubscribeController) {
      this.unsubscribeController();
      this.unsubscribeController = null;
    }
    if (this.unsubscribeRawMessages) {
      this.unsubscribeRawMessages();
      this.unsubscribeRawMessages = null;
    }
  }

  private async resetLiveSession(): Promise<void> {
    this.teardownLiveListeners();
    try {
      await this.controller.disconnect();
    } catch {}
    this.controller.destroy();
    this.client = this.options.client ?? this.createClient();
    this.controller = createChatController({
      client: this.client,
      mode: 'end_user',
      debug: this.options.debug,
    });
    this.liveChatState = this.controller.getState();
    this.ui.attachmentsAvailable = typeof this.client.uploadAttachment === 'function'
      || typeof this.client.uploadFile === 'function';
    this.liveConnected = false;
    this.liveConnectPromise = null;
    this.bindControllerListeners();
  }

  private async ensureConnected(): Promise<void> {
    if (this.liveConnected) {
      return;
    }
    if (this.liveConnectPromise) {
      return this.liveConnectPromise;
    }
    this.liveConnectPromise = (async () => {
      await this.controller.connect();
      this.liveConnected = true;
    })().finally(() => {
      this.liveConnectPromise = null;
    });
    return this.liveConnectPromise;
  }

  private maybeEnableHistory(nextState: ChatState): void {
    if (!this.historyController || !nextState.connection.isSessionReady) {
      return;
    }
    const token = this.client.accessToken ?? null;
    const cpUrl = this.client.cpApiUrl ?? this.options.controlPlaneUrl ?? null;
    if (!token || !cpUrl) {
      return;
    }
    const historyClientKey = `${cpUrl}\n${token}`;
    if (this.historyClientKey === historyClientKey) {
      this.historyController.setLiveSessionId(this.getLiveSessionId());
      return;
    }
    this.historyClientKey = historyClientKey;
    const historyClient = createHistoryClient({ controlPlaneUrl: cpUrl, bearerToken: token });
    this.historyController.setClient(historyClient);
    this.historyController.setLiveSessionId(this.getLiveSessionId());
    void this.historyController.refresh();
  }

  private getPublicState(): CortexChatWidgetState {
    const displayedChatState = this.getDisplayedChatState();
    return {
      mode: this.options.mode,
      isOpen: this.options.mode === 'embedded' ? true : this.ui.isOpen,
      isReady: this.ui.isReady,
      isDestroyed: this.ui.isDestroyed,
      isAwaitingAnswer: this.chatView.kind === 'historical' ? false : this.ui.isAwaitingAnswer,
      isTyping: this.chatView.kind === 'historical' ? false : this.ui.isTyping,
      isHistoricalView: this.chatView.kind === 'historical',
      selectedFile: this.ui.selectedFile ? { ...this.ui.selectedFile } : null,
      chat: displayedChatState,
      error: this.ui.error ? { ...this.ui.error } : null,
    };
  }

  private getDisplayedChatState(): ChatState {
    if (this.chatView.kind === 'historical') {
      return {
        ...cloneChatState(EMPTY_CHAT_STATE),
        transcript: [...this.historicalTranscript],
        input: { locked: true, reason: 'historical_read_only' },
      };
    }
    return cloneChatState(this.liveChatState);
  }

  private syncTextareaValue(): void {
    if (this.dom.textarea.value !== this.ui.draftText) {
      this.dom.textarea.value = this.ui.draftText;
    }
  }

  private resizeComposerTextarea(): void {
    const textarea = this.dom.textarea;
    const computed = window.getComputedStyle(textarea);
    const parsePx = (value: string): number => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const lineHeight = parsePx(computed.lineHeight) || 20;
    const verticalChrome = parsePx(computed.paddingTop)
      + parsePx(computed.paddingBottom)
      + parsePx(computed.borderTopWidth)
      + parsePx(computed.borderBottomWidth);
    const maxHeight = (lineHeight * 5) + verticalChrome;
    const minHeight = lineHeight + verticalChrome;

    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.height = 'auto';
    const measuredHeight = textarea.scrollHeight || minHeight;
    const nextHeight = Math.max(minHeight, Math.min(measuredHeight, maxHeight));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = measuredHeight > maxHeight ? 'auto' : 'hidden';
  }

  private notifyAndRender(): void {
    if (this.ui.isDestroyed) {
      return;
    }
    this.syncTextareaValue();
    const state = this.getPublicState();
    const transcriptKey = this.computeTranscriptKey(state);
    const skipTranscript = transcriptKey === this.lastTranscriptRenderKey;
    if (!skipTranscript) {
      this.lastTranscriptRenderKey = transcriptKey;
    }
    renderWidget(this.dom, state, this.options, this.ui.attachmentsAvailable, this.ui.isUploading, { skipTranscript });
    this.resizeComposerTextarea();
    this.historyController?.setLiveSessionId(this.getLiveSessionId());
    this.options.onStateChange?.(state);
  }

  private computeTranscriptKey(state: CortexChatWidgetState): string {
    const msgs = state.chat.transcript;
    if (msgs.length === 0) {
      return `${state.isHistoricalView ? '1' : '0'}:0:`;
    }
    const msgSig = msgs.map((message) => {
      const content = message.content;
      const cLen = Array.isArray(content)
        ? (content as string[]).join('').length
        : String(content ?? '').length;
      return [
        message.id,
        message.type,
        message.status ?? '',
        String(message.deliveryStatus ?? ''),
        message.ts ?? '',
        cLen,
      ].join('|');
    }).join(';');
    return `${state.isHistoricalView ? '1' : '0'}:${msgs.length}:${msgSig}`;
  }

  private setSelectedFile(file: File | null): void {
    this.ui.selectedFileValue = file;
    this.ui.selectedFile = file
      ? {
          name: file.name,
          size: file.size,
          type: file.type,
        }
      : null;

    if (!file || this.ui.cachedUploadedFile !== file) {
      this.ui.cachedUploadedAttachmentId = null;
      this.ui.cachedUploadedFile = null;
    }
  }

  private clearSelectedFile(): void {
    this.setSelectedFile(null);
    this.dom.fileInput.value = '';
  }

  private clearDraftComposer(): void {
    this.ui.draftText = '';
    this.clearSelectedFile();
    this.ui.cachedUploadedAttachmentId = null;
    this.ui.cachedUploadedFile = null;
  }

  private async uploadSelectedFile(): Promise<string | null> {
    const file = this.ui.selectedFileValue;
    if (!file) {
      return null;
    }
    if (this.ui.cachedUploadedAttachmentId && this.ui.cachedUploadedFile === file) {
      return this.ui.cachedUploadedAttachmentId;
    }

    this.ui.isUploading = true;
    this.ui.error = null;
    this.notifyAndRender();

    try {
      let uploadedId: string;
      if (typeof this.client.uploadAttachment === 'function') {
        uploadedId = await this.client.uploadAttachment(file);
      } else if (typeof this.client.uploadFile === 'function') {
        uploadedId = await this.client.uploadFile(file);
      } else {
        throw createWidgetError(
          'attachments_unavailable',
          'Attachments are unavailable for the current client.',
        );
      }

      this.ui.cachedUploadedAttachmentId = uploadedId;
      this.ui.cachedUploadedFile = file;
      this.ui.isUploading = false;
      this.notifyAndRender();
      return uploadedId;
    } catch (error) {
      this.resolveUploadError(error);
      this.notifyAndRender();
      return null;
    }
  }

  private async handleSend(): Promise<void> {
    if (this.ui.isDestroyed || this.chatView.kind === 'historical') {
      return;
    }

    const content = this.ui.draftText.trim();
    const hasContent = content.length > 0;
    const hasFile = this.ui.selectedFileValue !== null;
    const displayedChatState = this.getDisplayedChatState();
    const activeQuestion = this.liveChatState.activeQuestion;

    if (activeQuestion && !activeQuestion.allow_reply) {
      return;
    }
    if (displayedChatState.input.locked || this.ui.isAwaitingAnswer || this.ui.isUploading || (!hasContent && !hasFile)) {
      return;
    }

    this.ui.error = null;
    let attachmentId: string | null = null;
    if (hasFile) {
      attachmentId = await this.uploadSelectedFile();
      if (this.ui.selectedFileValue && attachmentId === null) {
        return;
      }
    }

    const questionMeta = activeQuestion
      ? { question_id: activeQuestion.question_id, selected_option: 'reply' }
      : undefined;

    try {
      const sendRequest = {
        content: [content],
        attachments: attachmentId ? [attachmentId] : undefined,
        meta: questionMeta,
      };
      this.debug.log('[cortex-chat-widget] handleSend -> controller.sendMessage start', {
        ...summarizeSendPayload(sendRequest),
      });
      const result = await this.controller.sendMessage(sendRequest);
      this.debug.log('[cortex-chat-widget] handleSend -> controller.sendMessage done', {
        ok: result.ok,
        clientMsgId: result.clientMsgId,
        messageId: result.messageId,
      });

      if (!result.ok) {
        this.ui.isAwaitingAnswer = false;
        this.ui.isUploading = false;
        this.ui.error = null;
        this.notifyAndRender();
        return;
      }

      this.chatView = { kind: 'live' };
      this.historicalTranscript = [];
      this.clearDraftComposer();
      this.ui.error = null;
      this.ui.isAwaitingAnswer = true;
      this.notifyAndRender();
    } catch (error) {
      this.resolveRuntimeError(error);
      this.notifyAndRender();
    }
  }

  private async handleLoginSubmit(): Promise<void> {
    if (this.ui.isDestroyed) {
      return;
    }
    const login = this.dom.authLoginInput.value.trim();
    const password = this.dom.authPasswordInput.value;
    if (!login || !password) {
      return;
    }
    this.dom.authPasswordInput.value = '';
    try {
      await this.controller.submitLogin({ login, password });
    } catch {
      // Auth state transitions are driven by the controller; errors surface via state.
    }
    this.notifyAndRender();
  }

  private async handleOptionSelect(questionId: string, optionId: string, optionLabel: string): Promise<void> {
    if (this.ui.isDestroyed || this.ui.isAwaitingAnswer || this.chatView.kind === 'historical') {
      return;
    }
    try {
      const result = await this.controller.sendMessage({
        content: [optionLabel],
        meta: { question_id: questionId, selected_option: optionId },
      });

      if (!result.ok) {
        this.ui.isAwaitingAnswer = false;
        this.ui.error = null;
        this.notifyAndRender();
        return;
      }

      this.chatView = { kind: 'live' };
      this.historicalTranscript = [];
      this.clearDraftComposer();
      this.ui.error = null;
      this.ui.isAwaitingAnswer = true;
      this.notifyAndRender();
    } catch (error) {
      this.resolveRuntimeError(error);
      this.notifyAndRender();
    }
  }

  private async handleTranscriptClick(event: MouseEvent): Promise<void> {
    const retryBtn = (event.target as Element).closest('[data-retry-msg-id]') as HTMLButtonElement | null;
    if (retryBtn) {
      const msgId = retryBtn.dataset.retryMsgId;
      if (msgId) {
        const result = await this.controller.retryMessage(msgId);
        this.ui.isAwaitingAnswer = Boolean(result?.ok);
        this.ui.error = null;
        this.notifyAndRender();
      }
      return;
    }

    const btn = (event.target as Element).closest('.cortex-widget__question-option') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const { questionId, optionId } = btn.dataset;
    const optionLabel = btn.textContent ?? '';
    if (questionId && optionId) {
      await this.handleOptionSelect(questionId, optionId, optionLabel);
    }
  }

  private setOpen(nextOpen: boolean): void {
    if (this.options.mode === 'embedded' || this.ui.isDestroyed) {
      return;
    }
    this.ui.isOpen = nextOpen;
    if (nextOpen) {
      void this.ensureConnected().catch((error) => {
        this.resolveRuntimeError(error);
        this.notifyAndRender();
      });
    }
    this.notifyAndRender();
  }

  private handleHistoryError(error: unknown, code: string, message: string): void {
    this.ui.error = toWidgetError(error, code, message);
    this.options.onError?.(error);
    this.notifyAndRender();
  }

  private resolveUploadError(error: unknown): void {
    this.ui.isAwaitingAnswer = false;
    this.ui.isUploading = false;
    this.ui.error = toWidgetError(error, 'upload_failed', 'Attachment upload failed');
    this.options.onError?.(error);
  }

  private resolveRuntimeError(error: unknown): void {
    this.ui.isAwaitingAnswer = false;
    this.ui.isTyping = false;
    this.ui.isUploading = false;
    this.ui.error = toWidgetError(error, 'widget_runtime_error', 'Widget runtime error');
    this.options.onError?.(error);
  }

  private extractRuntimeChatTitle(message: unknown): string | null {
    const candidates = [
      this.readUnknownPath(message, ['payload', 'meta', 'chat_title']),
      this.readUnknownPath(message, ['meta', 'chat_title']),
      this.readUnknownPath(message, ['payload', 'payload', 'meta', 'chat_title']),
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed.slice(0, MAX_RUNTIME_CHAT_TITLE_LENGTH);
      }
    }
    return null;
  }

  private readUnknownPath(value: unknown, path: string[]): unknown {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }
}
