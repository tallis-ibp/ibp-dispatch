import { Bot } from 'grammy';
import { handleCallbackQuery, handleTextMessage } from './messageHandler.js';

let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
    botInstance = new Bot(token);

    const publicUrl = process.env.PUBLIC_URL;
    const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;

    botInstance.command('start', async (ctx) => {
      const payload = ctx.match;
      if (!payload?.startsWith('login_')) {
        await ctx.reply('IBP Dispatch bot active. To log in to the dashboard, open the website and click "Open Telegram Bot".');
        return;
      }

      const nonce = payload.slice(6);
      if (!schedulerChatId) {
        await ctx.reply('Login is not configured. Contact the administrator.');
        return;
      }
      if (String(ctx.chat.id) !== schedulerChatId) {
        await ctx.reply('This login link is not for you.');
        return;
      }
      const loginUrl = `${publicUrl}/api/auth/exchange?nonce=${nonce}`;
      await ctx.reply('Tap the button below to log in. This link expires in 10 minutes.', {
        reply_markup: {
          inline_keyboard: [[{ text: 'Log In to Dashboard', url: loginUrl }]],
        },
      });
    });

    botInstance.on('callback_query', handleCallbackQuery);
    botInstance.on('message', handleTextMessage);

    botInstance.catch((err) => {
      console.error('[grammy] Unhandled error:', err);
    });
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
