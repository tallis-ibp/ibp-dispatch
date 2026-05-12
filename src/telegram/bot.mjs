/**
 * src/telegram/bot.mjs
 * Thin wrapper around the Telegram Bot API using native fetch (Node 18+).
 * No third-party library needed.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const BASE   = `https://api.telegram.org/bot${TOKEN}`;

export async function sendMessage(chatId, text, options = {}) {
  return telegramCall("sendMessage", {
    chat_id:    chatId,
    text,
    parse_mode: "Markdown",
    ...options,
  });
}

export async function sendPhoto(chatId, photoUrlOrBuffer, caption = "") {
  // If it's a local Buffer, use multipart upload
  if (Buffer.isBuffer(photoUrlOrBuffer)) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", caption);
    form.append("photo", new Blob([photoUrlOrBuffer], { type: "image/jpeg" }), "photo.jpg");
    const res = await fetch(`${BASE}/sendPhoto`, { method: "POST", body: form });
    return res.json();
  }
  // URL
  return telegramCall("sendPhoto", { chat_id: chatId, photo: photoUrlOrBuffer, caption });
}

export async function getFileUrl(fileId) {
  const data = await telegramCall("getFile", { file_id: fileId });
  const filePath = data?.result?.file_path;
  if (!filePath) throw new Error(`getFile failed for ${fileId}`);
  return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
}

export async function downloadFile(fileId) {
  const url = await getFileUrl(fileId);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function setWebhook(webhookUrl, secret) {
  return telegramCall("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
  });
}

export async function deleteWebhook() {
  return telegramCall("deleteWebhook", {});
}

export async function getMe() {
  return telegramCall("getMe", {});
}

async function telegramCall(method, params) {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`${BASE}/${method}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} error: ${data.description ?? JSON.stringify(data)}`);
  }
  return data;
}
