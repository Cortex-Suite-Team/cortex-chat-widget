import type { ChatMessageViewModel, HistoryConversationSummary } from './types.js';

interface HistoryListResponse {
  ok: boolean;
  data?: {
    conversations?: HistoryConversationSummary[];
  };
}

interface HistoryMessagesResponse {
  ok: boolean;
  data?: {
    session_id?: string;
    messages?: Array<{
      id: string;
      type: string;
      role: ChatMessageViewModel['role'];
      content: unknown;
      status?: ChatMessageViewModel['status'];
      ts?: string | null;
      meta?: Record<string, unknown>;
    }>;
  };
}

async function requestJson<T>(
  url: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `ApiKey ${apiKey}`,
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

export function createHistoryClient(args: { controlPlaneUrl: string; apiKey: string }) {
  const baseUrl = args.controlPlaneUrl.replace(/\/+$/, '');
  const apiKey = args.apiKey;

  return {
    async listConversations(): Promise<HistoryConversationSummary[]> {
      const body = await requestJson<HistoryListResponse>(`${baseUrl}/api/chat/conversations/`, apiKey);
      return body.data?.conversations ?? [];
    },
    async getMessages(sessionId: string): Promise<ChatMessageViewModel[]> {
      const body = await requestJson<HistoryMessagesResponse>(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/messages/`,
        apiKey,
      );
      return (body.data?.messages ?? []).map((message) => ({
        id: message.id,
        type: message.type,
        role: message.role,
        content: message.content,
        status: message.status,
        ts: message.ts ?? null,
        meta: message.meta ?? {},
      }));
    },
    async renameConversation(sessionId: string, title: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/rename/`,
        apiKey,
        {
          method: 'POST',
          body: JSON.stringify({ title }),
        },
      );
    },
    async pinConversation(sessionId: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/pin/`,
        apiKey,
        { method: 'POST' },
      );
    },
    async unpinConversation(sessionId: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/unpin/`,
        apiKey,
        { method: 'POST' },
      );
    },
    async deleteConversation(sessionId: string): Promise<void> {
      await requestJson(
        `${baseUrl}/api/chat/conversations/${encodeURIComponent(sessionId)}/`,
        apiKey,
        { method: 'DELETE' },
      );
    },
  };
}
