import { mountCortexChat } from './index.js';
declare global {
    interface Window {
        CortexChatWidget?: {
            mountCortexChat: typeof mountCortexChat;
        };
    }
}
export { mountCortexChat };
//# sourceMappingURL=loader.d.ts.map