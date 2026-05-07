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
});
