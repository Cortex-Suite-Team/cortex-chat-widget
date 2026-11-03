export interface HumanAssistanceCard {
    request: {
        request_id: string;
        question: string;
        options: Array<{
            id: string;
            label: string;
        }>;
        allow_text: boolean;
        deadline_at: string;
    };
    optionId: string | null;
    text: string;
    status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'resolved' | 'expired' | 'revoked' | 'delivery_failed' | 'cancelled';
    clientReplyId: string | null;
    reason?: string;
    error?: string;
}
export interface HumanAssistanceController {
    getCards(): HumanAssistanceCard[];
    subscribe(listener: (cards: HumanAssistanceCard[]) => void): () => void;
    selectOption(requestId: string, optionId: string | null): void;
    setText(requestId: string, text: string): void;
    submit(requestId: string): Promise<void>;
    refuse(requestId: string): Promise<void>;
    retry(requestId: string): Promise<void>;
    reset(): void;
    destroy(): void;
}
export interface HumanAssistanceClient {
    readonly humanAssistanceRequests: unknown[];
    onHumanAssistance(handler: (event: unknown) => void): () => void;
    replyHumanAssistance(options: unknown): Promise<void>;
}
/** Updates card nodes in place so status notifications preserve focus and unsent text. */
export declare class HumanAssistanceView {
    private readonly host;
    private readonly controller;
    private readonly nodes;
    private readonly deadlineTimers;
    constructor(host: HTMLElement, controller: HumanAssistanceController);
    render(cards: HumanAssistanceCard[]): void;
    destroy(): void;
    private clearDeadline;
    private scheduleDeadline;
    private createCard;
    private updateCard;
}
//# sourceMappingURL=human-assistance.d.ts.map