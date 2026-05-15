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
});
