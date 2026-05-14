export interface DebugLogger {
    enabled: boolean;
    log(message: string, data?: Record<string, unknown>): void;
}
export declare function createDebugLogger(enabled: boolean | undefined): DebugLogger;
//# sourceMappingURL=debug.d.ts.map