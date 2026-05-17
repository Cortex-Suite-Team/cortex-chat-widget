import type { HistoryConversationSummary, HistoryDom } from './types.js';
export type HistoryRenderState = {
    kind: 'loading';
    liveSessionId: string | null;
    liveSelected: boolean;
} | {
    kind: 'empty';
    liveSessionId: string | null;
    liveSelected: boolean;
} | {
    kind: 'error';
    message: string;
    liveSessionId: string | null;
    liveSelected: boolean;
} | {
    kind: 'loaded';
    items: HistoryConversationSummary[];
    liveSessionId: string | null;
    liveSelected: boolean;
    selectedHistoricalSessionId: string | null;
    menuSessionId: string | null;
};
export declare function renderHistoryList(dom: HistoryDom, state: HistoryRenderState): void;
//# sourceMappingURL=history-renderer.d.ts.map