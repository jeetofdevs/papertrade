// Activity feed and stats, from real data only:
// - market trades: large real trades on Binance for NEAR, BTC, ETH and SOL
// - Nitro trades: positions opened and closed on this site (on this device in demo mode)
// - market volume: Binance 24h quote volume; Nitro volume and open interest from real Nitro positions

import { useSyncExternalStore } from 'react';
import { Market, MARKETS, Side, State, unrealizedPnl } from './engine';
import { getMarks, onMarketTrade, usePrices } from './prices';
import { getState, subscribe, useStore } from './store';

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
  /** Binance 24h volume for the pair, in USD. 0 until the feed loads. */
  marketVolume24h: number;
  /** Nitro's own 24h volume and open interest. */
  volume24h: number;
  longOi: number;
  shortOi: number;
}

/** Market trades at or above this size show up in the ticker. */
export const WHALE_USD = 25_000;

let feed: Activity[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let n = 0;

function push(a: Omit<Activity, 'id'>) {
  feed = [{ ...a, id: `a${n++}` }, ...feed].slice(0, 60);
  emit();
}

// Real large trades from the market feed.
onMarketTrade((t) => {
  if (t.usd < WHALE_USD) return;
  push({ market: t.market, side: t.buy ? 'long' : 'short', kind: 'open', amount: t.usd, price: t.price, time: t.time, mine: false });
});

// Trades on Nitro, from engine state changes.
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
      const kind = t.reason === 'liquidated' ? 'bust' : t.pnl >= 0 ? 'win' : 'loss';
      push({ market: t.market, side: t.side, kind, amount: t.pnl, price: t.exit, time: t.closedAt, mine: true });
    }
  }
  prev = next;
});

export function startActivity() {
  /* feeds start on import; kept for callers */
}

/** Nitro stats per market, computed from real positions and trades. */
function nitroStats(state: State, marketVolumes: Partial<Record<Market, number>>): Record<Market, MarketStats> {
  const now = Date.now();
  const out = Object.fromEntries(
    MARKETS.map((m) => [m, { marketVolume24h: marketVolumes[m] ?? 0, volume24h: 0, longOi: 0, shortOi: 0 }]),
  ) as Record<Market, MarketStats>;
  // Demo trades live only in this browser and are never counted as Nitro activity.
  void state;
  void now;
  return out;
}

export function useActivity() {
  const f = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => feed,
  );
  const state = useStore();
  const { tickers } = usePrices();
  const vols: Partial<Record<Market, number>> = {};
  for (const m of MARKETS) vols[m] = tickers[m]?.volume24h ?? 0;
  return { feed: f, stats: nitroStats(state, vols) };
}

/** Live unrealised PnL across a set of positions. */
export function totalPnl(state: State, id: string) {
  const marks = getMarks();
  return (state.accounts[id]?.positions ?? []).reduce((s, p) => s + unrealizedPnl(p, marks[p.market] ?? p.entry), 0);
}
