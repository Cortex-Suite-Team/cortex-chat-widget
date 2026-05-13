import { __getLastController } from './mocks/sdk-ui.js';
import {
  baseChatState,
  changeInput,
  CustomClient,
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
