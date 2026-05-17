import { getIconSvg } from './icons.js';
import type { HistoryConversationSummary, HistoryDom } from './types.js';

export type HistoryRenderState =
  | {
      kind: 'loading';
      liveSessionId: string | null;
      liveSelected: boolean;
      liveTitle: string | null;
    }
  | {
      kind: 'empty';
      liveSessionId: string | null;
      liveSelected: boolean;
      liveTitle: string | null;
    }
  | {
      kind: 'error';
      message: string;
      liveSessionId: string | null;
      liveSelected: boolean;
      liveTitle: string | null;
    }
  | {
      kind: 'loaded';
      items: HistoryConversationSummary[];
      liveSessionId: string | null;
      liveSelected: boolean;
      liveTitle: string | null;
      selectedHistoricalSessionId: string | null;
      menuSessionId: string | null;
    };

function appendCurrentRow(
  dom: HistoryDom,
  state: { liveSessionId: string | null; liveSelected: boolean; liveTitle: string | null },
): void {
  if (!state.liveSessionId) {
    return;
  }

  const currentRow = document.createElement('button');
  currentRow.type = 'button';
  currentRow.className = 'cortex-widget-history__row';
  currentRow.dataset.sessionId = state.liveSessionId;
  currentRow.dataset.liveCurrent = 'true';
  currentRow.dataset.active = String(state.liveSelected);
  currentRow.setAttribute('data-testid', 'history-current-row');

  const currentTitle = document.createElement('span');
  currentTitle.className = 'cortex-widget-history__row-title';
  currentTitle.textContent = state.liveTitle || 'Current chat';
  currentRow.appendChild(currentTitle);
  dom.list.appendChild(currentRow);
}

function appendStatusRow(dom: HistoryDom, className: string, text: string): void {
  const row = document.createElement('div');
  row.className = className;
  row.textContent = text;
  dom.list.appendChild(row);
}

export function renderHistoryList(dom: HistoryDom, state: HistoryRenderState): void {
  const savedScroll = dom.list.scrollTop;
  dom.list.replaceChildren();
  dom.status.textContent = state.kind === 'loading' ? 'Loading chats...' : '';

  appendCurrentRow(dom, state);

  if (state.kind === 'loading') {
    appendStatusRow(dom, 'cortex-widget-history__empty', 'Loading chats...');
    dom.list.scrollTop = savedScroll;
    return;
  }

  if (state.kind === 'error') {
    appendStatusRow(dom, 'cortex-widget-history__error', state.message);
    dom.list.scrollTop = savedScroll;
    return;
  }

  if (state.kind === 'empty') {
    if (!state.liveSessionId) {
      appendStatusRow(dom, 'cortex-widget-history__empty', 'No chats yet');
    }
    dom.list.scrollTop = savedScroll;
    return;
  }

  const filteredItems = state.liveSessionId
    ? state.items.filter((item) => item.session_id !== state.liveSessionId)
    : state.items;

  for (const item of filteredItems) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cortex-widget-history__row';
    row.dataset.sessionId = item.session_id;
    row.dataset.active = String(state.selectedHistoricalSessionId === item.session_id);
    row.dataset.menuOpen = String(state.menuSessionId === item.session_id);
    row.dataset.pinned = String(item.pinned);
    row.setAttribute('data-testid', 'history-row');

    const title = document.createElement('span');
    title.className = 'cortex-widget-history__row-title';
    title.textContent = item.title;
    title.setAttribute('data-testid', 'history-row-title');

    const pinIndicator = document.createElement('span');
    pinIndicator.className = 'cortex-widget-history__row-pin';
    pinIndicator.setAttribute('aria-hidden', 'true');
    if (item.pinned) {
      pinIndicator.innerHTML = getIconSvg('pin-angle-fill');
      pinIndicator.setAttribute('data-testid', 'history-pinned-icon');
    }

    const menuToggle = document.createElement('button');
    menuToggle.type = 'button';
    menuToggle.className = 'cortex-widget-history__menu-toggle';
    menuToggle.dataset.sessionId = item.session_id;
    menuToggle.setAttribute('aria-label', 'Conversation actions');
    menuToggle.setAttribute('data-testid', 'history-menu-toggle');
    menuToggle.innerHTML = getIconSvg('three-dots');

    const menu = document.createElement('div');
    menu.className = 'cortex-widget-history__menu';
    menu.setAttribute('data-testid', 'history-menu');

    const actions = [
      {
        action: 'pin',
        label: item.pinned ? 'Unpin' : 'Pin',
        icon: item.pinned ? 'pin-angle' : 'pin-angle-fill',
      },
      { action: 'rename', label: 'Rename', icon: 'pencil-square' },
      { action: 'delete', label: 'Delete', icon: 'trash' },
    ] as const;

    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cortex-widget-history__menu-action';
      button.dataset.sessionId = item.session_id;
      button.dataset.action = action.action;

      const icon = document.createElement('span');
      icon.className = 'cortex-widget-history__menu-action-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.setAttribute('data-testid', 'history-menu-action-icon');
      icon.innerHTML = getIconSvg(action.icon);

      const label = document.createElement('span');
      label.className = 'cortex-widget-history__menu-action-label';
      label.textContent = action.label;

      button.append(icon, label);
      menu.appendChild(button);
    }

    row.append(title, pinIndicator, menuToggle, menu);
    dom.list.appendChild(row);
  }

  dom.list.scrollTop = savedScroll;
}
