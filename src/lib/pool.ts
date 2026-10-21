// Client for the Nitro vault contract (our own USDC pool on NEAR).
// Reads go straight to a NEAR RPC node; writes are signed by the user's wallet.

import { useEffect, useState } from 'react';
import { CONTRACT_ID, type WalletAction } from './wallet';

export const POOL_ID = CONTRACT_ID;
export const POOL_AVAILABLE = POOL_ID !== '';
/** Native USDC on NEAR (Circle). */
export const USDC_ID =
  (import.meta.env.VITE_USDC_CONTRACT as string | undefined) || '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const RPC = (import.meta.env.VITE_NEAR_RPC as string | undefined) || 'https://free.rpc.fastnear.com';
/** Optional keeper service; enables "claim a transfer by tx hash". */
export const KEEPER_URL = ((import.meta.env.VITE_KEEPER_URL as string | undefined) || '').replace(/\/$/, '');
const DECIMALS = 1_000_000;

export interface PoolAccount {
  balance: number;
  nitro: number;
  vaultShares: number;
  positions: number;
}

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'nitro',
      method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    }),
  });
  const j = await r.json();
  if (j.error || j.result?.error) throw new Error(j.error?.cause?.name ?? j.result?.error ?? 'RPC error');
  return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
}

/** USDC base units (string) <-> dollars. */
export const fromUnits = (s: string | undefined) => Number(s ?? 0) / DECIMALS;
export function toUnits(usd: number): string {
  const [i, f = ''] = usd.toFixed(6).split('.');
  return (BigInt(i) * BigInt(DECIMALS) + BigInt(f.padEnd(6, '0'))).toString();
}

export async function loadPoolAccount(accountId: string): Promise<PoolAccount> {
  const a = await view<{ balance: string; nitro: string; vault_shares: string; position_ids: number[] }>(POOL_ID, 'get_account', { account_id: accountId });
  return { balance: fromUnits(a.balance), nitro: fromUnits(a.nitro), vaultShares: fromUnits(a.vault_shares), positions: a.position_ids.length };
}

export async function loadUsdcBalance(accountId: string): Promise<number> {
  return fromUnits(await view<string>(USDC_ID, 'ft_balance_of', { account_id: accountId }));
}

/** Polls the user's pool account and wallet USDC. */
export function usePoolAccount(accountId: string | null) {
  const [data, setData] = useState<{ pool: PoolAccount; wallet: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!POOL_AVAILABLE || !accountId) return;
    let live = true;
    const load = () =>
      Promise.all([loadPoolAccount(accountId), loadUsdcBalance(accountId)])
        .then(([pool, wallet]) => live && (setData({ pool, wallet }), setError(null)))
        .catch((e: Error) => live && setError(e.message));
    load();
    const t = setInterval(load, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [accountId, nonce]);
  return { data, error, refresh: () => setNonce((n) => n + 1) };
}

const TGAS = '000000000000';

/** Deposit from the connected wallet: one ft_transfer_call, credited instantly by the contract. */
export function depositAction(amountUsd: number, toVault = false): WalletAction {
  return {
    type: 'FunctionCall',
    params: {
      methodName: 'ft_transfer_call',
      args: { receiver_id: POOL_ID, amount: toUnits(amountUsd), msg: toVault ? 'vault' : '' },
      gas: `100${TGAS}`,
      deposit: '1',
    },
  };
}

export function withdrawAction(amountUsd: number): WalletAction {
  return { type: 'FunctionCall', params: { methodName: 'withdraw', args: { amount: toUnits(amountUsd) }, gas: `60${TGAS}`, deposit: '0' } };
}

/** Ask the keeper to credit a plain transfer to the pool address. */
export async function claimTransfer(txHash: string, accountId: string): Promise<string[]> {
  const r = await fetch(`${KEEPER_URL}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ txHash: txHash.trim(), accountId }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j.credited ?? [];
}
