import { Bot } from 'grammy';
import { handleCallbackQuery, handleTextMessage } from './messageHandler.js';
import { handlePhotoMessage } from './photoHandler.js';
import { recordChatActivity, markChatLeft } from './chatRegistry.js';
import { getSql } from '../db/client.js';

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

    botInstance.command('myid', async (ctx) => {
      await ctx.reply(
        `Chat ID: \`${ctx.chat.id}\`\n\nPaste this into the Crews tab on the IBP dashboard to connect this group.`,
        { parse_mode: 'Markdown' },
      );
    });

    // 1.6 — admin test commands (scheduler only)
    botInstance.command('test', async (ctx) => {
      if (!schedulerChatId || String(ctx.chat.id) !== schedulerChatId) {
        await ctx.reply('Not available.');
        return;
      }
      const args = (ctx.match ?? '').trim();

      if (args === 'ping') {
        const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
        const env = process.env.NODE_ENV ?? 'development';
        await ctx.reply(`pong\nenv: ${env}\ncommit: ${sha}`);
        return;
      }

      if (args === 'brief') {
        const today = new Date().toISOString().slice(0, 10);
        try {
          const { generateBriefs } = await import('../core/generateBriefs.js');
          await generateBriefs(today);
          const sql = getSql();
          const [{ n }] = await sql<[{ n: string }]>`SELECT COUNT(*) AS n FROM brief_jobs WHERE brief_date = ${today}`;
          await ctx.reply(`Brief generated — ${n} brief_jobs for ${today}`);
        } catch (err) {
          await ctx.reply(`Brief generation failed: ${String(err)}`);
        }
        return;
      }

      if (args === 'webhook') {
        try {
          const info = await ctx.api.getWebhookInfo();
          await ctx.reply(`Webhook: ${info.url || '(not set)'}\nPending updates: ${info.pending_update_count}`);
        } catch (err) {
          await ctx.reply(`Webhook info failed: ${String(err)}`);
        }
        return;
      }

      await ctx.reply('Unknown command. Try: /test ping · /test brief · /test webhook');
    });

    // Auto-register every chat the bot is added to, kicked from, or messaged in
    botInstance.on('my_chat_member', async (ctx) => {
      const update = ctx.myChatMember;
      const chat = update.chat;
      const newStatus = update.new_chat_member.status;
      const chatTitle = 'title' in chat ? chat.title : null;
      try {
        if (newStatus === 'left' || newStatus === 'kicked') {
          await markChatLeft(String(chat.id), newStatus);
          return;
        }
        // Bot was added to a group or its membership upgraded
        const isNew = await recordChatActivity(String(chat.id), chat.type, chatTitle ?? null);
        if (isNew && (chat.type === 'group' || chat.type === 'supergroup')) {
          // Minimal welcome message — operational, no technical IDs leak to crew leaders
          await ctx.api.sendMessage(chat.id,
            '✅ IBP Dispatch is active in this group. Job briefs from the office will arrive here.');
        }
      } catch (err) {
        console.error('[my_chat_member] failed:', err);
      }
    });

    // Wrap message handlers so we always record activity, even if the handler errors
    const withActivity = (
      fn: (ctx: import('grammy').Context) => Promise<void>,
    ) => async (ctx: import('grammy').Context) => {
      const chat = ctx.chat;
      if (chat) {
        const chatTitle = 'title' in chat ? chat.title : null;
        recordChatActivity(String(chat.id), chat.type, chatTitle ?? null)
          .catch((e) => console.warn('[recordChatActivity]', e));
      }
      await fn(ctx);
    };

    // 1.4 — photo handler registered before generic message handler to avoid double-handling
    botInstance.on('message:photo', withActivity(handlePhotoMessage));
    botInstance.on('callback_query', withActivity(handleCallbackQuery));
    botInstance.on('message', withActivity(handleTextMessage));

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
    // Telegram default does NOT send my_chat_member events. Must opt in
    // explicitly via allowed_updates so the bot auto-registers groups it's
    // added to.
    await bot.api.setWebhook(`${publicUrl}/webhook/telegram`, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
      allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
    });
    console.log(`[telegram] Webhook set: ${publicUrl}/webhook/telegram (with my_chat_member)`);
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
