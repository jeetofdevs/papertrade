// NEAR wallet connection via @near-wallet-selector.

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import type { WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import '@near-wallet-selector/modal-ui/styles.css';

export const NETWORK = (import.meta.env.VITE_NEAR_NETWORK as 'testnet' | 'mainnet' | undefined) || 'mainnet';
/** The deployed Nitro contract. Real-money mode stays off until this is set. */
export const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID as string | undefined) || '';
export const REAL_MODE_AVAILABLE = CONTRACT_ID !== '';
export const GUEST = 'guest';
/** Test builds only: let the app open without a wallet. */
export const ALLOW_GUEST = import.meta.env.VITE_ALLOW_GUEST === 'true';

interface WalletCtx {
  accountId: string | null;
  /** Account used for trading: the wallet account, or a local guest account. */
  traderId: string;
  ready: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<WalletCtx>({
  accountId: null,
  traderId: GUEST,
  ready: false,
  connect: () => {},
  disconnect: async () => {},
});

async function loadSelector() {
  // near-js expects Node's Buffer as a global.
  const { Buffer } = await import('buffer');
  (globalThis as { Buffer?: unknown }).Buffer ??= Buffer;
  const [core, modal, mnw, meteor, here] = await Promise.all([
    import('@near-wallet-selector/core'),
    import('@near-wallet-selector/modal-ui'),
    import('@near-wallet-selector/my-near-wallet'),
    import('@near-wallet-selector/meteor-wallet'),
    import('@near-wallet-selector/here-wallet'),
  ]);
  const s = await core.setupWalletSelector({
    network: NETWORK,
    modules: [meteor.setupMeteorWallet(), mnw.setupMyNearWallet(), here.setupHereWallet()],
  });
  return { s, setupModal: modal.setupModal };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    // Wallet code is large, so load it after the trading UI is on screen.
    loadSelector()
      .then(({ s, setupModal }) => {
        setSelector(s);
        setModal(setupModal(s, CONTRACT_ID ? { contractId: CONTRACT_ID } : {}));
        const pick = () => s.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
        setAccountId(pick());
        const sub = s.store.observable.subscribe(() => setAccountId(pick()));
        unsub = () => sub.unsubscribe();
      })
      .catch((e) => console.warn('Wallet selector failed to load', e));
    return () => unsub?.();
  }, []);

  const value: WalletCtx = {
    accountId,
    traderId: accountId ?? GUEST,
    ready: !!selector,
    connect: () => modal?.show(),
    disconnect: async () => {
      if (!selector) return;
      const wallet = await selector.wallet();
      await wallet.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWallet = () => useContext(Ctx);
