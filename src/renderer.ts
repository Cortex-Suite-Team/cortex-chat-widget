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

    if (!hasTextContent && attachments.length === 0) {
      continue;
    }

    const wrapper = document.createElement('article');
    wrapper.className = 'cortex-widget__message';
    wrapper.dataset.role = message.role;
    wrapper.dataset.type = message.type;
    wrapper.setAttribute('data-testid', 'transcript-message');

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

    const meta = document.createElement('div');
    meta.className = 'cortex-widget__meta';
    const metaParts: string[] = [message.role];
    if (message.status === 'streaming') {
      metaParts.push('streaming');
    }
    meta.textContent = metaParts.join(' · ');

    wrapper.append(bubble, meta);
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
  dom.textarea.disabled = state.chat.input.locked || state.isAwaitingAnswer || isUploading;

  const canSend = !state.chat.input.locked
    && !state.isAwaitingAnswer
    && !isUploading
    && (dom.textarea.value.trim().length > 0 || state.selectedFile !== null);

  dom.sendButton.disabled = !canSend;
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
