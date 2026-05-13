import { describe, it, expect } from 'vitest';
import { detectIntentFromText } from '../../src/telegram/messageHandler.js';

describe('detectIntentFromText', () => {
  it('detects "done" from English', () => {
    expect(detectIntentFromText('job is done')).toBe('done');
    expect(detectIntentFromText('finished')).toBe('done');
  });

  it('detects "done" from Spanish', () => {
    expect(detectIntentFromText('terminamos')).toBe('done');
    expect(detectIntentFromText('listo')).toBe('done');
  });

  it('detects "done" from Portuguese', () => {
    expect(detectIntentFromText('acabou')).toBe('done');
  });

  it('detects "arrived" intent', () => {
    expect(detectIntentFromText('chegamos')).toBe('arrived');
    expect(detectIntentFromText('we arrived')).toBe('arrived');
  });

  it('detects "issue" intent', () => {
    expect(detectIntentFromText('problema')).toBe('issue');
    expect(detectIntentFromText('there is a problem')).toBe('issue');
  });

  it('returns null for unknown messages', () => {
    expect(detectIntentFromText('what time is the game')).toBeNull();
  });
});
