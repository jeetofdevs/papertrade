// Market activity feed and protocol stats (volume, open interest).
// The viewer's own trades are real; other traders are simulated in demo mode.

import { useSyncExternalStore } from 'react';
import { Market, MARKETS, Side, State, unrealizedPnl } from './engine';
import { getMarks } from './prices';
import { getState, subscribe } from './store';

export interface Activity {
  id: string;
  market: Market;
  side: Side;
  kind: 'open' | 'win' | 'loss' | 'bust';
  /** Position size for opens, PnL for closes. */
  amount: number;
  price: number;
  time: number;
  mine: boolean;
}

export interface MarketStats {
  volume24h: number;
  longOi: number;
  shortOi: number;
}

type Snap = { feed: Activity[]; stats: Record<Market, MarketStats> };

const BASE: Record<Market, MarketStats> = {
  NEAR: { volume24h: 410e6, longOi: 6.2e6, shortOi: 4.9e6 },
  BTC: { volume24h: 5.1e9, longOi: 41e6, shortOi: 26e6 },
  ETH: { volume24h: 2.6e9, longOi: 22e6, shortOi: 18e6 },
  SOL: { volume24h: 880e6, longOi: 9.4e6, shortOi: 7.1e6 },
};

let snap: Snap = { feed: [], stats: structuredClone(BASE) };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let n = 0;

function push(a: Omit<Activity, 'id'>) {
  const stats = { ...snap.stats, [a.market]: { ...snap.stats[a.market] } };
  const s = stats[a.market];
  if (a.kind === 'open') {
    s.volume24h += a.amount;
    if (a.side === 'long') s.longOi += a.amount;
    else s.shortOi += a.amount;
  }
  snap = { feed: [{ ...a, id: `a${n++}` }, ...snap.feed].slice(0, 60), stats };
  emit();
}

// Simulated traders
const SIZES = [500, 1_200, 3_000, 8_000, 25_000, 60_000, 100_000, 219_000];
function simulate() {
  const marks = getMarks();
  const market = MARKETS[Math.floor(Math.random() * MARKETS.length)];
  const price = marks[market];
  if (price) {
    const side: Side = Math.random() < 0.55 ? 'long' : 'short';
    const r = Math.random();
    const size = SIZES[Math.floor(Math.random() * SIZES.length)] * (0.5 + Math.random());
    if (r < 0.45) push({ market, side, kind: 'open', amount: size, price, time: Date.now(), mine: false });
    else if (r < 0.75) push({ market, side, kind: 'win', amount: Math.random() ** 3 * 400, price, time: Date.now(), mine: false });
    else if (r < 0.92) push({ market, side, kind: 'loss', amount: -(Math.random() ** 3) * 300, price, time: Date.now(), mine: false });
    else push({ market, side, kind: 'bust', amount: -(5 + Math.random() * 200), price, time: Date.now(), mine: false });
  }
  setTimeout(simulate, 900 + Math.random() * 2500);
}

// The viewer's own trades, from engine state changes
let prev: State = getState();
subscribe(() => {
  const next = getState();
  for (const [id, acct] of Object.entries(next.accounts)) {
    const old = prev.accounts[id];
    for (const p of acct.positions) {
      if (!old?.positions.some((x) => x.id === p.id)) {
        push({ market: p.market, side: p.side, kind: 'open', amount: p.size, price: p.entry, time: p.openedAt, mine: true });
      }
    }
    for (const t of acct.history) {
      if (old?.history.some((x) => x.id === t.id)) continue;
      const s = snap.stats[t.market];
      if (t.side === 'long') s.longOi = Math.max(0, s.longOi - t.size);
      else s.shortOi = Math.max(0, s.shortOi - t.size);
      const kind = t.reason === 'liquidated' ? 'bust' : t.pnl >= 0 ? 'win' : 'loss';
      push({ market: t.market, side: t.side, kind, amount: t.pnl, price: t.exit, time: t.closedAt, mine: true });
    }
  }
  prev = next;
});

let started = false;
export function startActivity() {
  if (started) return;
  started = true;
  setTimeout(simulate, 1500);
}

export function useActivity(): Snap {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
  );
}

/** Live unrealised PnL across a set of positions. */
export function totalPnl(state: State, id: string) {
  const marks = getMarks();
  return (state.accounts[id]?.positions ?? []).reduce((s, p) => s + unrealizedPnl(p, marks[p.market] ?? p.entry), 0);
}
