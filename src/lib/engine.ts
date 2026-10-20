// Core trading rules for Nitro. Pure functions only: every action takes the
// current state and returns a new one, so the same logic is easy to test and
// to mirror in the on-chain contract (see /contract).

export type Market = 'NEAR' | 'BTC' | 'ETH' | 'SOL';
export type Side = 'long' | 'short';

export const MARKETS: Market[] = ['NEAR', 'BTC', 'ETH', 'SOL'];
export const MAX_LEVERAGE = 1000;
export const MIN_COLLATERAL = 1;
/**
 * Moon-style risk: the collateral is the trader's wager and the most they can lose.
 * A position closes automatically at the max loss price, where it has lost 100% of the wager.
 */
export const LIQUIDATION_LOSS = 1;
/** NITRO tokens minted for every 1 USDC a trader loses. */
export const NITRO_PER_USD_LOST = 10;
/** One position can be at most this share of pool liquidity. */
export const MAX_SIZE_OF_POOL = 0.02;
/** Demo USDC every new account starts with, and gets again after 24 hours. */
export const FAUCET_AMOUNT = 1_000;
export const FAUCET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface Position {
  id: string;
  market: Market;
  side: Side;
  collateral: number;
  leverage: number;
  size: number;
  entry: number;
  liq: number;
  openedAt: number;
}

export interface Trade {
  id: string;
  market: Market;
  side: Side;
  size: number;
  leverage: number;
  entry: number;
  exit: number;
  pnl: number;
  nitro: number;
  reason: 'close' | 'liquidated';
  closedAt: number;
}

export interface Account {
  usdc: number;
  nitro: number;
  /** Profit owed to the trader that the pool could not pay yet. */
  pendingProfit: number;
  lpShares: number;
  realizedPnl: number;
  volume: number;
  lastFaucet: number;
  positions: Position[];
  history: Trade[];
}

export interface Pool {
  liquidity: number;
  totalShares: number;
  nitroMinted: number;
}

export interface State {
  pool: Pool;
  accounts: Record<string, Account>;
}

export type Result = { state: State; error?: string };

export const emptyAccount = (): Account => ({
  usdc: 0,
  nitro: 0,
  pendingProfit: 0,
  lpShares: 0,
  realizedPnl: 0,
  volume: 0,
  lastFaucet: 0,
  positions: [],
  history: [],
});

export const initialState = (): State => ({
  pool: { liquidity: 2_500_000, totalShares: 2_500_000, nitroMinted: 0 },
  accounts: {},
});

const dir = (side: Side) => (side === 'long' ? 1 : -1);
const round = (n: number) => Math.round(n * 1e6) / 1e6;

let counter = 0;
const newId = (now: number) => `${now.toString(36)}${(counter++).toString(36)}`;

export function liquidationPrice(entry: number, side: Side, leverage: number): number {
  return entry * (1 - (dir(side) * LIQUIDATION_LOSS) / leverage);
}

/** Unrealised PnL in USDC. A loss never exceeds the collateral. */
export function unrealizedPnl(pos: Position, mark: number): number {
  const raw = pos.size * (mark / pos.entry - 1) * dir(pos.side);
  return Math.max(raw, -pos.collateral);
}

export function isLiquidatable(pos: Position, mark: number): boolean {
  return pos.side === 'long' ? mark <= pos.liq : mark >= pos.liq;
}

export function account(state: State, id: string): Account {
  return state.accounts[id] ?? emptyAccount();
}

function withAccount(state: State, id: string, acct: Account, pool = state.pool): State {
  return { pool, accounts: { ...state.accounts, [id]: acct } };
}

export function faucet(state: State, id: string, now: number): Result {
  const acct = account(state, id);
  if (now - acct.lastFaucet < FAUCET_COOLDOWN_MS) {
    return { state, error: 'Demo balance can be claimed once every 24 hours' };
  }
  return {
    state: withAccount(state, id, { ...acct, usdc: round(acct.usdc + FAUCET_AMOUNT), lastFaucet: now }),
  };
}

export interface OpenParams {
  market: Market;
  side: Side;
  collateral: number;
  leverage: number;
}

export function openPosition(state: State, id: string, p: OpenParams, mark: number, now: number): Result {
  const acct = account(state, id);
  if (!(mark > 0)) return { state, error: 'No price yet' };
  if (!(p.collateral >= MIN_COLLATERAL)) return { state, error: `Minimum wager is ${MIN_COLLATERAL} USDC` };
  if (!(p.leverage >= 1 && p.leverage <= MAX_LEVERAGE)) return { state, error: `Leverage must be 1x–${MAX_LEVERAGE}x` };
  if (p.collateral > acct.usdc + 1e-9) return { state, error: 'Insufficient USDC balance' };
  const size = p.collateral * p.leverage;
  const maxSize = state.pool.liquidity * MAX_SIZE_OF_POOL;
  if (size > maxSize) return { state, error: `Max position size is ${Math.floor(maxSize).toLocaleString('en-US')} USDC` };

  const pos: Position = {
    id: newId(now),
    market: p.market,
    side: p.side,
    collateral: p.collateral,
    leverage: p.leverage,
    size,
    entry: mark,
    liq: liquidationPrice(mark, p.side, p.leverage),
    openedAt: now,
  };
  return {
    state: withAccount(state, id, {
      ...acct,
      usdc: round(acct.usdc - p.collateral),
      volume: round(acct.volume + size),
      positions: [pos, ...acct.positions],
    }),
  };
}

/** Settle a position against the pool. Losses go to the pool and mint NITRO; profits are paid by the pool. */
export function closePosition(
  state: State,
  id: string,
  posId: string,
  mark: number,
  now: number,
  reason: Trade['reason'] = 'close',
): Result {
  const acct = account(state, id);
  const pos = acct.positions.find((x) => x.id === posId);
  if (!pos) return { state, error: 'Position not found' };

  const pnl = reason === 'liquidated' ? -pos.collateral : unrealizedPnl(pos, mark);
  const pool = { ...state.pool };
  let usdc = acct.usdc;
  let pending = acct.pendingProfit;
  let nitro = 0;

  if (pnl < 0) {
    pool.liquidity += -pnl;
    usdc += pos.collateral + pnl;
    nitro = -pnl * NITRO_PER_USD_LOST;
    pool.nitroMinted += nitro;
  } else {
    const paid = Math.min(pnl, pool.liquidity);
    pool.liquidity -= paid;
    usdc += pos.collateral + paid;
    pending += pnl - paid;
  }

  const trade: Trade = {
    id: pos.id,
    market: pos.market,
    side: pos.side,
    size: pos.size,
    leverage: pos.leverage,
    entry: pos.entry,
    exit: mark,
    pnl: round(pnl),
    nitro: round(nitro),
    reason,
    closedAt: now,
  };

  pool.liquidity = round(pool.liquidity);
  pool.nitroMinted = round(pool.nitroMinted);
  return {
    state: withAccount(
      state,
      id,
      {
        ...acct,
        usdc: round(usdc),
        nitro: round(acct.nitro + nitro),
        pendingProfit: round(pending),
        realizedPnl: round(acct.realizedPnl + pnl),
        positions: acct.positions.filter((x) => x.id !== posId),
        history: [trade, ...acct.history].slice(0, 200),
      },
      pool,
    ),
  };
}

/** Liquidate every position whose mark price crossed its liquidation price. */
export function runLiquidations(state: State, marks: Partial<Record<Market, number>>, now: number): State {
  let next = state;
  for (const [id, acct] of Object.entries(state.accounts)) {
    for (const pos of acct.positions) {
      const mark = marks[pos.market];
      if (mark && isLiquidatable(pos, mark)) {
        next = closePosition(next, id, pos.id, pos.liq, now, 'liquidated').state;
      }
    }
  }
  return next;
}

/** Pay out queued profit once the pool has the liquidity for it. */
export function claimPending(state: State, id: string): Result {
  const acct = account(state, id);
  if (acct.pendingProfit <= 0) return { state, error: 'Nothing to claim' };
  const paid = Math.min(acct.pendingProfit, state.pool.liquidity);
  if (paid <= 0) return { state, error: 'Vault has no free liquidity yet' };
  return {
    state: withAccount(
      state,
      id,
      { ...acct, usdc: round(acct.usdc + paid), pendingProfit: round(acct.pendingProfit - paid) },
      { ...state.pool, liquidity: round(state.pool.liquidity - paid) },
    ),
  };
}

export function sharePrice(pool: Pool): number {
  return pool.totalShares > 0 ? pool.liquidity / pool.totalShares : 1;
}

export function poolDeposit(state: State, id: string, amount: number): Result {
  const acct = account(state, id);
  if (!(amount > 0)) return { state, error: 'Enter an amount' };
  if (amount > acct.usdc + 1e-9) return { state, error: 'Insufficient USDC balance' };
  const shares = amount / sharePrice(state.pool);
  return {
    state: withAccount(
      state,
      id,
      { ...acct, usdc: round(acct.usdc - amount), lpShares: round(acct.lpShares + shares) },
      {
        ...state.pool,
        liquidity: round(state.pool.liquidity + amount),
        totalShares: round(state.pool.totalShares + shares),
      },
    ),
  };
}

export function poolWithdraw(state: State, id: string, shares: number): Result {
  const acct = account(state, id);
  if (!(shares > 0)) return { state, error: 'Enter an amount' };
  if (shares > acct.lpShares + 1e-9) return { state, error: 'Not enough LP shares' };
  const amount = shares * sharePrice(state.pool);
  return {
    state: withAccount(
      state,
      id,
      { ...acct, usdc: round(acct.usdc + amount), lpShares: round(acct.lpShares - shares) },
      {
        ...state.pool,
        liquidity: round(state.pool.liquidity - amount),
        totalShares: round(state.pool.totalShares - shares),
      },
    ),
  };
}
