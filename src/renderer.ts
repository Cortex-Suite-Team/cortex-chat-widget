import { getIconSvg } from './icons.js';
import {
  buildStatusText,
  formatContent,
  shouldHideTranscriptMessage,
} from './message-flags.js';
import type {
  ChatMessageViewModel,
  CortexChatWidgetState,
  NormalizedWidgetOptions,
  TranscriptAttachmentViewModel,
  WidgetDom,
} from './types.js';

function getAvatarInitials(label: string): string {
  const normalized = label.trim();
  if (!normalized) {
    return 'CX';
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return initials || normalized.slice(0, 2).toUpperCase();
}

function getHeaderCorrespondent(state: CortexChatWidgetState) {
  return state.chat.session?.correspondent ?? null;
}

function getHeaderTitle(state: CortexChatWidgetState, options: NormalizedWidgetOptions): string {
  return getHeaderCorrespondent(state)?.name ?? options.title;
}

function getHeaderSubtitle(state: CortexChatWidgetState, options: NormalizedWidgetOptions): string {
  const correspondent = getHeaderCorrespondent(state);
  return correspondent?.title ?? correspondent?.subtitle ?? options.subtitle;
}

function normalizeAvatarUrl(
  avatarUrl: string | null,
  options: NormalizedWidgetOptions,
): string | null {
  if (!avatarUrl) {
    return null;
  }

  if (/^(https?:|data:)/i.test(avatarUrl)) {
    return avatarUrl;
  }

  const baseUrl = options.controlPlaneUrl ?? options.authUrl;
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(avatarUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function syncHeaderAvatar(
  avatarEl: HTMLElement,
  title: string,
  avatarUrl: string | null,
): void {
  const existingImage = avatarEl.querySelector('img');
  if (avatarUrl) {
    let image = existingImage as HTMLImageElement | null;
    if (!image) {
      image = document.createElement('img');
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      avatarEl.appendChild(image);
    }

    for (const node of Array.from(avatarEl.childNodes)) {
      if (node === image) {
        continue;
      }
      if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'IMG')) {
        node.remove();
      }
    }

    if (image.getAttribute('src') !== avatarUrl) {
      image.src = avatarUrl;
    }

    if (avatarEl.lastChild !== image) {
      avatarEl.appendChild(image);
    }
    return;
  }

  existingImage?.remove();
  const initials = getAvatarInitials(title);
  const currentText = Array.from(avatarEl.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? '')
    .join('');

  for (const node of Array.from(avatarEl.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) {
      node.remove();
    }
  }

  if (currentText !== initials) {
    avatarEl.textContent = initials;
  }
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const hex = value.trim();
  const short = /^#([\da-f]{3})$/i.exec(hex);
  if (short) {
    const [, raw] = short;
    return {
      r: parseInt(`${raw[0]}${raw[0]}`, 16),
      g: parseInt(`${raw[1]}${raw[1]}`, 16),
      b: parseInt(`${raw[2]}${raw[2]}`, 16),
    };
  }

  const full = /^#([\da-f]{6})$/i.exec(hex);
  if (!full) {
    return null;
  }

  const [, raw] = full;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function isDarkColor(value: string | undefined, fallbackDark: boolean): boolean {
  if (!value) {
    return fallbackDark;
  }
  const rgb = parseHexColor(value);
  if (!rgb) {
    return fallbackDark;
  }
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance < 0.45;
}

export function applyResolvedTheme(
  host: HTMLElement,
  root: HTMLElement,
  theme: NormalizedWidgetOptions['theme'] | undefined,
  variantClasses: { light: string; dark: string },
): boolean {
  const accentColor = theme?.accentColor ?? '#2563eb';
  const backgroundColor = theme?.backgroundColor ?? '#ffffff';
  const textColor = theme?.textColor ?? '#172033';
  const borderRadius = theme?.borderRadius ?? '18px';
  const darkTheme = isDarkColor(backgroundColor, false);

  host.style.setProperty('--cortex-accent-color', accentColor);
  host.style.setProperty('--cortex-background-color', backgroundColor);
  host.style.setProperty('--cortex-text-color', textColor);
  host.style.setProperty('--cortex-border-radius', borderRadius);
  host.style.setProperty('color-scheme', darkTheme ? 'dark' : 'light');

  root.classList.toggle(variantClasses.dark, darkTheme);
  root.classList.toggle(variantClasses.light, !darkTheme);

  return darkTheme;
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatMessageTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

function getTimestampSource(message: ChatMessageViewModel): 'client' | 'server' | null {
  const value = message.meta?.['timestamp_source'];
  return value === 'client' || value === 'server' ? value : null;
}

function getDeliveryStatusIconName(status: string): 'check' | 'check2-all' | null {
  if (status === 'sending' || status === 'sent') {
    return 'check';
  }
  if (status === 'delivered' || status === 'processed') {
    return 'check2-all';
  }
  return null;
}

function getDeliveryStatusLabel(status: string): string {
  if (status === 'sending') {
    return 'Sending';
  }
  if (status === 'sent') {
    return 'Sent';
  }
  if (status === 'delivered') {
    return 'Delivered';
  }
  if (status === 'processed') {
    return 'Processed by Runtime';
  }
  return 'Failed';
}

function toAttachmentViewModel(attachment: unknown): TranscriptAttachmentViewModel | null {
  if (typeof attachment === 'string') {
    const label = attachment.trim();
    if (!label) {
      return null;
    }
    return {
      id: label,
      label,
      url: null,
      fileName: null,
      contentType: null,
      size: null,
    };
  }

  if (!isRecord(attachment)) {
    return null;
  }

  const id = toNonEmptyString(attachment.file_id) ?? toNonEmptyString(attachment.attachment_id);
  const fileName = toNonEmptyString(attachment.filename) ?? toNonEmptyString(attachment.file_name) ?? toNonEmptyString(attachment.name);
  const url = toNonEmptyString(attachment.download_url) ?? toNonEmptyString(attachment.url) ?? toNonEmptyString(attachment.href);
  const contentType = toNonEmptyString(attachment.content_type) ?? toNonEmptyString(attachment.mime_type) ?? toNonEmptyString(attachment.type);
  const size = typeof attachment.size === 'number'
    ? attachment.size
    : (typeof attachment.size_bytes === 'number' ? attachment.size_bytes : null);
  const label = fileName ?? id ?? url;

  if (!label) {
    return null;
  }

  return {
    id,
    label,
    url,
    fileName,
    contentType,
    size,
  };
}

function getMessageAttachments(message: ChatMessageViewModel): TranscriptAttachmentViewModel[] {
  const attachments = message.meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .map((attachment) => toAttachmentViewModel(attachment))
    .filter((attachment): attachment is TranscriptAttachmentViewModel => attachment !== null);
}

function renderTranscript(
  transcriptEl: HTMLElement,
  state: CortexChatWidgetState,
  options: NormalizedWidgetOptions,
) {
  transcriptEl.replaceChildren();

  const visibleMessages = state.chat.transcript.filter((message: (typeof state.chat.transcript)[number]) => !shouldHideTranscriptMessage(message));
  if (visibleMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cortex-widget__empty';
    empty.textContent = state.isHistoricalView ? 'No messages in this chat yet.' : 'New chat';
    transcriptEl.appendChild(empty);
    return;
  }

  for (const message of visibleMessages) {
    const content = formatContent(message.content);
    const attachments = getMessageAttachments(message);
    const hasTextContent = content.contentText !== null
      ? content.contentText.trim().length > 0
      : (content.formattedContent ?? '').trim().length > 0;
    const hasQuestionOptions = message.type === 'chat::question'
      && Array.isArray(message.meta?.['options'])
      && (message.meta['options'] as unknown[]).length > 0;

    if (!hasTextContent && attachments.length === 0 && !hasQuestionOptions) {
      continue;
    }

    const wrapper = document.createElement('article');
    wrapper.className = 'cortex-widget__message';
    wrapper.dataset.role = message.role;
    wrapper.dataset.type = message.type;
    wrapper.setAttribute('data-testid', 'transcript-message');

    // Actor header for non-user, non-error messages
    const actor = isRecord(message.meta?.['actor']) ? message.meta!['actor'] as Record<string, unknown> : null;
    const hasActorHeader = actor !== null && message.role !== 'user' && message.role !== 'error';

    if (hasActorHeader) {
      const actorHeader = document.createElement('div');
      actorHeader.className = 'cortex-widget__actor';
      actorHeader.setAttribute('data-testid', 'actor-header');

      const avatarUrl = normalizeAvatarUrl(toNonEmptyString(actor!['avatar_url']), options);
      if (avatarUrl) {
        const img = document.createElement('img');
        img.className = 'cortex-widget__actor-avatar';
        img.src = avatarUrl;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.setAttribute('data-testid', 'actor-avatar');
        actorHeader.appendChild(img);
      }

      const actorInfo = document.createElement('div');
      actorInfo.className = 'cortex-widget__actor-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'cortex-widget__actor-name';
      nameEl.textContent = toNonEmptyString(actor!['name']) ?? 'Assistant';
      nameEl.setAttribute('data-testid', 'actor-name');
      actorInfo.appendChild(nameEl);

      const actorTitle = toNonEmptyString(actor!['title']);
      if (actorTitle) {
        const titleEl = document.createElement('span');
        titleEl.className = 'cortex-widget__actor-title';
        titleEl.textContent = actorTitle;
        actorInfo.appendChild(titleEl);
      }

      actorHeader.appendChild(actorInfo);
      wrapper.appendChild(actorHeader);
    }

    const bubble = document.createElement('div');
    bubble.className = 'cortex-widget__bubble';
    bubble.setAttribute('data-testid', 'message-bubble');
    if (message.status) {
      bubble.dataset.status = message.status;
    }

    if (content.contentText !== null) {
      const textContent = content.contentText.trim();
      if (textContent.length > 0) {
        const text = document.createElement('div');
        text.className = 'cortex-widget__bubble-text';
        text.textContent = textContent;
        bubble.appendChild(text);
      } else if (attachments.length > 0) {
        const fallback = document.createElement('div');
        fallback.className = 'cortex-widget__bubble-text';
        fallback.textContent = 'Attachment sent';
        bubble.appendChild(fallback);
      }
    } else {
      const pre = document.createElement('pre');
      pre.className = 'cortex-widget__formatted';
      pre.textContent = content.formattedContent ?? '';
      bubble.appendChild(pre);
    }

    if (attachments.length > 0) {
      const attachmentList = document.createElement('ul');
      attachmentList.className = 'cortex-widget__message-attachments';
      attachmentList.setAttribute('data-testid', 'message-attachments');
      for (const attachment of attachments) {
        const item = document.createElement('li');
        item.className = 'cortex-widget__message-attachment';
        const hasDownloadLink = message.role === 'assistant' && attachment.url;

        if (hasDownloadLink) {
          const link = document.createElement('a');
          link.className = 'cortex-widget__message-attachment-link';
          link.href = attachment.url ?? '#';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          if (attachment.fileName) {
            link.download = attachment.fileName;
          }
          link.setAttribute('data-testid', 'message-attachment-link');

          const label = document.createElement('span');
          label.className = 'cortex-widget__message-attachment-label';
          label.textContent = attachment.label;

          const detailsParts: string[] = [];
          if (attachment.contentType) {
            detailsParts.push(attachment.contentType);
          }
          if (attachment.size !== null) {
            detailsParts.push(formatFileSize(attachment.size));
          }

          link.appendChild(label);

          if (detailsParts.length > 0) {
            const details = document.createElement('span');
            details.className = 'cortex-widget__message-attachment-details';
            details.textContent = detailsParts.join(' · ');
            link.appendChild(details);
          }

          item.appendChild(link);
        } else {
          item.textContent = attachment.label;
        }
        attachmentList.appendChild(item);
      }
      bubble.appendChild(attachmentList);
    }

    // Question options for chat::question messages
    if (message.type === 'chat::question' && Array.isArray(message.meta?.['options'])) {
      const questionId = toNonEmptyString(message.meta?.['question_id']);
      const inputType = toNonEmptyString(message.meta?.['input_type']) ?? 'radio';

      if (inputType === 'checkbox') {
        console.warn('[cortex-chat-widget] chat::question input_type="checkbox" is not supported');
      }

      if (questionId && inputType !== 'checkbox') {
        const isActive = state.chat.activeQuestion?.question_id === questionId;
        const optionsDisabled = !isActive || state.isAwaitingAnswer;

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'cortex-widget__question-options';
        optionsContainer.setAttribute('data-testid', 'question-options');

        for (const option of message.meta['options'] as Array<Record<string, unknown>>) {
          const optionId = toNonEmptyString(option['id']);
          const optionLabel = toNonEmptyString(option['label']);
          if (!optionId || !optionLabel) continue;

          const btn = document.createElement('button');
          btn.className = 'cortex-widget__question-option';
          btn.type = 'button';
          btn.textContent = optionLabel;
          btn.dataset.questionId = questionId;
          btn.dataset.optionId = optionId;
          btn.disabled = optionsDisabled;
          btn.setAttribute('data-testid', 'question-option');
          optionsContainer.appendChild(btn);
        }

        bubble.appendChild(optionsContainer);
      }
    }

    const meta = document.createElement('div');
    meta.className = 'cortex-widget__meta';
    const metaText = document.createElement('span');
    metaText.className = 'cortex-widget__meta-text';
    metaText.setAttribute('data-testid', 'message-meta-text');

    const timestampText = formatMessageTime(message.ts ?? null);
    const timestampSource = getTimestampSource(message);
    metaText.dataset.timestampSource = timestampSource ?? 'unknown';
    if (timestampSource === 'client') {
      metaText.dataset.provisional = 'true';
    }
    if (hasActorHeader) {
      metaText.textContent = timestampText ?? (message.status === 'streaming' ? 'streaming' : '');
    } else {
      const metaParts: string[] = [];
      if (message.role !== 'user') {
        const displayName = message.role === 'assistant' ? 'Assistant' : message.role;
        metaParts.push(displayName);
      }
      if (timestampText) {
        metaParts.push(timestampText);
      }
      if (message.status === 'streaming') {
        metaParts.push('streaming');
      }
      metaText.textContent = metaParts.join(' · ');
    }
    meta.appendChild(metaText);

    let statusEl: HTMLElement | null = null;
    const deliveryStatus = typeof message.deliveryStatus === 'string' ? message.deliveryStatus : undefined;
    if (message.role === 'user' && deliveryStatus) {
      statusEl = document.createElement('div');
      statusEl.className = 'cortex-widget__message-status';
      statusEl.dataset.status = deliveryStatus;
      statusEl.setAttribute('data-testid', 'message-delivery-status');

      const iconName = getDeliveryStatusIconName(deliveryStatus);
      if (iconName) {
        const icon = document.createElement('span');
        icon.className = 'cortex-widget__message-status-icon';
        icon.setAttribute('aria-label', getDeliveryStatusLabel(deliveryStatus));
        icon.setAttribute('title', getDeliveryStatusLabel(deliveryStatus));
        icon.setAttribute('data-testid', 'message-delivery-icon');
        icon.innerHTML = getIconSvg(iconName);
        statusEl.appendChild(icon);
      }

      if (deliveryStatus === 'failed' && message.retryable) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'cortex-widget__message-retry';
        retryBtn.type = 'button';
        retryBtn.setAttribute('aria-label', 'Retry message');
        retryBtn.setAttribute('title', 'Retry message');
        retryBtn.setAttribute('data-testid', 'message-retry-button');
        retryBtn.dataset.retryMsgId = message.id;
        retryBtn.innerHTML = getIconSvg('arrow-clockwise');
        statusEl.appendChild(retryBtn);
      }
    }

    if (statusEl) {
      meta.appendChild(statusEl);
    }
    wrapper.append(bubble, meta);
    transcriptEl.appendChild(wrapper);
  }

  if (transcriptEl.childElementCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'cortex-widget__empty';
    empty.textContent = state.isHistoricalView ? 'No messages in this chat yet.' : 'New chat';
    transcriptEl.appendChild(empty);
    return;
  }

  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

export function renderWidget(
  dom: WidgetDom,
  state: CortexChatWidgetState,
  options: NormalizedWidgetOptions,
  attachmentsAvailable: boolean,
  isUploading: boolean,
): void {
  applyResolvedTheme(dom.host, dom.root, options.theme, {
    dark: 'cortex-widget--dark',
    light: 'cortex-widget--light',
  });

  const headerCorrespondent = getHeaderCorrespondent(state);
  const headerTitle = getHeaderTitle(state, options);
  const headerSubtitle = getHeaderSubtitle(state, options);
  if (dom.title.textContent !== headerTitle) {
    dom.title.textContent = headerTitle;
  }
  if (dom.subtitle.textContent !== headerSubtitle) {
    dom.subtitle.textContent = headerSubtitle;
  }
  dom.status.textContent = state.isHistoricalView
    ? 'Viewing chat history'
    : buildStatusText(state.chat, state.isAwaitingAnswer, state.isTyping);
  syncHeaderAvatar(dom.avatar, headerTitle, normalizeAvatarUrl(headerCorrespondent?.avatarUrl ?? null, options));
  dom.statusDot.dataset.state = state.isHistoricalView
    ? 'history'
    : state.chat.connection.isConnected
      ? 'online'
      : (state.isAwaitingAnswer || state.isTyping || state.chat.workerState.state === 'working' || state.chat.workerState.state === 'waiting')
        ? 'active'
        : 'idle';

  const isPanelVisible = state.mode === 'embedded' || state.isOpen;
  dom.panel.hidden = !isPanelVisible;
  dom.launcher.textContent = options.launcherLabel;
  dom.launcher.hidden = state.mode !== 'floating';

  const visibleError = state.error?.message ?? state.chat.lastError?.message ?? '';
  dom.errorBanner.textContent = visibleError;
  dom.errorBanner.dataset.visible = visibleError ? 'true' : 'false';

  const workerState = state.chat.workerState;
  const workerStateVisible = workerState.state !== 'idle'
    && (workerState.expiresAt === undefined || workerState.expiresAt > Date.now());
  if (workerStateVisible) {
    const label = workerState.label ?? (
      workerState.state === 'working' ? 'Digital worker is working…'
        : workerState.state === 'waiting' ? 'Still working…'
          : workerState.state === 'error' ? 'Something went wrong'
            : ''
    );
    dom.workerStatus.textContent = label;
    dom.workerStatus.dataset.visible = 'true';
    dom.workerStatus.dataset.state = workerState.state;
  } else {
    dom.workerStatus.textContent = '';
    dom.workerStatus.dataset.visible = 'false';
    dom.workerStatus.dataset.state = 'idle';
  }

  dom.typing.textContent = 'Digital Worker is typing...';
  dom.typing.dataset.visible = state.isTyping ? 'true' : 'false';

  if (state.chat.escalation?.status === 'pending') {
    dom.escalation.dataset.visible = 'true';
    dom.escalation.textContent = 'The Digital Worker is waiting for human/operator action before continuing.';
  } else {
    dom.escalation.dataset.visible = 'false';
    dom.escalation.textContent = '';
  }

  if (state.isDestroyed) {
    dom.textarea.value = '';
  }
  const questionLocksInput = !!state.chat.activeQuestion && !state.chat.activeQuestion.allow_reply;
  dom.textarea.disabled = state.chat.input.locked || state.isAwaitingAnswer || isUploading || questionLocksInput;
  dom.textarea.placeholder = state.isHistoricalView ? 'History view is read-only' : options.placeholder;

  const canSend = !state.chat.input.locked
    && !state.isAwaitingAnswer
    && !isUploading
    && !questionLocksInput
    && (dom.textarea.value.trim().length > 0 || state.selectedFile !== null);

  dom.sendButton.disabled = !canSend;

  const isReplyMode = state.chat.activeQuestion !== null;
  dom.sendButton.innerHTML = getIconSvg(isReplyMode ? 'reply-fill' : 'send-fill');
  dom.sendButton.setAttribute('aria-label', isReplyMode ? 'Reply' : 'Send message');
  dom.sendButton.setAttribute('title', isReplyMode ? 'Reply' : 'Send message');

  dom.attachButton.disabled = !attachmentsAvailable || state.chat.input.locked || state.isAwaitingAnswer || isUploading;
  dom.fileInput.disabled = dom.attachButton.disabled;
  dom.fileHint.textContent = attachmentsAvailable ? '' : 'Attachments unavailable';
  dom.fileHint.title = attachmentsAvailable ? '' : 'Attachments unavailable';

  if (state.selectedFile) {
    dom.fileChip.dataset.visible = 'true';
    dom.fileChipName.textContent = state.selectedFile.name;
    dom.fileChipMeta.textContent = `${formatFileSize(state.selectedFile.size)}${state.selectedFile.type ? ` · ${state.selectedFile.type}` : ''}`;
    dom.fileChipRemove.disabled = state.isAwaitingAnswer || isUploading;
  } else {
    dom.fileChip.dataset.visible = 'false';
    dom.fileChipName.textContent = '';
    dom.fileChipMeta.textContent = '';
    dom.fileChipRemove.disabled = true;
  }

  renderTranscript(dom.transcript, state, options);
}
