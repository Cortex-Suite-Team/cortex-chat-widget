import { jest } from '@jest/globals';
import { resetMocks } from './helpers.js';

describe('loader', () => {
  beforeEach(() => {
    resetMocks();
    jest.resetModules();
    delete (window as Window & { CortexChatWidget?: unknown }).CortexChatWidget;
  });

  it('reads data attributes and mounts widget', async () => {
    const script = document.createElement('script');
    script.dataset.apiKey = 'loader-key';
    script.dataset.mode = 'floating';
    script.dataset.title = 'Ask Cortex';
    script.dataset.position = 'bottom-right';
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      value: script,
    });

    await import('../src/loader.js');

    expect(window.CortexChatWidget).toBeTruthy();
    const host = document.body.firstElementChild as HTMLElement;
    const title = host.shadowRoot?.querySelector('.cortex-widget__title');
    expect(title?.textContent).toBe('Ask Cortex');
  });

  it('supports optional history loader attributes', async () => {
    const historyTarget = document.createElement('div');
    historyTarget.id = 'history-target';
    const chatTarget = document.createElement('div');
    chatTarget.id = 'chat-target';
    document.body.append(historyTarget, chatTarget);

    const fetchMock: any = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { conversations: [] } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const script = document.createElement('script');
    script.dataset.apiKey = 'loader-key';
    script.dataset.mode = 'embedded';
    script.dataset.target = '#chat-target';
    script.dataset.historyTarget = '#history-target';
    script.dataset.controlPlaneUrl = 'https://cp.example.test';
    Object.defineProperty(document, 'currentScript', {
      configurable: true,
      value: script,
    });

    await import('../src/loader.js');
    await Promise.resolve();

    expect(historyTarget.firstElementChild).toBeTruthy();
    expect(fetchMock).toHaveBeenCalled();
  });
});
