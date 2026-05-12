/**
 * src/telegram/poller.mjs
 * Long-polling fallback — used when no public URL is available for a webhook.
 * Polls getUpdates every 2 seconds and dispatches to the same handleUpdate logic.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const BASE   = `https://api.telegram.org/bot${TOKEN}`;

let _offset  = 0;
let _running = false;
let _handler = null;

export function startPolling(handleUpdate) {
  if (_running) return;
  if (!TOKEN) { console.warn("[poller] TELEGRAM_BOT_TOKEN not set — polling disabled"); return; }
  _handler = handleUpdate;
  _running = true;
  console.log("[poller] Long-polling started — bot is live");
  poll();
}

export function stopPolling() {
  _running = false;
}

async function poll() {
  if (!_running) return;
  try {
    const res  = await fetch(`${BASE}/getUpdates?offset=${_offset}&timeout=20&allowed_updates=["message"]`);
    const data = await res.json();
    if (data.ok && data.result?.length) {
      for (const update of data.result) {
        _offset = update.update_id + 1;
        try {
          await _handler(update);
        } catch (err) {
          console.error("[poller] Handler error:", err.message);
        }
      }
    }
  } catch (err) {
    console.warn("[poller] Poll error:", err.message);
  }
  // Schedule next poll
  if (_running) setTimeout(poll, _running ? 500 : 2000);
}
