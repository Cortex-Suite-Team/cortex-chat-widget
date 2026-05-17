import type { DebugLogger } from './debug.js';
import { renderHistoryList } from './history-renderer.js';
import type {
  ChatMessageViewModel,
  HistoryClient,
  HistoryConversationSummary,
  HistoryDom,
  HistorySelection,
  NormalizedWidgetOptions,
} from './types.js';

export interface HistoryControllerCallbacks {
  getLiveSessionId(): string | null;
  onOpenCurrent(): void;
  onOpenHistorical(sessionId: string, messages: ChatMessageViewModel[]): void;
  onStartNewChat(): Promise<void>;
  onError(error: unknown, code: string, message: string): void;
}

interface HistoryControllerState {
  status: 'disabled' | 'loading' | 'ready' | 'empty' | 'error';
  items: HistoryConversationSummary[];
  liveSessionId: string | null;
  liveTitle: string | null;
  selection: HistorySelection;
  menuSessionId: string | null;
  errorMessage: string | null;
}

const HISTORY_PIN_STORAGE_KEY = 'cortex-chat-widget:history-pins:v1';
const MAX_RUNTIME_TITLE_LENGTH = 120;

export class HistoryPinStore {
  private readonly storage: Storage | null;
  private readonly key: string;
  private memoryPins: Record<string, true> = {};

  constructor(storage: Storage | null, key: string) {
    this.storage = storage;
    this.key = key;
    this.memoryPins = this.readPins();
  }

  isPinned(sessionId: string): boolean {
    return this.memoryPins[sessionId] === true;
  }

  setPinned(sessionId: string, pinned: boolean): void {
    if (!sessionId) {
      return;
    }
    if (pinned) {
      this.memoryPins[sessionId] = true;
    } else {
      delete this.memoryPins[sessionId];
    }
    this.writePins();
  }

  toggle(sessionId: string): boolean {
    const nextPinned = !this.isPinned(sessionId);
    this.setPinned(sessionId, nextPinned);
    return nextPinned;
  }

  snapshot(): Record<string, true> {
    return { ...this.memoryPins };
  }

  private readPins(): Record<string, true> {
    if (!this.storage) {
      return {};
    }
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const pins: Record<string, true> = {};
      for (const [sessionId, value] of Object.entries(parsed)) {
        if (value === true) {
          pins[sessionId] = true;
        }
      }
      return pins;
    } catch {
      return {};
    }
  }

  private writePins(): void {
    if (!this.storage) {
      return;
    }
    try {
      this.storage.setItem(this.key, JSON.stringify(this.memoryPins));
    } catch {
      // Keep the in-memory snapshot if browser storage is unavailable.
    }
  }
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class HistoryController {
  private readonly dom: HistoryDom;
  private readonly options: NormalizedWidgetOptions;
  private readonly callbacks: HistoryControllerCallbacks;
  private readonly debug?: DebugLogger;
  private client: HistoryClient | null = null;
  private destroyed = false;
  private mounted = false;
  private lastRenderKey = '';
  private refreshGeneration = 0;
  private messagesGeneration = 0;
  private readonly pinStore: HistoryPinStore;
  private readonly manuallyRenamedSessionIds = new Set<string>();
  private readonly manualTitleBySessionId = new Map<string, string>();
  private readonly lastAutoTitleBySessionId = new Map<string, string>();
  private readonly state: HistoryControllerState = {
    status: 'disabled',
    items: [],
    liveSessionId: null,
    liveTitle: null,
    selection: { kind: 'none' },
    menuSessionId: null,
    errorMessage: null,
  };

  private readonly onNewChatClick = () => {
    void this.handleNewChatClick();
  };

  private readonly onListClick = (event: MouseEvent) => {
    void this.handleListClick(event);
  };

  constructor(args: {
    dom: HistoryDom;
    options: NormalizedWidgetOptions;
    callbacks: HistoryControllerCallbacks;
    debug?: DebugLogger;
    pinStore?: HistoryPinStore;
  }) {
    this.dom = args.dom;
    this.options = args.options;
    this.callbacks = args.callbacks;
    this.debug = args.debug;
    this.pinStore = args.pinStore ?? new HistoryPinStore(getLocalStorage(), HISTORY_PIN_STORAGE_KEY);
  }

  mount(): void {
    if (this.mounted || this.destroyed) {
      return;
    }
    this.mounted = true;
    this.dom.newChatButton.addEventListener('click', this.onNewChatClick);
    this.dom.list.addEventListener('click', this.onListClick);
    this.render();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.refreshGeneration += 1;
    this.messagesGeneration += 1;
    if (this.mounted) {
      this.dom.newChatButton.removeEventListener('click', this.onNewChatClick);
      this.dom.list.removeEventListener('click', this.onListClick);
      this.mounted = false;
    }
    this.client = null;
    this.dom.host.remove();
  }

  setClient(client: HistoryClient | null): void {
    if (this.destroyed) {
      return;
    }
    this.client = client;
    if (!client) {
      this.refreshGeneration += 1;
      this.messagesGeneration += 1;
      this.state.status = 'disabled';
      this.state.items = [];
      this.state.errorMessage = null;
      this.state.menuSessionId = null;
      this.state.selection = this.state.liveSessionId ? { kind: 'current' } : { kind: 'none' };
      this.lastRenderKey = '';
      this.render();
      return;
    }
    if (this.state.status === 'disabled') {
      this.state.status = 'loading';
    }
    this.render();
  }

  setLiveSessionId(sessionId: string | null): void {
    if (this.destroyed) {
      return;
    }
    if (this.state.liveSessionId !== sessionId) {
      this.state.liveTitle = null;
    }
    this.state.liveSessionId = sessionId;
    if (sessionId && this.state.selection.kind === 'none') {
      this.state.selection = { kind: 'current' };
    }
    this.syncLiveTitleFromItems();
    this.render();
  }

  applyRuntimeTitle(title: string): void {
    if (this.destroyed) {
      return;
    }
    const liveSessionId = this.state.liveSessionId;
    if (!liveSessionId) {
      return;
    }
    const nextTitle = this.normalizeRuntimeTitle(title);
    if (!nextTitle) {
      return;
    }
    if (this.isManualTitle(liveSessionId)) {
      return;
    }

    const liveItem = this.state.items.find((item) => item.session_id === liveSessionId);
    if (liveItem?.renamed) {
      this.manuallyRenamedSessionIds.add(liveSessionId);
      return;
    }

    const currentLiveTitle = this.state.liveTitle;
    const knownItemTitle = liveItem?.title ?? null;
    if (currentLiveTitle === nextTitle) {
      return;
    }

    this.state.liveTitle = nextTitle;
    if (liveItem) {
      liveItem.title = nextTitle;
    }
    this.render();

    if (!this.client) {
      return;
    }
    if (knownItemTitle === nextTitle) {
      return;
    }
    if (this.lastAutoTitleBySessionId.get(liveSessionId) === nextTitle) {
      return;
    }
    this.lastAutoTitleBySessionId.set(liveSessionId, nextTitle);
    void this.client.renameConversation(liveSessionId, nextTitle).catch((error) => {
      this.debug?.log('[cortex-chat-widget] runtime title persistence failed', {
        sessionId: liveSessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async refresh(): Promise<void> {
    if (this.destroyed || !this.client) {
      return;
    }
    const client = this.client;
    const generation = ++this.refreshGeneration;
    this.state.status = 'loading';
    this.state.errorMessage = null;
    this.render();

    try {
      const items = await client.listConversations();
      if (this.destroyed || generation !== this.refreshGeneration || client !== this.client) {
        return;
      }
      this.state.items = items;
      this.state.status = items.length === 0 ? 'empty' : 'ready';
      const selection = this.state.selection;
      if (
        selection.kind === 'historical'
        && !items.some((item) => item.session_id === selection.sessionId)
      ) {
        this.state.selection = this.state.liveSessionId ? { kind: 'current' } : { kind: 'none' };
      }
      this.syncLiveTitleFromItems();
      this.render();
    } catch (error) {
      if (this.destroyed || generation !== this.refreshGeneration || client !== this.client) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load chats.';
      this.state.status = 'error';
      this.state.errorMessage = message;
      this.callbacks.onError(error, 'history_refresh_failed', message);
      this.render();
    }
  }

  render(): void {
    if (this.destroyed) {
      return;
    }
    const nextKey = this.computeRenderKey();
    if (nextKey === this.lastRenderKey) {
      return;
    }
    this.lastRenderKey = nextKey;
    const liveSelected = this.state.selection.kind === 'current';

    if (this.state.status === 'loading') {
      renderHistoryList(this.dom, {
        kind: 'loading',
        liveSessionId: this.state.liveSessionId,
        liveSelected,
        liveTitle: this.state.liveTitle,
      });
      return;
    }
    if (this.state.status === 'error') {
      renderHistoryList(this.dom, {
        kind: 'error',
        message: this.state.errorMessage || 'Unable to load chats.',
        liveSessionId: this.state.liveSessionId,
        liveSelected,
        liveTitle: this.state.liveTitle,
      });
      return;
    }
    if (this.state.status === 'empty' || this.state.status === 'disabled') {
      renderHistoryList(this.dom, {
        kind: 'empty',
        liveSessionId: this.state.liveSessionId,
        liveSelected,
        liveTitle: this.state.liveTitle,
      });
      return;
    }

    renderHistoryList(this.dom, {
      kind: 'loaded',
      items: this.getRenderItems(),
      liveSessionId: this.state.liveSessionId,
      liveSelected,
      liveTitle: this.state.liveTitle,
      selectedHistoricalSessionId: this.state.selection.kind === 'historical'
        ? this.state.selection.sessionId
        : null,
      menuSessionId: this.state.menuSessionId,
    });
  }

  private async handleNewChatClick(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    this.state.selection = { kind: 'current' };
    this.state.menuSessionId = null;
    this.render();
    try {
      await this.callbacks.onStartNewChat();
      this.setLiveSessionId(this.callbacks.getLiveSessionId());
    } catch (error) {
      this.callbacks.onError(error, 'history_new_chat_failed', 'New chat failed');
    }
  }

  private async handleListClick(event: MouseEvent): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const target = event.target as Element;
    const actionButton = target.closest('.cortex-widget-history__menu-action') as HTMLButtonElement | null;
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      await this.handleMenuAction(actionButton);
      return;
    }

    const toggleButton = target.closest('.cortex-widget-history__menu-toggle') as HTMLButtonElement | null;
    if (toggleButton) {
      event.preventDefault();
      event.stopPropagation();
      const sessionId = toggleButton.dataset.sessionId ?? null;
      this.state.menuSessionId = this.state.menuSessionId === sessionId ? null : sessionId;
      this.render();
      return;
    }

    const currentRow = target.closest('[data-live-current="true"]') as HTMLButtonElement | null;
    if (currentRow) {
      event.preventDefault();
      this.state.selection = { kind: 'current' };
      this.state.menuSessionId = null;
      this.callbacks.onOpenCurrent();
      this.render();
      return;
    }

    const row = target.closest('[data-testid="history-row"]') as HTMLButtonElement | null;
    const sessionId = row?.dataset.sessionId;
    if (sessionId) {
      event.preventDefault();
      await this.openHistorical(sessionId);
    }
  }

  private async openHistorical(sessionId: string): Promise<void> {
    if (this.destroyed || !this.client) {
      return;
    }
    const client = this.client;
    const generation = ++this.messagesGeneration;
    this.state.selection = { kind: 'historical', sessionId };
    this.state.menuSessionId = null;
    this.render();

    try {
      const messages = await client.getMessages(sessionId);
      if (this.destroyed || generation !== this.messagesGeneration || client !== this.client) {
        return;
      }
      this.callbacks.onOpenHistorical(sessionId, messages);
      this.render();
    } catch (error) {
      if (this.destroyed || generation !== this.messagesGeneration || client !== this.client) {
        return;
      }
      this.callbacks.onError(error, 'history_load_failed', 'History messages could not be loaded');
      this.render();
    }
  }

  private async handleMenuAction(actionButton: HTMLButtonElement): Promise<void> {
    if (!this.client) {
      return;
    }
    const sessionId = actionButton.dataset.sessionId ?? '';
    const action = actionButton.dataset.action ?? '';
    this.state.menuSessionId = null;

    try {
      if (action === 'rename') {
        const current = this.state.items.find((item) => item.session_id === sessionId);
        const nextTitle = window.prompt('Rename chat', current?.title ?? '');
        if (typeof nextTitle === 'string' && nextTitle.trim()) {
          const trimmedTitle = nextTitle.trim();
          await this.client.renameConversation(sessionId, trimmedTitle);
          this.markManualRename(sessionId, trimmedTitle);
          await this.refresh();
        }
      } else if (action === 'delete') {
        await this.client.deleteConversation(sessionId);
        if (this.state.selection.kind === 'historical' && this.state.selection.sessionId === sessionId) {
          this.state.selection = this.state.liveSessionId ? { kind: 'current' } : { kind: 'none' };
          this.callbacks.onOpenCurrent();
        }
        await this.refresh();
      } else if (action === 'pin') {
        this.pinStore.toggle(sessionId);
        this.render();
      }
    } catch (error) {
      this.callbacks.onError(error, `history_${action || 'action'}_failed`, 'Chat update failed');
      this.render();
    }
  }

  private computeRenderKey(): string {
    const itemsSig = this.getRenderItems()
      .map((item) => `${item.session_id}:${item.title}:${item.pinned ? '1' : '0'}`)
      .join(',');
    const selectionSig = this.state.selection.kind === 'historical'
      ? `historical:${this.state.selection.sessionId}`
      : this.state.selection.kind;
    return [
      this.state.status,
      this.state.liveSessionId ?? '',
      this.state.liveTitle ?? '',
      selectionSig,
      this.state.menuSessionId ?? '',
      this.state.errorMessage ?? '',
      itemsSig,
      Object.keys(this.pinStore.snapshot()).sort().join(','),
      this.options.mode,
    ].join('|');
  }

  private getRenderItems(): HistoryConversationSummary[] {
    const derived = this.state.items.map((item) => ({
      ...item,
      title: this.manualTitleBySessionId.get(item.session_id) ?? item.title,
      renamed: this.manuallyRenamedSessionIds.has(item.session_id) || item.renamed,
      pinned: this.pinStore.isPinned(item.session_id),
    }));
    const pinned: HistoryConversationSummary[] = [];
    const unpinned: HistoryConversationSummary[] = [];
    for (const item of derived) {
      if (item.pinned) {
        pinned.push(item);
      } else {
        unpinned.push(item);
      }
    }
    return [...pinned, ...unpinned];
  }

  private normalizeRuntimeTitle(title: string): string | null {
    const trimmed = title.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.slice(0, MAX_RUNTIME_TITLE_LENGTH);
  }

  private isManualTitle(sessionId: string): boolean {
    return this.manuallyRenamedSessionIds.has(sessionId)
      || this.state.items.some((item) => item.session_id === sessionId && item.renamed);
  }

  private markManualRename(sessionId: string, title: string): void {
    this.manuallyRenamedSessionIds.add(sessionId);
    this.manualTitleBySessionId.set(sessionId, title);
    this.lastAutoTitleBySessionId.delete(sessionId);
    const item = this.state.items.find((entry) => entry.session_id === sessionId);
    if (item) {
      item.title = title;
      item.renamed = true;
    }
    if (sessionId === this.state.liveSessionId) {
      this.state.liveTitle = title;
    }
    this.render();
  }

  private syncLiveTitleFromItems(): void {
    const liveSessionId = this.state.liveSessionId;
    if (!liveSessionId) {
      return;
    }
    const manualTitle = this.manualTitleBySessionId.get(liveSessionId);
    if (manualTitle) {
      this.state.liveTitle = manualTitle;
      return;
    }
    const liveItem = this.state.items.find((item) => item.session_id === liveSessionId);
    if (!liveItem?.renamed) {
      return;
    }
    this.manuallyRenamedSessionIds.add(liveSessionId);
    this.state.liveTitle = liveItem.title;
  }
}
