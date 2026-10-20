// Per-viewer display preferences, kept in localStorage.

import { useSyncExternalStore } from 'react';

export interface Settings {
  /** demo: local demo USDC. real: USDC on NEAR through the Nitro contract. */
  mode: 'demo' | 'real';
  chartType: 'tick' | 'candles';
  showEntries: boolean;
  showMaxLoss: boolean;
  showTrades: boolean;
  showOthers: boolean;
  antiSocial: boolean;
  childproof: boolean;
  sound: boolean;
}

const KEY = 'nitro:settings:v1';
const DEFAULTS: Settings = {
  mode: 'demo',
  chartType: 'tick',
  showEntries: true,
  showMaxLoss: true,
  showTrades: true,
  showOthers: false,
  antiSocial: false,
  childproof: false,
  sound: true,
};

let settings: Settings = DEFAULTS;
try {
  settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  /* storage unavailable */
}
const listeners = new Set<() => void>();

export function getSettings() {
  return settings;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}
