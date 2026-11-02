import { jest } from '@jest/globals';
import { createHistoryClient } from '../src/history-client.js';

const message = (id: number, type: string, role: 'user' | 'assistant', content: string[]) => ({
  id,
  timestamp: `2026-10-30T12:00:0${id}Z`,
  message_type: type,
  direction: role === 'user' ? 'in' : 'out',
  role,
  content,
  source: 'session-manager',
});

const page = (messages: unknown[], nextCursor: string | null) => ({
  ok: true,
  data: {
    messages,
    next_cursor: nextCursor,
    incomplete: true,
    incomplete_reason: 'audit_best_effort',
    truncated: nextCursor !== null,
  },
});

const client = () => createHistoryClient({ controlPlaneUrl: 'https://cp.example', bearerToken: 'test-token' });

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = jest.fn() as typeof fetch; });
afterEach(() => { globalThis.fetch = originalFetch; });

test('loads real audit pages, deduplicates IDs and retains provenance for the history notice', async () => {
  const user = message(1, 'chat::message', 'user', ['Hello']);
  const answer = message(2, 'chat::answer', 'assistant', ['**Hi**']);
  const fetchMock = jest.mocked(globalThis.fetch)
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page([user], `${user.timestamp}|1`) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page([user, answer], null) } as Response);

  const result = await client().getMessages('session-1');
  expect(result.messages).toEqual([
    { id: '1', type: 'chat::message', role: 'user', direction: 'in', source: 'session-manager', content: ['Hello'], ts: user.timestamp },
    { id: '2', type: 'chat::answer', role: 'assistant', direction: 'out', source: 'session-manager', content: ['**Hi**'], ts: answer.timestamp, status: 'final' },
  ]);
  expect(result.audit).toEqual({
    incomplete: true,
    incompleteReason: 'audit_best_effort',
    truncated: false,
    sources: ['session-manager'],
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
  expect(secondUrl.searchParams.get('cursor')).toBe(`${user.timestamp}|1`);
  expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
});

test('empty audit is distinct from malformed, unsuccessful and repeated-cursor responses', async () => {
  jest.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true, status: 200, json: async () => page([], null),
  } as Response);
  expect((await client().getMessages('empty')).messages).toEqual([]);

  jest.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true, status: 200, json: async () => ({ ok: false, data: page([], null).data }),
  } as Response);
  await expect(client().getMessages('failed')).rejects.toThrow('unsuccessful');

  jest.mocked(globalThis.fetch).mockResolvedValueOnce({
    ok: true, status: 200, json: async () => page([{ ...message(1, 'chat::message', 'user', ['x']), content: 'invalid' }], null),
  } as Response);
  await expect(client().getMessages('malformed')).rejects.toThrow('malformed transcript message');

  const cursor = '2026-10-30T12:00:01Z|1';
  jest.mocked(globalThis.fetch)
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page([message(1, 'chat::message', 'user', ['x'])], cursor) } as Response)
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page([message(1, 'chat::message', 'user', ['x'])], cursor) } as Response);
  await expect(client().getMessages('loop')).rejects.toThrow('repeated transcript cursor');
});
