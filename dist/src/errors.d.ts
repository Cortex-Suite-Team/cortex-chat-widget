import type { CortexChatWidgetError } from './types.js';
export declare class WidgetError extends Error {
    code: string;
    cause?: unknown;
    constructor(code: string, message: string, cause?: unknown);
}
export declare function createWidgetError(code: string, message: string, cause?: unknown): WidgetError;
export declare function toWidgetError(error: unknown, fallbackCode?: string, fallbackMessage?: string): CortexChatWidgetError;
//# sourceMappingURL=errors.d.ts.map