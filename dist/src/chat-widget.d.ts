import { type HistoryTranscript, type CortexChatWidgetHandle, type NormalizedWidgetOptions, type WidgetClientLike, type WidgetDom } from './types.js';
export declare class ChatWidget {
    private readonly options;
    private readonly dom;
    private readonly mountTarget;
    private readonly historyTarget?;
    private readonly createClient;
    private readonly debug;
    private client;
    private controller;
    private liveChatState;
    private historicalTranscript;
    private historicalAudit;
    private historicalTranscriptRevision;
    private chatView;
    private historyController;
    private historyClientKey;
    private liveConnected;
    private liveConnectPromise;
    private mounted;
    private readonly domCleanup;
    private composerFileSeq;
    private readonly pendingDownloadUrls;
    private unsubscribeController;
    private unsubscribeRawMessages;
    private humanAssistanceController;
    private humanAssistanceView;
    private unsubscribeHumanAssistance;
    private readonly ui;
    private readonly onTextareaInput;
    private readonly onTextareaKeyDown;
    private readonly onComposerSubmit;
    private readonly onAttachClick;
    private readonly onFileChange;
    private readonly onFileChipsClick;
    private readonly onAuthSubmitClick;
    private readonly onAuthPasswordKeyDown;
    private readonly onLauncherClick;
    private readonly onTranscriptClick;
    private readonly onTranscriptSubmit;
    constructor(args: {
        options: NormalizedWidgetOptions;
        dom: WidgetDom;
        mountTarget: HTMLElement;
        historyTarget?: HTMLElement;
        createClient: () => WidgetClientLike;
    });
    mount(): CortexChatWidgetHandle;
    destroy(): Promise<void>;
    showLive(): void;
    showHistoricalTranscript(sessionId: string, transcript: HistoryTranscript): void;
    startNewChat(): Promise<void>;
    getLiveSessionId(): string | null;
    private createHandle;
    private initializeLiveRuntime;
    private initializeHumanAssistance;
    private teardownHumanAssistance;
    private bindControllerListeners;
    private bindDomListeners;
    private teardownLiveListeners;
    private resetLiveSession;
    private ensureConnected;
    private maybeEnableHistory;
    private getPublicState;
    private getDisplayedChatState;
    private syncTextareaValue;
    private resizeComposerTextarea;
    private notifyAndRender;
    private addComposerFiles;
    private removeComposerFile;
    private isComposerUploadError;
    private updateComposerFile;
    private clearComposerFiles;
    private clearDraftComposer;
    private buildUploadedAttachment;
    private uploadComposerFile;
    private setComposerUploadFailure;
    /**
     * Upload every composer file that has no sf_ ref yet, in selection order.
     * Returns the ordered refs only when every selected file is uploaded and the
     * selection did not change meanwhile; otherwise nothing is sent.
     */
    private uploadComposerFiles;
    private retryComposerUpload;
    private handleSend;
    private handleLoginSubmit;
    private handleOptionSelect;
    private handleQuestionFormSubmit;
    private handleTranscriptClick;
    /**
     * Download one generated file of a live answer. The descriptor is resolved
     * again from the transcript (never from DOM or message URLs); only an
     * available assistant file of that answer reaches client.downloadFile().
     */
    private downloadGeneratedFile;
    private setFileDownload;
    private saveBlob;
    private setOpen;
    private handleHistoryError;
    private resolveRuntimeError;
    private extractRuntimeChatTitle;
    private readUnknownPath;
}
//# sourceMappingURL=chat-widget.d.ts.map