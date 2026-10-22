// Live mode: real USDC trading against the Nitro pool contract on NEAR.
// Reads go straight to a NEAR RPC node; writes are signed by the user's NEAR wallet.
// Every deposit, withdrawal and trade is recorded per user by the contract (get_ledger).

import { useSyncExternalStore } from 'react';
import type { Market, Position, Side, Trade } from './engine';
import { rpc } from './rpc';
import { CONTRACT_ID, type WalletAction } from './wallet';

export const POOL_ID = CONTRACT_ID;
/** The admin who reviews withdrawals. The contract's own owner check is what actually protects the actions. */
export const ADMIN_ID = (import.meta.env.VITE_ADMIN_ID as string | undefined) || 'nitroonnear.near';
export const isAdmin = (accountId: string | null, owner: string | null) => !!accountId && accountId === (owner ?? ADMIN_ID);
export const POOL_AVAILABLE = POOL_ID !== '';
/** Native USDC on NEAR (Circle). */
export const USDC_ID =
  (import.meta.env.VITE_USDC_CONTRACT as string | undefined) || '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const USDC = 1_000_000;
const PRICE = 100_000_000;
const TGAS = '000000000000';
const POLL_MS = 8_000;
/** Largest single deposit, in USDC (the contract enforces its own configured value). */
export const MAX_DEPOSIT = 1_000;
/** Config, vault, owner, promo and requests change rarely: refresh them every this many polls. */
const SLOW_EVERY = 5;

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
    const j = await rpc('query', { request_type: 'view_code', finality: 'final', account_id: POOL_ID });
    if (j.result?.code_base64) return true;
    // Only a definite "no code / no account" answer counts as not deployed; network errors do not.
    return !/NO_CONTRACT_CODE|UNKNOWN_ACCOUNT|CodeDoesNotExist|never been observed|does not exist/i.test(JSON.stringify(j.error ?? j.result?.error ?? ''));
  } catch {
    return true;
  }
}

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const j = await rpc('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contractId,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
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
  promo_backed?: string;
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
  /** A bonus is active: the bonus balance can be traded but not withdrawn until the turnover is reached. */
  locked: boolean;
  /** Bonus balance (display-only credit plus any winnings made with it). */
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
  bonus_virtual?: string;
  bonus_backed?: string;
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
  max_deposit?: string;
  slippage_base_ppm?: number;
  slippage_impact_ppm?: number;
}
interface RawVault {
  liquidity: string;
  free: string;
  open_interest?: string;
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
    | 'deposit_near'
    | 'settle_near'
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
  /** Largest single deposit in USDC (0 = no limit). */
  maxDeposit: number;
  /** Slippage as fractions: base, and extra impact at the largest position size. */
  slippageBase: number;
  slippageImpact: number;
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
  /** False when the wallet balance could not be read (busy RPC); the UI then does not cap amounts by it. */
  walletKnown: boolean;
  /** Spendable NEAR in the user's wallet. */
  walletNear: number;
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
  walletKnown: false,
  walletNear: 0,
  totals: { deposited: 0, withdrawn: 0, volume: 0, profit: 0, loss: 0, trades: 0 },
  positions: [],
  ledger: [],
  config: { maxLeverage: 1000, minWager: 1, maxPositionShare: 0.02, maxProfitMultiple: 10, profitFee: 0.1, spread: 0, minDeposit: 1, maxDeposit: MAX_DEPOSIT, slippageBase: 0.00005, slippageImpact: 0.0002 },
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
    bonus: Number(p.bonus_virtual ?? 0) + Number(p.bonus_backed ?? 0) > 0,
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

let tick = 0;
let deployed: boolean | null = null;
let slow: { config: RawConfig; vault: RawVault; requests: RawRequest[]; owner: string | null; promo: RawPromo | null } | null = null;

async function loadWallet(id: string): Promise<{ wallet: number; walletKnown: boolean; walletNear: number }> {
  const near = await nearBalance(id).catch(() => state.walletNear);
  try {
    return { wallet: fromUsdc(await view<string>(USDC_ID, 'ft_balance_of', { account_id: id })), walletKnown: true, walletNear: near };
  } catch {
    return { wallet: state.wallet, walletKnown: state.walletKnown, walletNear: near };
  }
}

const YOCTO = 10n ** 24n;
/** NEAR the account can spend: balance minus storage and a little for gas. */
async function nearBalance(id: string): Promise<number> {
  const j = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: id });
  if (!j.result) throw new Error('No account');
  const amount = BigInt(j.result.amount);
  const storage = BigInt(j.result.storage_usage) * 10n ** 19n;
  const spendable = amount - storage - 5n * 10n ** 22n; // keep 0.05 NEAR for gas
  return spendable > 0n ? Number(spendable / 10n ** 18n) / 1e6 : 0;
}
export const toYocto = (near: number) => {
  const [i, f = ''] = near.toFixed(6).split('.');
  return (BigInt(i) * YOCTO + BigInt(f.padEnd(6, '0')) * 10n ** 18n).toString();
};
export const fromYocto = (y: string | number | bigint) => Number(BigInt(y) / 10n ** 18n) / 1e6;

async function load() {
  const id = account;
  if (!id || !POOL_AVAILABLE) return;
  tick++;
  // Before launch only the wallet balance matters; re-check for the contract every few polls.
  if (deployed !== true && (deployed === null || tick % SLOW_EVERY === 1)) deployed = await hasContractCode();
  if (!deployed) {
    const w = await loadWallet(id);
    if (id !== account) return;
    set({ ...state, ready: true, missing: true, error: null, ...w });
    return;
  }
  try {
    if (!slow || tick % SLOW_EVERY === 0) {
      const [config, vault, requests, owner, promo] = await Promise.all([
        view<RawConfig>(POOL_ID, 'get_config'),
        view<RawVault>(POOL_ID, 'get_vault'),
        view<RawRequest[]>(POOL_ID, 'get_withdraw_requests', { from_index: 0, limit: 200 }).catch(() => [] as RawRequest[]),
        view<string>(POOL_ID, 'get_owner').catch(() => null),
        view<RawPromo>(POOL_ID, 'get_promo').catch(() => null),
      ]);
      slow = { config, vault, requests, owner, promo };
    }
    const { config, vault, requests, owner, promo } = slow;
    const [a, positions, ledger, w] = await Promise.all([
      view<RawAccount>(POOL_ID, 'get_account', { account_id: id }),
      view<RawPosition[]>(POOL_ID, 'get_positions', { account_id: id }),
      view<RawEntry[]>(POOL_ID, 'get_ledger', { account_id: id, from_index: 0, limit: 100 }),
      loadWallet(id),
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
      ...w,
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
        maxDeposit: config.max_deposit != null ? fromUsdc(config.max_deposit) : MAX_DEPOSIT,
        slippageBase: (config.slippage_base_ppm ?? 50) / 1e6,
        slippageImpact: (config.slippage_impact_ppm ?? 200) / 1e6,
      },
      vault: { liquidity: fromUsdc(vault.liquidity), free: fromUsdc(vault.free) },
    });
  } catch (e) {
    // Not deployed yet? Ask for the contract code directly rather than trusting the error text.
    const missing = e instanceof RpcError && e.missing;
    if (missing) deployed = false;
    const w = await loadWallet(id);
    if (id !== account) return;
    set({ ...state, ready: true, missing, ...w, error: missing ? null : 'The network is busy, retrying…' });
  }
}

/** Start polling the pool for this NEAR account (or stop with null). */
export function watchPool(accountId: string | null) {
  if (accountId === account) return;
  account = accountId;
  seenCloses = null;
  tick = 0;
  slow = null;
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

// ---------- NEAR deposits ----------

/** Live: deposit NEAR through the contract, credited in USDC at the current NEAR price. */
export const nearDepositAction = (near: number) => call('deposit_near', {}, 30, toYocto(near));
/** Before launch: send NEAR straight to the pool account; credited at launch at the price of that moment. */
export const preLaunchNearDepositAction = (near: number): WalletAction => ({ type: 'Transfer', params: { deposit: toYocto(near) } });

// ---------- Deposit history read from the chain (NearBlocks) ----------

const NEARBLOCKS = ((import.meta.env.VITE_NEARBLOCKS_API as string | undefined) || 'https://api.nearblocks.io').replace(/\/$/, '');

export interface ChainDeposit {
  hash: string;
  account: string;
  asset: 'USDC' | 'NEAR';
  amount: number;
  at: number;
}

async function nb(path: string): Promise<any> {
  const r = await fetch(`${NEARBLOCKS}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`NearBlocks ${r.status}`);
  return r.json();
}

const nsToMs = (t: unknown) => Math.floor(Number(t ?? 0) / 1e6);

/** Every USDC and NEAR transfer into the pool account, newest first (best effort, up to `pages` x 50 each). */
export async function loadChainDeposits(pages = 4): Promise<ChainDeposit[]> {
  const out: ChainDeposit[] = [];
  for (let p = 1; p <= pages; p++) {
    const r = await nb(`/v1/account/${POOL_ID}/ft-txns?page=${p}&per_page=50&order=desc`);
    const txns: any[] = r?.txns ?? [];
    for (const t of txns) {
      const contract = t.ft?.contract ?? t.contract;
      const delta = Number(t.delta_amount ?? 0);
      if (contract !== USDC_ID || !(delta > 0) || !t.involved_account_id) continue;
      out.push({ hash: t.transaction_hash, account: t.involved_account_id, asset: 'USDC', amount: delta / 1e6, at: nsToMs(t.block_timestamp) });
    }
    if (txns.length < 50) break;
  }
  for (let p = 1; p <= pages; p++) {
    const r = await nb(`/v1/account/${POOL_ID}/txns?page=${p}&per_page=50&order=desc`);
    const txns: any[] = r?.txns ?? [];
    for (const t of txns) {
      const from = t.signer_account_id ?? t.predecessor_account_id;
      const acts: any[] = t.actions ?? [];
      const transfer = acts.length > 0 && acts.every((a) => String(a.action).toUpperCase() === 'TRANSFER');
      const ok = t.outcomes?.status !== false;
      if (t.receiver_account_id !== POOL_ID || !from || from === POOL_ID || !transfer || !ok) continue;
      const yocto = acts.reduce((s, a) => s + BigInt(String(a.deposit ?? '0').split('.')[0]), 0n);
      if (yocto === 0n) continue;
      out.push({ hash: t.transaction_hash, account: from, asset: 'NEAR', amount: fromYocto(yocto), at: nsToMs(t.block_timestamp) });
    }
    if (txns.length < 50) break;
  }
  return out.sort((a, b) => b.at - a.at);
}

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
  /** Value in USDC. */
  amount: number;
  asset?: 'USDC' | 'NEAR';
  /** Amount in the deposited asset. */
  units?: number;
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
  /** $NTR tokens per NITRO point, in whole tokens (decimals applied when known). */
  tokensPerPointRaw: string;
  /** Token base units still in the points pool, and per-account / daily caps (0 = none). */
  budgetRaw: string;
  maxPerAccountRaw: string;
  dailyLimitRaw: string;
  open: boolean;
}

/** Network-wide NITRO numbers from the contract (real USDC losses only). */
export async function loadNitroStats(): Promise<NitroStats> {
  const n = await view<{
    total_minted: string;
    total_converted: string;
    conversion: { token: string | null; tokens_per_point: string; budget?: string; max_per_account?: string; daily_limit?: string; open: boolean };
  }>(
    POOL_ID,
    'get_nitro',
  );
  return {
    totalMinted: fromUsdc(n.total_minted),
    totalConverted: fromUsdc(n.total_converted),
    token: n.conversion.token,
    tokensPerPointRaw: n.conversion.tokens_per_point,
    budgetRaw: n.conversion.budget ?? '0',
    maxPerAccountRaw: n.conversion.max_per_account ?? '0',
    dailyLimitRaw: n.conversion.daily_limit ?? '0',
    open: n.conversion.open,
  };
}

/** Token decimals from its NEP-148 metadata. */
export async function tokenDecimals(token: string): Promise<number> {
  return (await view<{ decimals: number }>(token, 'ft_metadata')).decimals;
}

/** Convert NITRO points to $NTR; attaches 0.00125 NEAR so the token can register the user. */
export const convertNitroAction = (points: number) => call('convert_nitro', { points: toUsdc(points) }, 60, '1250000000000000000000');

/** Real, network-wide Nitro numbers from the contract: all-time volume and current open interest. */
export async function loadNetworkStats(): Promise<{ volume: number; openInterest: number }> {
  const [rows, vault] = await Promise.all([loadLeaderboard(), view<RawVault>(POOL_ID, 'get_vault')]);
  return { volume: rows.reduce((s, r) => s + r.volume, 0), openInterest: fromUsdc(vault.open_interest ?? '0') };
}

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

/** Estimated slippage (fraction) for a position of `size` USDC, mirroring the contract. */
export function estimateSlippage(cfg: PoolConfig, vaultLiquidity: number, size: number): number {
  const maxSize = Math.max(1, vaultLiquidity * cfg.maxPositionShare);
  return cfg.slippageBase + (cfg.slippageImpact * Math.min(size, maxSize)) / maxSize;
}
