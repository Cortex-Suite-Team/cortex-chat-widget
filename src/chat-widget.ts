import { createChatController, type ChatController, type ChatState } from '@cortex-suite/sdk-ui';
import * as sdkUi from '@cortex-suite/sdk-ui';
import { findGeneratedFile, FILE_REF_PATTERN, safeDownloadFilename } from './attachments.js';
import { createDebugLogger } from './debug.js';
import { createWidgetError, toWidgetError } from './errors.js';
import { createHistoryClient } from './history-client.js';
import { HistoryController } from './history-controller.js';
import { createHistoryDom } from './history-dom.js';
import { HumanAssistanceView, type HumanAssistanceClient, type HumanAssistanceController } from './human-assistance.js';
import {
  getMessageFlags,
  isTerminalSessionState,
} from './message-flags.js';
import { applyResolvedTheme, destroyTranscriptRenderer, renderWidget } from './renderer.js';
import {
  MAX_COMPOSER_ATTACHMENTS,
  type ChatMessageViewModel,
  type ChatViewMode,
  type ComposerFile,
  type CortexChatWidgetError,
  type CortexChatWidgetHandle,
  type CortexChatWidgetOptions,
  type CortexChatWidgetState,
  type InternalWidgetState,
  type NormalizedWidgetOptions,
  type WidgetAttachmentRef,
  type WidgetClientLike,
  type WidgetDom,
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
  transcriptRevision: 0,
  transcriptMutation: null,
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
// Object URLs of saved downloads stay alive briefly so the browser can start the save.
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1000;
// SDK error codes after which repeating the same upload or download cannot succeed.
const NON_RETRYABLE_FILE_ERRORS = new Set([
  'attachments_unavailable',
  'downloads_unavailable',
  'file_access_denied',
  'file_api_unavailable',
  'file_expired',
  'file_not_found',
  'file_too_large',
  'file_type_rejected',
  'invalid_attachment',
  'too_many_attachments',
  'upload_failed',
]);

function isRetryableFileError(error: unknown, widgetError: CortexChatWidgetError): boolean {
  if (NON_RETRYABLE_FILE_ERRORS.has(widgetError.code)) return false;
  if (error && typeof error === 'object' && typeof (error as { retryable?: unknown }).retryable === 'boolean') {
    return (error as { retryable: boolean }).retryable;
  }
  return true;
}

function isSameSelectedFile(a: File, b: File): boolean {
  return a === b || (a.name === b.name && a.size === b.size && a.type === b.type && a.lastModified === b.lastModified);
}

function cloneChatState(state: ChatState): ChatState {
  return {
    session: {
      correspondent: state.session.correspondent ? { ...state.session.correspondent } : null,
    },
    connection: { ...state.connection },
    transcript: state.transcript,
    transcriptRevision: state.transcriptRevision,
    transcriptMutation: state.transcriptMutation,
    input: { ...state.input },
    auth: { ...state.auth },
    escalation: state.escalation ? { ...state.escalation } : null,
    lastError: state.lastError ? { ...state.lastError } : null,
    activeQuestion: state.activeQuestion
      ? {
          ...state.activeQuestion,
          questions: (state.activeQuestion.questions ?? []).map((question) => ({
            ...question,
            options: [...question.options],
          })),
          options: [...state.activeQuestion.options],
        }
      : null,
    workerState: { ...state.workerState },
  };
}

function deriveCorrespondentFromTranscript(
  transcript: ChatMessageViewModel[],
): ChatState['session']['correspondent'] {
  for (const message of transcript) {
    if (message.role === 'user' || message.role === 'error') continue;

    const actor = message.actor ?? null;
    if (!actor || actor.kind !== 'digital_worker') continue;

    return {
      kind: actor.kind,
      id: actor.id ?? null,
      name: actor.name,
      title: actor.title ?? null,
      subtitle: actor.subtitle ?? null,
      avatarUrl: actor.avatarUrl ?? null,
    };
  }

  return null;
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

function getQuestionRef(activeQuestion: unknown): string | null {
  if (!activeQuestion || typeof activeQuestion !== 'object') {
    return null;
  }
  const record = activeQuestion as Record<string, unknown>;
  const questionRef = record['question_ref'];
  if (typeof questionRef === 'string' && questionRef.trim()) {
    return questionRef.trim();
  }
  const legacyQuestionId = record['question_id'];
  return typeof legacyQuestionId === 'string' && legacyQuestionId.trim()
    ? legacyQuestionId.trim()
    : null;
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
  private historicalTranscriptRevision = 0;
  private chatView: ChatViewMode = { kind: 'live' };
  private historyController: HistoryController | null = null;
  private historyClientKey: string | null = null;
  private liveConnected = false;
  private liveConnectPromise: Promise<void> | null = null;
  private mounted = false;
  private readonly domCleanup = new Set<() => void>();
  private composerFileSeq = 0;
  private readonly pendingDownloadUrls = new Map<string, number>();
  private unsubscribeController: (() => void) | null = null;
  private unsubscribeRawMessages: (() => void) | null = null;
  private humanAssistanceController: HumanAssistanceController | null = null;
  private humanAssistanceView: HumanAssistanceView | null = null;
  private unsubscribeHumanAssistance: (() => void) | null = null;
  private readonly ui: InternalWidgetState = {
    isOpen: false,
    isReady: false,
    isDestroyed: false,
    isAwaitingAnswer: false,
    isTyping: false,
    isUploading: false,
    attachmentsAvailable: false,
    composerFiles: [],
    fileDownloads: new Map(),
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
      || this.ui.composerFiles.length >= MAX_COMPOSER_ATTACHMENTS
      || this.getDisplayedChatState().input.locked
    ) {
      return;
    }
    this.dom.fileInput.click();
  };

  private readonly onFileChange = () => {
    const files = Array.from(this.dom.fileInput.files ?? []);
    // Clear the input so the same file can be picked again after removing it.
    this.dom.fileInput.value = '';
    if (!this.ui.attachmentsAvailable || files.length === 0) {
      return;
    }
    this.addComposerFiles(files);
    this.notifyAndRender();
  };

  private readonly onFileChipsClick = (event: MouseEvent) => {
    const target = event.target as Element;
    const removeButton = target.closest('[data-remove-file-id]') as HTMLButtonElement | null;
    if (removeButton) {
      const fileId = removeButton.dataset.removeFileId;
      if (!removeButton.disabled && fileId) {
        this.removeComposerFile(fileId);
      }
      return;
    }
    const retryButton = target.closest('[data-retry-file-id]') as HTMLButtonElement | null;
    const retryId = retryButton?.dataset.retryFileId;
    if (retryButton && !retryButton.disabled && retryId) {
      void this.retryComposerUpload(retryId);
    }
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

  private readonly onTranscriptSubmit = (event: Event) => {
    const form = (event.target as Element).closest('.cortex-widget__question-form') as HTMLFormElement | null;
    if (!form) {
      return;
    }
    event.preventDefault();
    void this.handleQuestionFormSubmit(form);
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
    for (const [url, timer] of this.pendingDownloadUrls) {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    this.pendingDownloadUrls.clear();
    this.historyController?.destroy();
    this.historyController = null;
    this.teardownHumanAssistance();
    this.teardownLiveListeners();
    for (const dispose of Array.from(this.domCleanup)) {
      dispose();
      this.domCleanup.delete(dispose);
    }
    destroyTranscriptRenderer(this.dom.transcript);
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
    this.historicalTranscriptRevision += 1;
    this.ui.error = null;
    this.notifyAndRender();
  }

  showHistoricalTranscript(sessionId: string, messages: ChatMessageViewModel[]): void {
    if (this.ui.isDestroyed) {
      return;
    }
    this.chatView = { kind: 'historical', sessionId };
    this.historicalTranscript = [...messages];
    this.historicalTranscriptRevision += 1;
    this.ui.isAwaitingAnswer = false;
    this.ui.isTyping = false;
    this.clearDraftComposer();
    this.notifyAndRender();
  }

  async startNewChat(): Promise<void> {
    if (this.ui.isDestroyed) {
      return;
    }
    this.chatView = { kind: 'live' };
    this.historicalTranscript = [];
    this.historicalTranscriptRevision += 1;
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
    this.ui.attachmentsAvailable = typeof this.client.uploadFile === 'function';
    this.ui.fileDownloads = new Map();
    this.initializeHumanAssistance();
    this.bindControllerListeners();
  }

  private initializeHumanAssistance(): void {
    const client = this.client as WidgetClientLike & Partial<HumanAssistanceClient>;
    const factory = (sdkUi as unknown as {
      createHumanAssistanceController?: (options: { client: HumanAssistanceClient }) => HumanAssistanceController;
    }).createHumanAssistanceController;
    // Both accepted S20 native client and S21 SDK UI must be present. Old packages fail closed.
    if (typeof factory !== 'function'
      || !Array.isArray(client.humanAssistanceRequests)
      || typeof client.onHumanAssistance !== 'function'
      || typeof client.replyHumanAssistance !== 'function') {
      return;
    }
    const controller = factory({ client: client as HumanAssistanceClient });
    const view = new HumanAssistanceView(this.dom.humanAssistance, controller);
    this.humanAssistanceController = controller;
    this.humanAssistanceView = view;
    this.unsubscribeHumanAssistance = controller.subscribe((cards) => view.render(cards));
    view.render(controller.getCards());
  }

  private teardownHumanAssistance(): void {
    this.unsubscribeHumanAssistance?.();
    this.unsubscribeHumanAssistance = null;
    this.humanAssistanceController?.destroy();
    this.humanAssistanceController = null;
    this.humanAssistanceView?.destroy();
    this.humanAssistanceView = null;
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
    this.dom.fileChips.addEventListener('click', this.onFileChipsClick);
    this.dom.authSubmitButton.addEventListener('click', this.onAuthSubmitClick);
    this.dom.authPasswordInput.addEventListener('keydown', this.onAuthPasswordKeyDown);
    this.dom.launcher.addEventListener('click', this.onLauncherClick);
    this.dom.transcript.addEventListener('click', this.onTranscriptClick);
    this.dom.transcript.addEventListener('submit', this.onTranscriptSubmit);

    this.domCleanup.add(() => this.dom.textarea.removeEventListener('input', this.onTextareaInput));
    this.domCleanup.add(() => this.dom.textarea.removeEventListener('keydown', this.onTextareaKeyDown));
    this.domCleanup.add(() => this.dom.composer.removeEventListener('submit', this.onComposerSubmit));
    this.domCleanup.add(() => this.dom.attachButton.removeEventListener('click', this.onAttachClick));
    this.domCleanup.add(() => this.dom.fileInput.removeEventListener('change', this.onFileChange));
    this.domCleanup.add(() => this.dom.fileChips.removeEventListener('click', this.onFileChipsClick));
    this.domCleanup.add(() => this.dom.authSubmitButton.removeEventListener('click', this.onAuthSubmitClick));
    this.domCleanup.add(() => this.dom.authPasswordInput.removeEventListener('keydown', this.onAuthPasswordKeyDown));
    this.domCleanup.add(() => this.dom.launcher.removeEventListener('click', this.onLauncherClick));
    this.domCleanup.add(() => this.dom.transcript.removeEventListener('click', this.onTranscriptClick));
    this.domCleanup.add(() => this.dom.transcript.removeEventListener('submit', this.onTranscriptSubmit));
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
    this.teardownHumanAssistance();
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
    this.ui.attachmentsAvailable = typeof this.client.uploadFile === 'function';
    this.ui.fileDownloads = new Map();
    this.initializeHumanAssistance();
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
      selectedFiles: this.ui.composerFiles.map((entry) => ({
        id: entry.id,
        name: entry.file.name,
        size: entry.file.size,
        type: entry.file.type,
        status: entry.status,
        error: entry.error ? { ...entry.error } : null,
        retryable: entry.retryable,
      })),
      fileDownloads: Object.fromEntries(Array.from(this.ui.fileDownloads, ([fileRef, download]) => [
        fileRef,
        { ...download, error: download.error ? { ...download.error } : null },
      ])),
      chat: displayedChatState,
      error: this.ui.error ? { ...this.ui.error } : null,
    };
  }

  private getDisplayedChatState(): ChatState {
    if (this.chatView.kind === 'historical') {
      return {
        ...cloneChatState(EMPTY_CHAT_STATE),
        session: {
          correspondent: deriveCorrespondentFromTranscript(this.historicalTranscript),
        },
        transcript: this.historicalTranscript,
        transcriptRevision: this.historicalTranscriptRevision,
        transcriptMutation: null,
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
    renderWidget(
      this.dom,
      state,
      this.options,
      this.ui.attachmentsAvailable,
      this.ui.isUploading,
      typeof this.client.downloadFile === 'function',
    );
    this.resizeComposerTextarea();
    this.historyController?.setLiveSessionId(this.getLiveSessionId());
    this.options.onStateChange?.(state);
  }

  private addComposerFiles(files: File[]): void {
    const selected = [...this.ui.composerFiles];
    let overflow = 0;
    for (const file of files) {
      if (selected.some((entry) => isSameSelectedFile(entry.file, file))) {
        continue;
      }
      if (selected.length >= MAX_COMPOSER_ATTACHMENTS) {
        overflow += 1;
        continue;
      }
      this.composerFileSeq += 1;
      selected.push({
        id: `file_${this.composerFileSeq}`,
        file,
        status: 'selected',
        uploadedRef: null,
        error: null,
        retryable: false,
      });
    }
    this.ui.composerFiles = selected;
    if (overflow > 0) {
      this.ui.error = {
        code: 'too_many_attachments',
        message: `You can attach up to ${MAX_COMPOSER_ATTACHMENTS} files to one message.`,
      };
    }
  }

  private removeComposerFile(fileId: string): void {
    if (this.ui.isUploading || this.ui.isAwaitingAnswer) {
      return;
    }
    const index = this.ui.composerFiles.findIndex((entry) => entry.id === fileId);
    if (index < 0) {
      return;
    }
    this.ui.composerFiles = this.ui.composerFiles.filter((entry) => entry.id !== fileId);
    const error = this.ui.error;
    const failedRemain = this.ui.composerFiles.some((entry) => entry.status === 'failed');
    if (error && (error.code === 'too_many_attachments' || (!failedRemain && this.isComposerUploadError(error)))) {
      this.ui.error = null;
    }
    this.notifyAndRender();
    // Keep keyboard focus in the chip list: next chip, else the previous one, else the attach button.
    const removeButtons = Array.from(this.dom.fileChips.querySelectorAll<HTMLButtonElement>('[data-remove-file-id]'));
    (removeButtons[index] ?? removeButtons[index - 1] ?? this.dom.attachButton).focus();
  }

  private isComposerUploadError(error: CortexChatWidgetError): boolean {
    return error.code === 'upload_failed' || error.code === 'attachments_unavailable' || error.code.startsWith('file_');
  }

  private updateComposerFile(fileId: string, patch: Partial<ComposerFile>): void {
    this.ui.composerFiles = this.ui.composerFiles.map((entry) => (
      entry.id === fileId ? { ...entry, ...patch } : entry
    ));
  }

  private clearComposerFiles(): void {
    this.ui.composerFiles = [];
    this.dom.fileInput.value = '';
  }

  private clearDraftComposer(): void {
    this.ui.draftText = '';
    this.clearComposerFiles();
  }

  private buildUploadedAttachment(fileRef: string, file: File): WidgetAttachmentRef {
    if (!FILE_REF_PATTERN.test(fileRef)) {
      throw createWidgetError('upload_failed', 'Upload did not return a canonical sf_ file_ref.');
    }
    const meta: Partial<WidgetAttachmentRef> = {};
    if (file.name) meta.filename = file.name;
    if (file.type) meta.content_type = file.type;
    meta.size = file.size;
    return { file_ref: fileRef, ...meta };
  }

  // Upload one composer file once; a file that already has its sf_ ref is never uploaded again.
  private async uploadComposerFile(entry: ComposerFile): Promise<boolean> {
    if (entry.uploadedRef) {
      return true;
    }
    this.updateComposerFile(entry.id, { status: 'uploading', error: null, retryable: false });
    this.notifyAndRender();
    try {
      if (typeof this.client.uploadFile !== 'function') {
        throw createWidgetError(
          'attachments_unavailable',
          'Attachments are unavailable for the current client.',
        );
      }
      const fileRef = await this.client.uploadFile(entry.file);
      const uploadedRef = this.buildUploadedAttachment(fileRef, entry.file);
      this.updateComposerFile(entry.id, { status: 'uploaded', uploadedRef, error: null, retryable: false });
      return true;
    } catch (error) {
      const widgetError = toWidgetError(error, 'upload_failed', 'Attachment upload failed');
      this.updateComposerFile(entry.id, {
        status: 'failed',
        error: widgetError,
        retryable: isRetryableFileError(error, widgetError),
      });
      this.debug.log('[cortex-chat-widget] upload failed', {
        code: widgetError.code,
        message: widgetError.message,
        details: (error && typeof error === 'object' && 'details' in error)
          ? (error as { details?: unknown }).details
          : undefined,
      });
      this.options.onError?.(error);
      return false;
    }
  }

  private setComposerUploadFailure(failed: ComposerFile[]): void {
    this.ui.error = failed.length === 1 && failed[0].error
      ? { ...failed[0].error }
      : {
          code: 'upload_failed',
          message: `${failed.length} files could not be uploaded. Retry or remove them to send.`,
        };
  }

  /**
   * Upload every composer file that has no sf_ ref yet, in selection order.
   * Returns the ordered refs only when every selected file is uploaded and the
   * selection did not change meanwhile; otherwise nothing is sent.
   */
  private async uploadComposerFiles(): Promise<WidgetAttachmentRef[] | null> {
    const entries = [...this.ui.composerFiles];
    const blocked = entries.filter((entry) => entry.status === 'failed' && !entry.retryable);
    if (blocked.length > 0) {
      this.setComposerUploadFailure(blocked);
      return null;
    }

    this.ui.isUploading = true;
    this.ui.error = null;
    this.notifyAndRender();
    for (const entry of entries) {
      await this.uploadComposerFile(entry);
      if (this.ui.isDestroyed) {
        return null;
      }
    }
    this.ui.isUploading = false;

    const current = this.ui.composerFiles;
    const failed = current.filter((entry) => entry.status === 'failed');
    if (failed.length > 0) {
      this.setComposerUploadFailure(failed);
      return null;
    }
    const unchanged = current.length === entries.length
      && current.every((entry, index) => entry.id === entries[index].id && entry.uploadedRef !== null);
    if (!unchanged) {
      return null;
    }
    const refs = current.map((entry) => entry.uploadedRef as WidgetAttachmentRef);
    if (new Set(refs.map((ref) => ref.file_ref)).size !== refs.length) {
      this.ui.error = { code: 'invalid_attachment', message: 'Two selected files resolved to the same upload. Remove one to send.' };
      return null;
    }
    return refs;
  }

  private async retryComposerUpload(fileId: string): Promise<void> {
    const entry = this.ui.composerFiles.find((candidate) => candidate.id === fileId);
    if (
      !entry
      || entry.status !== 'failed'
      || !entry.retryable
      || this.ui.isUploading
      || this.ui.isAwaitingAnswer
      || this.ui.isDestroyed
    ) {
      return;
    }
    this.ui.isUploading = true;
    this.ui.error = null;
    await this.uploadComposerFile(entry);
    if (this.ui.isDestroyed) {
      return;
    }
    this.ui.isUploading = false;
    const failed = this.ui.composerFiles.filter((candidate) => candidate.status === 'failed');
    if (failed.length > 0) {
      this.setComposerUploadFailure(failed);
    }
    this.notifyAndRender();
  }

  private async handleSend(): Promise<void> {
    if (this.ui.isDestroyed || this.chatView.kind === 'historical') {
      return;
    }

    const content = this.ui.draftText.trim();
    const hasContent = content.length > 0;
    const hasFile = this.ui.composerFiles.length > 0;
    const displayedChatState = this.getDisplayedChatState();
    const activeQuestion = this.liveChatState.activeQuestion;

    if (activeQuestion && !activeQuestion.allow_reply) {
      return;
    }
    if (displayedChatState.input.locked || this.ui.isAwaitingAnswer || this.ui.isUploading || (!hasContent && !hasFile)) {
      return;
    }

    this.ui.error = null;
    let attachments: WidgetAttachmentRef[] | undefined;
    if (hasFile) {
      const uploaded = await this.uploadComposerFiles();
      if (uploaded === null) {
        this.ui.isUploading = false;
        this.notifyAndRender();
        return;
      }
      attachments = uploaded;
    }

    const questionRef = getQuestionRef(activeQuestion);
    const questionMeta = questionRef
      ? { question_ref: questionRef }
      : undefined;

    try {
      const sendRequest = {
        content: [content],
        attachments,
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

  private async handleOptionSelect(questionRef: string, optionId: string, optionLabel: string): Promise<void> {
    if (this.ui.isDestroyed || this.ui.isAwaitingAnswer || this.chatView.kind === 'historical') {
      return;
    }
    try {
      const result = await this.controller.sendMessage({
        content: [optionLabel],
        meta: { question_ref: questionRef, selected: [optionId] },
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

  private async handleQuestionFormSubmit(form: HTMLFormElement): Promise<void> {
    if (this.ui.isDestroyed || this.ui.isAwaitingAnswer || this.chatView.kind === 'historical') {
      return;
    }
    const questionRef = form.dataset.questionRef;
    if (!questionRef) {
      return;
    }

    const answers: Record<string, unknown> = {};
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
        continue;
      }
      if (!element.name) {
        continue;
      }
      const questionType = element.getAttribute('data-question-type');
      const value = questionType === 'boolean' && element instanceof HTMLInputElement
        ? element.checked
        : element.value.trim();
      if (element.required && (value === '' || value === false)) {
        return;
      }
      answers[element.name] = value;
    }
    if (Object.keys(answers).length === 0) {
      return;
    }

    const summary = Object.values(answers)
      .map((value) => String(value))
      .filter((value) => value.length > 0)
      .join('\n') || 'Submitted answers';

    try {
      const result = await this.controller.sendMessage({
        content: [summary],
        meta: { question_ref: questionRef, answers },
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
    const downloadButton = (event.target as Element).closest('[data-download-file-ref]') as HTMLButtonElement | null;
    if (downloadButton) {
      event.preventDefault();
      const fileRef = downloadButton.dataset.downloadFileRef;
      const messageId = downloadButton.dataset.messageId;
      if (!downloadButton.disabled && fileRef && messageId) {
        await this.downloadGeneratedFile(messageId, fileRef);
      }
      return;
    }

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
    const questionRef = btn.dataset.questionRef ?? btn.dataset.questionId;
    const { optionId } = btn.dataset;
    const optionLabel = btn.textContent ?? '';
    if (questionRef && optionId) {
      await this.handleOptionSelect(questionRef, optionId, optionLabel);
    }
  }

  /**
   * Download one generated file of a live answer. The descriptor is resolved
   * again from the transcript (never from DOM or message URLs); only an
   * available assistant file of that answer reaches client.downloadFile().
   */
  private async downloadGeneratedFile(messageId: string, fileRef: string): Promise<void> {
    if (this.ui.isDestroyed || this.chatView.kind === 'historical') {
      return;
    }
    const message = this.liveChatState.transcript.find((candidate) => candidate.id === messageId);
    const attachment = message ? findGeneratedFile(message, fileRef) : null;
    if (!attachment || attachment.state !== 'available') {
      return;
    }
    if (this.ui.fileDownloads.get(fileRef)?.status === 'downloading') {
      return;
    }
    const client = this.client;
    if (typeof client.downloadFile !== 'function') {
      this.setFileDownload(fileRef, {
        status: 'failed',
        error: { code: 'downloads_unavailable', message: 'Downloads are unavailable for the current client.' },
        retryable: false,
      });
      this.notifyAndRender();
      return;
    }

    this.setFileDownload(fileRef, { status: 'downloading', error: null, retryable: false });
    this.notifyAndRender();
    try {
      const blob = await client.downloadFile(fileRef);
      if (this.ui.isDestroyed || this.client !== client) {
        return;
      }
      if (!(blob instanceof Blob)) {
        throw createWidgetError('file_download_failed', 'Download did not return file contents.');
      }
      this.saveBlob(blob, safeDownloadFilename(attachment.fileName));
      this.setFileDownload(fileRef, null);
    } catch (error) {
      if (this.ui.isDestroyed || this.client !== client) {
        return;
      }
      const widgetError = toWidgetError(error, 'file_download_failed', 'File download failed');
      this.setFileDownload(fileRef, {
        status: 'failed',
        error: widgetError,
        retryable: isRetryableFileError(error, widgetError),
      });
      this.options.onError?.(error);
    }
    this.notifyAndRender();
  }

  private setFileDownload(fileRef: string, download: { status: 'downloading' | 'failed'; error: CortexChatWidgetError | null; retryable: boolean } | null): void {
    const next = new Map(this.ui.fileDownloads);
    if (download) next.set(fileRef, download);
    else next.delete(fileRef);
    this.ui.fileDownloads = next;
  }

  // Save a downloaded Blob through a short-lived object URL; no server URL is ever used.
  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    const timer = window.setTimeout(() => {
      this.pendingDownloadUrls.delete(url);
      URL.revokeObjectURL(url);
    }, DOWNLOAD_URL_REVOKE_DELAY_MS);
    this.pendingDownloadUrls.set(url, timer);
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
    if (this.ui.isDestroyed) {
      return;
    }
    this.ui.error = toWidgetError(error, code, message);
    this.options.onError?.(error);
    this.notifyAndRender();
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
