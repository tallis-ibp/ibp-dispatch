import { describe, it, expect } from 'vitest';
import { normalizeAssignment, extractJobNumbers, classifyStatus } from '../../src/core/scheduleParser.js';

describe('normalizeAssignment', () => {
  it('trims whitespace', () => {
    expect(normalizeAssignment('  DECK INSTALL  ')).toBe('DECK INSTALL');
  });

  it('returns empty string for blank cell', () => {
    expect(normalizeAssignment('')).toBe('');
    expect(normalizeAssignment('   ')).toBe('');
  });
});

describe('extractJobNumbers', () => {
  it('extracts 6-digit job numbers', () => {
    expect(extractJobNumbers('GILROY #600049 - DECK')).toEqual(['600049']);
  });

  it('extracts multiple job numbers', () => {
    expect(extractJobNumbers('#170859 / #170810')).toEqual(['170859', '170810']);
  });

  it('returns empty array when none found', () => {
    expect(extractJobNumbers('OFF')).toEqual([]);
  });
});

describe('classifyStatus', () => {
  it('classifies blank as blank', () => {
    expect(classifyStatus('')).toBe('blank');
  });

  it('classifies OFF as off', () => {
    expect(classifyStatus('OFF')).toBe('off');
    expect(classifyStatus('off')).toBe('off');
  });

  it('classifies filled cell as assigned', () => {
    expect(classifyStatus('GILROY #600049 - DECK')).toBe('assigned');
  });
});
