import type { CortexChatWidgetError } from './types.js';

export class WidgetError extends Error {
  code: string;
  cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'WidgetError';
    this.code = code;
    this.cause = cause;
  }
}

export function createWidgetError(
  code: string,
  message: string,
  cause?: unknown,
): WidgetError {
  return new WidgetError(code, message, cause);
}

export function toWidgetError(
  error: unknown,
  fallbackCode = 'widget_error',
  fallbackMessage = 'Unexpected widget error',
): CortexChatWidgetError {
  if (error instanceof WidgetError) {
    return {
      code: error.code,
      message: error.message,
      cause: error.cause,
    };
  }

  if (error instanceof Error) {
    return {
      code: fallbackCode,
      message: error.message,
      cause: error,
    };
  }

  return {
    code: fallbackCode,
    message: fallbackMessage,
    cause: error,
  };
}
