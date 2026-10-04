export declare const TRANSCRIPT_OVERSCAN_ROWS = 8;
export declare const MAX_MOUNTED_TRANSCRIPT_ROWS = 80;
export interface VirtualTranscriptItem<T> {
    key: string;
    version: string;
    value: T;
}
export declare class TranscriptVirtualizer<T> {
    private readonly viewport;
    private readonly topSpacer;
    private readonly rows;
    private readonly bottomSpacer;
    private readonly mounted;
    private readonly heights;
    private readonly indexByKey;
    private readonly heightIndex;
    private readonly resizeObserver;
    private items;
    private renderRow;
    private scopeKey;
    private followBottom;
    private destroyed;
    constructor(viewport: HTMLElement);
    update(items: VirtualTranscriptItem<T>[], renderRow: (value: T) => HTMLElement | null, scopeKey: string): void;
    updateItem(index: number, item: VirtualTranscriptItem<T>, renderRow: (value: T) => HTMLElement | null): void;
    appendItem(item: VirtualTranscriptItem<T>, renderRow: (value: T) => HTMLElement | null): void;
    refreshMounted(renderRow: (value: T) => HTMLElement | null, getVersion: (value: T) => string): void;
    destroy(): void;
    private get viewportHeight();
    private get totalHeight();
    private readonly onScroll;
    private onResize;
    private captureAnchor;
    private findIndexAtOffset;
    private renderWindow;
    private measureMountedRows;
}
//# sourceMappingURL=transcript-virtualizer.d.ts.map