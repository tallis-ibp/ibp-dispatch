import { Bot } from 'grammy';

let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
    botInstance = new Bot(token);
  }
  return botInstance;
}

export async function startBot(): Promise<void> {
  const bot = getBot();
  const publicUrl = process.env.PUBLIC_URL;

  if (publicUrl) {
    await bot.api.setWebhook(`${publicUrl}/webhook/telegram`, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    });
    console.log(`[telegram] Webhook set: ${publicUrl}/webhook/telegram`);
  } else {
    void bot.start({ onStart: () => console.log('[telegram] Long-polling started') });
    console.log('[telegram] Running in polling mode (no PUBLIC_URL set)');
  }
}

export async function stopBot(): Promise<void> {
  if (botInstance) {
    await botInstance.stop();
    botInstance = null;
  }
}
