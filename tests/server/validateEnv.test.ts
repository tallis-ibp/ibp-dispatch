import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../../src/server/validateEnv.js';

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_SCHEDULER_CHAT_ID',
  'MONDAY_API_KEY', 'ANTHROPIC_API_KEY', 'JWT_SECRET', 'PUBLIC_URL', 'DATABASE_URL'
];

describe('validateEnv', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    REQUIRED.forEach((k) => {
      saved[k] = process.env[k];
      process.env[k] = 'test-value';
    });
  });

  afterEach(() => {
    REQUIRED.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it('passes when all required vars are set', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws listing missing vars', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.MONDAY_API_KEY;
    expect(() => validateEnv()).toThrow('TELEGRAM_BOT_TOKEN, MONDAY_API_KEY');
  });
});
