import { getIconSvg } from '../src/icons.js';
import { mountCortexChat } from '../src/index.js';
import { layoutStyles } from '../src/styles/layout.js';
import { changeInput, flushAsyncWork, mountWidget, resetMocks } from './helpers.js';
import { __getLastController } from './mocks/sdk-ui.js';

function getShadowFromBody(): ShadowRoot {
  const host = document.body.firstElementChild as HTMLElement | null;
  if (!host?.shadowRoot) {
    throw new Error('Expected widget shadow root');
  }
  return host.shadowRoot;
}

function getTextarea(shadow: ShadowRoot): HTMLTextAreaElement {
  return shadow.querySelector('[data-testid="composer-textarea"]') as HTMLTextAreaElement;
}

function setScrollHeight(textarea: HTMLTextAreaElement, value: number): void {
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    value,
  });
}

function prepareTextareaMetrics(textarea: HTMLTextAreaElement): void {
  textarea.style.lineHeight = '20px';
  textarea.style.padding = '0px';
  textarea.style.border = '0px';
}

describe('widget shell layout', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('renders the left rail and collapsed history slot when history is absent', () => {
    mountWidget();
    const shadow = getShadowFromBody();
    const shell = shadow.querySelector('[data-testid="panel"]') as HTMLElement;
    const rail = shadow.querySelector('[data-testid="widget-shell-rail"]');
    const historySlot = shadow.querySelector('[data-testid="widget-history-slot"]') as HTMLElement;
    const chatSlot = shadow.querySelector('[data-testid="widget-chat-slot"]');

    expect(shell.dataset.hasHistory).toBe('false');
    expect(rail).toBeTruthy();
    expect(historySlot).toBeTruthy();
    expect(historySlot.children).toHaveLength(0);
    expect(chatSlot).toBeTruthy();
  });

  it('mounts history into the shell history slot when history is available', () => {
    const chat = document.createElement('div');
    chat.id = 'chat';
    const history = document.createElement('div');
    history.id = 'history';
    document.body.append(history, chat);

    mountCortexChat({
      apiKey: 'test-key',
      mode: 'embedded',
      target: '#chat',
      historyTarget: '#history',
      controlPlaneUrl: 'https://cp.example.test',
    });

    const host = chat.firstElementChild as HTMLElement;
    const shadow = host.shadowRoot!;
    const shell = shadow.querySelector('[data-testid="panel"]') as HTMLElement;
    const historySlot = shadow.querySelector('[data-testid="widget-history-slot"]') as HTMLElement;

    expect(shell.dataset.hasHistory).toBe('true');
    expect(historySlot.firstElementChild).toBeTruthy();
    expect((historySlot.firstElementChild as HTMLElement).shadowRoot).toBeTruthy();
  });

  it('keeps the no-history slot width-zero behavior in CSS', () => {
    expect(layoutStyles).toContain('.cortex-widget-shell[data-has-history="false"] .cortex-widget-shell__history');
    expect(layoutStyles).toContain('flex: 0 0 0');
    expect(layoutStyles).toContain('width: 0');
  });
});

describe('composer polish', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('uses the arrow-up icon for the normal send button', () => {
    mountWidget();
    const shadow = getShadowFromBody();
    const button = shadow.querySelector('[data-testid="send-button"]') as HTMLButtonElement;
    const expectedIcon = document.createElement('span');
    expectedIcon.innerHTML = getIconSvg('arrow-up');

    expect(button.querySelector('path')?.getAttribute('d')).toBe(
      expectedIcon.querySelector('path')?.getAttribute('d'),
    );
  });

  it('auto-grows the textarea up to five lines and then scrolls internally', () => {
    mountWidget();
    const shadow = getShadowFromBody();
    const textarea = getTextarea(shadow);
    prepareTextareaMetrics(textarea);

    setScrollHeight(textarea, 60);
    changeInput(textarea, 'line 1\nline 2\nline 3');
    expect(textarea.style.height).toBe('60px');
    expect(textarea.style.overflowY).toBe('hidden');

    setScrollHeight(textarea, 140);
    changeInput(textarea, 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6');
    expect(textarea.style.height).toBe('100px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('resets textarea height after a successful send clears the composer', async () => {
    mountWidget();
    const shadow = getShadowFromBody();
    const textarea = getTextarea(shadow);
    const composer = shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
    prepareTextareaMetrics(textarea);

    setScrollHeight(textarea, 140);
    changeInput(textarea, 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6');
    expect(textarea.style.height).toBe('100px');

    composer.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    setScrollHeight(textarea, 20);
    await flushAsyncWork();

    expect(textarea.value).toBe('');
    expect(textarea.style.height).toBe('20px');
    expect(textarea.style.overflowY).toBe('hidden');
  });

  it('preserves Shift+Enter newline behavior by not sending or preventing default', async () => {
    mountWidget();
    const shadow = getShadowFromBody();
    const textarea = getTextarea(shadow);
    changeInput(textarea, 'hello');

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
    await flushAsyncWork();

    expect(event.defaultPrevented).toBe(false);
    expect(__getLastController()?.sendCalls).toHaveLength(0);
  });

  it('sends with Enter without Shift and prevents the newline default', async () => {
    mountWidget();
    const shadow = getShadowFromBody();
    const textarea = getTextarea(shadow);
    changeInput(textarea, 'send me');

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
    await flushAsyncWork();

    expect(event.defaultPrevented).toBe(true);
    expect(__getLastController()?.sendCalls).toHaveLength(1);
  });
});
