const REQUIRED_ENV_VARS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_SCHEDULER_CHAT_ID',
  'MONDAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'JWT_SECRET',
  'PUBLIC_URL',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Server cannot start. Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env and fill in all values.`
    );
  }
}
