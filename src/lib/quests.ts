// Daily and weekly quests, counted from real USDC trades in the Nitro pool (Live mode).

import type { LedgerItem } from './pool';

export interface LiveFill {
  at: number;
  market: string;
  usd: number;
  /** Realized PnL when the fill closed a position, else 0. */
  pnl: number;
}

export interface LiveOpen {
  at: number;
  market: string;
  usd: number;
  leverage: number;
}

/** Opens and closes from the user's on-chain history, as quest activity. */
export function activityFromLedger(ledger: LedgerItem[]): { fills: LiveFill[]; opens: LiveOpen[] } {
  const fills: LiveFill[] = [];
  const opens: LiveOpen[] = [];
  const wagers = new Map<number | null, number>();
  for (const e of ledger) if (e.kind === 'open') wagers.set(e.positionId, e.amount);
  for (const e of ledger) {
    if (!e.market || !e.leverage) continue;
    if (e.kind === 'open') {
      const usd = e.amount * e.leverage;
      opens.push({ at: e.at, market: e.market, usd, leverage: e.leverage });
      fills.push({ at: e.at, market: e.market, usd, pnl: 0 });
    } else if (e.kind === 'close') {
      const wager = wagers.get(e.positionId) ?? e.amount - e.pnl + e.fee;
      const pnl = e.pnl > 0 ? e.pnl - e.fee : e.pnl;
      fills.push({ at: e.at, market: e.market, usd: wager * e.leverage, pnl: pnl === 0 ? -1e-9 : pnl });
    }
  }
  return { fills, opens };
}

export interface QuestInput {
  /** Real opens and closes from the pool. */
  fills: LiveFill[];
  /** Opened positions, with the leverage used. */
  opens: LiveOpen[];
  /** Times the trader shared a PnL card. */
  shares: number[];
  claims: Record<string, string>;
}

export interface QuestState {
  id: string;
  title: string;
  detail: string;
  reward: number;
  period: 'daily' | 'weekly';
  progress: number;
  goal: number;
  unit?: 'usd';
  done: boolean;
  claimed: boolean;
  periodKey: string;
}

const DAY = 24 * 60 * 60 * 1000;
/** Claims for real-money quests are stored under this prefix. */
export const QUEST_PREFIX = 'live:';

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
  return start + (7 - ((d.getUTCDay() + 6) % 7)) * DAY;
}

/** Closing fills of one order arrive as several fills; merge those within 3s on the same market into one closed trade. */
export function closedTrades(fills: LiveFill[]): Array<{ at: number; market: string; pnl: number }> {
  const closes = fills.filter((f) => f.pnl !== 0).sort((a, b) => a.at - b.at);
  const out: Array<{ at: number; market: string; pnl: number }> = [];
  for (const f of closes) {
    const last = out[out.length - 1];
    if (last && last.market === f.market && f.at - last.at <= 3000) last.pnl += f.pnl;
    else out.push({ at: f.at, market: f.market, pnl: f.pnl });
  }
  return out;
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

export function quests(input: QuestInput, now: number): QuestState[] {
  const dayStart = Date.parse(`${dayKey(now)}T00:00:00Z`);
  const weekStart = Date.parse(`${weekKey(now)}T00:00:00Z`);
  const fillsToday = input.fills.filter((f) => f.at >= dayStart);
  const fillsWeek = input.fills.filter((f) => f.at >= weekStart);
  const opensToday = input.opens.filter((o) => o.at >= dayStart);
  const closes = closedTrades(input.fills);
  const winsToday = closes.filter((c) => c.at >= dayStart && c.pnl > 0).length;
  const closesWeek = closes.filter((c) => c.at >= weekStart);
  const sum = (fs: LiveFill[]) => fs.reduce((s, f) => s + f.usd, 0);

  const list: Array<Omit<QuestState, 'done' | 'claimed' | 'periodKey'>> = [
    { id: 'd-trades', period: 'daily', title: 'Warm up', detail: 'Open 3 trades today', reward: 300, progress: opensToday.length, goal: 3 },
    { id: 'd-win', period: 'daily', title: 'Bag secured', detail: 'Close a winning trade today', reward: 500, progress: winsToday, goal: 1 },
    { id: 'd-markets', period: 'daily', title: 'Tourist', detail: 'Trade 2 different markets today', reward: 400, progress: new Set(fillsToday.map((f) => f.market)).size, goal: 2 },
    { id: 'd-lev', period: 'daily', title: 'Send it', detail: 'Open a trade at 10x or more', reward: 200, progress: opensToday.some((o) => o.leverage >= 10) ? 1 : 0, goal: 1 },
    { id: 'd-volume', period: 'daily', title: 'Volume day', detail: 'Trade $1,000 of volume today', reward: 600, progress: sum(fillsToday), goal: 1_000, unit: 'usd' },
    { id: 'd-share', period: 'daily', title: 'Show off', detail: 'Share a PnL card', reward: 150, progress: input.shares.filter((t) => t >= dayStart).length, goal: 1 },
    { id: 'w-streak', period: 'weekly', title: 'Hot hand', detail: 'Win 3 trades in a row this week', reward: 1_500, progress: longestWinStreak(closesWeek.map((c) => c.pnl)), goal: 3 },
    { id: 'w-wins', period: 'weekly', title: 'Sniper', detail: 'Close 5 winning trades this week', reward: 2_000, progress: closesWeek.filter((c) => c.pnl > 0).length, goal: 5 },
    { id: 'w-volume', period: 'weekly', title: 'Whale week', detail: 'Trade $25,000 of volume this week', reward: 3_000, progress: sum(fillsWeek), goal: 25_000, unit: 'usd' },
  ];

  return list.map((q) => {
    const periodKey = q.period === 'daily' ? dayKey(now) : weekKey(now);
    return { ...q, done: q.progress >= q.goal, claimed: input.claims[QUEST_PREFIX + q.id] === periodKey, periodKey };
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

/** Level from real volume: 1 XP per $100 traded. */
export function level(volumeUsd: number) {
  const xp = Math.floor(volumeUsd / 100);
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
