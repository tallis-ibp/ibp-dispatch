import { createServer } from 'http';
import { validateEnv } from './validateEnv.js';
import { runMigrations } from '../db/migrations.js';
import { seedCrews } from '../db/seedCrews.js';
import { startBot, getBot } from '../telegram/grammy.js';
import { handleCallbackQuery, handleTextMessage } from '../telegram/messageHandler.js';
import { sendMorningSummary } from '../telegram/schedulerBot.js';
import { refreshMonday } from '../monday/refreshMonday.js';
import { fetchSchedule } from '../core/fetchSchedule.js';
import { generateProposals } from '../agents/schedulingAgent.js';
import { requestHandler } from './handler.js';

const PORT = parseInt(process.env.PORT ?? '3002');

function scheduleDailyJobs(): void {
  setInterval(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);

    (async () => {
      try {
        if (hhmm === '05:00') await fetchSchedule();
        if (hhmm === '05:30') await refreshMonday();
        if (hhmm === '06:00') {
          await generateProposals(today);
          await sendMorningSummary(today);
        }
      } catch (err) {
        console.error('[cron] Morning routine error:', err);
      }
    })();
  }, 60_000);

  setInterval(() => {
    refreshMonday().catch((err: unknown) => console.error('[cron] refreshMonday error:', err));
  }, 30 * 60_000);
}

async function main(): Promise<void> {
  validateEnv();
  await runMigrations();
  await seedCrews();

  const bot = getBot();
  bot.on('callback_query', handleCallbackQuery);
  bot.on('message', handleTextMessage);

  await startBot();
  scheduleDailyJobs();

  const server = createServer(requestHandler);
  server.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
    console.log(`[server] Dashboard: http://localhost:${PORT}`);
  });
}

main().catch((err: unknown) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
