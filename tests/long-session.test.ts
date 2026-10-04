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
});
