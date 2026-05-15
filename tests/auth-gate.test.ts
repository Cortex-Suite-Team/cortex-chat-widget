/**
 * Slice 12: Auth gate UI tests.
 *
 * Covers:
 * - auth gate is hidden when auth.state is 'none' or 'accepted'
 * - auth gate appears when auth.state is 'required' or 'denied'
 * - composer is hidden while auth gate is visible
 * - composer is visible when auth gate is hidden
 * - auth message text comes from state.chat.auth.message
 * - denied state falls back to generic retry message
 * - submit button disabled while auth.state is 'submitting'
 * - inputs disabled while auth.state is 'submitting'
 * - login submit calls controller.submitLogin (not sendMessage)
 * - no optimistic message bubble after login submit
 * - password field is cleared after each submit
 * - login field is preserved after submit (not cleared)
 * - Enter key in password field triggers submit
 * - auth gate data-state attribute reflects current auth state
 */
import {
  applyChatState,
  baseChatState,
  flushAsyncWork,
  mountWidget,
  resetMocks,
} from './helpers.js';
import { __getLastController } from './mocks/sdk-ui.js';

function getHost(): HTMLElement {
  return document.body.firstElementChild as HTMLElement;
}

function getShadow(): ShadowRoot {
  const host = getHost();
  if (!host.shadowRoot) {
    throw new Error('Expected shadow root');
  }
  return host.shadowRoot;
}

function getAuthGate(shadow: ShadowRoot): HTMLElement {
  return shadow.querySelector('[data-testid="auth-gate"]') as HTMLElement;
}

function getComposer(shadow: ShadowRoot): HTMLFormElement {
  return shadow.querySelector('[data-testid="composer"]') as HTMLFormElement;
}

function getAuthLoginInput(shadow: ShadowRoot): HTMLInputElement {
  return shadow.querySelector('[data-testid="auth-login-input"]') as HTMLInputElement;
}

function getAuthPasswordInput(shadow: ShadowRoot): HTMLInputElement {
  return shadow.querySelector('[data-testid="auth-password-input"]') as HTMLInputElement;
}

function getAuthSubmitButton(shadow: ShadowRoot): HTMLButtonElement {
  return shadow.querySelector('[data-testid="auth-submit-button"]') as HTMLButtonElement;
}

function getAuthMessage(shadow: ShadowRoot): HTMLElement {
  return shadow.querySelector('[data-testid="auth-message"]') as HTMLElement;
}

describe('auth gate visibility', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('auth gate is hidden initially (auth.state=none)', () => {
    mountWidget();
    const shadow = getShadow();
    const authGate = getAuthGate(shadow);
    expect(authGate.dataset.visible).toBe('false');
  });

  it('auth gate appears when auth.state=required', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    expect(getAuthGate(shadow).dataset.visible).toBe('true');
  });

  it('auth gate appears when auth.state=denied', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'denied' } }));

    expect(getAuthGate(shadow).dataset.visible).toBe('true');
  });

  it('auth gate is hidden when auth.state=accepted', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'accepted' } }));

    expect(getAuthGate(shadow).dataset.visible).toBe('false');
  });

  it('auth gate is hidden when auth.state=submitting transitions to accepted', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'submitting' } }));
    expect(getAuthGate(shadow).dataset.visible).toBe('true');

    applyChatState(baseChatState({ auth: { state: 'accepted' } }));
    expect(getAuthGate(shadow).dataset.visible).toBe('false');
  });
});

describe('composer visibility with auth gate', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('composer is visible when auth.state=none', () => {
    mountWidget();
    const shadow = getShadow();
    expect(getComposer(shadow).hidden).toBe(false);
  });

  it('composer is hidden when auth gate is visible (required)', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    expect(getComposer(shadow).hidden).toBe(true);
  });

  it('composer is hidden when auth gate is visible (denied)', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'denied' } }));

    expect(getComposer(shadow).hidden).toBe(true);
  });

  it('composer returns when auth.state=accepted', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));
    expect(getComposer(shadow).hidden).toBe(true);

    applyChatState(baseChatState({ auth: { state: 'accepted' } }));
    expect(getComposer(shadow).hidden).toBe(false);
  });
});

describe('auth gate message text', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('displays auth.message from state when provided', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required', message: 'Please sign in to continue.' } }));

    expect(getAuthMessage(shadow).textContent).toBe('Please sign in to continue.');
  });

  it('falls back to default message when auth.state=required and no message', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    expect(getAuthMessage(shadow).textContent).toBeTruthy();
    expect(getAuthMessage(shadow).textContent!.length).toBeGreaterThan(0);
  });

  it('falls back to retry message when auth.state=denied and no message', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'denied' } }));

    const text = getAuthMessage(shadow).textContent ?? '';
    expect(text.length).toBeGreaterThan(0);
  });

  it('auth gate data-state attribute reflects current auth state', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));
    expect(getAuthGate(shadow).dataset.state).toBe('required');

    applyChatState(baseChatState({ auth: { state: 'denied' } }));
    expect(getAuthGate(shadow).dataset.state).toBe('denied');

    applyChatState(baseChatState({ auth: { state: 'submitting' } }));
    expect(getAuthGate(shadow).dataset.state).toBe('submitting');
  });
});

describe('auth gate input states', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('inputs and button are enabled when auth.state=required', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    expect(getAuthLoginInput(shadow).disabled).toBe(false);
    expect(getAuthPasswordInput(shadow).disabled).toBe(false);
    expect(getAuthSubmitButton(shadow).disabled).toBe(false);
  });

  it('inputs and button are disabled when auth.state=submitting', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'submitting' } }));

    expect(getAuthLoginInput(shadow).disabled).toBe(true);
    expect(getAuthPasswordInput(shadow).disabled).toBe(true);
    expect(getAuthSubmitButton(shadow).disabled).toBe(true);
  });

  it('submit button shows "Signing in…" when submitting', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'submitting' } }));

    expect(getAuthSubmitButton(shadow).textContent).toContain('Signing in');
  });

  it('submit button shows "Sign in" when required or denied', () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));
    expect(getAuthSubmitButton(shadow).textContent).toBe('Sign in');

    applyChatState(baseChatState({ auth: { state: 'denied' } }));
    expect(getAuthSubmitButton(shadow).textContent).toBe('Sign in');
  });
});

describe('login submit behavior', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('clicking submit calls controller.submitLogin with credentials', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = 's3cr3t';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(controller.loginCalls).toHaveLength(1);
    expect(controller.loginCalls[0]).toEqual({ login: 'alice', password: 's3cr3t' });
  });

  it('login submit does NOT call controller.sendMessage', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = 'pw';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(controller.sendCalls).toHaveLength(0);
  });

  it('no optimistic message bubble is added to transcript after login submit', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = 'pw';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    const messages = shadow.querySelectorAll('[data-testid="transcript-message"]');
    expect(messages).toHaveLength(0);
    expect(controller.state.transcript).toHaveLength(0);
  });

  it('password field is cleared after submit', async () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = 's3cr3t';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(getAuthPasswordInput(shadow).value).toBe('');
  });

  it('login field is preserved after submit (not cleared)', async () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = 's3cr3t';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(getAuthLoginInput(shadow).value).toBe('alice');
  });

  it('Enter key in password field triggers submit', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'bob';
    getAuthPasswordInput(shadow).value = 'hunter2';
    getAuthPasswordInput(shadow).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flushAsyncWork();

    expect(controller.loginCalls).toHaveLength(1);
    expect(controller.loginCalls[0]).toEqual({ login: 'bob', password: 'hunter2' });
  });

  it('password is cleared after Enter key submit', async () => {
    mountWidget();
    const shadow = getShadow();

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'bob';
    getAuthPasswordInput(shadow).value = 'hunter2';
    getAuthPasswordInput(shadow).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await flushAsyncWork();

    expect(getAuthPasswordInput(shadow).value).toBe('');
  });

  it('does not submit when login field is empty', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = '';
    getAuthPasswordInput(shadow).value = 'pw';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(controller.loginCalls).toHaveLength(0);
  });

  it('does not submit when password field is empty', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = '';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(controller.loginCalls).toHaveLength(0);
  });

  it('password cleared after each submit regardless of result', async () => {
    mountWidget();
    const shadow = getShadow();
    const controller = __getLastController()!;
    controller.nextLoginResult = { ok: false, error: 'access_denied' };

    applyChatState(baseChatState({ auth: { state: 'required' } }));

    getAuthLoginInput(shadow).value = 'alice';
    getAuthPasswordInput(shadow).value = 'wrong';
    getAuthSubmitButton(shadow).click();
    await flushAsyncWork();

    expect(getAuthPasswordInput(shadow).value).toBe('');
  });
});
