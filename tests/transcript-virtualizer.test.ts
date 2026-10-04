import {
  MAX_MOUNTED_TRANSCRIPT_ROWS,
  TranscriptVirtualizer,
} from '../src/transcript-virtualizer.js';

interface RowValue {
  id: string;
  content: string;
}

function items(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    key: `message-${index}`,
    version: '1',
    value: { id: `message-${index}`, content: `content-${index}` },
  }));
}

function createViewport(height = 600): HTMLElement {
  const viewport = document.createElement('section');
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: height });
  Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 0 });
  document.body.appendChild(viewport);
  return viewport;
}

function renderRow(value: RowValue): HTMLElement {
  const row = document.createElement('article');
  row.dataset.testid = 'transcript-message';
  row.textContent = value.content;
  return row;
}

describe.each([1_000, 10_000, 50_000])('TranscriptVirtualizer with %i messages', (count) => {
  it('keeps mounted DOM bounded by viewport and overscan', () => {
    const viewport = createViewport();
    const virtualizer = new TranscriptVirtualizer<RowValue>(viewport);
    virtualizer.update(items(count), renderRow, 'session:one');

    const mounted = viewport.querySelectorAll('[data-testid="transcript-message"]');
    expect(mounted).toHaveLength(17);
    expect(mounted.length).toBeLessThanOrEqual(MAX_MOUNTED_TRANSCRIPT_ROWS);
    expect(mounted.length).toBeLessThan(count);
  });
});

describe('TranscriptVirtualizer window movement', () => {
  it('unmounts old rows and reconstructs exact local order without network work', () => {
    const viewport = createViewport();
    const virtualizer = new TranscriptVirtualizer<RowValue>(viewport);
    const source = items(10_000);
    let renderCalls = 0;
    const renderer = (value: RowValue) => {
      renderCalls += 1;
      return renderRow(value);
    };
    virtualizer.update(source, renderer, 'session:one');
    const bottomScrollTop = viewport.scrollTop;
    const bottomKeys = Array.from(viewport.querySelectorAll<HTMLElement>('[data-virtual-key]'), (row) => row.dataset.virtualKey);

    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event('scroll'));
    const topRows = Array.from(viewport.querySelectorAll<HTMLElement>('[data-virtual-key]'));
    expect(topRows.map((row) => row.textContent)).toEqual(
      topRows.map((row) => `content-${row.dataset.virtualIndex}`),
    );
    expect(topRows.every((row) => !bottomKeys.includes(row.dataset.virtualKey))).toBe(true);

    const callsAfterTop = renderCalls;
    viewport.scrollTop = bottomScrollTop;
    viewport.dispatchEvent(new Event('scroll'));
    expect(Array.from(viewport.querySelectorAll<HTMLElement>('[data-virtual-key]'), (row) => row.dataset.virtualKey)).toEqual(bottomKeys);
    expect(renderCalls - callsAfterTop).toBeLessThanOrEqual(MAX_MOUNTED_TRANSCRIPT_ROWS);
  });

  it('follows streaming output near bottom but preserves a scrolled-up reader', () => {
    const viewport = createViewport();
    const virtualizer = new TranscriptVirtualizer<RowValue>(viewport);
    const source = items(1_000);
    virtualizer.update(source, renderRow, 'session:one');
    const followed = viewport.scrollTop;
    virtualizer.update([...source, { key: 'new', version: '1', value: { id: 'new', content: 'new' } }], renderRow, 'session:one');
    expect(viewport.scrollTop).toBeGreaterThan(followed);

    viewport.scrollTop = 72 * 100;
    viewport.dispatchEvent(new Event('scroll'));
    const readingAt = viewport.scrollTop;
    virtualizer.update([...source, { key: 'new', version: '2', value: { id: 'new', content: 'growing' } }], renderRow, 'session:one');
    expect(viewport.scrollTop).toBe(readingAt);
  });

  it('keeps a streaming partial as one row and recalculates after viewport resize', () => {
    const viewport = createViewport(300);
    const virtualizer = new TranscriptVirtualizer<RowValue>(viewport);
    const source = items(100);
    virtualizer.update(source, renderRow, 'session:one');
    const before = viewport.querySelectorAll('[data-virtual-key]').length;
    const updated = source.map((item, index) => index === 99
      ? { ...item, version: '2', value: { ...item.value, content: 'streaming content grew' } }
      : item);
    virtualizer.update(updated, renderRow, 'session:one');
    expect(viewport.querySelectorAll('[data-virtual-key="message-99"]')).toHaveLength(1);
    expect(viewport.querySelectorAll('[data-virtual-key]').length).toBeLessThanOrEqual(MAX_MOUNTED_TRANSCRIPT_ROWS);
    expect(viewport.querySelectorAll('[data-virtual-key]').length).toBeGreaterThanOrEqual(before);
  });

  it('measures variable rows and preserves the visual anchor when a row above it grows', () => {
    const previousResizeObserver = globalThis.ResizeObserver;
    const observer = { callback: null as ResizeObserverCallback | null };
    class MockResizeObserver {
      constructor(next: ResizeObserverCallback) { observer.callback = next; }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    try {
      const viewport = createViewport();
      const virtualizer = new TranscriptVirtualizer<RowValue>(viewport);
      virtualizer.update(items(1_000), renderRow, 'session:one');
      viewport.scrollTop = 100 * 72;
      viewport.dispatchEvent(new Event('scroll'));
      const rowAbove = viewport.querySelector<HTMLElement>('[data-virtual-index="92"]');
      expect(rowAbove).toBeTruthy();
      const before = viewport.scrollTop;
      const resizeCallback = observer.callback;
      if (!resizeCallback) throw new Error('Expected ResizeObserver callback');
      resizeCallback([{
        target: rowAbove!,
        contentRect: { height: 200 },
        borderBoxSize: [{ blockSize: 200 }],
      } as unknown as ResizeObserverEntry], {} as ResizeObserver);
      expect(viewport.scrollTop).toBe(before + 136);
      expect(viewport.querySelectorAll('[data-virtual-key]').length).toBeLessThanOrEqual(MAX_MOUNTED_TRANSCRIPT_ROWS);
    } finally {
      globalThis.ResizeObserver = previousResizeObserver;
    }
  });
});
