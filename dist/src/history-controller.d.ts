import type { DebugLogger } from './debug.js';
import type { ChatMessageViewModel, HistoryClient, HistoryDom, NormalizedWidgetOptions } from './types.js';
export interface HistoryControllerCallbacks {
    getLiveSessionId(): string | null;
    onOpenCurrent(): void;
    onOpenHistorical(sessionId: string, messages: ChatMessageViewModel[]): void;
    onStartNewChat(): Promise<void>;
    onError(error: unknown, code: string, message: string): void;
}
export declare class HistoryController {
    private readonly dom;
    private readonly options;
    private readonly callbacks;
    private readonly debug?;
    private client;
    private destroyed;
    private mounted;
    private lastRenderKey;
    private refreshGeneration;
    private messagesGeneration;
    private readonly state;
    private readonly onNewChatClick;
    private readonly onListClick;
    constructor(args: {
        dom: HistoryDom;
        options: NormalizedWidgetOptions;
        callbacks: HistoryControllerCallbacks;
        debug?: DebugLogger;
    });
    mount(): void;
    destroy(): void;
    setClient(client: HistoryClient | null): void;
    setLiveSessionId(sessionId: string | null): void;
    refresh(): Promise<void>;
    render(): void;
    private handleNewChatClick;
    private handleListClick;
    private openHistorical;
    private handleMenuAction;
    private computeRenderKey;
}
//# sourceMappingURL=history-controller.d.ts.map