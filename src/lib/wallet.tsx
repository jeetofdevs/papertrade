// NEAR wallet connection via @near-wallet-selector.

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import type { WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import '@near-wallet-selector/modal-ui/styles.css';
import { rpc } from './rpc';

export const NETWORK = (import.meta.env.VITE_NEAR_NETWORK as 'testnet' | 'mainnet' | undefined) || 'mainnet';
/** The Nitro pool contract. Live mode trades real USDC against it. */
export const CONTRACT_ID = (import.meta.env.VITE_CONTRACT_ID as string | undefined) || 'nitroonnear.near';

/** Is the pool contract deployed? Sign-in asks for a trading key for it only when it is. */
async function contractDeployed(): Promise<boolean> {
  try {
    const j = await rpc('query', { request_type: 'view_code', finality: 'final', account_id: CONTRACT_ID });
    return !!j.result?.code_base64;
  } catch {
    return false;
  }
}
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
  /** Sign and send one transaction with the connected wallet. */
  signAndSend: (receiverId: string, actions: WalletAction[]) => Promise<unknown>;
}

export type WalletAction =
  | { type: 'FunctionCall'; params: { methodName: string; args: object; gas: string; deposit: string } }
  | { type: 'Transfer'; params: { deposit: string } };

const Ctx = createContext<WalletCtx>({
  accountId: null,
  traderId: GUEST,
  ready: false,
  connect: () => {},
  disconnect: async () => {},
  signAndSend: async () => {
    throw new Error('Wallet not ready');
  },
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
  const deployed = CONTRACT_ID ? await contractDeployed() : false;
  const s = await core.setupWalletSelector({
    network: NETWORK,
    modules: [meteor.setupMeteorWallet(), mnw.setupMyNearWallet(), here.setupHereWallet()],
  });
  return { s, setupModal: modal.setupModal, deployed };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    // Wallet code is large, so load it after the trading UI is on screen.
    loadSelector()
      .then(({ s, setupModal, deployed }) => {
        setSelector(s);
        // With the contract set, wallets add a key that can only call the pool, so trades need no popup.
        setModal(setupModal(s, deployed ? { contractId: CONTRACT_ID } : {}));
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
    signAndSend: async (receiverId, actions) => {
      if (!selector || !accountId) throw new Error('Connect a NEAR wallet first');
      const [wallet, { actionCreators }] = await Promise.all([selector.wallet(), import('@near-js/transactions')]);
      const najActions = actions.map((a) =>
        a.type === 'Transfer'
          ? actionCreators.transfer(BigInt(a.params.deposit))
          : actionCreators.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit)),
      );
      return wallet.signAndSendTransaction({ signerId: accountId, receiverId, actions: najActions });
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWallet = () => useContext(Ctx);
