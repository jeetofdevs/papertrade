// Live mode: real USDC trading against the Nitro pool contract on NEAR.
// Reads go straight to a NEAR RPC node; writes are signed by the user's NEAR wallet.
// Every deposit, withdrawal and trade is recorded per user by the contract (get_ledger).

import { useSyncExternalStore } from 'react';
import type { Market, Position, Side, Trade } from './engine';
import { CONTRACT_ID, type WalletAction } from './wallet';

export const POOL_ID = CONTRACT_ID;
/** The admin who reviews withdrawals. The contract's own owner check is what actually protects the actions. */
export const ADMIN_ID = (import.meta.env.VITE_ADMIN_ID as string | undefined) || 'nitroonnear.near';
export const isAdmin = (accountId: string | null, owner: string | null) => !!accountId && accountId === (owner ?? ADMIN_ID);
export const POOL_AVAILABLE = POOL_ID !== '';
/** Native USDC on NEAR (Circle). */
export const USDC_ID =
  (import.meta.env.VITE_USDC_CONTRACT as string | undefined) || '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const RPC = (import.meta.env.VITE_NEAR_RPC as string | undefined) || 'https://free.rpc.fastnear.com';
const USDC = 1_000_000;
const PRICE = 100_000_000;
const TGAS = '000000000000';
const POLL_MS = 4_000;

// ---------- RPC ----------

class RpcError extends Error {
  constructor(
    message: string,
    readonly missing = false,
  ) {
    super(message);
  }
}

/** Is the pool contract deployed? */
export async function hasContractCode(): Promise<boolean> {
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'nitro', method: 'query', params: { request_type: 'view_code', finality: 'final', account_id: POOL_ID } }),
    });
    const j = await r.json();
    if (j.result?.code_base64) return true;
    // Only a definite "no code / no account" answer counts as not deployed; network errors do not.
    return !/NO_CONTRACT_CODE|UNKNOWN_ACCOUNT|CodeDoesNotExist|never been observed|does not exist/i.test(JSON.stringify(j.error ?? j.result?.error ?? ''));
  } catch {
    return true;
  }
}

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'nitro',
      method: 'query',
      params: { request_type: 'call_function', finality: 'optimistic', account_id: contractId, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    }),
  });
  const j = await r.json();
  const err: string | undefined = j.error?.cause?.name ?? j.error?.message ?? j.result?.error;
  if (err) throw new RpcError(err, /UNKNOWN_ACCOUNT|NO_CONTRACT_CODE|CodeDoesNotExist|MethodNotFound|MethodResolveError|does not exist|never been observed/i.test(JSON.stringify(j.error ?? j.result?.error)));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
}

// ---------- Units ----------

export const fromUsdc = (s: string | undefined) => Number(s ?? 0) / USDC;
export const fromPrice = (s: string | undefined) => Number(s ?? 0) / PRICE;
export function toUsdc(usd: number): string {
  const [i, f = ''] = usd.toFixed(6).split('.');
  return (BigInt(i) * BigInt(USDC) + BigInt(f.padEnd(6, '0'))).toString();
}
export const toPrice = (p: number) => BigInt(Math.round(p * PRICE)).toString();

// ---------- Contract types ----------

interface RawAccount {
  balance: string;
  nitro: string;
  vault_shares: string;
  position_ids: number[];
  total_deposited: string;
  total_withdrawn: string;
  volume: string;
  profit: string;
  loss: string;
  trades: number;
  pending_withdraw?: string;
  promo_claimed?: boolean;
  promo_bonus?: string;
  promo_wager_required?: string;
  promo_wagered?: string;
  x_handle?: string | null;
}
interface RawPromo {
  amount: string;
  min_deposit: string;
  wager_multiple: number;
  min_hold_sec: number;
  budget: string;
  claims: number;
  active: boolean;
}
export interface Promo {
  amount: number;
  minDeposit: number;
  multiple: number;
  minHoldSec: number;
  budget: number;
  claims: number;
  /** Bonuses can still be claimed. */
  open: boolean;
}
export interface UserPromo {
  claimed: boolean;
  /** A bonus is active and withdrawals are locked until the turnover is reached. */
  locked: boolean;
  bonus: number;
  required: number;
  wagered: number;
}
const toPromo = (p: RawPromo): Promo => ({
  amount: fromUsdc(p.amount),
  minDeposit: fromUsdc(p.min_deposit),
  multiple: p.wager_multiple,
  minHoldSec: p.min_hold_sec,
  budget: fromUsdc(p.budget),
  claims: p.claims,
  open: p.active,
});
interface RawRequest {
  id: number;
  account: string;
  amount: string;
  requested_at: number;
}
export interface WithdrawRequest {
  id: number;
  account: string;
  amount: number;
  requestedAt: number;
}
const toRequest = (r: RawRequest): WithdrawRequest => ({ id: r.id, account: r.account, amount: fromUsdc(r.amount), requestedAt: r.requested_at });
interface RawPosition {
  id: number;
  owner: string;
  market: Market;
  long: boolean;
  wager: string;
  leverage: number;
  entry: string;
  liq: string;
  tp: string | null;
  reserved: string;
  opened_at: number;
}
interface RawEntry {
  kind: string;
  amount: string;
  at: number;
  position_id: number | null;
  market: Market | null;
  long: boolean | null;
  leverage: number | null;
  price: string | null;
  pnl: string | null;
  fee: string | null;
  nitro: string | null;
  reason: string | null;
}
interface RawConfig {
  max_leverage: number;
  min_wager: string;
  max_position_bps: number;
  max_profit_multiple: number;
  profit_fee_bps: number;
  spread_bps: number;
  min_deposit: string;
}
interface RawVault {
  liquidity: string;
  free: string;
}

export interface LedgerItem {
  kind:
    | 'deposit'
    | 'withdraw_request'
    | 'withdraw'
    | 'withdraw_rejected'
    | 'withdraw_cancelled'
    | 'promo_bonus'
    | 'promo_unlocked'
    | 'promo_ended'
    | 'nitro_convert'
    | 'nitro_refund'
    | 'refund'
    | 'vault_deposit'
    | 'vault_withdraw'
    | 'open'
    | 'close';
  amount: number;
  at: number;
  positionId: number | null;
  market: Market | null;
  side: Side | null;
  leverage: number | null;
  price: number;
  pnl: number;
  fee: number;
  nitro: number;
  reason: 'close' | 'max_loss' | 'take_profit' | null;
}

export interface PoolConfig {
  maxLeverage: number;
  minWager: number;
  maxPositionShare: number;
  maxProfitMultiple: number;
  profitFee: number;
  spread: number;
  minDeposit: number;
}

export interface PoolState {
  /** True once the first load finished. */
  ready: boolean;
  /** The contract is not deployed yet. */
  missing: boolean;
  error: string | null;
  balance: number;
  /** USDC locked in withdrawal requests waiting for review. */
  pendingWithdraw: number;
  /** This user's withdrawal requests waiting for review. */
  requests: WithdrawRequest[];
  /** The contract owner, who reviews withdrawals. */
  owner: string | null;
  promo: Promo | null;
  userPromo: UserPromo;
  nitro: number;
  /** USDC in the user's NEAR wallet. */
  wallet: number;
  totals: { deposited: number; withdrawn: number; volume: number; profit: number; loss: number; trades: number };
  positions: Position[];
  ledger: LedgerItem[];
  config: PoolConfig;
  vault: { liquidity: number; free: number };
}

const EMPTY: PoolState = {
  ready: false,
  missing: false,
  error: null,
  balance: 0,
  pendingWithdraw: 0,
  requests: [],
  owner: null,
  promo: null,
  userPromo: { claimed: false, locked: false, bonus: 0, required: 0, wagered: 0 },
  nitro: 0,
  wallet: 0,
  totals: { deposited: 0, withdrawn: 0, volume: 0, profit: 0, loss: 0, trades: 0 },
  positions: [],
  ledger: [],
  config: { maxLeverage: 1000, minWager: 1, maxPositionShare: 0.02, maxProfitMultiple: 10, profitFee: 0.1, spread: 0, minDeposit: 1 },
  vault: { liquidity: 0, free: 0 },
};

const toPosition = (p: RawPosition): Position => {
  const wager = fromUsdc(p.wager);
  return {
    id: String(p.id),
    market: p.market,
    side: p.long ? 'long' : 'short',
    collateral: wager,
    leverage: p.leverage,
    size: wager * p.leverage,
    entry: fromPrice(p.entry),
    liq: fromPrice(p.liq),
    tp: p.tp ? fromPrice(p.tp) : null,
    openedAt: Math.floor(p.opened_at / 1e6),
  };
};

const toItem = (e: RawEntry): LedgerItem => ({
  kind: e.kind as LedgerItem['kind'],
  amount: fromUsdc(e.amount),
  at: e.at,
  positionId: e.position_id,
  market: e.market,
  side: e.long == null ? null : e.long ? 'long' : 'short',
  leverage: e.leverage,
  price: fromPrice(e.price ?? '0'),
  pnl: Number(e.pnl ?? 0) / USDC,
  fee: fromUsdc(e.fee ?? '0'),
  nitro: fromUsdc(e.nitro ?? '0'),
  reason: e.reason as LedgerItem['reason'],
});

/** Closed trades from the ledger, in the same shape as demo trades. */
export function tradesFromLedger(ledger: LedgerItem[]): Trade[] {
  const opens = new Map(ledger.filter((e) => e.kind === 'open').map((e) => [e.positionId, e]));
  return ledger
    .filter((e) => e.kind === 'close' && e.market && e.side && e.leverage)
    .map((c) => {
      const o = opens.get(c.positionId);
      // payout = wager + pnl - fee, so the wager can be recovered when the open entry has rolled off.
      const wager = o?.amount ?? c.amount - c.pnl + c.fee;
      return {
        id: `pool-${c.positionId}`,
        market: c.market!,
        side: c.side!,
        size: wager * c.leverage!,
        leverage: c.leverage!,
        entry: o?.price ?? c.price,
        exit: c.price,
        pnl: c.pnl > 0 ? c.pnl - c.fee : c.pnl,
        nitro: c.nitro,
        reason: c.reason === 'max_loss' ? 'liquidated' : c.reason === 'take_profit' ? 'tp' : 'close',
        openedAt: o?.at,
        closedAt: c.at,
      } satisfies Trade;
    });
}

// ---------- Store ----------

let state: PoolState = EMPTY;
let account: string | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let seenCloses: Set<string> | null = null;
const listeners = new Set<() => void>();
const closeListeners = new Set<(t: Trade, item: LedgerItem) => void>();

function set(next: PoolState) {
  state = next;
  listeners.forEach((l) => l());
}

async function load() {
  const id = account;
  if (!id || !POOL_AVAILABLE) return;
  try {
    const [a, positions, ledger, config, vault, wallet, requests, owner, promo] = await Promise.all([
      view<RawAccount>(POOL_ID, 'get_account', { account_id: id }),
      view<RawPosition[]>(POOL_ID, 'get_positions', { account_id: id }),
      view<RawEntry[]>(POOL_ID, 'get_ledger', { account_id: id, from_index: 0, limit: 100 }),
      view<RawConfig>(POOL_ID, 'get_config'),
      view<RawVault>(POOL_ID, 'get_vault'),
      view<string>(USDC_ID, 'ft_balance_of', { account_id: id }).catch(() => '0'),
      view<RawRequest[]>(POOL_ID, 'get_withdraw_requests', { from_index: 0, limit: 200 }).catch(() => [] as RawRequest[]),
      view<string>(POOL_ID, 'get_owner').catch(() => null),
      view<RawPromo>(POOL_ID, 'get_promo').catch(() => null),
    ]);
    if (id !== account) return;
    const items = ledger.map(toItem);
    // Tell listeners about trades that closed since the last load (by hand, max loss or take profit).
    const closes = items.filter((e) => e.kind === 'close');
    const key = (e: LedgerItem) => `${e.positionId}:${e.at}`;
    if (seenCloses) {
      const fresh = closes.filter((e) => !seenCloses!.has(key(e)));
      const trades = tradesFromLedger(items);
      for (const e of fresh.reverse()) {
        const t = trades.find((x) => x.id === `pool-${e.positionId}`);
        if (t) closeListeners.forEach((l) => l(t, e));
      }
    }
    seenCloses = new Set(closes.map(key));
    set({
      ready: true,
      missing: false,
      error: null,
      balance: fromUsdc(a.balance),
      pendingWithdraw: fromUsdc(a.pending_withdraw ?? '0'),
      requests: requests.filter((r) => r.account === id).map(toRequest),
      owner,
      promo: promo ? toPromo(promo) : null,
      userPromo: {
        claimed: !!a.promo_claimed,
        locked: fromUsdc(a.promo_wager_required ?? '0') > 0,
        bonus: fromUsdc(a.promo_bonus ?? '0'),
        required: fromUsdc(a.promo_wager_required ?? '0'),
        wagered: fromUsdc(a.promo_wagered ?? '0'),
      },
      nitro: fromUsdc(a.nitro),
      wallet: fromUsdc(wallet),
      totals: {
        deposited: fromUsdc(a.total_deposited),
        withdrawn: fromUsdc(a.total_withdrawn),
        volume: fromUsdc(a.volume),
        profit: fromUsdc(a.profit),
        loss: fromUsdc(a.loss),
        trades: a.trades ?? 0,
      },
      positions: positions.map(toPosition),
      ledger: items,
      config: {
        maxLeverage: config.max_leverage,
        minWager: fromUsdc(config.min_wager),
        maxPositionShare: config.max_position_bps / 10_000,
        maxProfitMultiple: config.max_profit_multiple,
        profitFee: config.profit_fee_bps / 10_000,
        spread: (config.spread_bps ?? 0) / 10_000,
        minDeposit: fromUsdc(config.min_deposit ?? '1000000'),
      },
      vault: { liquidity: fromUsdc(vault.liquidity), free: fromUsdc(vault.free) },
    });
  } catch (e) {
    // Not deployed yet? Ask for the contract code directly rather than trusting the error text.
    const missing = (e instanceof RpcError && e.missing) || !(await hasContractCode());
    // Before launch, still show the USDC in the user's wallet so they can deposit early.
    const wallet = missing ? await view<string>(USDC_ID, 'ft_balance_of', { account_id: id }).then(fromUsdc, () => state.wallet) : state.wallet;
    if (id !== account) return;
    set({ ...state, ready: true, missing, wallet, error: missing ? null : (e as Error).message });
  }
}

/** Start polling the pool for this NEAR account (or stop with null). */
export function watchPool(accountId: string | null) {
  if (accountId === account) return;
  account = accountId;
  seenCloses = null;
  clearInterval(timer);
  set(EMPTY);
  if (!accountId) return;
  load();
  timer = setInterval(load, POLL_MS);
}

export const refreshPool = () => load();

export function usePool(): PoolState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Called for every trade that closes while the app is open. */
export function onPoolClose(fn: (t: Trade, item: LedgerItem) => void) {
  closeListeners.add(fn);
  return () => {
    closeListeners.delete(fn);
  };
}

// ---------- Slippage (set by the trader, kept per browser) ----------

export const SLIPPAGE_CHOICES = [0.001, 0.005, 0.01, 0.02];
const SLIP_KEY = 'nitro:slippage';
export function getSlippage(): number {
  try {
    const v = Number(localStorage.getItem(SLIP_KEY));
    return SLIPPAGE_CHOICES.includes(v) ? v : 0.005;
  } catch {
    return 0.005;
  }
}
export function saveSlippage(v: number) {
  try {
    localStorage.setItem(SLIP_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** Worst price a trader accepts: buying (long open, short close) allows a higher price, selling a lower one. */
export const limitPrice = (mark: number, buy: boolean, slippage: number) => mark * (buy ? 1 + slippage : 1 - slippage);

// ---------- Wallet actions ----------

const call = (methodName: string, args: object, tgas: number, deposit = '0'): WalletAction => ({
  type: 'FunctionCall',
  params: { methodName, args, gas: `${tgas}${TGAS}`, deposit },
});

// ---------- Deposits before the contract is live ----------
// Users can already send USDC to the pool account. Each transfer carries "nitro:<account>" in its memo,
// and once the contract is deployed the keeper credits every such transfer to that account (each only once).

/** Plain USDC transfer to the pool account, for before the contract is live. If the pool account is not
 * registered on USDC yet, the same transaction registers it first (0.00125 NEAR storage deposit). */
export const preLaunchDepositActions = (usd: number, accountId: string, register: boolean): WalletAction[] => [
  ...(register ? [call('storage_deposit', { account_id: POOL_ID, registration_only: true }, 10, '1250000000000000000000')] : []),
  call('ft_transfer', { receiver_id: POOL_ID, amount: toUsdc(usd), memo: `nitro:${accountId}` }, 30, '1'),
];

/** Can the pool account receive USDC (is it registered on the USDC contract)? */
export async function poolCanReceiveUsdc(): Promise<boolean> {
  try {
    return (await view<unknown>(USDC_ID, 'storage_balance_of', { account_id: POOL_ID })) != null;
  } catch {
    return false;
  }
}

export interface EarlyDeposit {
  at: number;
  amount: number;
}
const earlyKey = (id: string) => `nitro:early-deposits:${id}`;
export function earlyDeposits(accountId: string): EarlyDeposit[] {
  try {
    return JSON.parse(localStorage.getItem(earlyKey(accountId)) || '[]');
  } catch {
    return [];
  }
}
export function recordEarlyDeposit(accountId: string, d: EarlyDeposit) {
  try {
    localStorage.setItem(earlyKey(accountId), JSON.stringify([d, ...earlyDeposits(accountId)].slice(0, 100)));
  } catch {
    /* ignore */
  }
}

/** Deposit: one ft_transfer_call to the pool contract, credited to the sender's balance by the contract. */
export const depositAction = (usd: number): WalletAction =>
  call('ft_transfer_call', { receiver_id: POOL_ID, amount: toUsdc(usd), msg: '' }, 100, '1');

/** Withdrawals are reviewed: this locks the amount until the owner approves or rejects it. */
export const requestWithdrawAction = (usd: number) => call('request_withdraw', { amount: toUsdc(usd) }, 30);
export const cancelWithdrawAction = (id: number) => call('cancel_withdraw', { id }, 30);
export const approveWithdrawAction = (id: number) => call('approve_withdraw', { id }, 60);
export const rejectWithdrawAction = (id: number, reason: string) => call('reject_withdraw', { id, reason: reason || null }, 30);

/** The project's X account users must follow to claim the bonus. */
export const X_ACCOUNT = (import.meta.env.VITE_X_ACCOUNT as string | undefined) || 'nitroonnear';
export const claimPromoAction = (xHandle: string) => call('claim_promo', { x_handle: xHandle.trim().replace(/^@/, '') }, 30);
/** Owner: set how much more may be paid out as bonuses (a cap; no USDC is sent). */
export const setPromoBudgetAction = (usd: number) => call('set_promo_budget', { budget: toUsdc(usd) }, 30);

export interface LeaderRow {
  account: string;
  pnl: number;
  volume: number;
  trades: number;
  nitro: number;
}

/** Every user's real stats from the contract, for the leaderboard. */
export async function loadLeaderboard(): Promise<LeaderRow[]> {
  const rows: LeaderRow[] = [];
  for (let from = 0; from < 5_000; from += 200) {
    const page = await view<Array<{ account: string; volume: string; profit: string; loss: string; trades: number; nitro: string }>>(POOL_ID, 'get_users_stats', {
      from_index: from,
      limit: 200,
    });
    for (const u of page) {
      rows.push({ account: u.account, pnl: fromUsdc(u.profit) - fromUsdc(u.loss), volume: fromUsdc(u.volume), trades: u.trades, nitro: fromUsdc(u.nitro) });
    }
    if (page.length < 200) break;
  }
  return rows;
}

export interface NitroStats {
  totalMinted: number;
  totalConverted: number;
  token: string | null;
  /** $NITRO tokens per NITRO point, in whole tokens (decimals applied when known). */
  tokensPerPointRaw: string;
  open: boolean;
}

/** Network-wide NITRO numbers from the contract (real USDC losses only). */
export async function loadNitroStats(): Promise<NitroStats> {
  const n = await view<{ total_minted: string; total_converted: string; conversion: { token: string | null; tokens_per_point: string; open: boolean } }>(
    POOL_ID,
    'get_nitro',
  );
  return {
    totalMinted: fromUsdc(n.total_minted),
    totalConverted: fromUsdc(n.total_converted),
    token: n.conversion.token,
    tokensPerPointRaw: n.conversion.tokens_per_point,
    open: n.conversion.open,
  };
}

/** Token decimals from its NEP-148 metadata. */
export async function tokenDecimals(token: string): Promise<number> {
  return (await view<{ decimals: number }>(token, 'ft_metadata')).decimals;
}

/** Convert NITRO points to $NITRO; attaches 0.00125 NEAR so the token can register the user. */
export const convertNitroAction = (points: number) => call('convert_nitro', { points: toUsdc(points) }, 60, '1250000000000000000000');

export const loadPromo = async () => toPromo(await view<RawPromo>(POOL_ID, 'get_promo'));

/** Every withdrawal request waiting for review (owner view). */
export async function loadAllRequests(): Promise<WithdrawRequest[]> {
  return (await view<RawRequest[]>(POOL_ID, 'get_withdraw_requests', { from_index: 0, limit: 200 })).map(toRequest);
}

/** A user's balances, for reviewing their request. */
export async function loadUserSummary(accountId: string) {
  const a = await view<RawAccount>(POOL_ID, 'get_account', { account_id: accountId });
  return {
    balance: fromUsdc(a.balance),
    deposited: fromUsdc(a.total_deposited),
    withdrawn: fromUsdc(a.total_withdrawn),
    profit: fromUsdc(a.profit),
    loss: fromUsdc(a.loss),
    trades: a.trades ?? 0,
    xHandle: a.x_handle ?? null,
  };
}

export const openAction = (p: { market: Market; side: Side; wager: number; leverage: number; tpRoe: number; limit: number }) =>
  call(
    'open_position',
    {
      market: p.market,
      long: p.side === 'long',
      wager: toUsdc(p.wager),
      leverage: p.leverage,
      tp_roe_bps: p.tpRoe > 0 ? Math.round(p.tpRoe * 100) : null,
      acceptable_price: toPrice(p.limit),
    },
    100,
  );

export const closeAction = (id: string, limit: number) => call('close_position', { id: Number(id), acceptable_price: toPrice(limit) }, 100);
