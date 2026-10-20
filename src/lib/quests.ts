// Daily and weekly quests, worked out from the trader's own history.

import type { Account } from './engine';

export interface Quest {
  id: string;
  title: string;
  detail: string;
  reward: number;
  period: 'daily' | 'weekly';
  progress: number;
  goal: number;
  /** Formats progress for display (for example as dollars). */
  unit?: 'usd';
}

export interface QuestState extends Quest {
  done: boolean;
  claimed: boolean;
  periodKey: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** UTC day key, e.g. 2026-10-20. */
export function dayKey(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Key for the UTC week starting Monday. */
export function weekKey(now: number) {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return dayKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

export function nextReset(now: number, period: 'daily' | 'weekly') {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (period === 'daily') return start + DAY;
  const day = (d.getUTCDay() + 6) % 7;
  return start + (7 - day) * DAY;
}

function longestWinStreak(pnls: number[]) {
  let best = 0;
  let cur = 0;
  for (const p of pnls) {
    cur = p > 0 ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export function quests(acct: Account, now: number): QuestState[] {
  const dayStart = Date.parse(`${dayKey(now)}T00:00:00Z`);
  const weekStart = Date.parse(`${weekKey(now)}T00:00:00Z`);
  // Every position opened in a period, closed or still open.
  const opens = [
    ...acct.history.map((t) => ({ at: t.openedAt ?? t.closedAt, market: t.market, size: t.size, leverage: t.leverage })),
    ...acct.positions.map((p) => ({ at: p.openedAt, market: p.market, size: p.size, leverage: p.leverage })),
  ];
  const today = opens.filter((o) => o.at >= dayStart);
  const week = opens.filter((o) => o.at >= weekStart);
  const closedWeek = acct.history.filter((t) => t.closedAt >= weekStart);
  const tpToday = acct.history.filter((t) => t.reason === 'tp' && t.closedAt >= dayStart).length;
  const tpWeek = closedWeek.filter((t) => t.reason === 'tp').length;
  const sharesToday = (acct.shares ?? []).filter((t) => t >= dayStart).length;

  const list: Quest[] = [
    { id: 'd-trades', period: 'daily', title: 'Warm up', detail: 'Open 3 trades today', reward: 300, progress: today.length, goal: 3 },
    { id: 'd-tp', period: 'daily', title: 'Bag secured', detail: 'Hit a take profit today', reward: 500, progress: tpToday, goal: 1 },
    { id: 'd-markets', period: 'daily', title: 'Tourist', detail: 'Trade 3 different markets today', reward: 400, progress: new Set(today.map((o) => o.market)).size, goal: 3 },
    { id: 'd-100x', period: 'daily', title: 'Send it', detail: 'Open a trade at 100x or more', reward: 200, progress: today.some((o) => o.leverage >= 100) ? 1 : 0, goal: 1 },
    { id: 'd-volume', period: 'daily', title: 'Volume day', detail: 'Trade $50K of volume today', reward: 600, progress: today.reduce((s, o) => s + o.size, 0), goal: 50_000, unit: 'usd' },
    { id: 'd-share', period: 'daily', title: 'Show off', detail: 'Share a PnL card', reward: 150, progress: sharesToday, goal: 1 },
    { id: 'w-streak', period: 'weekly', title: 'Hot hand', detail: 'Win 3 trades in a row this week', reward: 1_500, progress: longestWinStreak([...closedWeek].reverse().map((t) => t.pnl)), goal: 3 },
    { id: 'w-tp', period: 'weekly', title: 'Sniper', detail: 'Hit 5 take profits this week', reward: 2_000, progress: tpWeek, goal: 5 },
    { id: 'w-volume', period: 'weekly', title: 'Whale week', detail: 'Trade $1M of volume this week', reward: 3_000, progress: week.reduce((s, o) => s + o.size, 0), goal: 1_000_000, unit: 'usd' },
  ];

  return list.map((q) => {
    const periodKey = q.period === 'daily' ? dayKey(now) : weekKey(now);
    return { ...q, done: q.progress >= q.goal, claimed: acct.questClaims?.[q.id] === periodKey, periodKey };
  });
}

const LEVELS = [
  { name: 'Paper hands', xp: 0 },
  { name: 'Rookie', xp: 10 },
  { name: 'Degen', xp: 100 },
  { name: 'Leverage lord', xp: 1_000 },
  { name: 'Whale', xp: 10_000 },
  { name: 'Moon boy', xp: 100_000 },
];

/** Level from lifetime volume: 1 XP per $1,000 traded. */
export function level(acct: Account) {
  const xp = Math.floor(acct.volume / 1000);
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
  const next = LEVELS[i + 1];
  return {
    index: i + 1,
    name: LEVELS[i].name,
    xp,
    next: next?.name ?? null,
    progress: next ? (xp - LEVELS[i].xp) / (next.xp - LEVELS[i].xp) : 1,
    toNext: next ? next.xp - xp : 0,
  };
}
