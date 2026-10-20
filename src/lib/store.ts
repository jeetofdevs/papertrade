// App state: the engine State, persisted to localStorage, with a React hook.

import { useSyncExternalStore } from 'react';
import { initialState, Result, runLiquidations, State } from './engine';
import { getMarks, onTick } from './prices';

const KEY = 'nitro:state:v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* ignore broken or blocked storage */
  }
  return initialState();
}

let state: State = load();
const listeners = new Set<() => void>();

function set(next: State) {
  if (next === state) return;
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

/** Apply an engine action. Returns the error message, if any. */
export function dispatch(fn: (s: State) => Result): string | undefined {
  const r = fn(state);
  if (!r.error) set(r.state);
  return r.error;
}

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function resetDemo() {
  set(initialState());
}

// Keeper: liquidate positions as prices move.
const liqListeners = new Set<(msg: string) => void>();
export function onLiquidation(fn: (msg: string) => void) {
  liqListeners.add(fn);
  return () => liqListeners.delete(fn);
}

onTick(() => {
  const before = state;
  const next = runLiquidations(state, getMarks(), Date.now());
  if (next !== before) {
    for (const [id, acct] of Object.entries(next.accounts)) {
      const prev = before.accounts[id];
      const fresh = acct.history.filter((t) => t.reason === 'liquidated' && !prev?.history.some((h) => h.id === t.id));
      fresh.forEach((t) =>
        liqListeners.forEach((l) => l(`${t.market} ${t.side} ${t.leverage}x hit max loss — earned ${Math.round(t.nitro).toLocaleString()} NITRO`)),
      );
    }
    set(next);
  }
});
