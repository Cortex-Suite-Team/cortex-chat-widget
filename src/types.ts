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

export interface SelectedFileState {
  name: string;
  size: number;
  type: string;
}

export interface TranscriptAttachmentViewModel {
  id: string | null;
  label: string;
  url: string | null;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
}

export interface CortexChatWidgetState {
  mode: 'embedded' | 'floating';
  isOpen: boolean;
  isReady: boolean;
  isDestroyed: boolean;
  isAwaitingAnswer: boolean;
  isTyping: boolean;
  isHistoricalView: boolean;
  selectedFile: SelectedFileState | null;
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
  uploadAttachment?(file: File | Blob | ArrayBuffer | Uint8Array | string): Promise<string>;
  uploadFile?(
    file: File | Blob | ArrayBuffer | Uint8Array | string,
    options?: { sessionId?: string },
  ): Promise<string>;
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
}

export interface InternalWidgetState {
  isOpen: boolean;
  isReady: boolean;
  isDestroyed: boolean;
  isAwaitingAnswer: boolean;
  isTyping: boolean;
  isUploading: boolean;
  attachmentsAvailable: boolean;
  selectedFile: SelectedFileState | null;
  selectedFileValue: File | null;
  cachedUploadedAttachmentId: string | null;
  cachedUploadedFile: File | null;
  draftText: string;
  error: CortexChatWidgetError | null;
  viewMode: 'draft' | 'live' | 'historical';
}

export interface WidgetDom {
  host: HTMLElement;
  shadowRoot: ShadowRoot;
  root: HTMLElement;
  launcher: HTMLButtonElement;
  panel: HTMLElement;
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
  composer: HTMLFormElement;
  textarea: HTMLTextAreaElement;
  sendButton: HTMLButtonElement;
  attachButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  fileHint: HTMLElement;
  fileChip: HTMLElement;
  fileChipName: HTMLElement;
  fileChipMeta: HTMLElement;
  fileChipRemove: HTMLButtonElement;
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
