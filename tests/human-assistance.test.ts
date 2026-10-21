import { jest } from '@jest/globals';
import { applyChatState, baseChatState, CustomClient, flushAsyncWork, mountWidget, resetMocks } from './helpers.js';

type Request = { version: 1; request_id: string; question: string; options: Array<{ id: string; label: string }>; allow_text: boolean; deadline_at: string; status: 'pending' };
class HAClient extends CustomClient {
  humanAssistanceRequests: Request[] = [];
  haListeners = new Set<(event: { type: string; payload: any }) => void>();
  replies: any[] = [];
  failNextReply = false;
  onHumanAssistance(handler: (event: { type: string; payload: any }) => void): () => void {
    this.haListeners.add(handler);
    return () => { this.haListeners.delete(handler); };
  }
  async replyHumanAssistance(payload: unknown): Promise<void> {
    this.replies.push(payload);
    if (this.failNextReply) { this.failNextReply = false; throw Error('network uncertain'); }
  }
  notify(type: string, payload: any): void {
    if (type === 'human_assistance::request' && !this.humanAssistanceRequests.some((item) => item.request_id === payload.request_id)) this.humanAssistanceRequests.push(payload);
    for (const handler of this.haListeners) handler({ type, payload });
  }
}

const request = (id: string, options: Request['options'], allowText: boolean): Request => ({
  version: 1, request_id: id, question: `Question ${id} <img src=x onerror=alert(1)>`,
  options, allow_text: allowText, deadline_at: '2099-01-01T00:00:00Z', status: 'pending',
});
const card = (root: ShadowRoot, id: string) => root.querySelector<HTMLElement>(`[data-ha-request-id="${id}"]`)!;
const action = (node: HTMLElement, name: string) => node.querySelector<HTMLButtonElement>(`[data-ha-action="${name}"]`)!;

describe('Human Assistance visual host', () => {
  beforeEach(resetMocks);

  it('renders two independent cards while A has an active question and keeps the transcript and composer intact', async () => {
    const client = new HAClient();
    const { widget, controller } = mountWidget({ client, initialOpen: true });
    const root = (document.body.firstElementChild as HTMLElement).shadowRoot!;
    const transcript = root.querySelector('[data-testid="transcript"]')!;
    const composer = root.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!;
    composer.value = 'draft for A';
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    applyChatState(baseChatState({
      transcript: [{ id: 'a1', type: 'chat::question', role: 'assistant', actor: { kind: 'digital_worker', name: 'A' }, content: 'A question', meta: { question_ref: 'q-a', questions: [{ key: 'choice', label: 'A choice', type: 'select', options: [{ id: 'a', label: 'A' }] }] } }],
      activeQuestion: { question_ref: 'q-a', input_type: 'select', allow_reply: false, options: [{ id: 'a', label: 'A' }] },
    }));
    const beforeTranscript = transcript.textContent;
    client.notify('human_assistance::request', request('b', [{ id: 'yes', label: '<script>bad</script>' }], true));
    client.notify('human_assistance::request', request('c', [], true));
    expect(root.querySelectorAll('[data-ha-request-id]')).toHaveLength(2);
    expect(card(root, 'b').querySelector('img')).toBeNull();
    expect(card(root, 'b').querySelector('script')).toBeNull();
    expect(card(root, 'b').textContent).toContain('<script>bad</script>');
    expect(transcript.textContent).toBe(beforeTranscript);
    expect(composer.value).toBe('draft for A');
    expect(widget.getState().chat.activeQuestion?.question_ref).toBe('q-a');
    const b = card(root, 'b');
    const select = b.querySelector<HTMLSelectElement>('select')!;
    const text = b.querySelector<HTMLTextAreaElement>('textarea')!;
    select.value = 'yes'; select.dispatchEvent(new Event('change', { bubbles: true }));
    text.value = 'Because'; text.focus(); text.dispatchEvent(new Event('input', { bubbles: true }));
    expect(document.activeElement).toBe((document.body.firstElementChild as HTMLElement));
    expect(root.activeElement).toBe(text);
    action(b, 'submit').click();
    await flushAsyncWork();
    expect(client.replies).toEqual([{ requestId: 'b', clientReplyId: 'reply_1', action: 'answer', optionId: 'yes', text: 'Because' }]);
    expect(b.textContent).toContain('Sent, awaiting acknowledgement');
    expect(controller.sendCalls).toHaveLength(0);
    expect(client.sentMessages).toHaveLength(0);
    expect(transcript.textContent).toBe(beforeTranscript);
    expect(composer.value).toBe('draft for A');
    client.notify('human_assistance::status', { request_id: 'b', status: 'reply_accepted', client_reply_id: 'reply_1' });
    expect(b.textContent).toContain('Accepted, awaiting resolution');
    expect(action(b, 'retry').hidden).toBe(true);
    client.notify('human_assistance::status', { request_id: 'b', status: 'resolved' });
    expect(b.textContent).toContain('Resolved');
    action(card(root, 'c'), 'refuse').click();
    await flushAsyncWork();
    expect(client.replies[1]).toMatchObject({ requestId: 'c', action: 'refuse' });
    widget.destroy();
  });

  it('guards empty and expired inputs, retries an ambiguous send unchanged, and cleans up on destroy', async () => {
    const client = new HAClient();
    const { widget } = mountWidget({ client, initialOpen: true });
    const root = (document.body.firstElementChild as HTMLElement).shadowRoot!;
    client.notify('human_assistance::request', request('choice', [{ id: 'one', label: 'One' }], false));
    client.notify('human_assistance::request', request('expired', [], true));
    client.notify('human_assistance::status', { request_id: 'expired', status: 'expired' });
    client.notify('human_assistance::request', request('revoked', [{ id: 'one', label: 'One' }], false));
    client.notify('human_assistance::status', { request_id: 'revoked', status: 'revoked' });
    expect(action(card(root, 'choice'), 'submit').disabled).toBe(true);
    expect(card(root, 'choice').querySelector('textarea')).toBeNull();
    expect(action(card(root, 'expired'), 'submit').disabled).toBe(true);
    expect(action(card(root, 'revoked'), 'refuse').disabled).toBe(true);
    const select = card(root, 'choice').querySelector<HTMLSelectElement>('select')!;
    select.value = 'one'; select.dispatchEvent(new Event('change', { bubbles: true }));
    client.failNextReply = true;
    action(card(root, 'choice'), 'submit').click();
    await flushAsyncWork();
    expect(action(card(root, 'choice'), 'retry').hidden).toBe(false);
    action(card(root, 'choice'), 'retry').click();
    await flushAsyncWork();
    expect(client.replies).toHaveLength(2);
    expect(client.replies[1]).toEqual(client.replies[0]);
    client.notify('human_assistance::status', { request_id: 'choice', status: 'reply_rejected', client_reply_id: 'reply_1', reason: 'unauthorized' });
    expect(card(root, 'choice').textContent).toContain('Reason: unauthorized');
    expect(action(card(root, 'choice'), 'retry').hidden).toBe(true);
    client.notify('human_assistance::request', request('choice', [{ id: 'two', label: 'Two' }], true));
    expect(root.querySelectorAll('[data-ha-request-id="choice"]')).toHaveLength(1);
    widget.destroy();
    await flushAsyncWork();
    expect(client.haListeners.size).toBe(0);
    expect(root.querySelectorAll('[data-ha-request-id]')).toHaveLength(0);
  });

  it('fails closed when the native client lacks HA methods', () => {
    const { widget } = mountWidget({ client: new CustomClient(), initialOpen: true });
    const root = (document.body.firstElementChild as HTMLElement).shadowRoot!;
    expect(root.querySelector<HTMLElement>('[data-testid="human-assistance"]')!.hidden).toBe(true);
    widget.destroy();
  });

  it('disables a pending card when its deadline passes without another notification', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00Z'));
    try {
      const client = new HAClient();
      const { widget } = mountWidget({ client, initialOpen: true });
      const root = (document.body.firstElementChild as HTMLElement).shadowRoot!;
      client.notify('human_assistance::request', { ...request('short', [], true), deadline_at: '2026-10-21T12:00:00.050Z' });
      expect(action(card(root, 'short'), 'refuse').disabled).toBe(false);
      jest.advanceTimersByTime(51);
      expect(action(card(root, 'short'), 'refuse').disabled).toBe(true);
      widget.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('replaces the HA subscription and clears old cards on New Chat', async () => {
    const target = document.createElement('div');
    const historyTarget = document.createElement('div');
    document.body.append(target, historyTarget);
    const client = new HAClient();
    const { widget } = mountWidget({ client, mode: 'embedded', target, historyTarget, controlPlaneUrl: 'https://cp.test' });
    const root = (target.firstElementChild as HTMLElement).shadowRoot!;
    client.notify('human_assistance::request', request('old', [], true));
    expect(client.haListeners.size).toBe(1);
    expect(card(root, 'old')).toBeTruthy();
    // The accepted native SDK clears its inbox on explicit disconnect.
    client.humanAssistanceRequests = [];
    const historyHost = root.querySelector<HTMLElement>('[data-testid="widget-history-slot"] > *')!;
    historyHost.shadowRoot!.querySelector<HTMLButtonElement>('[data-testid="history-new-chat"]')!.click();
    await flushAsyncWork();
    expect(client.haListeners.size).toBe(1);
    expect(root.querySelectorAll('[data-ha-request-id]')).toHaveLength(0);
    client.notify('human_assistance::request', request('new', [], true));
    expect(root.querySelectorAll('[data-ha-request-id]')).toHaveLength(1);
    expect(card(root, 'new')).toBeTruthy();
    widget.destroy();
  });
});
