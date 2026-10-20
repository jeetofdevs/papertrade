// App state: the engine State, persisted to localStorage, with a React hook.

import { useSyncExternalStore } from 'react';
import { initialState, Result, runLiquidations, State, Trade } from './engine';
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

// Keeper: close positions at take profit or max loss as prices move.
const autoListeners = new Set<(t: Trade) => void>();
export function onAutoClose(fn: (t: Trade) => void) {
  autoListeners.add(fn);
  return () => autoListeners.delete(fn);
}

onTick(() => {
  const before = state;
  const next = runLiquidations(state, getMarks(), Date.now());
  if (next === before) return;
  set(next);
  for (const [id, acct] of Object.entries(next.accounts)) {
    const prev = before.accounts[id];
    acct.history
      .filter((t) => t.reason !== 'close' && !prev?.history.some((h) => h.id === t.id))
      .forEach((t) => autoListeners.forEach((l) => l(t)));
  }
});

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
