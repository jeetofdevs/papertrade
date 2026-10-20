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
