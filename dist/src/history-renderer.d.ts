import type { HistoryConversationSummary, HistoryDom } from './types.js';
export type HistoryRenderState = {
    kind: 'loading';
    liveSessionId: string | null;
    liveSelected: boolean;
    liveTitle: string | null;
} | {
    kind: 'empty';
    liveSessionId: string | null;
    liveSelected: boolean;
    liveTitle: string | null;
} | {
    kind: 'error';
    message: string;
    liveSessionId: string | null;
    liveSelected: boolean;
    liveTitle: string | null;
} | {
    kind: 'loaded';
    items: HistoryConversationSummary[];
    liveSessionId: string | null;
    liveSelected: boolean;
    liveTitle: string | null;
    selectedHistoricalSessionId: string | null;
    menuSessionId: string | null;
};
export declare function renderHistoryList(dom: HistoryDom, state: HistoryRenderState): void;
//# sourceMappingURL=history-renderer.d.ts.map