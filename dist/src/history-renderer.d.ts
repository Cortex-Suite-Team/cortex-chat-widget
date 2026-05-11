import type { HistoryConversationSummary, HistoryDom } from './types.js';
export type HistoryRenderState = {
    kind: 'loading';
} | {
    kind: 'empty';
} | {
    kind: 'error';
    message: string;
} | {
    kind: 'loaded';
    items: HistoryConversationSummary[];
    selectedSessionId: string | null;
    menuSessionId: string | null;
    draftSelected: boolean;
};
export declare function renderHistoryList(dom: HistoryDom, state: HistoryRenderState): void;
//# sourceMappingURL=history-renderer.d.ts.map