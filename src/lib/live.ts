// Config and shared state for Live mode (real USDC on Orderly Network).
// The Orderly SDK itself only loads when Live mode is opened (see src/live).

import { useSyncExternalStore } from 'react';
import type { Position } from './engine';

/** Your Orderly broker (builder) ID. Live mode stays off until it is set. */
export const ORDERLY_BROKER_ID = (import.meta.env.VITE_ORDERLY_BROKER_ID as string | undefined) || '';
export const ORDERLY_NETWORK: 'mainnet' | 'testnet' = import.meta.env.VITE_ORDERLY_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
export const LIVE_AVAILABLE = ORDERLY_BROKER_ID !== '';

export interface LiveSummary {
  ready: boolean;
  accountValue: number;
  maxLeverage: number | null;
  /** Live positions in the same shape as demo positions, for the chart and tracks. */
  positions: Position[];
}

let summary: LiveSummary = { ready: false, accountValue: 0, maxLeverage: null, positions: [] };
const listeners = new Set<() => void>();

export function setLiveSummary(patch: Partial<LiveSummary>) {
  summary = { ...summary, ...patch };
  listeners.forEach((l) => l());
}

export function useLiveSummary(): LiveSummary {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => summary,
  );
}

// ---- Real trade activity for quests ----

export interface LiveFill {
  at: number;
  market: string;
  usd: number;
  /** Realized PnL when the fill closed (part of) a position, else 0. */
  pnl: number;
}

export interface LiveOpen {
  at: number;
  market: string;
  usd: number;
  leverage: number;
}

export interface LiveActivity {
  /** True once trades have been loaded from Orderly for a trading-enabled account. */
  ready: boolean;
  address: string | null;
  fills: LiveFill[];
}

let activity: LiveActivity = { ready: false, address: null, fills: [] };
const activityListeners = new Set<() => void>();

export function setLiveActivity(next: LiveActivity) {
  activity = next;
  activityListeners.forEach((l) => l());
}

export function useLiveActivity(): LiveActivity {
  return useSyncExternalStore(
    (l) => {
      activityListeners.add(l);
      return () => activityListeners.delete(l);
    },
    () => activity,
  );
}

// Leverage is not part of Orderly's fill history, so Nitro remembers the leverage of orders it sent.
const opensKey = (address: string) => `nitro:live-opens:${address.toLowerCase()}`;

export function recordLiveOpen(address: string, o: LiveOpen) {
  try {
    const list: LiveOpen[] = JSON.parse(localStorage.getItem(opensKey(address)) || '[]');
    localStorage.setItem(opensKey(address), JSON.stringify([o, ...list].slice(0, 200)));
  } catch {
    /* storage unavailable */
  }
}

export function liveOpens(address: string | null): LiveOpen[] {
  if (!address) return [];
  try {
    return JSON.parse(localStorage.getItem(opensKey(address)) || '[]');
  } catch {
    return [];
  }
}
