import type {
  ChatController,
  ChatMessageViewModel,
  ChatState,
  CortexClientLike,
  CortexTransportMessage,
} from '@cortex-suite/sdk-ui';

export interface CortexChatWidgetError {
  code: string;
  message: string;
  cause?: unknown;
}

/**
 * Attachment ref sent in chat::message payload.meta.attachments.
 * The public boundary carries only the canonical SessionManager file_ref.
 */
export interface WidgetAttachmentRef {
  file_ref: string;
  filename?: string;
  content_type?: string;
  size?: number;
}

/** Maximum files in one composed message (SDK MAX_ATTACHMENTS_PER_MESSAGE). */
export const MAX_COMPOSER_ATTACHMENTS = 8;

export type SelectedFileStatus = 'selected' | 'uploading' | 'uploaded' | 'failed';

export interface SelectedFileState {
  /** Stable local identity of this selection; never sent to the server. */
  id: string;
  name: string;
  size: number;
  type: string;
  status: SelectedFileStatus;
  /** Upload failure of this file; retryable failures can be retried without touching the others. */
  error: CortexChatWidgetError | null;
  retryable: boolean;
}

export type FileDownloadStatus = 'downloading' | 'failed';

export interface FileDownloadState {
  status: FileDownloadStatus;
  error: CortexChatWidgetError | null;
  retryable: boolean;
}

/**
 * A public session file rendered on a transcript message. Built only from the
 * canonical `message.meta.attachments` descriptor; it carries no URL. The only
 * download target is `fileRef`, passed to `client.downloadFile(fileRef)`.
 */
export interface TranscriptAttachmentViewModel {
  /** Session file reference (sf_...) — the public, render-safe id. */
  fileRef: string;
  label: string;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  /** Descriptor state; only `available` files can be downloaded. */
  state: 'available' | 'expired' | 'deleted' | 'quarantined' | null;
  /** True for an assistant-generated file of this answer (rendered as a download card). */
  generated: boolean;
}

export interface CortexChatWidgetState {
  mode: 'embedded' | 'floating';
  isOpen: boolean;
  isReady: boolean;
  isDestroyed: boolean;
  isAwaitingAnswer: boolean;
  isTyping: boolean;
  isHistoricalView: boolean;
  /** Files selected in the composer, in selection order. */
  selectedFiles: SelectedFileState[];
  /** In-flight or failed generated-file downloads, by file_ref. */
  fileDownloads: Record<string, FileDownloadState>;
  chat: ChatState;
  error: CortexChatWidgetError | null;
}

export interface HistoryConversationSummary {
  session_id: string;
  title: string;
  renamed: boolean;
  pinned: boolean;
  last_message_at: string | null;
  created_at: string | null;
}

export interface HistoryClient {
  listConversations(): Promise<HistoryConversationSummary[]>;
  getMessages(sessionId: string): Promise<ChatMessageViewModel[]>;
  renameConversation(sessionId: string, title: string): Promise<void>;
  pinConversation(sessionId: string): Promise<void>;
  unpinConversation(sessionId: string): Promise<void>;
  deleteConversation(sessionId: string): Promise<void>;
}

export type ChatViewMode =
  | { kind: 'live' }
  | { kind: 'historical'; sessionId: string };

export type HistorySelection =
  | { kind: 'current' }
  | { kind: 'historical'; sessionId: string }
  | { kind: 'none' };

export interface CortexChatWidgetOptions {
  apiKey: string;
  workerRef?: string;
  mode?: 'embedded' | 'floating';
  target?: string | HTMLElement;
  historyTarget?: string | HTMLElement;
  authUrl?: string;
  controlPlaneUrl?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  launcherLabel?: string;
  position?: 'bottom-right' | 'bottom-left';
  debug?: boolean;
  theme?: {
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    borderRadius?: string;
  };
  initialOpen?: boolean;
  client?: WidgetClientLike;
  onReady?: () => void;
  onStateChange?: (state: CortexChatWidgetState) => void;
  onError?: (error: unknown) => void;
}

export interface CortexChatWidgetHandle {
  destroy(): void;
  open(): void;
  close(): void;
  toggle(): void;
  getState(): CortexChatWidgetState;
}

export interface WidgetClientLike extends CortexClientLike {
  uploadFile?(
    file: File | Blob | ArrayBuffer | Uint8Array | string,
    options?: { sessionId?: string },
  ): Promise<string>;
  /** SDK session-file download: resolves the bytes of a public sf_ file. */
  downloadFile?(fileRef: string): Promise<Blob>;
  readonly accessToken?: string | null;
  readonly cpApiUrl?: string | null;
}

export type {
  ChatController,
  ChatMessageViewModel,
  ChatState,
  CortexClientLike,
  CortexTransportMessage,
} from '@cortex-suite/sdk-ui';

export interface NormalizedWidgetOptions extends CortexChatWidgetOptions {
  mode: 'embedded' | 'floating';
  position: 'bottom-right' | 'bottom-left';
  title: string;
  subtitle: string;
  placeholder: string;
  launcherLabel: string;
  initialOpen: boolean;
  debug?: boolean;
}

export interface InternalWidgetState {
  isOpen: boolean;
  isReady: boolean;
  isDestroyed: boolean;
  isAwaitingAnswer: boolean;
  isTyping: boolean;
  isUploading: boolean;
  attachmentsAvailable: boolean;
  /** Composer files in selection order; a successful upload keeps its sf_ ref for retries. */
  composerFiles: ComposerFile[];
  fileDownloads: Map<string, FileDownloadState>;
  draftText: string;
  error: CortexChatWidgetError | null;
}

export interface ComposerFile {
  id: string;
  file: File;
  status: SelectedFileStatus;
  uploadedRef: WidgetAttachmentRef | null;
  error: CortexChatWidgetError | null;
  retryable: boolean;
}

export interface WidgetDom {
  host: HTMLElement;
  shadowRoot: ShadowRoot;
  root: HTMLElement;
  launcher: HTMLButtonElement;
  panel: HTMLElement;
  shell: HTMLElement;
  shellRail: HTMLElement;
  historySlot: HTMLElement;
  chatSlot: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  status: HTMLElement;
  avatar: HTMLElement;
  statusDot: HTMLElement;
  errorBanner: HTMLElement;
  transcript: HTMLElement;
  workerStatus: HTMLElement;
  typing: HTMLElement;
  escalation: HTMLElement;
  humanAssistance: HTMLElement;
  authGate: HTMLElement;
  authMessage: HTMLElement;
  authLoginInput: HTMLInputElement;
  authPasswordInput: HTMLInputElement;
  authSubmitButton: HTMLButtonElement;
  composer: HTMLFormElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  attachButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  fileHint: HTMLElement;
  /** Selected-file chip list; chips are rendered per file. */
  fileChips: HTMLElement;
}

export interface HistoryDom {
  host: HTMLElement;
  shadowRoot: ShadowRoot;
  root: HTMLElement;
  status: HTMLElement;
  searchPlaceholder: HTMLElement;
  newChatButton: HTMLButtonElement;
  list: HTMLElement;
}

export interface WidgetInstance {
  handle: CortexChatWidgetHandle;
}

export interface CreateWidgetArgs {
  options: NormalizedWidgetOptions;
  client: WidgetClientLike;
  controller: ChatController;
  dom: WidgetDom;
}

export interface MessageFlags {
  startTyping: boolean;
  stopTyping: boolean;
  finalAnswer: boolean;
  isQuestion: boolean;
}

export interface MountTargetResolution {
  mountTarget: HTMLElement;
  targetElement?: HTMLElement;
  historyTarget?: HTMLElement;
}

export interface TranscriptRenderMessage {
  message: ChatMessageViewModel;
  contentText: string | null;
  formattedContent: string | null;
}

export type WidgetRawMessage = CortexTransportMessage;
