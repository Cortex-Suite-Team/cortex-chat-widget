import { createChatController, type ChatState } from '@cortex-suite/sdk-ui';
import { createWidgetError, toWidgetError } from './errors.js';
import {
  getMessageFlags,
  isTerminalSessionState,
} from './message-flags.js';
import { renderWidget } from './renderer.js';
import type {
  CortexChatWidgetHandle,
  CortexChatWidgetOptions,
  CortexChatWidgetState,
  InternalWidgetState,
  NormalizedWidgetOptions,
  WidgetClientLike,
  WidgetDom,
} from './types.js';

const EMPTY_CHAT_STATE: ChatState = {
  connection: {
    channelState: 'CLOSED',
    sessionState: 'CREATED',
    isConnected: false,
    isStale: false,
  },
  transcript: [],
  input: {
    locked: false,
  },
  escalation: null,
  lastError: null,
};

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
    isAwaitingAnswer: internal.isAwaitingAnswer,
    isTyping: internal.isTyping,
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

export function createWidgetHandle(args: {
  options: NormalizedWidgetOptions;
  client: WidgetClientLike;
  dom: WidgetDom;
  mountTarget: HTMLElement;
}): CortexChatWidgetHandle {
  const { options, client, dom, mountTarget } = args;
  const controller = createChatController({
    client,
    mode: 'end_user',
  });

  let chatState = controller.getState();
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
  };

  const domCleanup = new Set<() => void>();
  let unsubscribeController: (() => void) | null = null;
  let unsubscribeRawMessages: (() => void) | null = null;

  function getPublicState(): CortexChatWidgetState {
    return clonePublicState(options, internal, chatState);
  }

  function syncTextareaValue() {
    if (dom.textarea.value !== internal.draftText) {
      dom.textarea.value = internal.draftText;
    }
  }

  function notifyAndRender() {
    syncTextareaValue();
    const state = getPublicState();
    renderWidget(dom, state, options, internal.attachmentsAvailable, internal.isUploading);
    options.onStateChange?.(state);
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

  async function handleSend() {
    if (internal.isDestroyed) {
      return;
    }

    const content = internal.draftText.trim();
    const hasContent = content.length > 0;
    const hasFile = internal.selectedFileValue !== null;
    const inputLocked = chatState.input.locked;
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

    try {
      await controller.sendMessage({
        content,
        attachments: attachmentId ? [attachmentId] : undefined,
      });

      internal.draftText = '';
      clearSelectedFile();
      internal.cachedUploadedAttachmentId = null;
      internal.cachedUploadedFile = null;
      internal.error = null;
      internal.isAwaitingAnswer = true;
      notifyAndRender();
    } catch (error) {
      internal.isAwaitingAnswer = false;
      internal.isUploading = false;
      internal.error = toWidgetError(error, 'send_failed', 'Message send failed');
      options.onError?.(error);
      notifyAndRender();
    }
  }

  function setOpen(nextOpen: boolean) {
    if (options.mode === 'embedded' || internal.isDestroyed) {
      return;
    }
    internal.isOpen = nextOpen;
    notifyAndRender();
  }

  function teardown() {
    if (unsubscribeController) {
      unsubscribeController();
      unsubscribeController = null;
    }
    if (unsubscribeRawMessages) {
      unsubscribeRawMessages();
      unsubscribeRawMessages = null;
    }
    for (const dispose of Array.from(domCleanup)) {
      dispose();
      domCleanup.delete(dispose);
    }
  }

  unsubscribeController = controller.subscribe((nextState: ChatState) => {
    chatState = nextState;
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
    notifyAndRender();
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
    notifyAndRender();
  });

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
    if (!internal.attachmentsAvailable || internal.isUploading || internal.isAwaitingAnswer || chatState.input.locked) {
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

  const onLauncherClick = () => {
    if (options.mode !== 'floating') {
      return;
    }
    internal.isOpen = !internal.isOpen;
    notifyAndRender();
  };

  dom.textarea.addEventListener('input', onTextareaInput);
  dom.textarea.addEventListener('keydown', onTextareaKeyDown);
  dom.composer.addEventListener('submit', onComposerSubmit);
  dom.attachButton.addEventListener('click', onAttachClick);
  dom.fileInput.addEventListener('change', onFileChange);
  dom.fileChipRemove.addEventListener('click', onRemoveFile);
  dom.launcher.addEventListener('click', onLauncherClick);

  domCleanup.add(() => dom.textarea.removeEventListener('input', onTextareaInput));
  domCleanup.add(() => dom.textarea.removeEventListener('keydown', onTextareaKeyDown));
  domCleanup.add(() => dom.composer.removeEventListener('submit', onComposerSubmit));
  domCleanup.add(() => dom.attachButton.removeEventListener('click', onAttachClick));
  domCleanup.add(() => dom.fileInput.removeEventListener('change', onFileChange));
  domCleanup.add(() => dom.fileChipRemove.removeEventListener('click', onRemoveFile));
  domCleanup.add(() => dom.launcher.removeEventListener('click', onLauncherClick));

  mountTarget.appendChild(dom.host);
  internal.isReady = true;
  notifyAndRender();
  options.onReady?.();

  void controller.connect().catch((error: unknown) => {
    resolveRuntimeError(error, options, internal);
    notifyAndRender();
  });

  return {
    destroy() {
      if (internal.isDestroyed) {
        return;
      }

      internal.isDestroyed = true;
      internal.isAwaitingAnswer = false;
      internal.isTyping = false;
      internal.isUploading = false;

      teardown();
      dom.host.remove();

      void controller.disconnect().catch((error: unknown) => {
        resolveRuntimeError(error, options, internal);
      });
      controller.destroy();
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
