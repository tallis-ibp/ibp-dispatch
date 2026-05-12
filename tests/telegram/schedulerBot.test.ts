import { describe, it, expect } from 'vitest';
import { buildMorningSummary } from '../../src/telegram/schedulerBot.js';

describe('buildMorningSummary', () => {
  it('includes all crew assignments', () => {
    const text = buildMorningSummary('Tuesday, May 13', [
      { crewKey: 'santiago', jobName: 'Gilroy #600049', jobType: 'Deck', confidence: 'high' },
      { crewKey: 'toby', jobName: 'Favilla #280608', jobType: 'Coping', confidence: 'high' },
    ], 0);
    expect(text).toContain('SANTIAGO');
    expect(text).toContain('Gilroy #600049');
    expect(text).toContain('TOBY');
  });

  it('includes flag count when flags exist', () => {
    const text = buildMorningSummary('Tuesday, May 13', [], 3);
    expect(text).toContain('3');
    expect(text).toContain('flag');
  });

  it('omits flag line when no flags', () => {
    const text = buildMorningSummary('Tuesday, May 13', [], 0);
    expect(text).not.toContain('flag');
  });
});
