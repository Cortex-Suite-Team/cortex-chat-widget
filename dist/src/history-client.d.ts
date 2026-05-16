import type { ChatMessageViewModel, HistoryConversationSummary } from './types.js';
export declare function createHistoryClient(args: {
    controlPlaneUrl: string;
    bearerToken: string;
}): {
    listConversations(): Promise<HistoryConversationSummary[]>;
    getMessages(sessionId: string): Promise<ChatMessageViewModel[]>;
    renameConversation(sessionId: string, title: string): Promise<void>;
    pinConversation(sessionId: string): Promise<void>;
    unpinConversation(sessionId: string): Promise<void>;
    deleteConversation(sessionId: string): Promise<void>;
};
//# sourceMappingURL=history-client.d.ts.map