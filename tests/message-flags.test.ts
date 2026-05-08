import { formatContent } from '../src/message-flags.js';

describe('formatContent', () => {
  it('returns plain string as contentText', () => {
    expect(formatContent('Hello')).toEqual({ contentText: 'Hello', formattedContent: null });
  });

  it('joins single-element string array', () => {
    expect(formatContent(['Check'])).toEqual({ contentText: 'Check', formattedContent: null });
  });

  it('joins multi-element string array with newline', () => {
    expect(formatContent(['Line 1', 'Line 2'])).toEqual({ contentText: 'Line 1\nLine 2', formattedContent: null });
  });

  it('joins empty string array to empty string', () => {
    expect(formatContent([])).toEqual({ contentText: '', formattedContent: null });
  });

  it('returns empty contentText for null', () => {
    expect(formatContent(null)).toEqual({ contentText: '', formattedContent: null });
  });

  it('returns empty contentText for undefined', () => {
    expect(formatContent(undefined)).toEqual({ contentText: '', formattedContent: null });
  });

  it('formats non-string array as JSON fallback', () => {
    const result = formatContent([1, 2, 3]);
    expect(result.contentText).toBeNull();
    expect(result.formattedContent).toBe(JSON.stringify([1, 2, 3], null, 2));
  });

  it('formats mixed array as JSON fallback', () => {
    const result = formatContent(['text', 42]);
    expect(result.contentText).toBeNull();
    expect(result.formattedContent).not.toBeNull();
  });

  it('formats object as JSON fallback', () => {
    const result = formatContent({ key: 'value' });
    expect(result.contentText).toBeNull();
    expect(result.formattedContent).toBe(JSON.stringify({ key: 'value' }, null, 2));
  });
});
