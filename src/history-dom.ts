import { getIconSvg } from './icons.js';
import { widgetStyles } from './styles.js';
import type { HistoryDom } from './types.js';

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

export function createHistoryDom(): HistoryDom {
  const host = createElement('div');
  host.style.width = '100%';
  host.style.height = '100%';
  host.style.display = 'block';
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = createElement('style');
  style.textContent = widgetStyles;

  const root = createElement('section', 'cortex-widget-history');
  root.classList.add('cortex-widget-history--light');
  const panel = createElement('div', 'cortex-widget-history__panel');
  const header = createElement('div', 'cortex-widget-history__header');
  const status = createElement('div', 'cortex-widget-history__status', '');
  const searchPlaceholder = createElement('div', 'cortex-widget-history__search', 'Search coming soon');
  const newChatButton = createElement('button', 'cortex-widget-history__new-chat') as HTMLButtonElement;
  newChatButton.type = 'button';
  newChatButton.innerHTML = `${getIconSvg('plus-lg')}<span>New Chat</span>`;
  newChatButton.setAttribute('data-testid', 'history-new-chat');
  const list = createElement('div', 'cortex-widget-history__list');
  list.setAttribute('data-testid', 'history-list');

  header.append(status, searchPlaceholder, newChatButton);
  panel.append(header, list);
  root.append(panel);
  shadowRoot.append(style, root);

  return {
    host,
    shadowRoot,
    root,
    status,
    searchPlaceholder,
    newChatButton,
    list,
  };
}
