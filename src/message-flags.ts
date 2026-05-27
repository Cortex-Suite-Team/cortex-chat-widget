import type {
  ChatMessageViewModel,
  ChatState,
  MessageFlags,
  WidgetRawMessage,
} from './types.js';

const TYPING_TYPES = new Set(['chat::typing', 'typing::start', 'typing::stop']);
const HIDDEN_TRANSCRIPT_TYPES = new Set([
  'system::opened',
  'system::lifecycle',
  'system::state',
  'system::pong',
  'system::telemetry',
  'system::billing',
  'escalation::request',
]);
const TERMINAL_SESSION_STATES = new Set([
  'COMPLETED',
  'FAILED',
  'STOPPED',
  'TIMEOUT',
  'CANCELLED',
]);

function payloadValue(message: WidgetRawMessage, key: string): unknown {
  if (!message.payload || typeof message.payload !== 'object') {
    return undefined;
  }
  return (message.payload as Record<string, unknown>)[key];
}

export function getMessageFlags(message: WidgetRawMessage): MessageFlags {
  const type = message.type;
  const answerKind = payloadValue(message, 'answer_kind');

  return {
    startTyping: type === 'chat::typing' || type === 'typing::start',
    stopTyping: type === 'typing::stop',
    finalAnswer: type === 'chat::answer' && answerKind === 'final',
    isQuestion: type === 'chat::question',
  };
}

export function isTypingMessageType(type: string): boolean {
  return TYPING_TYPES.has(type);
}

export function shouldHideTranscriptMessage(message: ChatMessageViewModel): boolean {
  return isTypingMessageType(message.type)
    || HIDDEN_TRANSCRIPT_TYPES.has(message.type)
    || (message.type.startsWith('system::') && message.type !== 'system::error');
}

export function isTerminalSessionState(sessionState: string): boolean {
  return TERMINAL_SESSION_STATES.has(sessionState);
}

export function buildStatusText(state: ChatState, isAwaitingAnswer: boolean, isTyping: boolean): string {
  if (state.lastError) {
    return state.lastError.message;
  }

  if (state.escalation?.status === 'pending') {
    return 'Waiting for human review';
  }

  if (isAwaitingAnswer) {
    return 'Waiting for answer...';
  }

  if (isTyping) {
    return 'Digital Worker is typing...';
  }

  if (state.connection.isStale) {
    return 'Reconnecting...';
  }

  if (!state.connection.isConnected) {
    return state.connection.channelState === 'CONNECTING'
      ? 'Connecting...'
      : `Connection: ${state.connection.channelState.toLowerCase()}`;
  }

  if (isTerminalSessionState(state.connection.sessionState)) {
    return `Session ${state.connection.sessionState.toLowerCase()}`;
  }

  return 'Connected';
}
