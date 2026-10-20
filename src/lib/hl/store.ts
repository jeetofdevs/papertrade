// Live Hyperliquid state for the UI: wallet, setup progress, account and positions.

import { useSyncExternalStore } from 'react';
import {
  AssetInfo,
  connectEvm,
  currentEvm,
  enableTrading,
  getAccount,
  getAssets,
  HlAccount,
  setupStatus,
} from './client';

type Hex = `0x${string}`;

export interface HlState {
  status: 'idle' | 'no-wallet' | 'connecting' | 'needs-setup' | 'setting-up' | 'ready' | 'error';
  user: Hex | null;
  account: HlAccount | null;
  assets: Record<string, AssetInfo> | null;
  error: string | null;
}

let state: HlState = { status: 'idle', user: null, account: null, assets: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<HlState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshAccount() {
  if (!state.user) return;
  try {
    set({ account: await getAccount(state.user) });
  } catch (e) {
    set({ error: (e as Error).message });
  }
}

async function afterConnect(user: Hex) {
  set({ user, status: 'connecting', error: null });
  const [assets, setup] = await Promise.all([getAssets(), setupStatus(user)]);
  set({ assets, status: setup.agentApproved && setup.builderApproved ? 'ready' : 'needs-setup' });
  await refreshAccount();
  if (!timer) timer = setInterval(refreshAccount, 3000);
}

/** Start live mode: reuse an already connected wallet if there is one. */
export async function startHl() {
  if (state.status !== 'idle' && state.status !== 'error') return;
  if (!window.ethereum) return set({ status: 'no-wallet' });
  try {
    const user = await currentEvm();
    if (user) await afterConnect(user);
    else set({ status: 'needs-setup' });
  } catch (e) {
    set({ status: 'error', error: (e as Error).message });
  }
}

export async function connectHl() {
  try {
    set({ status: 'connecting', error: null });
    await afterConnect(await connectEvm());
  } catch (e) {
    set({ status: state.user ? 'needs-setup' : 'error', error: (e as Error).message });
  }
}

export async function setupHl() {
  if (!state.user) return connectHl();
  try {
    set({ status: 'setting-up', error: null });
    await enableTrading(state.user);
    set({ status: 'ready' });
  } catch (e) {
    set({ status: 'needs-setup', error: (e as Error).message });
  }
}

export function stopHl() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function useHl(): HlState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
