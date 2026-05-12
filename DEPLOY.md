# IBP Dispatch — Deployment Guide (Railway)

This guide is for deploying the TypeScript build of the IBP Crew Dispatch System on Railway.

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
3. This stores the SQLite database (`ibp.db`) and all schedule caches

---

## 4. Set Environment Variables

In Railway → **Variables**, add each of these:

| Variable | Required | What it is |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `TELEGRAM_SCHEDULER_CHAT_ID` | ✅ | Scheduler's personal Telegram chat ID |
| `MONDAY_API_KEY` | ✅ | Monday.com API key |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key (Claude scheduling agent) |
| `JWT_SECRET` | ✅ | Random 40+ character string (keep secret) |
| `PUBLIC_URL` | ✅ | e.g. `https://ibp-dispatch.up.railway.app` |
| `TELEGRAM_WEBHOOK_SECRET` | recommended | Random string for webhook validation |
| `MONDAY_BOARD_ID` | optional | Default: `2214820863` |
| `SCHEDULE_SHEET_ID` | optional | Google Sheet ID for the schedule |
| `PORT` | optional | Default: `3002` |
| `NODE_ENV` | optional | Set to `production` |

**The server will refuse to start if any required variable is missing.** Check Railway logs if it won't boot.

---

## 5. Set the Start Command

In Railway → **Settings → Deploy**, set the start command to:

```
npm run build && npm start
```

This compiles TypeScript to `dist/` then runs the compiled server.

---

## 6. Register the Telegram Webhook (one-time, after deploy)

Once the app is live and Railway gives you a URL, run this **once** from your local machine:

```bash
PUBLIC_URL=https://ibp-dispatch.up.railway.app \
TELEGRAM_BOT_TOKEN=<your_token> \
TELEGRAM_WEBHOOK_SECRET=<your_secret> \
npm run setup:webhook
```

Expected output:
```
✅ Webhook registered: https://ibp-dispatch.up.railway.app/webhook/telegram
   Pending updates: 0
```

---

## 7. End-to-End Smoke Test

After deploy, verify the full flow:

- [ ] Open `https://<your-domain>` → login screen appears
- [ ] Tap "Login via Telegram" → bot sends a secure link → tap it → dashboard loads
- [ ] `POST /api/generate` with `{ "date": "YYYY-MM-DD" }` → brief generated
- [ ] `POST /api/proposals` with `{ "date": "YYYY-MM-DD" }` → AI proposals appear in dashboard
- [ ] Approve a proposal in dashboard → crew Telegram group receives dispatch with ✅/⚠️ buttons
- [ ] Tap ✅ Job Done in crew group → Monday.com item gets an update
- [ ] Generate a viewer link from Settings → open on phone → read-only dashboard, no edit controls

---

## 8. Daily Cron Schedule (automatic)

| Time | Action |
|---|---|
| 5:00 AM | Fetch Google Sheet schedule |
| 5:30 AM | Sync Monday.com jobs to SQLite |
| 6:00 AM | Generate AI proposals + send Telegram summary to scheduler |
| Every 30 min | Monday.com incremental sync |

---

## Notes

- **Never commit the `.env` file** — it contains secrets
- The `data/` folder on the Volume persists between deploys — don't wipe it
- SQLite database lives at `/app/data/ibp.db` (or `DB_PATH` env var)
- If Telegram webhook stops working, re-run `npm run setup:webhook` with current Railway URL
- For local development: omit `PUBLIC_URL` → bot runs in long-polling mode automatically
