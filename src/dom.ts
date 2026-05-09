import { getIconSvg } from './icons.js';
import { widgetStyles } from './styles.js';
import type { NormalizedWidgetOptions, WidgetDom } from './types.js';

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

export function createWidgetDom(options: NormalizedWidgetOptions): WidgetDom {
  const host = createElement('div');
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = createElement('style');
  style.textContent = widgetStyles;

  const root = createElement('div', 'cortex-widget');
  root.dataset.mode = options.mode;
  root.dataset.position = options.position;

  const launcher = createElement('button', 'cortex-widget__launcher', options.launcherLabel);
  launcher.type = 'button';
  launcher.setAttribute('data-testid', 'launcher');

  const panel = createElement('section', 'cortex-widget__panel');
  panel.setAttribute('data-testid', 'panel');

  const header = createElement('header', 'cortex-widget__header');
  const title = createElement('h2', 'cortex-widget__title', options.title);
  const subtitle = createElement('p', 'cortex-widget__subtitle', options.subtitle);
  const status = createElement('p', 'cortex-widget__status', '');

  const body = createElement('div', 'cortex-widget__body');
  const errorBanner = createElement('div', 'cortex-widget__error');
  errorBanner.setAttribute('role', 'alert');
  errorBanner.setAttribute('data-testid', 'error-banner');
  const transcript = createElement('div', 'cortex-widget__transcript');
  transcript.setAttribute('data-testid', 'transcript');
  const workerStatus = createElement('div', 'cortex-widget__worker-status');
  workerStatus.setAttribute('data-testid', 'worker-status');
  const typing = createElement('div', 'cortex-widget__typing');
  typing.setAttribute('data-testid', 'typing-indicator');
  const escalation = createElement('div', 'cortex-widget__escalation');
  escalation.setAttribute('data-testid', 'escalation-card');

  const composer = createElement('form', 'cortex-widget__composer') as HTMLFormElement;
  composer.setAttribute('data-testid', 'composer');
  const textarea = createElement('textarea', 'cortex-widget__textarea') as HTMLTextAreaElement;
  textarea.placeholder = options.placeholder;
  textarea.setAttribute('data-testid', 'composer-textarea');

  const fileChip = createElement('div', 'cortex-widget__file-chip');
  fileChip.setAttribute('data-testid', 'selected-file-chip');
  const fileChipMain = createElement('div', 'cortex-widget__file-chip-main');
  const fileChipName = createElement('span', 'cortex-widget__file-chip-name');
  const fileChipMeta = createElement('span', 'cortex-widget__file-chip-meta');
  const fileChipRemove = createElement('button', 'cortex-widget__file-remove', 'Remove') as HTMLButtonElement;
  fileChipRemove.type = 'button';
  fileChipRemove.setAttribute('data-testid', 'remove-file');
  fileChipMain.append(fileChipName, fileChipMeta);
  fileChip.append(fileChipMain, fileChipRemove);

  const actions = createElement('div', 'cortex-widget__actions');
  const attachWrap = createElement('div', 'cortex-widget__attach-wrap');
  const fileInput = createElement('input', 'cortex-widget__file-input') as HTMLInputElement;
  fileInput.type = 'file';
  fileInput.setAttribute('data-testid', 'file-input');
  const attachButton = createElement('button', 'cortex-widget__attach') as HTMLButtonElement;
  attachButton.type = 'button';
  attachButton.setAttribute('aria-label', 'Attach file');
  attachButton.setAttribute('title', 'Attach file');
  attachButton.setAttribute('data-testid', 'attach-button');
  attachButton.innerHTML = getIconSvg('paperclip');
  const fileHint = createElement('span', 'cortex-widget__file-hint');
  fileHint.setAttribute('data-testid', 'file-hint');
  const sendButton = createElement('button', 'cortex-widget__send') as HTMLButtonElement;
  sendButton.type = 'submit';
  sendButton.setAttribute('aria-label', 'Send message');
  sendButton.setAttribute('title', 'Send message');
  sendButton.setAttribute('data-testid', 'send-button');
  sendButton.innerHTML = getIconSvg('send-fill');

  attachWrap.append(fileInput, attachButton, fileHint);
  actions.append(attachWrap, sendButton);

  composer.append(textarea, fileChip, actions);
  header.append(title, subtitle, status);
  body.append(errorBanner, transcript, workerStatus, typing, escalation, composer);
  panel.append(header, body);

  if (options.mode === 'floating') {
    root.append(panel, launcher);
  } else {
    root.append(panel);
  }

  shadowRoot.append(style, root);

  return {
    host,
    shadowRoot,
    launcher,
    panel,
    title,
    subtitle,
    status,
    errorBanner,
    transcript,
    workerStatus,
    typing,
    escalation,
    composer,
    textarea,
    sendButton,
    attachButton,
    fileInput,
    fileHint,
    fileChip,
    fileChipName,
    fileChipMeta,
    fileChipRemove,
  };
}
