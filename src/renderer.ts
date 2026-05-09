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
) {
  transcriptEl.replaceChildren();

  const visibleMessages = state.chat.transcript.filter((message: (typeof state.chat.transcript)[number]) => !shouldHideTranscriptMessage(message));
  if (visibleMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cortex-widget__empty';
    empty.textContent = 'Start the conversation when you are ready.';
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

      const avatarUrl = toNonEmptyString(actor!['avatar_url']);
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
    if (hasActorHeader) {
      // Actor header already shows name; only show streaming indicator here
      meta.textContent = message.status === 'streaming' ? 'streaming' : '';
    } else {
      const displayName = message.role === 'user' ? 'You'
        : message.role === 'assistant' ? 'Assistant'
        : message.role;
      const metaParts: string[] = [displayName];
      if (message.status === 'streaming') {
        metaParts.push('streaming');
      }
      meta.textContent = metaParts.join(' · ');
    }

    // Delivery status for user messages (sending / failed only — sent is silent)
    let statusEl: HTMLElement | null = null;
    if (message.role === 'user' && message.deliveryStatus !== undefined && message.deliveryStatus !== 'sent') {
      statusEl = document.createElement('div');
      statusEl.className = 'cortex-widget__message-status';
      statusEl.dataset.status = message.deliveryStatus;
      statusEl.setAttribute('data-testid', 'message-delivery-status');

      if (message.deliveryStatus === 'sending') {
        statusEl.textContent = 'Sending…';
      } else if (message.deliveryStatus === 'failed') {
        const text = document.createElement('span');
        text.className = 'cortex-widget__message-status-text';
        text.textContent = 'Not sent';
        statusEl.appendChild(text);

        if (message.retryable) {
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
    }

    if (statusEl) {
      wrapper.append(bubble, statusEl, meta);
    } else {
      wrapper.append(bubble, meta);
    }
    transcriptEl.appendChild(wrapper);
  }

  if (transcriptEl.childElementCount === 0) {
    const empty = document.createElement('div');
    empty.className = 'cortex-widget__empty';
    empty.textContent = 'Start the conversation when you are ready.';
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
  dom.host.style.setProperty('--cortex-accent-color', options.theme?.accentColor ?? '#2563eb');
  dom.host.style.setProperty('--cortex-background-color', options.theme?.backgroundColor ?? '#ffffff');
  dom.host.style.setProperty('--cortex-text-color', options.theme?.textColor ?? '#172033');
  dom.host.style.setProperty('--cortex-border-radius', options.theme?.borderRadius ?? '18px');

  dom.title.textContent = options.title;
  dom.subtitle.textContent = options.subtitle;
  dom.status.textContent = buildStatusText(state.chat, state.isAwaitingAnswer, state.isTyping);

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

  dom.textarea.value = state.isDestroyed ? '' : dom.textarea.value;
  const questionLocksInput = !!state.chat.activeQuestion && !state.chat.activeQuestion.allow_reply;
  dom.textarea.disabled = state.chat.input.locked || state.isAwaitingAnswer || isUploading || questionLocksInput;

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

  renderTranscript(dom.transcript, state);
}
