export interface DebugLogger {
  enabled: boolean;
  log(message: string, data?: Record<string, unknown>): void;
}

function hasWindowLocalStorageDebugFlag(): boolean {
  try {
    return (
      (globalThis as typeof globalThis & { localStorage?: { getItem(key: string): string | null } })
        .localStorage?.getItem('cortex_debug')
    ) === '1';
  } catch {
    return false;
  }
}

export function createDebugLogger(enabled: boolean | undefined): DebugLogger {
  const active = enabled === true || hasWindowLocalStorageDebugFlag();
  return {
    enabled: active,
    log(message, data) {
      if (!active) {
        return;
      }
      if (data === undefined) {
        console.debug(message);
        return;
      }
      console.debug(message, data);
    },
  };
}
