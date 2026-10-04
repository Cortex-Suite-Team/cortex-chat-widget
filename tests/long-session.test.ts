import type { ChatMessageViewModel } from '@cortex-suite/sdk-ui';
import { MAX_MOUNTED_TRANSCRIPT_ROWS } from '../src/transcript-virtualizer.js';
import { applyChatState, baseChatState, mountWidget, resetMocks } from './helpers.js';

describe('long-session transcript contour', () => {
  beforeEach(resetMocks);

  it('scrolls a 50k local transcript with bounded DOM and zero transport reads', () => {
    const { controller } = mountWidget();
    const transcript = Array.from({ length: 50_000 }, (_, index) => ({
      id: `message-${index}`,
      seq: index,
      type: 'chat::answer',
      role: 'assistant' as const,
      content: `message content ${index}`,
      status: 'final' as const,
      actor: { kind: 'digital_worker' as const, name: 'Worker' },
    }));
    applyChatState(baseChatState({ transcript }));
    const viewport = document.body.firstElementChild?.shadowRoot?.querySelector<HTMLElement>('[data-testid="transcript"]');
    expect(viewport).toBeTruthy();
    const transportCallsBefore = controller.sendCalls.length;
    const connectCallsBefore = controller.connectCalls;

    for (const scrollTop of [0, 72_000, 1_500_000, 3_599_400, 0]) {
      viewport!.scrollTop = scrollTop;
      viewport!.dispatchEvent(new Event('scroll'));
      expect(viewport!.querySelectorAll('[data-testid="transcript-message"]').length)
        .toBeLessThanOrEqual(MAX_MOUNTED_TRANSCRIPT_ROWS);
    }

    expect(controller.sendCalls).toHaveLength(transportCallsBefore);
    expect(controller.connectCalls).toBe(connectCallsBefore);
  });

  it.each([10_000, 50_000])(
    'updates repeated partials in a %i-message transcript without full transcript iteration',
    (count) => {
      const { controller } = mountWidget();
      const messages: ChatMessageViewModel[] = Array.from({ length: count }, (_, index) => Object.freeze({
        id: index === count - 1 ? 'turn:stream' : `message-${index}`,
        seq: index,
        type: index === count - 1 ? 'chat::partial' : 'chat::answer',
        role: 'assistant' as const,
        content: index === count - 1 ? 'seed' : `message content ${index}`,
        status: index === count - 1 ? 'streaming' as const : 'final' as const,
        actor: { kind: 'digital_worker' as const, name: 'Worker' },
      }));
      const scans = { filter: 0, map: 0, iterator: 0 };
      const transcript = new Proxy(messages, {
        get(target, property, receiver) {
          if (property === 'filter' || property === 'map') {
            return (...args: unknown[]) => {
              scans[property] += 1;
              return (Array.prototype[property] as (...values: unknown[]) => unknown).apply(target, args);
            };
          }
          if (property === Symbol.iterator) {
            scans.iterator += 1;
          }
          return Reflect.get(target, property, receiver) as unknown;
        },
        set() {
          throw new TypeError('Transcript view is read-only');
        },
      });
      applyChatState(baseChatState({ transcript, transcriptRevision: 1 }));
      scans.filter = 0;
      scans.map = 0;
      scans.iterator = 0;

      for (let revision = 2; revision <= 101; revision += 1) {
        const message = Object.freeze({
          ...messages[count - 1],
          content: `seed${'x'.repeat(revision - 1)}`,
          seq: count + revision,
        });
        messages[count - 1] = message;
        applyChatState(baseChatState({
          transcript,
          transcriptRevision: revision,
          transcriptMutation: {
            type: 'message_updated',
            index: count - 1,
            message,
          },
        }));
      }

      const viewport = document.body.firstElementChild!.shadowRoot!
        .querySelector<HTMLElement>('[data-testid="transcript"]')!;
      expect(scans).toEqual({ filter: 0, map: 0, iterator: 0 });
      expect(viewport.querySelectorAll('[data-testid="transcript-message"]')).toHaveLength(17);
      expect(viewport.textContent).toContain(`seed${'x'.repeat(100)}`);
      expect(controller.sendCalls).toHaveLength(0);
    },
  );

  it('appends a row incrementally through a runtime-readonly 50k transcript view', () => {
    mountWidget();
    const messages: ChatMessageViewModel[] = Array.from({ length: 50_000 }, (_, index) => Object.freeze({
      id: `message-${index}`,
      seq: index,
      type: 'chat::answer',
      role: 'assistant' as const,
      content: `message content ${index}`,
      status: 'final' as const,
      actor: { kind: 'digital_worker' as const, name: 'Worker' },
    }));
    const scans = { filter: 0, map: 0, iterator: 0 };
    const transcript = new Proxy(messages, {
      get(target, property, receiver) {
        if (property === 'filter' || property === 'map') {
          return (...args: unknown[]) => {
            scans[property] += 1;
            return (Array.prototype[property] as (...values: unknown[]) => unknown).apply(target, args);
          };
        }
        if (property === Symbol.iterator) scans.iterator += 1;
        return Reflect.get(target, property, receiver) as unknown;
      },
      set() {
        throw new TypeError('Transcript view is read-only');
      },
    });
    applyChatState(baseChatState({ transcript, transcriptRevision: 1 }));
    scans.filter = 0;
    scans.map = 0;
    scans.iterator = 0;

    const appended = Object.freeze({
      id: 'message-appended',
      seq: 50_000,
      type: 'chat::answer',
      role: 'assistant' as const,
      content: 'incrementally appended',
      status: 'final' as const,
      actor: { kind: 'digital_worker' as const, name: 'Worker' },
    });
    messages.push(appended);
    applyChatState(baseChatState({
      transcript,
      transcriptRevision: 2,
      transcriptMutation: { type: 'message_added', index: 50_000, message: appended },
    }));

    const viewport = document.body.firstElementChild!.shadowRoot!
      .querySelector<HTMLElement>('[data-testid="transcript"]')!;
    expect(scans).toEqual({ filter: 0, map: 0, iterator: 0 });
    expect(viewport.querySelectorAll('[data-testid="transcript-message"]').length)
      .toBeLessThanOrEqual(MAX_MOUNTED_TRANSCRIPT_ROWS);
    expect(viewport.textContent).toContain('incrementally appended');
  });
});
