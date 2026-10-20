// Derived trading stats for an account.

import { Account, sharePrice, State, Trade, unrealizedPnl } from './engine';
import { getMarks } from './prices';

export interface ProfileStats {
  trades: number;
  wins: number;
  winRate: number;
  maxLosses: number;
  realizedPnl: number;
  openPnl: number;
  volume: number;
  best: Trade | null;
  worst: Trade | null;
  vaultValue: number;
  equity: number;
  favourite: string | null;
}

export function profileStats(state: State, acct: Account): ProfileStats {
  const h = acct.history;
  const wins = h.filter((t) => t.pnl > 0).length;
  const marks = getMarks();
  const openPnl = acct.positions.reduce((s, p) => s + unrealizedPnl(p, marks[p.market] ?? p.entry), 0);
  const locked = acct.positions.reduce((s, p) => s + p.collateral, 0);
  const vaultValue = acct.lpShares * sharePrice(state.pool);
  const counts = new Map<string, number>();
  for (const t of h) counts.set(t.market, (counts.get(t.market) ?? 0) + 1);
  const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    trades: h.length,
    wins,
    winRate: h.length ? (wins / h.length) * 100 : 0,
    maxLosses: h.filter((t) => t.reason === 'liquidated').length,
    realizedPnl: acct.realizedPnl,
    openPnl,
    volume: acct.volume,
    best: h.reduce<Trade | null>((b, t) => (!b || t.pnl > b.pnl ? t : b), null),
    worst: h.reduce<Trade | null>((b, t) => (!b || t.pnl < b.pnl ? t : b), null),
    vaultValue,
    equity: acct.usdc + locked + openPnl + vaultValue + acct.pendingProfit,
    favourite,
  };
}

/** Stable colours for an account's avatar. */
export function avatarColors(id: string): [string, string] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = h % 360;
  return [`hsl(${a} 85% 55%)`, `hsl(${(a + 70) % 360} 80% 45%)`];
}

export function explorerUrl(id: string, network: string) {
  return network === 'testnet' ? `https://testnet.nearblocks.io/address/${id}` : `https://nearblocks.io/address/${id}`;
}
