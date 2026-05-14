import { getBot } from './grammy.js';
import { getSql } from '../db/client.js';
import { dispatchBriefToCrews } from './dispatcher.js';

interface ProposalSummary {
  crewKey: string;
  jobName: string;
  jobType: string;
  confidence: 'high' | 'medium' | 'low';
}

export function buildMorningSummary(
  dateLabel: string,
  proposals: ProposalSummary[],
  flagCount: number
): string {
  const lines = [
    `📋 *Schedule Ready — ${dateLabel}*`,
    '',
    ...proposals.map((p) => {
      const badge = p.confidence === 'low' ? ' ⚠️' : '';
      return `${p.crewKey.toUpperCase()} → ${p.jobName} (${p.jobType})${badge}`;
    }),
  ];

  if (flagCount > 0) {
    lines.push('', `⚠️ ${flagCount} flag${flagCount === 1 ? '' : 's'} need attention`);
  }

  lines.push('', 'Tap a button below to approve, hold, or open the dashboard.');
  return lines.join('\n');
}

export function buildApprovalKeyboard(date: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve & Send', callback_data: `schedule_approve:${date}` },
        { text: '✏️ Open Dashboard', callback_data: `schedule_dashboard:${date}` },
      ],
      [{ text: '🚫 Hold', callback_data: `schedule_hold:${date}` }],
    ],
  };
}

export async function sendMorningSummary(date: string): Promise<void> {
  const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;
  if (!schedulerChatId) throw new Error('TELEGRAM_SCHEDULER_CHAT_ID not set');

  const bot = getBot();
  const sql = getSql();

  const proposals = await sql<{ crew_key: string; job_name: string | null; confidence: string }[]>`
    SELECT crew_key, job_name, confidence FROM schedule_proposals
    WHERE date = ${date} AND status = 'pending'
  `;

  const [{ c }] = await sql<[{ c: string }]>`
    SELECT COUNT(*) AS c FROM flags WHERE date = ${date} AND resolved = 0
  `;
  const flagCount = parseInt(c, 10);

  const dateLabel = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const text = buildMorningSummary(
    dateLabel,
    proposals.map((p) => ({
      crewKey: p.crew_key,
      jobName: p.job_name ?? 'TBD',
      jobType: 'Job',
      confidence: p.confidence as 'high' | 'medium' | 'low',
    })),
    flagCount
  );

  await bot.api.sendMessage(schedulerChatId, text, {
    parse_mode: 'Markdown',
    reply_markup: buildApprovalKeyboard(date),
  });
}

export async function handleSchedulerCallback(callbackData: string, date: string): Promise<void> {
  const sql = getSql();
  const bot = getBot();
  const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID!;

  if (callbackData.startsWith('schedule_approve:')) {
    await sql`UPDATE schedule_proposals SET status = 'approved' WHERE date = ${date}`;
    await sql`UPDATE briefs SET approved = 1, approved_at = ${new Date().toISOString()}, approved_by = 'telegram' WHERE date = ${date}`;
    await sql`UPDATE brief_jobs SET approved = 1 WHERE brief_date = ${date}`;
    await dispatchBriefToCrews(date);
    await bot.api.sendMessage(schedulerChatId, '✅ Schedule approved and dispatched to all crews.');
  }

  if (callbackData.startsWith('schedule_hold:')) {
    await bot.api.sendMessage(schedulerChatId, "🚫 Schedule held. Tap Regenerate when ready, or it will retry on the next morning cron.");
  }

  if (callbackData.startsWith('schedule_dashboard:')) {
    const publicUrl = process.env.PUBLIC_URL;
    await bot.api.sendMessage(schedulerChatId, `Open the dashboard to review:\n${publicUrl}/proposals?date=${date}`);
  }
}
