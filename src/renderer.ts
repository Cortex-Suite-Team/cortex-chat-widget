import {
  buildStatusText,
  formatContent,
  shouldHideTranscriptMessage,
} from './message-flags.js';
import type {
  CortexChatWidgetState,
  NormalizedWidgetOptions,
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
    const wrapper = document.createElement('article');
    wrapper.className = 'cortex-widget__message';
    wrapper.dataset.role = message.role;
    wrapper.dataset.type = message.type;

    const bubble = document.createElement('div');
    bubble.className = 'cortex-widget__bubble';
    if (message.status) {
      bubble.dataset.status = message.status;
    }

    const content = formatContent(message.content);
    if (content.contentText !== null) {
      bubble.textContent = content.contentText;
    } else {
      const pre = document.createElement('pre');
      pre.className = 'cortex-widget__formatted';
      pre.textContent = content.formattedContent ?? '';
      bubble.appendChild(pre);
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
