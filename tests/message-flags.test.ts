import { shouldHideTranscriptMessage } from '../src/message-flags.js';

describe('shouldHideTranscriptMessage', () => {
  it('hides blocked protocol messages', () => {
    expect(shouldHideTranscriptMessage({
      id: '1',
      type: 'system::opened',
      role: 'system',
      content: {},
    })).toBe(true);

    expect(shouldHideTranscriptMessage({
      id: '2',
      type: 'system::lifecycle',
      role: 'system',
      content: {},
    })).toBe(true);
  });

  it('keeps system::error visible', () => {
    expect(shouldHideTranscriptMessage({
      id: '3',
      type: 'system::error',
      role: 'error',
      content: 'Something failed',
    })).toBe(false);
  });

  it('hides escalation::request from end-user transcript', () => {
    expect(shouldHideTranscriptMessage({
      id: 'esc_1',
      type: 'escalation::request',
      role: 'escalation',
      content: 'Needs human approval',
      meta: { waitToken: 'tok', allowedActions: ['reply_user'] },
    })).toBe(true);
  });

  it('does not hide normal chat messages', () => {
    expect(shouldHideTranscriptMessage({
      id: 'q1',
      type: 'chat::question',
      role: 'assistant',
      content: 'Choose',
      meta: {},
    })).toBe(false);

    expect(shouldHideTranscriptMessage({
      id: 'a1',
      type: 'chat::answer',
      role: 'assistant',
      content: 'Here is the answer',
    })).toBe(false);
  });
});
