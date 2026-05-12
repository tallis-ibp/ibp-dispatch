/**
 * Run once to register the Telegram webhook:
 *   npm run setup:webhook -- https://your-domain.com
 *
 * Or for local dev with ngrok:
 *   npm run setup:webhook -- https://xxxx.ngrok.io
 */

import { setWebhook, getMe } from "../telegram/bot.mjs";

const publicUrl = process.argv[2];
if (!publicUrl) {
  console.error("Usage: node src/scripts/setupWebhook.mjs https://your-domain.com");
  process.exit(1);
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const webhookUrl = `${publicUrl.replace(/\/$/, "")}/webhook/telegram`;

console.log("Registering Telegram webhook:", webhookUrl);

try {
  const me = await getMe();
  console.log("Bot:", me.result?.username, `(@${me.result?.username})`);

  const result = await setWebhook(webhookUrl, secret);
  console.log("Webhook set:", result.description ?? JSON.stringify(result));
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
}
