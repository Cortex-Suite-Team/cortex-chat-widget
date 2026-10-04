export const TRANSCRIPT_OVERSCAN_ROWS = 8;
export const MAX_MOUNTED_TRANSCRIPT_ROWS = 80;

const DEFAULT_ROW_HEIGHT = 72;
const ROW_GAP = 8;
const BOTTOM_FOLLOW_THRESHOLD = 96;

export interface VirtualTranscriptItem<T> {
  key: string;
  version: string;
  value: T;
}

interface MountedRow {
  element: HTMLElement;
  version: string;
}

interface Anchor {
  key: string;
  offset: number;
}

export class TranscriptVirtualizer<T> {
  private readonly viewport: HTMLElement;
  private readonly topSpacer = document.createElement('div');
  private readonly rows = document.createElement('div');
  private readonly bottomSpacer = document.createElement('div');
  private readonly mounted = new Map<string, MountedRow>();
  private readonly heights = new Map<string, number>();
  private readonly resizeObserver: ResizeObserver | null;
  private items: VirtualTranscriptItem<T>[] = [];
  private offsets: number[] = [0];
  private renderRow: (value: T) => HTMLElement | null = () => null;
  private scopeKey = '';
  private followBottom = true;
  private destroyed = false;

  constructor(viewport: HTMLElement) {
    this.viewport = viewport;
    this.topSpacer.className = 'cortex-widget__virtual-spacer';
    this.topSpacer.dataset.virtualSpacer = 'top';
    this.rows.className = 'cortex-widget__virtual-rows';
    this.rows.dataset.testid = 'transcript-window';
    this.bottomSpacer.className = 'cortex-widget__virtual-spacer';
    this.bottomSpacer.dataset.virtualSpacer = 'bottom';
    this.viewport.replaceChildren(this.topSpacer, this.rows, this.bottomSpacer);
    this.viewport.addEventListener('scroll', this.onScroll, { passive: true });

    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => this.onResize(entries));
    this.resizeObserver?.observe(this.viewport);
  }

  update(
    items: VirtualTranscriptItem<T>[],
    renderRow: (value: T) => HTMLElement | null,
    scopeKey: string,
  ): void {
    if (this.destroyed) return;

    const scopeChanged = scopeKey !== this.scopeKey;
    const wasEmpty = this.items.length === 0;
    const previousTotal = this.totalHeight;
    const viewportHeight = this.viewportHeight;
    const nearBottom = wasEmpty
      || previousTotal - (this.viewport.scrollTop + viewportHeight) <= BOTTOM_FOLLOW_THRESHOLD;
    const anchor = scopeChanged || nearBottom ? null : this.captureAnchor();

    if (scopeChanged) {
      this.scopeKey = scopeKey;
      this.heights.clear();
      for (const mounted of this.mounted.values()) {
        this.resizeObserver?.unobserve(mounted.element);
        mounted.element.remove();
      }
      this.mounted.clear();
      this.followBottom = true;
    } else {
      this.followBottom = nearBottom;
    }

    this.items = items;
    this.renderRow = renderRow;
    this.rebuildOffsets();

    let targetScrollTop = this.viewport.scrollTop;
    if (this.followBottom) {
      targetScrollTop = Math.max(0, this.totalHeight - viewportHeight);
    } else if (anchor) {
      const anchorIndex = this.items.findIndex((item) => item.key === anchor.key);
      if (anchorIndex >= 0) {
        targetScrollTop = this.offsets[anchorIndex] + anchor.offset;
      }
    }

    this.renderWindow(targetScrollTop);
    this.viewport.scrollTop = targetScrollTop;
    this.measureMountedRows();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.viewport.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
    this.mounted.clear();
  }

  private get viewportHeight(): number {
    return this.viewport.clientHeight || 600;
  }

  private get totalHeight(): number {
    return this.offsets[this.offsets.length - 1] ?? 0;
  }

  private readonly onScroll = (): void => {
    if (this.destroyed) return;
    this.followBottom = this.totalHeight
      - (this.viewport.scrollTop + this.viewportHeight) <= BOTTOM_FOLLOW_THRESHOLD;
    this.renderWindow(this.viewport.scrollTop);
  };

  private onResize(entries: ResizeObserverEntry[]): void {
    let geometryChanged = false;
    let correction = 0;
    const anchor = this.captureAnchor();
    const anchorIndex = anchor
      ? this.items.findIndex((item) => item.key === anchor.key)
      : -1;

    for (const entry of entries) {
      if (entry.target === this.viewport) {
        geometryChanged = true;
        continue;
      }
      const row = entry.target as HTMLElement;
      const key = row.dataset.virtualKey;
      if (!key) continue;
      const measuredHeight = entry.borderBoxSize?.[0]?.blockSize
        ?? entry.contentRect.height
        ?? row.getBoundingClientRect().height;
      if (!(measuredHeight > 0)) continue;
      const nextHeight = measuredHeight + ROW_GAP;
      const previousHeight = this.heights.get(key) ?? DEFAULT_ROW_HEIGHT;
      if (Math.abs(previousHeight - nextHeight) < 0.5) continue;
      this.heights.set(key, nextHeight);
      const changedIndex = this.items.findIndex((item) => item.key === key);
      if (!this.followBottom && changedIndex >= 0 && changedIndex < anchorIndex) {
        correction += nextHeight - previousHeight;
      }
      geometryChanged = true;
    }

    if (!geometryChanged) return;
    this.rebuildOffsets();
    if (this.followBottom) {
      this.viewport.scrollTop = Math.max(0, this.totalHeight - this.viewportHeight);
    } else if (correction !== 0) {
      this.viewport.scrollTop += correction;
    }
    this.renderWindow(this.viewport.scrollTop);
  }

  private rebuildOffsets(): void {
    const offsets = new Array<number>(this.items.length + 1);
    offsets[0] = 0;
    for (let index = 0; index < this.items.length; index += 1) {
      offsets[index + 1] = offsets[index]
        + (this.heights.get(this.items[index].key) ?? DEFAULT_ROW_HEIGHT);
    }
    this.offsets = offsets;
  }

  private captureAnchor(): Anchor | null {
    if (this.items.length === 0) return null;
    const index = this.findIndexAtOffset(this.viewport.scrollTop);
    return {
      key: this.items[index]?.key ?? this.items[0].key,
      offset: this.viewport.scrollTop - this.offsets[index],
    };
  }

  private findIndexAtOffset(offset: number): number {
    if (this.items.length === 0) return 0;
    let low = 0;
    let high = this.items.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.offsets[middle + 1] <= offset) low = middle + 1;
      else high = middle;
    }
    return Math.min(low, this.items.length - 1);
  }

  private renderWindow(scrollTop: number): void {
    if (this.items.length === 0) {
      for (const mounted of this.mounted.values()) {
        this.resizeObserver?.unobserve(mounted.element);
      }
      this.mounted.clear();
      this.rows.replaceChildren();
      this.topSpacer.style.height = '0px';
      this.bottomSpacer.style.height = '0px';
      return;
    }

    const firstVisible = this.findIndexAtOffset(Math.max(0, scrollTop));
    const lastVisible = this.findIndexAtOffset(Math.max(0, scrollTop) + this.viewportHeight);
    let start = Math.max(0, firstVisible - TRANSCRIPT_OVERSCAN_ROWS);
    let end = Math.min(this.items.length, lastVisible + TRANSCRIPT_OVERSCAN_ROWS + 1);
    if (end - start > MAX_MOUNTED_TRANSCRIPT_ROWS) {
      end = Math.min(this.items.length, start + MAX_MOUNTED_TRANSCRIPT_ROWS);
    }

    const desiredKeys = new Set(this.items.slice(start, end).map((item) => item.key));
    for (const [key, mounted] of this.mounted) {
      if (!desiredKeys.has(key)) {
        this.resizeObserver?.unobserve(mounted.element);
        mounted.element.remove();
        this.mounted.delete(key);
      }
    }

    let cursor: ChildNode | null = this.rows.firstChild;
    for (let index = start; index < end; index += 1) {
      const item = this.items[index];
      let mounted = this.mounted.get(item.key);
      if (!mounted || mounted.version !== item.version) {
        const element = this.renderRow(item.value);
        if (!element) continue;
        element.dataset.virtualKey = item.key;
        element.dataset.virtualIndex = String(index);
        if (mounted) {
          if (mounted.element === cursor) cursor = cursor.nextSibling;
          this.resizeObserver?.unobserve(mounted.element);
          mounted.element.replaceWith(element);
        }
        mounted = { element, version: item.version };
        this.mounted.set(item.key, mounted);
        this.resizeObserver?.observe(element);
      } else {
        mounted.element.dataset.virtualIndex = String(index);
      }

      if (mounted.element !== cursor) {
        this.rows.insertBefore(mounted.element, cursor);
      } else {
        cursor = cursor.nextSibling;
      }
    }

    this.topSpacer.style.height = `${this.offsets[start]}px`;
    this.bottomSpacer.style.height = `${Math.max(0, this.totalHeight - this.offsets[end])}px`;
  }

  private measureMountedRows(): void {
    if (this.resizeObserver) return;
    let changed = false;
    for (const [key, mounted] of this.mounted) {
      const measuredHeight = mounted.element.getBoundingClientRect().height;
      const height = measuredHeight + ROW_GAP;
      if (measuredHeight > 0 && Math.abs((this.heights.get(key) ?? DEFAULT_ROW_HEIGHT) - height) >= 0.5) {
        this.heights.set(key, height);
        changed = true;
      }
    }
    if (changed) {
      this.rebuildOffsets();
      this.renderWindow(this.viewport.scrollTop);
    }
  }
}
