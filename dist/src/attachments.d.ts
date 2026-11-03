import type { ChatMessageViewModel, TranscriptAttachmentViewModel } from './types.js';
export declare const FILE_REF_PATTERN: RegExp;
/** Files to render on a transcript message, in server order, at most 8, without repeats. */
export declare function getMessageAttachments(message: ChatMessageViewModel): TranscriptAttachmentViewModel[];
/** The generated file `fileRef` of `message`, when it is one this answer owns. */
export declare function findGeneratedFile(message: ChatMessageViewModel, fileRef: string): TranscriptAttachmentViewModel | null;
/** A filename safe to hand to the browser's download attribute. */
export declare function safeDownloadFilename(name: string | null): string;
//# sourceMappingURL=attachments.d.ts.map