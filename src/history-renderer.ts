import { getIconSvg } from './icons.js';
import type { HistoryConversationSummary, HistoryDom } from './types.js';

export type HistoryRenderState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; items: HistoryConversationSummary[]; selectedSessionId: string | null; menuSessionId: string | null; draftSelected: boolean };

export function renderHistoryList(dom: HistoryDom, state: HistoryRenderState): void {
  dom.list.replaceChildren();
  dom.status.textContent = state.kind === 'loading' ? 'Loading chats…' : '';

  if (state.kind === 'loading') {
    const empty = document.createElement('div');
    empty.className = 'cortex-widget-history__empty';
    empty.textContent = 'Loading chats…';
    dom.list.appendChild(empty);
    return;
  }

  if (state.kind === 'error') {
    const error = document.createElement('div');
    error.className = 'cortex-widget-history__error';
    error.textContent = state.message;
    dom.list.appendChild(error);
    return;
  }

  if (state.kind === 'empty') {
    const empty = document.createElement('div');
    empty.className = 'cortex-widget-history__empty';
    empty.textContent = 'No chats yet';
    dom.list.appendChild(empty);
    return;
  }

  const draftRow = document.createElement('button');
  draftRow.type = 'button';
  draftRow.className = 'cortex-widget-history__row';
  draftRow.dataset.draft = 'true';
  draftRow.dataset.active = String(state.draftSelected);
  draftRow.setAttribute('data-testid', 'history-draft-row');

  const draftTitle = document.createElement('span');
  draftTitle.className = 'cortex-widget-history__row-title';
  draftTitle.textContent = 'New chat';
  draftRow.appendChild(draftTitle);
  dom.list.appendChild(draftRow);

  for (const item of state.items) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'cortex-widget-history__row';
    row.dataset.sessionId = item.session_id;
    row.dataset.active = String(state.selectedSessionId === item.session_id);
    row.dataset.menuOpen = String(state.menuSessionId === item.session_id);
    row.setAttribute('data-testid', 'history-row');

    const title = document.createElement('span');
    title.className = 'cortex-widget-history__row-title';
    title.textContent = item.title;
    title.setAttribute('data-testid', 'history-row-title');

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

    for (const action of ['Pin', 'Rename', 'Delete']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cortex-widget-history__menu-action';
      button.dataset.sessionId = item.session_id;
      button.dataset.action = action.toLowerCase();
      button.textContent = action;
      menu.appendChild(button);
    }

    row.append(title, menuToggle, menu);
    dom.list.appendChild(row);
  }
}
