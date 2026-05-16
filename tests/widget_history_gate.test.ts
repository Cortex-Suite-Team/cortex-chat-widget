import { jest } from '@jest/globals';
import { flushAsyncWork, resetMocks } from './helpers.js';
import { mountCortexChat } from '../src/index.js';
import { __getLastController, createMockChatState } from './mocks/sdk-ui.js';
import { __getLastSdkBrowserClient } from './mocks/sdk-browser.js';

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function installTargets() {
  const history = document.createElement('div');
  history.id = 'history';
  const chat = document.createElement('div');
  chat.id = 'chat';
  document.body.append(history, chat);
}

function getFetchMock(): any {
  return global.fetch as any;
}

describe('widget history gate', () => {
  beforeEach(() => {
    resetMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call history API before session is ready', async () => {
    installTargets();

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    await flushAsyncWork();

    expect(getFetchMock()).not.toHaveBeenCalled();
  });

  it('creates history client and loads history once isSessionReady becomes true', async () => {
    installTargets();
    getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: { conversations: [] } }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    expect(getFetchMock()).not.toHaveBeenCalled();

    __getLastController()!.setState(createMockChatState({ connection: { isSessionReady: true, channelState: 'OPEN', sessionState: 'ACTIVE', sessionId: 'sess_1', isConnected: true, isStale: false } }));
    await flushAsyncWork();

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('uses Bearer token in history API request, not ApiKey', async () => {
    installTargets();
    getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: { conversations: [] } }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const [, requestInit] = getFetchMock().mock.calls[0] as [string, RequestInit];
    const authHeader = (requestInit?.headers as Record<string, string>)?.['Authorization'] ?? '';

    expect(authHeader).toMatch(/^Bearer /);
    expect(authHeader).not.toMatch(/^ApiKey /);
    expect(authHeader).toBe('Bearer mock-access-token');
  });

  it('second isSessionReady tick does not create a second history client', async () => {
    installTargets();
    getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: { conversations: [] } }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    const controller = __getLastController()!;
    controller.setState(createMockChatState());
    await flushAsyncWork();

    expect(getFetchMock()).toHaveBeenCalledTimes(1);

    controller.setState(createMockChatState());
    await flushAsyncWork();

    expect(getFetchMock()).toHaveBeenCalledTimes(1);
  });

  it('uses client.cpApiUrl when available, falling back to options.controlPlaneUrl', async () => {
    installTargets();
    getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: { conversations: [] } }));

    const autoClient = __getLastSdkBrowserClient();

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    const client = __getLastSdkBrowserClient()!;
    client.cpApiUrl = 'https://runtime-cp.example.test';

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    const [url] = getFetchMock().mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://runtime-cp.example.test');

    void autoClient;
  });

  it('history gate does not fire when historyTarget is absent', async () => {
    getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: { conversations: [] } }));

    const target = document.body.appendChild(document.createElement('div'));
    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target,
    });

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    expect(getFetchMock()).not.toHaveBeenCalled();
  });

  it('history gate does not fire when client.accessToken is null', async () => {
    installTargets();
    getFetchMock().mockResolvedValue(mockJsonResponse({ ok: true, data: { conversations: [] } }));

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    const client = __getLastSdkBrowserClient()!;
    client.accessToken = null;

    __getLastController()!.setState(createMockChatState());
    await flushAsyncWork();

    expect(getFetchMock()).not.toHaveBeenCalled();
  });
});
