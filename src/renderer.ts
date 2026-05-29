import { getIconSvg } from './icons.js';
import { renderChatMessageContent } from '@cortex-suite/sdk-ui';
import {
  buildStatusText,
  shouldHideTranscriptMessage,
} from './message-flags.js';
import type {
  ChatMessageViewModel,
  CortexChatWidgetState,
  NormalizedWidgetOptions,
  TranscriptAttachmentViewModel,
  WidgetDom,
} from './types.js';

const _warnedMissingActorIds = new Set<string>();

function messageRequiresActor(message: ChatMessageViewModel): boolean {
  if (message.role === 'user' || message.role === 'error') return false;
  return (
    message.type === 'chat::answer'
    || message.type === 'chat::question'
    || message.type === 'chat::partial'
    || message.type === 'chat::forward'
    || message.type === 'chat::hail'
    || message.type === 'escalation::reply'
    || ((message.type === 'chat::echo' || message.type === 'chat::message') && message.role === 'operator')
  );
}

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

type WidgetQuestionOption = {
  id: string;
  label: string;
};

type WidgetQuestionField = {
  key: string;
  label: string;
  type: 'select' | 'radio' | 'text' | 'boolean' | 'date' | 'email';
  required: boolean;
  options: WidgetQuestionOption[];
};

function normalizeQuestionOptions(value: unknown): WidgetQuestionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item) => ({
      id: String(item['id'] ?? ''),
      label: String(item['label'] ?? ''),
    }))
    .filter((option) => option.id !== '' && option.label !== '');
}

function normalizeQuestionFields(value: unknown): WidgetQuestionField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const supported = new Set(['select', 'radio', 'text', 'boolean', 'date', 'email']);
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item): WidgetQuestionField | null => {
      const key = toNonEmptyString(item['key']);
      const rawType = toNonEmptyString(item['type']);
      if (!key || !rawType || !supported.has(rawType)) {
        return null;
      }
      return {
        key,
        label: toNonEmptyString(item['label']) ?? key,
        type: rawType as WidgetQuestionField['type'],
        required: item['required'] === true,
        options: normalizeQuestionOptions(item['options']),
      };
    })
    .filter((item): item is WidgetQuestionField => item !== null);
}

function singleChoiceQuestion(questions: WidgetQuestionField[]): WidgetQuestionField | null {
  if (questions.length !== 1) {
    return null;
  }
  const [question] = questions;
  if ((question.type === 'select' || question.type === 'radio') && question.options.length > 0) {
    return question;
  }
  return null;
}

// Synthesize a choice question from ask_user's {key, label} choices format.
// ask_user emits questions as option descriptors (no type field) + a parent choice_mode.
// Returns null if items have a type (handled by normalizeQuestionFields instead).
function synthesizeAskUserChoiceQuestion(
  rawQuestions: unknown,
  questionRef: string,
): WidgetQuestionField | null {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return null;
  }
  const options: WidgetQuestionOption[] = [];
  for (const item of rawQuestions) {
    if (!isRecord(item) || item['type'] != null) {
      return null;
    }
    const id = toNonEmptyString(item['key']);
    const label = toNonEmptyString(item['label']) ?? id;
    if (id && label) {
      options.push({ id, label });
    }
  }
  if (options.length === 0) {
    return null;
  }
  return { key: questionRef, label: '', type: 'radio', required: false, options };
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
    const rendered = renderChatMessageContent(message);
    const attachments = getMessageAttachments(message);
    const hasTextContent = rendered.format === 'html'
      ? rendered.html.trim().length > 0
      : rendered.text.trim().length > 0;
    const hasQuestionControls = message.type === 'chat::question'
      && Array.isArray(message.meta?.['questions'])
      && normalizeQuestionFields(message.meta['questions']).length > 0;

    if (!hasTextContent && attachments.length === 0 && !hasQuestionControls) {
      continue;
    }

    const wrapper = document.createElement('article');
    wrapper.className = 'cortex-widget__message';
    wrapper.dataset.role = message.role;
    wrapper.dataset.type = message.type;
    wrapper.setAttribute('data-testid', 'transcript-message');

    const actor = message.actor ?? null;
    const actorRequired = messageRequiresActor(message);
    const hasActorHeader = actor !== null && actorRequired;
    const hasMissingActor = actor === null && actorRequired;

    if (hasActorHeader) {
      const actorHeader = document.createElement('div');
      actorHeader.className = 'cortex-widget__actor';
      actorHeader.setAttribute('data-testid', 'actor-header');

      const avatarUrl = normalizeAvatarUrl(actor.avatarUrl ?? null, options);
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
      nameEl.textContent = actor.name;
      nameEl.setAttribute('data-testid', 'actor-name');
      actorInfo.appendChild(nameEl);

      const actorTitle = actor.title ?? null;
      if (actorTitle) {
        const titleEl = document.createElement('span');
        titleEl.className = 'cortex-widget__actor-title';
        titleEl.textContent = actorTitle;
        actorInfo.appendChild(titleEl);
      }

      actorHeader.appendChild(actorInfo);
      wrapper.appendChild(actorHeader);
    }

    if (hasMissingActor) {
      if (!_warnedMissingActorIds.has(message.id)) {
        _warnedMissingActorIds.add(message.id);
        console.warn('[cortex] Missing actor on non-user message', { type: message.type, id: message.id });
      }
      const isDebug = options.debug === true ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('cortex_debug') === '1');
      if (isDebug) {
        const marker = document.createElement('div');
        marker.className = 'cortex-widget__actor-missing';
        marker.setAttribute('data-testid', 'actor-missing');
        marker.textContent = '· unknown actor';
        wrapper.appendChild(marker);
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'cortex-widget__bubble';
    bubble.setAttribute('data-testid', 'message-bubble');
    if (message.status) {
      bubble.dataset.status = message.status;
    }

    if (rendered.format === 'html') {
      const htmlContent = rendered.html.trim();
      if (htmlContent.length > 0) {
        bubble.classList.add('cortex-widget__bubble--markdown');
        const text = document.createElement('div');
        text.className = 'cortex-widget__bubble-text cortex-widget__markdown';
        text.innerHTML = rendered.html;
        bubble.appendChild(text);
      } else if (attachments.length > 0) {
        const fallback = document.createElement('div');
        fallback.className = 'cortex-widget__bubble-text';
        fallback.textContent = 'Attachment sent';
        bubble.appendChild(fallback);
      }
    } else if (rendered.style === 'plain') {
      const textContent = rendered.text.trim();
      if (textContent.length > 0) {
        const text = document.createElement('div');
        text.className = 'cortex-widget__bubble-text';
        text.textContent = rendered.text;
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
      pre.textContent = rendered.text;
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

    // Canonical ask_user questions for chat::question messages.
    if (message.type === 'chat::question' && Array.isArray(message.meta?.['questions'])) {
      const questionRef = toNonEmptyString(message.meta?.['question_ref'])
        ?? toNonEmptyString(message.meta?.['question_id']);
      const questions = normalizeQuestionFields(message.meta?.['questions']);
      const choiceQuestion = singleChoiceQuestion(questions)
        ?? (questionRef
          ? synthesizeAskUserChoiceQuestion(message.meta?.['questions'], questionRef)
          : null);

      if (questionRef && choiceQuestion) {
        const isActive = getQuestionRef(state.chat.activeQuestion) === questionRef;
        const optionsDisabled = !isActive || state.isAwaitingAnswer;

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'cortex-widget__question-options';
        optionsContainer.setAttribute('data-testid', 'question-options');

        for (const option of choiceQuestion.options) {
          const btn = document.createElement('button');
          btn.className = 'cortex-widget__question-option';
          btn.type = 'button';
          btn.textContent = option.label;
          btn.dataset.questionRef = questionRef;
          btn.dataset.questionKey = choiceQuestion.key;
          btn.dataset.optionId = option.id;
          btn.disabled = optionsDisabled;
          btn.setAttribute('data-testid', 'question-option');
          optionsContainer.appendChild(btn);
        }

        bubble.appendChild(optionsContainer);
      } else if (questionRef && questions.length > 0) {
        const isActive = getQuestionRef(state.chat.activeQuestion) === questionRef;
        const controlsDisabled = !isActive || state.isAwaitingAnswer;
        const form = document.createElement('form');
        form.className = 'cortex-widget__question-form';
        form.dataset.questionRef = questionRef;
        form.setAttribute('data-testid', 'question-form');

        for (const question of questions) {
          const field = document.createElement('label');
          field.className = 'cortex-widget__question-field';
          const label = document.createElement('span');
          label.className = 'cortex-widget__question-label';
          label.textContent = question.label;
          field.appendChild(label);

          let control: HTMLInputElement | HTMLSelectElement;
          if (question.type === 'select' && question.options.length > 0) {
            const select = document.createElement('select');
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Select';
            select.appendChild(placeholder);
            for (const option of question.options) {
              const item = document.createElement('option');
              item.value = option.id;
              item.textContent = option.label;
              select.appendChild(item);
            }
            control = select;
          } else {
            const input = document.createElement('input');
            input.type = question.type === 'boolean' ? 'checkbox' : question.type;
            control = input;
          }
          control.name = question.key;
          control.required = question.required;
          control.disabled = controlsDisabled;
          control.className = 'cortex-widget__question-control';
          control.setAttribute('data-question-type', question.type);
          field.appendChild(control);
          form.appendChild(field);
        }

        const submit = document.createElement('button');
        submit.className = 'cortex-widget__question-submit cortex-widget__question-option';
        submit.type = 'submit';
        submit.textContent = 'Submit';
        submit.disabled = controlsDisabled;
        submit.setAttribute('data-testid', 'question-form-submit');
        form.appendChild(submit);
        bubble.appendChild(form);
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
    if (hasActorHeader || hasMissingActor) {
      // Actor header shows identity (or diagnostic), so meta only carries timing
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
  opts?: { skipTranscript?: boolean },
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

  const authState = state.chat.auth?.state ?? 'none';
  const showAuthGate = authState === 'required' || authState === 'submitting' || authState === 'denied';
  dom.authGate.dataset.visible = showAuthGate ? 'true' : 'false';
  dom.authGate.dataset.state = authState;
  dom.composer.hidden = showAuthGate;
  if (showAuthGate) {
    const authMsg = state.chat.auth.message
      ?? (authState === 'denied' ? 'Invalid credentials. Please try again.' : 'Please sign in to continue.');
    dom.authMessage.textContent = authMsg;
    const isSubmitting = authState === 'submitting';
    dom.authLoginInput.disabled = isSubmitting;
    dom.authPasswordInput.disabled = isSubmitting;
    dom.authSubmitButton.disabled = isSubmitting;
    dom.authSubmitButton.textContent = isSubmitting ? 'Signing in…' : 'Sign in';
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
  dom.sendButton.innerHTML = getIconSvg(isReplyMode ? 'reply-fill' : 'arrow-up');
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

  if (!opts?.skipTranscript) {
    renderTranscript(dom.transcript, state, options);
  }
}
