// S21 headless contract, accepted at ce1e84c889f95df46075b1b60fef43628ccd3c68.
// Keep the optional runtime export gated until a published SDK UI build includes it.
export interface HumanAssistanceCard {
  request: {
    request_id: string;
    question: string;
    options: Array<{ id: string; label: string }>;
    allow_text: boolean;
    deadline_at: string;
  };
  optionId: string | null;
  text: string;
  status: 'pending' | 'sent' | 'accepted' | 'rejected' | 'resolved' | 'expired' | 'revoked' | 'delivery_failed';
  clientReplyId: string | null;
  reason?: string;
  error?: string;
}

export interface HumanAssistanceController {
  getCards(): HumanAssistanceCard[];
  subscribe(listener: (cards: HumanAssistanceCard[]) => void): () => void;
  selectOption(requestId: string, optionId: string | null): void;
  setText(requestId: string, text: string): void;
  submit(requestId: string): Promise<void>;
  refuse(requestId: string): Promise<void>;
  retry(requestId: string): Promise<void>;
  reset(): void;
  destroy(): void;
}

export interface HumanAssistanceClient {
  readonly humanAssistanceRequests: unknown[];
  onHumanAssistance(handler: (event: unknown) => void): () => void;
  replyHumanAssistance(options: unknown): Promise<void>;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  result.className = className;
  return result;
}

function statusText(card: HumanAssistanceCard): string {
  const labels = {
    pending: 'Awaiting your response',
    sent: 'Sent, awaiting acknowledgement',
    accepted: 'Accepted, awaiting resolution',
    rejected: 'Rejected',
    resolved: 'Resolved',
    expired: 'Expired',
    revoked: 'Revoked',
    delivery_failed: 'Could not deliver request',
  };
  return labels[card.status];
}

/** Updates card nodes in place so status notifications preserve focus and unsent text. */
export class HumanAssistanceView {
  private readonly nodes = new Map<string, HTMLElement>();
  private readonly deadlineTimers = new Map<string, number>();

  constructor(private readonly host: HTMLElement, private readonly controller: HumanAssistanceController) {}

  render(cards: HumanAssistanceCard[]): void {
    const ids = new Set(cards.map((card) => card.request.request_id));
    for (const [id, node] of this.nodes) {
      if (!ids.has(id)) { node.remove(); this.nodes.delete(id); this.clearDeadline(id); }
    }
    for (const card of cards) {
      const id = card.request.request_id;
      let node = this.nodes.get(id);
      if (!node) {
        node = this.createCard(card);
        this.nodes.set(id, node);
        this.host.append(node);
        this.scheduleDeadline(card);
      }
      this.updateCard(node, card);
    }
    this.host.hidden = cards.length === 0;
  }

  destroy(): void {
    for (const id of this.deadlineTimers.keys()) this.clearDeadline(id);
    this.nodes.clear();
    this.host.replaceChildren();
    this.host.hidden = true;
  }

  private clearDeadline(id: string): void {
    const timer = this.deadlineTimers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    this.deadlineTimers.delete(id);
  }

  private scheduleDeadline(card: HumanAssistanceCard): void {
    const delay = Date.parse(card.request.deadline_at) - Date.now();
    if (card.status !== 'pending' || delay <= 0) return;
    const id = card.request.request_id;
    this.deadlineTimers.set(id, window.setTimeout(() => {
      this.deadlineTimers.delete(id);
      this.render(this.controller.getCards());
      if (this.nodes.has(id)) this.scheduleDeadline(card);
    }, Math.min(delay + 1, 0x7fffffff)));
  }

  private createCard(card: HumanAssistanceCard): HTMLElement {
    const id = card.request.request_id;
    const cardNode = element('article', 'cortex-widget__ha-card');
    cardNode.dataset.haRequestId = id;
    cardNode.setAttribute('aria-label', 'Human assistance request');
    const heading = element('h3', 'cortex-widget__ha-heading');
    heading.textContent = 'Human assistance';
    const prompt = element('p', 'cortex-widget__ha-prompt');
    prompt.textContent = card.request.question;
    cardNode.append(heading, prompt);
    if (card.request.options.length) {
      const label = element('label', 'cortex-widget__ha-label');
      label.textContent = 'Choose an option';
      const select = element('select', 'cortex-widget__ha-select');
      select.dataset.haControl = 'option';
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Select…';
      select.append(empty);
      for (const option of card.request.options) {
        const choice = document.createElement('option');
        choice.value = option.id;
        choice.textContent = option.label;
        select.append(choice);
      }
      select.addEventListener('change', () => {
        try { this.controller.selectOption(id, select.value || null); } catch { /* Controller owns validation/error state. */ }
      });
      label.append(select);
      cardNode.append(label);
    }
    if (card.request.allow_text) {
      const label = element('label', 'cortex-widget__ha-label');
      label.textContent = 'Your response';
      const input = element('textarea', 'cortex-widget__ha-text');
      input.dataset.haControl = 'text';
      input.maxLength = 4096;
      input.addEventListener('input', () => {
        try { this.controller.setText(id, input.value); } catch { /* Controller owns validation/error state. */ }
      });
      label.append(input);
      cardNode.append(label);
    }
    const status = element('p', 'cortex-widget__ha-status');
    status.setAttribute('role', 'status');
    const error = element('p', 'cortex-widget__ha-error');
    error.setAttribute('role', 'alert');
    const actions = element('div', 'cortex-widget__ha-actions');
    for (const [action, title] of [['submit', 'Submit'], ['refuse', 'Refuse'], ['retry', 'Retry']] as const) {
      const button = element('button', 'cortex-widget__ha-button');
      button.type = 'button';
      button.dataset.haAction = action;
      button.textContent = title;
      button.addEventListener('click', () => {
        try {
          const result = this.controller[action](id);
          void result.catch(() => { /* Controller emits the card error. */ });
        } catch { /* Controller emits the card error. */ }
      });
      actions.append(button);
    }
    cardNode.append(status, error, actions);
    return cardNode;
  }

  private updateCard(node: HTMLElement, card: HumanAssistanceCard): void {
    if (card.status !== 'pending') this.clearDeadline(card.request.request_id);
    const pending = card.status === 'pending' && Date.now() < Date.parse(card.request.deadline_at);
    const select = node.querySelector<HTMLSelectElement>('[data-ha-control="option"]');
    if (select) {
      const value = card.optionId ?? '';
      if (select.value !== value) select.value = value;
      select.disabled = !pending;
    }
    const input = node.querySelector<HTMLTextAreaElement>('[data-ha-control="text"]');
    if (input) {
      if (input.value !== card.text) input.value = card.text;
      input.disabled = !pending;
    }
    const status = node.querySelector<HTMLElement>('.cortex-widget__ha-status')!;
    status.textContent = statusText(card);
    const error = node.querySelector<HTMLElement>('.cortex-widget__ha-error')!;
    error.textContent = card.error ?? (card.reason ? `Reason: ${card.reason}` : '');
    error.hidden = !error.textContent;
    node.querySelector<HTMLButtonElement>('[data-ha-action="submit"]')!.disabled = !pending || (!card.optionId && !card.text.trim());
    node.querySelector<HTMLButtonElement>('[data-ha-action="refuse"]')!.disabled = !pending;
    const retry = node.querySelector<HTMLButtonElement>('[data-ha-action="retry"]')!;
    retry.hidden = !(card.status === 'sent' && !!card.error);
    retry.disabled = retry.hidden || Date.now() >= Date.parse(card.request.deadline_at);
  }
}
