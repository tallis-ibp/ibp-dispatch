import { describe, it, expect } from 'vitest';
import { detectIntent, INTENTS } from '../../src/telegram/messageHandler.js';

describe('detectIntent', () => {
  it('detects "done" from English', () => {
    expect(detectIntent('job is done')).toBe('done');
    expect(detectIntent('finished')).toBe('done');
  });

  it('detects "done" from Spanish', () => {
    expect(detectIntent('terminamos')).toBe('done');
    expect(detectIntent('listo')).toBe('done');
  });

  it('detects "done" from Portuguese', () => {
    expect(detectIntent('acabou')).toBe('done');
  });

  it('detects "arrived" intent', () => {
    expect(detectIntent('chegamos')).toBe('arrived');
    expect(detectIntent('we arrived')).toBe('arrived');
  });

  it('detects "issue" intent', () => {
    expect(detectIntent('problema')).toBe('issue');
    expect(detectIntent('there is a problem')).toBe('issue');
  });

  it('returns null for unknown messages', () => {
    expect(detectIntent('what time is the game')).toBeNull();
  });
});
