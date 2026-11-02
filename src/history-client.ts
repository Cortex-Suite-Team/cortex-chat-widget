import type { HistoryConversationSummary, HistoryMessageViewModel, HistoryTranscript } from './types.js';

interface HistoryListResponse {
  ok: boolean;
  data?: {
    conversations?: HistoryConversationSummary[];
  };
}

interface ObserverTranscriptMessage {
  id: number;
  timestamp: string;
  message_type: string;
  direction: 'in' | 'out';
  role: 'user' | 'assistant';
  content: string[];
  source: string;
}

interface ObserverTranscriptPage {
  messages: ObserverTranscriptMessage[];
  next_cursor: string | null;
  incomplete: boolean;
  incomplete_reason: string | null;
  truncated: boolean;
}

const HISTORY_PAGE_LIMIT = 100;
const MAX_HISTORY_PAGES = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseTranscriptPage(body: unknown): ObserverTranscriptPage {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    throw new Error('History API returned an unsuccessful or malformed response');
  }
  const data = body.data;
  if (!Array.isArray(data.messages)
    || !(data.next_cursor === null || (typeof data.next_cursor === 'string' && data.next_cursor.length > 0))
    || typeof data.incomplete !== 'boolean'
    || !(data.incomplete_reason === null || typeof data.incomplete_reason === 'string')
    || typeof data.truncated !== 'boolean'
    || data.truncated !== (data.next_cursor !== null)
    || data.messages.length > HISTORY_PAGE_LIMIT
    || (data.next_cursor !== null && data.messages.length === 0)) {
    throw new Error('History API returned a malformed transcript page');
  }
  for (const message of data.messages) {
    if (!isRecord(message)
      || !Number.isSafeInteger(message.id) || (message.id as number) <= 0
      || typeof message.timestamp !== 'string' || Number.isNaN(Date.parse(message.timestamp))
      || typeof message.message_type !== 'string' || !/^chat::(message|answer|hail|forward|question)$/.test(message.message_type)
      || (message.direction !== 'in' && message.direction !== 'out')
      || (message.role !== 'user' && message.role !== 'assistant')
      || (message.direction === 'in' && message.role !== 'user')
      || !Array.isArray(message.content) || !message.content.every((part: unknown) => typeof part === 'string')
      || message.source !== 'session-manager') {
      throw new Error('History API returned a malformed transcript message');
    }
  }
  if (data.next_cursor !== null) {
    const last = data.messages[data.messages.length - 1] as ObserverTranscriptMessage;
    if (data.next_cursor !== `${last.timestamp}|${last.id}`) {
      throw new Error('History API returned an impossible transcript cursor');
    }
  }
  return data as unknown as ObserverTranscriptPage;
}

function projectMessage(message: ObserverTranscriptMessage): HistoryMessageViewModel {
  return {
    id: String(message.id),
    type: message.message_type,
    role: message.role,
    direction: message.direction,
    source: message.source,
    content: message.content,
    ts: message.timestamp,
    ...(message.message_type === 'chat::answer' && message.role === 'assistant' ? { status: 'final' as const } : {}),
  };
}

async function requestJson<T>(
  url: string,
  bearerToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`History API request failed with HTTP ${response.status}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

export function createHistoryClient(args: { controlPlaneUrl: string; bearerToken: string }) {
  const baseUrl = args.controlPlaneUrl.replace(/\/+$/, '');
  const bearerToken = args.bearerToken;

  return {
    async listConversations(): Promise<HistoryConversationSummary[]> {
      const body = await requestJson<HistoryListResponse>(`${baseUrl}/api/chat/conversations/`, bearerToken);
      return body.data?.conversations ?? [];
    },
    async getMessages(sessionId: string): Promise<HistoryTranscript> {
      const messages: HistoryMessageViewModel[] = [];
      const seenIds = new Set<number>();
      const seenCursors = new Set<string>();
      const sources = new Set<string>();
      let cursor: string | null = null;
      let incomplete = false;
      let incompleteReason: string | null = null;
      for (let pageNumber = 0; pageNumber < MAX_HISTORY_PAGES; pageNumber += 1) {
        const url = new URL(`${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/messages/`);
        url.searchParams.set('limit', String(HISTORY_PAGE_LIMIT));
        if (cursor !== null) url.searchParams.set('cursor', cursor);
        const page = parseTranscriptPage(await requestJson<unknown>(url.toString(), bearerToken));
        incomplete ||= page.incomplete;
        incompleteReason ??= page.incomplete_reason;
        for (const message of page.messages) {
          sources.add(message.source);
          if (!seenIds.has(message.id)) {
            seenIds.add(message.id);
            messages.push(projectMessage(message));
          }
        }
        if (page.next_cursor === null) {
          return {
            messages,
            audit: { incomplete, incompleteReason, truncated: false, sources: [...sources] },
          };
        }
        if (seenCursors.has(page.next_cursor)) {
          throw new Error('History API returned a repeated transcript cursor');
        }
        seenCursors.add(page.next_cursor);
        cursor = page.next_cursor;
      }
      throw new Error('History exceeds the page limit; transcript was not opened partially');
    },
    async renameConversation(sessionId: string, title: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/rename/`,
        bearerToken,
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
      );
    },
    async pinConversation(sessionId: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/pin/`,
        bearerToken,
        { method: 'POST' },
      );
    },
    async unpinConversation(sessionId: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/unpin/`,
        bearerToken,
        { method: 'POST' },
      );
    },
    async deleteConversation(sessionId: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/`,
        bearerToken,
        { method: 'DELETE' },
      );
    },
  };
}
