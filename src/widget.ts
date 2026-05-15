import { createChatController, type ChatController, type ChatState } from '@cortex-suite/sdk-ui';
import { createDebugLogger } from './debug.js';
import { createWidgetError, toWidgetError } from './errors.js';
import { createHistoryClient } from './history-client.js';
import { createHistoryDom } from './history-dom.js';
import { renderHistoryList } from './history-renderer.js';
import {
  getMessageFlags,
  isTerminalSessionState,
} from './message-flags.js';
import { applyResolvedTheme, renderWidget } from './renderer.js';
import type {
  ChatMessageViewModel,
  CortexChatWidgetHandle,
  CortexChatWidgetOptions,
  CortexChatWidgetState,
  HistoryConversationSummary,
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

function clonePublicState(
  options: NormalizedWidgetOptions,
  internal: InternalWidgetState,
  chatState: ChatState,
): CortexChatWidgetState {
  return {
    mode: options.mode,
    isOpen: options.mode === 'embedded' ? true : internal.isOpen,
    isReady: internal.isReady,
    isDestroyed: internal.isDestroyed,
    isAwaitingAnswer: internal.viewMode === 'historical' ? false : internal.isAwaitingAnswer,
    isTyping: internal.viewMode === 'historical' ? false : internal.isTyping,
    isHistoricalView: internal.viewMode === 'historical',
    selectedFile: internal.selectedFile ? { ...internal.selectedFile } : null,
    chat: chatState,
    error: internal.error ? { ...internal.error } : null,
  };
}

function resolveUploadError(
  error: unknown,
  options: CortexChatWidgetOptions,
  internal: InternalWidgetState,
): void {
  internal.isAwaitingAnswer = false;
  internal.isUploading = false;
  internal.error = toWidgetError(error, 'upload_failed', 'Attachment upload failed');
  options.onError?.(error);
}

function resolveRuntimeError(
  error: unknown,
  options: CortexChatWidgetOptions,
  internal: InternalWidgetState,
): void {
  internal.isAwaitingAnswer = false;
  internal.isTyping = false;
  internal.isUploading = false;
  internal.error = toWidgetError(error, 'widget_runtime_error', 'Widget runtime error');
  options.onError?.(error);
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

export function createWidgetHandle(args: {
  options: NormalizedWidgetOptions;
  dom: WidgetDom;
  mountTarget: HTMLElement;
  historyTarget?: HTMLElement;
  createClient: () => WidgetClientLike;
}): CortexChatWidgetHandle {
  const { options, dom, mountTarget, historyTarget, createClient } = args;
  const historyDom = options.mode === 'embedded' && historyTarget ? createHistoryDom() : null;
  const historyClient = historyDom && options.controlPlaneUrl
    ? createHistoryClient({ controlPlaneUrl: options.controlPlaneUrl, apiKey: options.apiKey })
    : null;

  let client = createClient();
  let controller: ChatController = createChatController({
    client,
    mode: 'end_user',
    debug: options.debug,
  });
  const debug = createDebugLogger(options.debug);
  let liveChatState = controller.getState();
  let historicalTranscript: ChatMessageViewModel[] = [];
  let selectedHistorySessionId: string | null = null;
  let historyMenuSessionId: string | null = null;
  let historyItems: HistoryConversationSummary[] = [];
  let historyState: 'disabled' | 'loading' | 'loaded' | 'empty' | 'error' = historyClient ? 'loading' : 'disabled';
  let historyErrorMessage = '';
  let liveConnected = false;
  let liveConnectPromise: Promise<void> | null = null;

  const internal: InternalWidgetState = {
    isOpen: options.mode === 'embedded' ? true : options.initialOpen,
    isReady: false,
    isDestroyed: false,
    isAwaitingAnswer: false,
    isTyping: false,
    isUploading: false,
    attachmentsAvailable: typeof client.uploadAttachment === 'function' || typeof client.uploadFile === 'function',
    selectedFile: null,
    selectedFileValue: null,
    cachedUploadedAttachmentId: null,
    cachedUploadedFile: null,
    draftText: '',
    error: null,
    viewMode: 'draft',
  };

  const domCleanup = new Set<() => void>();
  let unsubscribeController: (() => void) | null = null;
  let unsubscribeRawMessages: (() => void) | null = null;

  function draftHasLiveData(state: ChatState): boolean {
    return state.transcript.length > 0
      || state.activeQuestion !== null
      || state.escalation !== null
      || state.lastError !== null
      || state.workerState.state !== 'idle'
      || state.connection.isConnected
      || state.connection.isStale
      || state.connection.sessionState !== EMPTY_CHAT_STATE.connection.sessionState
      || state.connection.channelState !== EMPTY_CHAT_STATE.connection.channelState;
  }

  function getDisplayedChatState(): ChatState {
    if (internal.viewMode === 'historical') {
      return {
        ...cloneChatState(EMPTY_CHAT_STATE),
        transcript: [...historicalTranscript],
        input: { locked: true, reason: 'historical_read_only' },
      };
    }
    if (internal.viewMode === 'draft' && !draftHasLiveData(liveChatState)) {
      return cloneChatState(EMPTY_CHAT_STATE);
    }
    return cloneChatState(liveChatState);
  }

  function getPublicState(): CortexChatWidgetState {
    return clonePublicState(options, internal, getDisplayedChatState());
  }

  function syncTextareaValue() {
    if (dom.textarea.value !== internal.draftText) {
      dom.textarea.value = internal.draftText;
    }
  }

  function renderHistory() {
    if (!historyDom) {
      return;
    }
    if (historyState === 'loading') {
      renderHistoryList(historyDom, { kind: 'loading' });
      return;
    }
    if (historyState === 'error') {
      renderHistoryList(historyDom, { kind: 'error', message: historyErrorMessage || 'Unable to load chats.' });
      return;
    }
    if (historyState === 'empty') {
      renderHistoryList(historyDom, { kind: 'empty' });
      return;
    }
    renderHistoryList(historyDom, {
      kind: 'loaded',
      items: historyItems,
      selectedSessionId: selectedHistorySessionId,
      menuSessionId: historyMenuSessionId,
      draftSelected: internal.viewMode === 'draft',
    });
  }

  function notifyAndRender() {
    syncTextareaValue();
    const state = getPublicState();
    renderWidget(dom, state, options, internal.attachmentsAvailable, internal.isUploading);
    if (historyDom) {
      applyResolvedTheme(historyDom.host, historyDom.root, options.theme, {
        dark: 'cortex-widget-history--dark',
        light: 'cortex-widget-history--light',
      });
    }
    renderHistory();
    options.onStateChange?.(state);
  }

  function bindControllerListeners() {
    unsubscribeController = controller.subscribe((nextState: ChatState) => {
      liveChatState = nextState;
      if (nextState.lastError) {
        internal.error = null;
        internal.isAwaitingAnswer = false;
        internal.isTyping = false;
        internal.isUploading = false;
      }
      if (isTerminalSessionState(nextState.connection.sessionState)) {
        internal.isAwaitingAnswer = false;
        internal.isTyping = false;
        internal.isUploading = false;
      }
      if (internal.viewMode !== 'historical') {
        notifyAndRender();
      }
    });

    unsubscribeRawMessages = client.onMessage((message) => {
      const flags = getMessageFlags(message);
      if (flags.startTyping) {
        internal.isTyping = true;
      }
      if (flags.stopTyping) {
        internal.isTyping = false;
      }
      if (flags.finalAnswer) {
        internal.isAwaitingAnswer = false;
        internal.isTyping = false;
        internal.isUploading = false;
        internal.error = null;
      }
      if (flags.isQuestion) {
        internal.isAwaitingAnswer = false;
        internal.isTyping = false;
      }
      if (internal.viewMode !== 'historical') {
        notifyAndRender();
      }
    });
  }

  function teardownLiveListeners() {
    if (unsubscribeController) {
      unsubscribeController();
      unsubscribeController = null;
    }
    if (unsubscribeRawMessages) {
      unsubscribeRawMessages();
      unsubscribeRawMessages = null;
    }
  }

  async function resetLiveSession() {
    teardownLiveListeners();
    try {
      await controller.disconnect();
    } catch {}
    controller.destroy();

    client = options.client ?? createClient();
    controller = createChatController({
      client,
      mode: 'end_user',
      debug: options.debug,
    });
    liveChatState = controller.getState();
    internal.attachmentsAvailable = typeof client.uploadAttachment === 'function' || typeof client.uploadFile === 'function';
    liveConnected = false;
    liveConnectPromise = null;
    bindControllerListeners();
  }

  async function ensureConnected(): Promise<void> {
    if (liveConnected) {
      return;
    }
    if (liveConnectPromise) {
      return liveConnectPromise;
    }
    liveConnectPromise = (async () => {
      await controller.connect();
      liveConnected = true;
    })().finally(() => {
      liveConnectPromise = null;
    });
    return liveConnectPromise;
  }

  function setSelectedFile(file: File | null) {
    internal.selectedFileValue = file;
    internal.selectedFile = file
      ? {
          name: file.name,
          size: file.size,
          type: file.type,
        }
      : null;

    if (!file || internal.cachedUploadedFile !== file) {
      internal.cachedUploadedAttachmentId = null;
      internal.cachedUploadedFile = null;
    }
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    dom.fileInput.value = '';
  }

  function clearDraftComposer() {
    internal.draftText = '';
    clearSelectedFile();
    internal.cachedUploadedAttachmentId = null;
    internal.cachedUploadedFile = null;
  }

  async function uploadSelectedFile(): Promise<string | null> {
    const file = internal.selectedFileValue;
    if (!file) {
      return null;
    }

    if (internal.cachedUploadedAttachmentId && internal.cachedUploadedFile === file) {
      return internal.cachedUploadedAttachmentId;
    }

    internal.isUploading = true;
    internal.error = null;
    notifyAndRender();

    try {
      let uploadedId: string;
      if (typeof client.uploadAttachment === 'function') {
        uploadedId = await client.uploadAttachment(file);
      } else if (typeof client.uploadFile === 'function') {
        uploadedId = await client.uploadFile(file);
      } else {
        throw createWidgetError(
          'attachments_unavailable',
          'Attachments are unavailable for the current client.',
        );
      }

      internal.cachedUploadedAttachmentId = uploadedId;
      internal.cachedUploadedFile = file;
      internal.isUploading = false;
      notifyAndRender();
      return uploadedId;
    } catch (error) {
      resolveUploadError(error, options, internal);
      notifyAndRender();
      return null;
    }
  }

  async function refreshHistory() {
    if (!historyClient) {
      return;
    }
    historyState = 'loading';
    historyErrorMessage = '';
    notifyAndRender();
    try {
      historyItems = await historyClient.listConversations();
      historyState = historyItems.length === 0 ? 'empty' : 'loaded';
      if (selectedHistorySessionId && !historyItems.some((item) => item.session_id === selectedHistorySessionId)) {
        selectedHistorySessionId = null;
        historicalTranscript = [];
        internal.viewMode = 'draft';
        clearDraftComposer();
      }
    } catch (error) {
      historyState = 'error';
      historyErrorMessage = error instanceof Error ? error.message : 'Unable to load chats.';
    }
    notifyAndRender();
  }

  async function handleSend() {
    if (internal.isDestroyed || internal.viewMode === 'historical') {
      return;
    }

    const content = internal.draftText.trim();
    const hasContent = content.length > 0;
    const hasFile = internal.selectedFileValue !== null;
    const displayedChatState = getDisplayedChatState();
    const inputLocked = displayedChatState.input.locked;

    const activeQuestion = liveChatState.activeQuestion;
    if (activeQuestion && !activeQuestion.allow_reply) {
      return;
    }

    if (inputLocked || internal.isAwaitingAnswer || internal.isUploading || (!hasContent && !hasFile)) {
      return;
    }

    internal.error = null;
    let attachmentId: string | null = null;
    if (hasFile) {
      attachmentId = await uploadSelectedFile();
      if (internal.selectedFileValue && attachmentId === null) {
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
      debug.log('[cortex-chat-widget] handleSend -> controller.sendMessage start', {
        ...summarizeSendPayload(sendRequest),
      });
      const result = await controller.sendMessage(sendRequest);
      debug.log('[cortex-chat-widget] handleSend -> controller.sendMessage done', {
        ok: result.ok,
        clientMsgId: result.clientMsgId,
        messageId: result.messageId,
      });

      if (!result.ok) {
        internal.isAwaitingAnswer = false;
        internal.isUploading = false;
        internal.error = null;
        notifyAndRender();
        return;
      }

      internal.viewMode = 'live';
      selectedHistorySessionId = null;
      historicalTranscript = [];
      clearDraftComposer();
      internal.error = null;
      internal.isAwaitingAnswer = true;
      notifyAndRender();
      void refreshHistory();
    } catch (error) {
      resolveRuntimeError(error, options, internal);
      notifyAndRender();
    }
  }

  async function handleLoginSubmit() {
    if (internal.isDestroyed) {
      return;
    }
    const login = dom.authLoginInput.value.trim();
    const password = dom.authPasswordInput.value;
    if (!login || !password) {
      return;
    }
    dom.authPasswordInput.value = '';
    try {
      await controller.submitLogin({ login, password });
    } catch {
      // auth state transitions are driven by the controller; errors surface via state
    }
    notifyAndRender();
  }

  async function handleOptionSelect(questionId: string, optionId: string, optionLabel: string) {
    if (internal.isDestroyed || internal.isAwaitingAnswer || internal.viewMode === 'historical') {
      return;
    }
    try {
      const result = await controller.sendMessage({
        content: [optionLabel],
        meta: { question_id: questionId, selected_option: optionId },
      });

      if (!result.ok) {
        internal.isAwaitingAnswer = false;
        internal.error = null;
        notifyAndRender();
        return;
      }

      internal.viewMode = 'live';
      selectedHistorySessionId = null;
      historicalTranscript = [];
      clearDraftComposer();
      internal.error = null;
      internal.isAwaitingAnswer = true;
      notifyAndRender();
      void refreshHistory();
    } catch (error) {
      resolveRuntimeError(error, options, internal);
      notifyAndRender();
    }
  }

  async function selectDraftMode() {
    selectedHistorySessionId = null;
    historicalTranscript = [];
    historyMenuSessionId = null;
    internal.viewMode = 'draft';
    clearDraftComposer();
    internal.error = null;
    internal.isAwaitingAnswer = false;
    internal.isTyping = false;
    await resetLiveSession();
    if (options.mode === 'embedded' || internal.isOpen) {
      void ensureConnected().catch((error) => {
        resolveRuntimeError(error, options, internal);
        notifyAndRender();
      });
    }
    notifyAndRender();
  }

  async function selectHistoricalConversation(sessionId: string) {
    if (!historyClient) {
      return;
    }
    internal.error = null;
    historyMenuSessionId = null;
    notifyAndRender();
    try {
      historicalTranscript = await historyClient.getMessages(sessionId);
      selectedHistorySessionId = sessionId;
      internal.viewMode = 'historical';
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      clearDraftComposer();
      clearSelectedFile();
      notifyAndRender();
    } catch (error) {
      internal.error = toWidgetError(error, 'history_load_failed', 'History messages could not be loaded');
      notifyAndRender();
    }
  }

  function setOpen(nextOpen: boolean) {
    if (options.mode === 'embedded' || internal.isDestroyed) {
      return;
    }
    internal.isOpen = nextOpen;
    if (nextOpen) {
      void ensureConnected().catch((error) => {
        resolveRuntimeError(error, options, internal);
        notifyAndRender();
      });
    }
    notifyAndRender();
  }

  async function teardown() {
    teardownLiveListeners();
    for (const dispose of Array.from(domCleanup)) {
      dispose();
      domCleanup.delete(dispose);
    }
    controller.destroy();
    try {
      await controller.disconnect();
    } catch {}
  }

  bindControllerListeners();

  const onTextareaInput = () => {
    internal.draftText = dom.textarea.value;
    notifyAndRender();
  };

  const onTextareaKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const onComposerSubmit = (event: Event) => {
    event.preventDefault();
    void handleSend();
  };

  const onAttachClick = () => {
    if (!internal.attachmentsAvailable || internal.isUploading || internal.isAwaitingAnswer || getDisplayedChatState().input.locked) {
      return;
    }
    dom.fileInput.click();
  };

  const onFileChange = () => {
    const file = dom.fileInput.files?.[0] ?? null;
    if (!internal.attachmentsAvailable || !file) {
      dom.fileInput.value = '';
      return;
    }
    setSelectedFile(file);
    notifyAndRender();
  };

  const onRemoveFile = () => {
    clearSelectedFile();
    notifyAndRender();
  };

  const onAuthSubmitClick = () => {
    void handleLoginSubmit();
  };

  const onAuthPasswordKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleLoginSubmit();
    }
  };

  const onLauncherClick = () => {
    if (options.mode !== 'floating') {
      return;
    }
    setOpen(!internal.isOpen);
  };

  const onTranscriptClick = (event: MouseEvent) => {
    const retryBtn = (event.target as Element).closest('[data-retry-msg-id]') as HTMLButtonElement | null;
    if (retryBtn) {
      const msgId = retryBtn.dataset.retryMsgId;
      if (msgId) {
        void controller.retryMessage(msgId).then((result) => {
          if (result?.ok) {
            internal.isAwaitingAnswer = true;
          } else {
            internal.isAwaitingAnswer = false;
          }
          internal.error = null;
          notifyAndRender();
        });
      }
      return;
    }

    const btn = (event.target as Element).closest('.cortex-widget__question-option') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const { questionId, optionId } = btn.dataset;
    const optionLabel = btn.textContent ?? '';
    if (questionId && optionId) {
      void handleOptionSelect(questionId, optionId, optionLabel);
    }
  };

  const onHistoryClick = (event: MouseEvent) => {
    const target = event.target as Element;
    const draftRow = target.closest('[data-draft="true"]') as HTMLButtonElement | null;
    if (draftRow) {
      event.preventDefault();
      void selectDraftMode();
      return;
    }

    const actionButton = target.closest('.cortex-widget-history__menu-action') as HTMLButtonElement | null;
    if (actionButton && historyClient) {
      event.preventDefault();
      event.stopPropagation();
      const sessionId = actionButton.dataset.sessionId ?? '';
      const action = actionButton.dataset.action ?? '';
      historyMenuSessionId = null;
      if (action === 'rename') {
        const current = historyItems.find((item) => item.session_id === sessionId);
        const nextTitle = window.prompt('Rename chat', current?.title ?? '');
        if (typeof nextTitle === 'string' && nextTitle.trim()) {
          void historyClient.renameConversation(sessionId, nextTitle.trim())
            .then(() => refreshHistory())
            .catch((error) => {
              internal.error = toWidgetError(error, 'history_rename_failed', 'Chat rename failed');
              notifyAndRender();
            });
        }
      } else if (action === 'delete') {
        void historyClient.deleteConversation(sessionId)
          .then(async () => {
            if (selectedHistorySessionId === sessionId) {
              await selectDraftMode();
            }
            await refreshHistory();
          })
          .catch((error) => {
            internal.error = toWidgetError(error, 'history_delete_failed', 'Chat delete failed');
            notifyAndRender();
          });
      } else if (action === 'pin') {
        const current = historyItems.find((item) => item.session_id === sessionId);
        const task = current?.pinned
          ? historyClient.unpinConversation(sessionId)
          : historyClient.pinConversation(sessionId);
        void task.then(() => refreshHistory()).catch((error) => {
          internal.error = toWidgetError(error, 'history_pin_failed', 'Chat update failed');
          notifyAndRender();
        });
      }
      notifyAndRender();
      return;
    }

    const toggleButton = target.closest('.cortex-widget-history__menu-toggle') as HTMLButtonElement | null;
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const sessionId = toggleButton.dataset.sessionId ?? null;
      historyMenuSessionId = historyMenuSessionId === sessionId ? null : sessionId;
      notifyAndRender();
      return;
    }

    const row = target.closest('.cortex-widget-history__row') as HTMLButtonElement | null;
    if (row?.dataset.sessionId) {
      void selectHistoricalConversation(row.dataset.sessionId);
    }
  };

  dom.textarea.addEventListener('input', onTextareaInput);
  dom.textarea.addEventListener('keydown', onTextareaKeyDown);
  dom.composer.addEventListener('submit', onComposerSubmit);
  dom.attachButton.addEventListener('click', onAttachClick);
  dom.fileInput.addEventListener('change', onFileChange);
  dom.fileChipRemove.addEventListener('click', onRemoveFile);
  dom.authSubmitButton.addEventListener('click', onAuthSubmitClick);
  dom.authPasswordInput.addEventListener('keydown', onAuthPasswordKeyDown);
  dom.launcher.addEventListener('click', onLauncherClick);
  dom.transcript.addEventListener('click', onTranscriptClick);

  domCleanup.add(() => dom.textarea.removeEventListener('input', onTextareaInput));
  domCleanup.add(() => dom.textarea.removeEventListener('keydown', onTextareaKeyDown));
  domCleanup.add(() => dom.composer.removeEventListener('submit', onComposerSubmit));
  domCleanup.add(() => dom.attachButton.removeEventListener('click', onAttachClick));
  domCleanup.add(() => dom.fileInput.removeEventListener('change', onFileChange));
  domCleanup.add(() => dom.fileChipRemove.removeEventListener('click', onRemoveFile));
  domCleanup.add(() => dom.authSubmitButton.removeEventListener('click', onAuthSubmitClick));
  domCleanup.add(() => dom.authPasswordInput.removeEventListener('keydown', onAuthPasswordKeyDown));
  domCleanup.add(() => dom.launcher.removeEventListener('click', onLauncherClick));
  domCleanup.add(() => dom.transcript.removeEventListener('click', onTranscriptClick));

  mountTarget.appendChild(dom.host);
  if (historyDom && historyTarget) {
    historyTarget.appendChild(historyDom.host);
    const onNewChatClick = () => {
      void selectDraftMode();
    };
    historyDom.newChatButton.addEventListener('click', onNewChatClick);
    historyDom.list.addEventListener('click', onHistoryClick);
    domCleanup.add(() => historyDom.newChatButton.removeEventListener('click', onNewChatClick));
    domCleanup.add(() => historyDom.list.removeEventListener('click', onHistoryClick));
  }

  internal.isReady = true;
  notifyAndRender();
  options.onReady?.();

  if (options.mode === 'embedded' || internal.isOpen) {
    void ensureConnected().catch((error) => {
      resolveRuntimeError(error, options, internal);
      notifyAndRender();
    });
  }

  if (historyClient) {
    void refreshHistory();
  }

  return {
    destroy() {
      if (internal.isDestroyed) {
        return;
      }

      internal.isDestroyed = true;
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      internal.isUploading = false;

      void teardown();
      dom.host.remove();
      historyDom?.host.remove();
    },

    open() {
      setOpen(true);
    },

    close() {
      setOpen(false);
    },

    toggle() {
      if (options.mode === 'embedded') {
        return;
      }
      setOpen(!internal.isOpen);
    },

    getState() {
      return getPublicState();
    },
  };
}
