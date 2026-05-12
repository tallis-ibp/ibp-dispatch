import { getBot } from '../telegram/grammy.js';

async function setup(): Promise<void> {
  const publicUrl = process.env.PUBLIC_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!publicUrl) {
    console.error('PUBLIC_URL not set. Cannot register webhook.');
    process.exit(1);
  }

  const bot = getBot();
  const webhookUrl = `${publicUrl}/webhook/telegram`;

  await bot.api.setWebhook(webhookUrl, {
    secret_token: secret ?? '',
    allowed_updates: ['message', 'callback_query'],
  });

  const info = await bot.api.getWebhookInfo();
  console.log('✅ Webhook registered:', info.url);
  console.log('   Pending updates:', info.pending_update_count);
}

setup().catch((err: unknown) => {
  console.error('Webhook setup failed:', err);
  process.exit(1);
});
