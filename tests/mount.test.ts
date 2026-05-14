import { jest } from '@jest/globals';
import { __getLastController } from './mocks/sdk-ui.js';
import {
  applyChatState,
  baseChatState,
  changeInput,
  CustomClient,
  flushAsyncWork,
  mountWidget,
  resetMocks,
  setFileInput,
  submitComposer,
} from './helpers.js';
import { mountCortexChat } from '../src/index.js';
import { __getLastSdkBrowserClient } from './mocks/sdk-browser.js';

describe('mountCortexChat', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('requires embedded target', () => {
    expect(() => {
      mountCortexChat({
        apiKey: 'test-key',
        mode: 'embedded',
      });
    }).toThrow('Embedded mode requires a target');
  });

  it('renders embedded into target and keeps it always open', () => {
    const target = document.createElement('div');
    target.id = 'chat';
    document.body.appendChild(target);

    const widget = mountCortexChat('#chat', {
      apiKey: 'test-key',
      mode: 'embedded',
    });

    const host = target.firstElementChild as HTMLElement;
    expect(host).toBeTruthy();
    expect(widget.getState().isOpen).toBe(true);

    widget.close();
    widget.toggle();
    expect(widget.getState().isOpen).toBe(true);
  });

  it('embedded mode opens the session automatically on mount', async () => {
    const target = document.createElement('div');
    target.id = 'chat';
    document.body.appendChild(target);

    mountCortexChat('#chat', {
      apiKey: 'test-key',
      mode: 'embedded',
    });

    await flushAsyncWork();

    expect(__getLastController()?.connectCalls).toBe(1);
  });

  it('creates floating launcher and toggles panel', () => {
    const { widget } = mountWidget({
      mode: 'floating',
    });

    const host = document.body.firstElementChild as HTMLElement;
    const launcher = host.shadowRoot?.querySelector('[data-testid="launcher"]') as HTMLButtonElement;
    const panel = host.shadowRoot?.querySelector('[data-testid="panel"]') as HTMLElement;

    expect(launcher).toBeTruthy();
    expect(panel.hidden).toBe(true);

    widget.open();
    expect(panel.hidden).toBe(false);

    widget.toggle();
    expect(panel.hidden).toBe(true);

    widget.close();
    expect(panel.hidden).toBe(true);
  });

  it('floating mode opens the session on first widget open, not during send', async () => {
    const { widget } = mountWidget({
      mode: 'floating',
    });

    expect(__getLastController()?.connectCalls).toBe(0);

    widget.open();
    await flushAsyncWork();
    expect(__getLastController()?.connectCalls).toBe(1);

    const host = document.body.firstElementChild as HTMLElement;
    const textarea = host.shadowRoot?.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const composer = host.shadowRoot?.querySelector('[data-testid="composer"]') as HTMLFormElement;
    changeInput(textarea, 'Hello after open');
    submitComposer(composer);
    await flushAsyncWork();

    expect(__getLastController()?.connectCalls).toBe(1);
  });

  it('floating launcher click opens the session on first open', async () => {
    mountWidget({
      mode: 'floating',
    });

    const host = document.body.firstElementChild as HTMLElement;
    const launcher = host.shadowRoot?.querySelector('[data-testid="launcher"]') as HTMLButtonElement;

    expect(__getLastController()?.connectCalls).toBe(0);

    launcher.click();
    await flushAsyncWork();

    expect(__getLastController()?.connectCalls).toBe(1);
  });

  it('throws on missing apiKey', () => {
    expect(() => {
      mountCortexChat({
        apiKey: '',
      });
    }).toThrow('requires apiKey');
  });

  it('passes workerRef to the SDK client', () => {
    mountCortexChat({
      apiKey: 'test-key',
      workerRef: 'live-worker',
    });

    expect(__getLastSdkBrowserClient()?.options.workerRef).toBe('live-worker');
  });

  it('passes debug flag through to the SDK client when enabled', () => {
    mountCortexChat({
      apiKey: 'test-key',
      workerRef: 'live-worker',
      debug: true,
    });

    expect(__getLastSdkBrowserClient()?.options.debug).toBe(true);
  });

  it('does not emit console.debug by default during widget send', async () => {
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    mountWidget({
      mode: 'floating',
    });

    const host = document.body.firstElementChild as HTMLElement;
    const textarea = host.shadowRoot?.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const composer = host.shadowRoot?.querySelector('[data-testid="composer"]') as HTMLFormElement;

    changeInput(textarea, 'Hello live runtime');
    submitComposer(composer);
    await flushAsyncWork();

    expect(debugSpy).not.toHaveBeenCalled();
    debugSpy.mockRestore();
  });

  it('draft input does not change header correspondent once session identity is set', () => {
    mountWidget({
      mode: 'floating',
    });
    const host = document.body.firstElementChild as HTMLElement;
    const shadow = host.shadowRoot as ShadowRoot;
    const textarea = shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const title = shadow.querySelector('.cortex-widget__title') as HTMLElement;

    applyChatState(baseChatState({
      session: {
        correspondent: {
          name: 'Echo Worker',
          title: 'Tester',
          avatarUrl: 'https://example.test/avatar.png',
        },
      },
    }));

    changeInput(textarea, 'draft text');

    expect(title.textContent).toBe('Echo Worker');
  });

  it('handleSend calls controller.sendMessage once', async () => {
    mountWidget({
      mode: 'floating',
    });

    const host = document.body.firstElementChild as HTMLElement;
    const textarea = host.shadowRoot?.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
    const composer = host.shadowRoot?.querySelector('[data-testid="composer"]') as HTMLFormElement;

    changeInput(textarea, 'Hello live runtime');
    submitComposer(composer);
    await flushAsyncWork();

    const controller = __getLastController();
    expect(controller?.sendCalls).toHaveLength(1);
    expect(controller?.sendCalls[0]).toMatchObject({
      content: ['Hello live runtime'],
    });
  });

  it('renders attachment UI disabled when client has no upload capability', () => {
    const client = new CustomClient();
    Object.defineProperty(client, 'uploadAttachment', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(client, 'uploadFile', {
      configurable: true,
      value: undefined,
    });

    mountWidget({
      client,
      mode: 'floating',
    });

    const host = document.body.firstElementChild as HTMLElement;
    const attachButton = host.shadowRoot?.querySelector('[data-testid="attach-button"]') as HTMLButtonElement;
    const fileHint = host.shadowRoot?.querySelector('[data-testid="file-hint"]') as HTMLElement;
    expect(attachButton.disabled).toBe(true);
    expect(fileHint.textContent).toContain('Attachments unavailable');
  });

  it('destroys safely, unsubscribes, removes DOM, and allows repeated destroy', () => {
    const client = new CustomClient();
    client.uploadAttachmentImpl = async () => 'file_1';
    const { widget } = mountWidget({
      client,
      mode: 'floating',
    });

    expect(client.listenerCount()).toBe(1);
    expect(document.body.children.length).toBe(1);

    widget.destroy();
    expect(client.listenerCount()).toBe(0);
    expect(document.body.children.length).toBe(0);
    expect(__getLastController()?.destroyCalls).toBe(1);

    expect(() => widget.destroy()).not.toThrow();
  });

  it('removes raw listeners on destroy for typing and final answer flow', () => {
    const client = new CustomClient();
    client.uploadAttachmentImpl = async () => 'file_1';
    mountWidget({
      client,
    });

    expect(client.listenerCount()).toBe(1);

    const widget = mountCortexChat({
      apiKey: 'test-key',
      client,
    });
    expect(client.listenerCount()).toBe(2);

    widget.destroy();
    expect(client.listenerCount()).toBe(1);
  });

  it('shows runtime error banner', () => {
    mountWidget();
    const host = document.body.firstElementChild as HTMLElement;
    const banner = host.shadowRoot?.querySelector('[data-testid="error-banner"]') as HTMLElement;

    __getLastController()?.setState(baseChatState({
      lastError: {
        code: 'runtime_failed',
        message: 'Runtime failed',
      },
    }));

    expect(banner.textContent).toContain('Runtime failed');
  });

  it('throws browser_unsupported instead of ReferenceError in non-browser environments', () => {
    const originalHTMLElement = globalThis.HTMLElement;
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: undefined,
    });

    try {
      let thrown: unknown;
      try {
        mountCortexChat({
          apiKey: 'test-key',
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as { code?: string }).code).toBe('browser_unsupported');
      expect(thrown).not.toBeInstanceOf(ReferenceError);
    } finally {
      Object.defineProperty(globalThis, 'HTMLElement', {
        configurable: true,
        value: originalHTMLElement,
      });
    }
  });

  it('throws shadow_dom_unsupported when attachShadow is unavailable on HTMLElement.prototype', () => {
    const originalAttachShadow = HTMLElement.prototype.attachShadow;
    const OriginalHTMLElement = globalThis.HTMLElement;
    function FakeHTMLElement() {}
    FakeHTMLElement.prototype = {};

    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: FakeHTMLElement,
    });

    try {
      let thrown: unknown;
      try {
        mountCortexChat({
          apiKey: 'test-key',
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as { code?: string }).code).toBe('shadow_dom_unsupported');
    } finally {
      Object.defineProperty(globalThis, 'HTMLElement', {
        configurable: true,
        value: OriginalHTMLElement,
      });
      Object.defineProperty(HTMLElement.prototype, 'attachShadow', {
        configurable: true,
        value: originalAttachShadow,
      });
    }
  });
});
