import { Bot } from 'grammy';
import { validateNonce } from '../server/routes/auth.js';

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

  bot.command('start', async (ctx) => {
    const payload = ctx.match;
    if (payload?.startsWith('login_')) {
      const nonce = payload.slice(6);
      const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;
      if (String(ctx.chat.id) !== schedulerChatId) {
        await ctx.reply('This login link is not for you.');
        return;
      }
      const loginUrl = `${publicUrl}/api/auth/exchange?nonce=${nonce}`;
      await ctx.reply(
        `Tap the button below to log in. This link expires in 10 minutes.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🔐 Log In to Dashboard', url: loginUrl }]],
          },
        }
      );
    }
  });

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
