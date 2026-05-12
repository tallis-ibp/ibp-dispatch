# IBP Dispatch — Deployment Guide (Railway)

This guide is for whoever is deploying this project. Lucas will send you the actual secret values separately.

---

## 1. Clone the repo

```bash
git clone https://github.com/lucasaguiarps91/schedule-logistics.git
cd schedule-logistics
```

---

## 2. Deploy on Railway

1. Go to **https://railway.app** and log in
2. Click **New Project → Deploy from GitHub repo**
3. Select `lucasaguiarps91/schedule-logistics`
4. Railway will detect it's a Node.js app automatically

---

## 3. Add a Persistent Volume (critical — data must survive restarts)

1. In Railway, open the service → **Settings → Volumes**
2. Add a volume mounted at: `/app/data`
3. This stores briefs, logistics plans, flags, and crew group config

---

## 4. Set Environment Variables

In Railway → **Variables**, add each of these (Lucas will send you the real values):

| Variable | What it is |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | `ibp_dispatch_2026` (use this exactly) |
| `MONDAY_API_KEY` | Monday.com API key |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI chat assistant) |
| `SCHEDULE_SHEET_ID` | Google Sheet ID for the schedule |
| `SCHEDULE_YEAR` | `2026` |
| `PORT` | `3002` |

---

## 5. Set the Start Command

In Railway → **Settings → Deploy**, set the start command to:

```
node src/server/index.mjs
```

---

## 6. Register the Telegram Webhook (one-time, after deploy)

Once the app is live and Railway gives you a URL (e.g. `https://ibp-dispatch.up.railway.app`), run this **once** from your local machine:

```bash
node --env-file=.env src/scripts/setupWebhook.mjs https://ibp-dispatch.up.railway.app
```

This tells Telegram where to send messages. You only need to do this once (or if the URL changes).

---

## 7. Verify it's working

- Open `https://your-railway-url.up.railway.app/dashboard` — the dashboard should load
- Send `/myid` in any of the Telegram crew groups — the bot should reply with the chat ID
- Check Railway logs for `[poller]` or `[webhook]` messages

---

## Notes

- **Never commit the `.env` file** — it contains secrets
- The `data/` folder on the Volume persists between deploys — don't wipe it
- If Telegram stops responding, re-run the `setupWebhook.mjs` script with the current Railway URL
