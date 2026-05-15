import type { ChatMessageViewModel, ChatState, MessageFlags, WidgetRawMessage } from './types.js';
export declare function getMessageFlags(message: WidgetRawMessage): MessageFlags;
export declare function isTypingMessageType(type: string): boolean;
export declare function shouldHideTranscriptMessage(message: ChatMessageViewModel): boolean;
export declare function isTerminalSessionState(sessionState: string): boolean;
export declare function buildStatusText(state: ChatState, isAwaitingAnswer: boolean, isTyping: boolean): string;
//# sourceMappingURL=message-flags.d.ts.map