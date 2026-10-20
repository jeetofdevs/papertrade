// Hyperliquid connection: EVM wallet, one-time approvals, agent key, orders.
//
// How signing works:
// - The user's own EVM wallet (MetaMask, Rabby, …) signs two one-time approvals:
//   the builder fee (only if a builder is configured) and an "agent" key.
// - The agent key lives in this browser and signs orders, so trades need no wallet popup.
//   An agent can trade but can never withdraw funds.

import type { ExchangeClient, InfoClient } from '@nktkas/hyperliquid';
import type { Market } from '../engine';

export const HL_TESTNET = import.meta.env.VITE_HL_NETWORK === 'testnet';
/** Builder address that receives the frontend fee. Leave unset to charge none. */
export const HL_BUILDER = ((import.meta.env.VITE_HL_BUILDER as string | undefined) || '').toLowerCase() as `0x${string}` | '';
/** Builder fee in tenths of a basis point (10 = 0.01%). Hyperliquid caps perps at 100 (0.1%). */
export const HL_BUILDER_FEE = Math.min(100, Math.max(0, Number(import.meta.env.VITE_HL_BUILDER_FEE ?? 0) || 0));
export const HL_APP_URL = HL_TESTNET ? 'https://app.hyperliquid-testnet.xyz' : 'https://app.hyperliquid.xyz';
/** Hyperliquid rejects orders below this notional value. */
export const HL_MIN_NOTIONAL = 10;
/** Market orders are sent as IOC limits this far through the mid price. */
const SLIPPAGE = 0.01;
const AGENT_NAME = 'nitro';

type Hex = `0x${string}`;

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, fn: (...a: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

export interface AssetInfo {
  index: number;
  szDecimals: number;
  maxLeverage: number;
}

export interface HlPosition {
  coin: string;
  size: number; // signed: >0 long, <0 short
  entry: number;
  value: number;
  pnl: number;
  roe: number;
  liq: number | null;
  margin: number;
  leverage: number;
  isolated: boolean;
}

export interface HlAccount {
  accountValue: number;
  withdrawable: number;
  positions: HlPosition[];
}

let sdk: typeof import('@nktkas/hyperliquid') | null = null;
let viem: { accounts: typeof import('viem/accounts'); core: typeof import('viem') } | null = null;
let info: InfoClient | null = null;
let assets: Record<string, AssetInfo> | null = null;

async function load() {
  if (!sdk) sdk = await import('@nktkas/hyperliquid');
  if (!viem) viem = { accounts: await import('viem/accounts'), core: await import('viem') };
  if (!info) info = new sdk.InfoClient({ transport: new sdk.HttpTransport({ isTestnet: HL_TESTNET }) });
  return { sdk, viem, info };
}

export function hasEvmWallet() {
  return typeof window !== 'undefined' && !!window.ethereum;
}

/** Ask the injected EVM wallet for an address. */
export async function connectEvm(): Promise<Hex> {
  if (!window.ethereum) throw new Error('No EVM wallet found. Install MetaMask or Rabby to trade on Hyperliquid.');
  const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.[0]) throw new Error('No account selected in your wallet');
  return accounts[0].toLowerCase() as Hex;
}

/** The connected address, if the wallet already granted access. */
export async function currentEvm(): Promise<Hex | null> {
  if (!window.ethereum) return null;
  const accounts = (await window.ethereum.request({ method: 'eth_accounts' })) as string[];
  return (accounts?.[0]?.toLowerCase() as Hex) ?? null;
}

async function mainWallet(user: Hex) {
  const { viem } = await load();
  return viem.core.createWalletClient({ account: user, transport: viem.core.custom(window.ethereum!) });
}

// ---- Agent key (kept in this browser, per user and network) ----

const agentKey = (user: string) => `nitro:hl-agent:${HL_TESTNET ? 'testnet' : 'mainnet'}:${user.toLowerCase()}`;

function savedAgent(user: string): Hex | null {
  try {
    return (localStorage.getItem(agentKey(user)) as Hex | null) ?? null;
  } catch {
    return null;
  }
}

async function agentAccount(user: string) {
  const pk = savedAgent(user);
  if (!pk) return null;
  const { viem } = await load();
  return viem.accounts.privateKeyToAccount(pk);
}

export function forgetAgent(user: string) {
  try {
    localStorage.removeItem(agentKey(user));
  } catch {
    /* ignore */
  }
}

async function agentExchange(user: Hex): Promise<ExchangeClient> {
  const { sdk } = await load();
  const wallet = await agentAccount(user);
  if (!wallet) throw new Error('Enable trading first');
  return new sdk.ExchangeClient({ transport: new sdk.HttpTransport({ isTestnet: HL_TESTNET }), wallet });
}

// ---- Setup ----

export interface SetupStatus {
  agentApproved: boolean;
  builderApproved: boolean;
}

export async function setupStatus(user: Hex): Promise<SetupStatus> {
  const { info } = await load();
  const agent = await agentAccount(user);
  let agentApproved = false;
  if (agent) {
    const agents = await info.extraAgents({ user });
    const now = Date.now();
    agentApproved = agents.some(
      (a) => a.address.toLowerCase() === agent.address.toLowerCase() && (!a.validUntil || a.validUntil > now),
    );
  }
  let builderApproved = true;
  if (HL_BUILDER && HL_BUILDER_FEE > 0) {
    const max = await info.maxBuilderFee({ user, builder: HL_BUILDER });
    builderApproved = max >= HL_BUILDER_FEE;
  }
  return { agentApproved, builderApproved };
}

/** One-time approvals, signed by the user's own wallet. */
export async function enableTrading(user: Hex) {
  const { sdk, viem } = await load();
  const wallet = await mainWallet(user);
  const exchange = new sdk.ExchangeClient({ transport: new sdk.HttpTransport({ isTestnet: HL_TESTNET }), wallet });
  const status = await setupStatus(user);
  if (!status.builderApproved) {
    await exchange.approveBuilderFee({ builder: HL_BUILDER as Hex, maxFeeRate: `${HL_BUILDER_FEE / 1000}%` });
  }
  if (!status.agentApproved) {
    const pk = viem.accounts.generatePrivateKey();
    const agent = viem.accounts.privateKeyToAccount(pk);
    await exchange.approveAgent({ agentAddress: agent.address, agentName: AGENT_NAME });
    try {
      localStorage.setItem(agentKey(user), pk);
    } catch {
      throw new Error('Your browser blocked storage, so the trading key cannot be kept');
    }
  }
}

// ---- Market data ----

export async function getAssets(): Promise<Record<string, AssetInfo>> {
  if (assets) return assets;
  const { info } = await load();
  const meta = await info.meta();
  assets = {};
  meta.universe.forEach((u, index) => {
    assets![u.name] = { index, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage };
  });
  return assets;
}

export async function getMids(): Promise<Record<string, number>> {
  const { info } = await load();
  const mids = await info.allMids();
  return Object.fromEntries(Object.entries(mids).map(([k, v]) => [k, Number(v)]));
}

export async function getAccount(user: Hex): Promise<HlAccount> {
  const { info } = await load();
  const s = await info.clearinghouseState({ user });
  return {
    accountValue: Number(s.marginSummary.accountValue),
    withdrawable: Number(s.withdrawable),
    positions: s.assetPositions.map(({ position: p }) => ({
      coin: p.coin,
      size: Number(p.szi),
      entry: Number(p.entryPx),
      value: Number(p.positionValue),
      pnl: Number(p.unrealizedPnl),
      roe: Number(p.returnOnEquity) * 100,
      liq: p.liquidationPx ? Number(p.liquidationPx) : null,
      margin: Number(p.marginUsed),
      leverage: p.leverage.value,
      isolated: p.leverage.type === 'isolated',
    })),
  };
}

// ---- Number formatting Hyperliquid accepts ----

/** Perp prices: at most 5 significant figures and at most (6 - szDecimals) decimals. */
export function formatPrice(px: number, szDecimals: number): string {
  if (Number.isInteger(px)) return String(px);
  const sig = Number(px.toPrecision(5));
  const decimals = Math.max(0, 6 - szDecimals);
  return String(Number(sig.toFixed(decimals)));
}

/** Sizes are rounded down to the asset's size decimals. */
export function formatSize(sz: number, szDecimals: number): string {
  const f = 10 ** szDecimals;
  return String(Math.floor(sz * f + 1e-9) / f);
}

function orderError(res: unknown): string | null {
  const statuses = (res as { response?: { data?: { statuses?: Array<Record<string, unknown>> } } })?.response?.data?.statuses ?? [];
  for (const s of statuses) if (typeof s.error === 'string') return s.error;
  return null;
}

const builder = () => (HL_BUILDER && HL_BUILDER_FEE > 0 ? { b: HL_BUILDER as Hex, f: HL_BUILDER_FEE } : undefined);

// ---- Trading ----

export interface OpenArgs {
  market: Market;
  isLong: boolean;
  wager: number; // isolated margin in USDC
  leverage: number;
  takeProfit?: number | null;
}

/** Open an isolated position at market: the wager is the margin, so it is also the most you can lose. */
export async function openMarket(user: Hex, a: OpenArgs) {
  const ex = await agentExchange(user);
  const all = await getAssets();
  const asset = all[a.market];
  if (!asset) throw new Error(`${a.market} is not listed on Hyperliquid`);
  if (a.leverage > asset.maxLeverage) throw new Error(`${a.market} allows up to ${asset.maxLeverage}x on Hyperliquid`);
  const mid = (await getMids())[a.market];
  if (!mid) throw new Error('No price from Hyperliquid');
  const notional = a.wager * a.leverage;
  if (notional < HL_MIN_NOTIONAL) throw new Error(`Hyperliquid needs a position of at least $${HL_MIN_NOTIONAL}`);
  const size = formatSize(notional / mid, asset.szDecimals);
  if (Number(size) <= 0) throw new Error('Position too small for this market');

  await ex.updateLeverage({ asset: asset.index, isCross: false, leverage: Math.floor(a.leverage) });
  const px = formatPrice(mid * (a.isLong ? 1 + SLIPPAGE : 1 - SLIPPAGE), asset.szDecimals);
  const res = await ex.order({
    orders: [{ a: asset.index, b: a.isLong, p: px, s: size, r: false, t: { limit: { tif: 'Ioc' } } }],
    grouping: 'na',
    builder: builder(),
  });
  const err = orderError(res);
  if (err) throw new Error(err);

  if (a.takeProfit) await setTakeProfit(user, a.market, a.isLong, Number(size), a.takeProfit);
  return { size: Number(size), mid };
}

/** Reduce-only take-profit trigger that closes the position at market. */
export async function setTakeProfit(user: Hex, market: Market, isLong: boolean, size: number, tp: number) {
  const ex = await agentExchange(user);
  const asset = (await getAssets())[market];
  const trigger = formatPrice(tp, asset.szDecimals);
  const limit = formatPrice(tp * (isLong ? 1 - SLIPPAGE : 1 + SLIPPAGE), asset.szDecimals);
  const res = await ex.order({
    orders: [
      {
        a: asset.index,
        b: !isLong,
        p: limit,
        s: formatSize(size, asset.szDecimals),
        r: true,
        t: { trigger: { isMarket: true, triggerPx: trigger, tpsl: 'tp' } },
      },
    ],
    grouping: 'na',
    builder: builder(),
  });
  const err = orderError(res);
  if (err) throw new Error(`Take profit not set: ${err}`);
}

/** Close a whole position at market with a reduce-only order. */
export async function closeMarket(user: Hex, pos: HlPosition) {
  const ex = await agentExchange(user);
  const asset = (await getAssets())[pos.coin];
  const mid = (await getMids())[pos.coin];
  const isLong = pos.size > 0;
  const px = formatPrice(mid * (isLong ? 1 - SLIPPAGE : 1 + SLIPPAGE), asset.szDecimals);
  const res = await ex.order({
    orders: [{ a: asset.index, b: !isLong, p: px, s: formatSize(Math.abs(pos.size), asset.szDecimals), r: true, t: { limit: { tif: 'Ioc' } } }],
    grouping: 'na',
    builder: builder(),
  });
  const err = orderError(res);
  if (err) throw new Error(err);
  await cancelReduceOnly(user, pos.coin);
}

/** Cancel leftover reduce-only orders (such as a take profit) for a coin. */
async function cancelReduceOnly(user: Hex, coin: string) {
  try {
    const { info } = await load();
    const asset = (await getAssets())[coin];
    const open = await info.frontendOpenOrders({ user });
    const cancels = open.filter((o) => o.coin === coin && o.reduceOnly).map((o) => ({ a: asset.index, o: o.oid }));
    if (cancels.length) await (await agentExchange(user)).cancel({ cancels });
  } catch {
    /* a leftover reduce-only order cannot open a position, so this is best effort */
  }
}
