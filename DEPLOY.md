# IBP Dispatch — Deployment Guide (Vercel + Supabase)

## 1. Supabase Setup

1. Go to https://supabase.com → **New Project**
2. Once created, go to **Settings → Database → Connection Pooling**
3. Copy the **Transaction mode** connection string (port 6543):
   ```
   postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
   ```
4. In the **SQL Editor**, paste and run the schema from `src/db/schema.ts`
   (copy the string inside the `SCHEMA` export, remove the surrounding backticks)

---

## 2. Vercel Setup

1. Go to https://vercel.com → **Add New Project → Import Git Repository**
2. Select this repo
3. Framework preset: **Other**
4. Build command: `npm run build`
5. Output directory: leave blank

---

## 3. Environment Variables

In **Vercel → Project Settings → Environment Variables**, add:

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | ✅ | Supabase pooler URL (port 6543, transaction mode) |
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `TELEGRAM_SCHEDULER_CHAT_ID` | ✅ | Your personal Telegram chat ID |
| `MONDAY_API_KEY` | ✅ | Monday.com API key |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API key |
| `JWT_SECRET` | ✅ | Random 40+ character string (keep secret) |
| `PUBLIC_URL` | ✅ | Your Vercel URL e.g. `https://ibp-dispatch.vercel.app` |
| `TELEGRAM_WEBHOOK_SECRET` | recommended | Random string for webhook validation |
| `CRON_SECRET` | recommended | Random string to authenticate cron calls |
| `MONDAY_BOARD_ID` | optional | Default: `2214820863` |
| `SCHEDULE_SHEET_ID` | optional | Google Sheet ID for the schedule |
| `NODE_ENV` | optional | Set to `production` |

---

## 4. Deploy

```bash
git push
```

Vercel automatically builds and deploys on every push to `main`.

---

## 5. Register Telegram Webhook (one-time, after first deploy)

Run once from your local machine after the app is live:

```bash
PUBLIC_URL=https://your-app.vercel.app \
TELEGRAM_BOT_TOKEN=<your_token> \
TELEGRAM_WEBHOOK_SECRET=<your_secret> \
npm run setup:webhook
```

Expected output:
```
✅ Webhook registered: https://your-app.vercel.app/webhook/telegram
   Pending updates: 0
```

---

## 6. Cron Jobs

Vercel Cron requires **Pro plan**. If you are on the Hobby plan, use https://cron-job.org instead:

| URL | Schedule | Description |
|---|---|---|
| `https://your-app.vercel.app/api/cron/fetch-schedule` | `0 5 * * *` | 5:00 AM — Fetch Google Sheet |
| `https://your-app.vercel.app/api/cron/sync-monday` | `30 5 * * *` | 5:30 AM — Sync Monday.com |
| `https://your-app.vercel.app/api/cron/morning` | `0 6 * * *` | 6:00 AM — AI proposals + summary |
| `https://your-app.vercel.app/api/cron/sync-monday` | `*/30 * * * *` | Every 30 min — Monday sync |

Set the `Authorization: Bearer <CRON_SECRET>` header on all cron requests.

---

## 7. Local Development

```bash
cp .env.example .env
# Fill in DATABASE_URL with your Supabase direct connection URL
# (Settings → Database → Connection String → URI — port 5432, NOT the pooler)
npm run dev
```

The server starts on port 3002 by default. The `setInterval` cron in `src/server/index.ts` handles scheduled jobs automatically in local mode.

---

## 8. Smoke Test

- [ ] Open your Vercel URL → login screen appears
- [ ] Tap "Login via Telegram" → bot sends a magic link → tap it → dashboard loads
- [ ] `POST /api/generate` with `{ "date": "YYYY-MM-DD" }` → brief generated
- [ ] `POST /api/proposals` with `{ "date": "YYYY-MM-DD" }` → AI proposals appear in dashboard
- [ ] Approve a proposal → crew Telegram group receives dispatch with ✅/⚠️ buttons
- [ ] Tap ✅ Job Done in crew group → Monday.com item gets an update
- [ ] Generate a viewer link → open on phone → read-only dashboard, no edit controls
