import { describe, expect, it } from 'vitest';
import {
  account,
  claimPending,
  closePosition,
  faucet,
  initialState,
  KAMI_PER_USD_LOST,
  liquidationPrice,
  openPosition,
  poolDeposit,
  poolWithdraw,
  runLiquidations,
  sharePrice,
  State,
} from './engine';

const ME = 'alice.testnet';
const funded = (): State => faucet(initialState(), ME, Date.now()).state;

describe('engine', () => {
  it('faucet gives USDC once per day', () => {
    const s = funded();
    expect(account(s, ME).usdc).toBe(10_000);
    expect(faucet(s, ME, Date.now()).error).toBeTruthy();
  });

  it('computes liquidation price', () => {
    expect(liquidationPrice(100, 'long', 10)).toBeCloseTo(91);
    expect(liquidationPrice(100, 'short', 10)).toBeCloseTo(109);
    expect(liquidationPrice(100, 'long', 1000)).toBeCloseTo(99.91);
  });

  it('opens a position and locks collateral', () => {
    const r = openPosition(funded(), ME, { market: 'NEAR', side: 'long', collateral: 100, leverage: 50 }, 5, 1);
    expect(r.error).toBeUndefined();
    const a = account(r.state, ME);
    expect(a.usdc).toBe(9_900);
    expect(a.positions[0].size).toBe(5_000);
  });

  it('rejects bad orders', () => {
    const s = funded();
    expect(openPosition(s, ME, { market: 'BTC', side: 'long', collateral: 20_000, leverage: 2 }, 1, 1).error).toMatch(/tidak cukup/);
    expect(openPosition(s, ME, { market: 'BTC', side: 'long', collateral: 10, leverage: 1001 }, 1, 1).error).toMatch(/Leverage/);
    expect(openPosition(s, ME, { market: 'BTC', side: 'long', collateral: 1000, leverage: 1000 }, 1, 1).error).toMatch(/maksimal/);
  });

  it('pays profit from the pool', () => {
    let s = openPosition(funded(), ME, { market: 'ETH', side: 'short', collateral: 100, leverage: 10 }, 100, 1).state;
    const pos = account(s, ME).positions[0];
    const poolBefore = s.pool.liquidity;
    s = closePosition(s, ME, pos.id, 90, 2).state; // -10% move, short wins 10% * 1000 = 100
    expect(account(s, ME).usdc).toBeCloseTo(10_100);
    expect(s.pool.liquidity).toBeCloseTo(poolBefore - 100);
    expect(account(s, ME).kami).toBe(0);
  });

  it('turns losses into KAMI and pool liquidity', () => {
    let s = openPosition(funded(), ME, { market: 'ETH', side: 'long', collateral: 100, leverage: 10 }, 100, 1).state;
    const pos = account(s, ME).positions[0];
    const poolBefore = s.pool.liquidity;
    s = closePosition(s, ME, pos.id, 95, 2).state; // -5% * 1000 = -50
    expect(account(s, ME).usdc).toBeCloseTo(9_950);
    expect(account(s, ME).kami).toBeCloseTo(50 * KAMI_PER_USD_LOST);
    expect(s.pool.liquidity).toBeCloseTo(poolBefore + 50);
  });

  it('liquidates positions past their liquidation price', () => {
    let s = openPosition(funded(), ME, { market: 'BTC', side: 'long', collateral: 100, leverage: 100 }, 100_000, 1).state;
    s = runLiquidations(s, { BTC: 99_950 }, 2);
    expect(account(s, ME).positions).toHaveLength(1);
    s = runLiquidations(s, { BTC: 99_000 }, 3);
    const a = account(s, ME);
    expect(a.positions).toHaveLength(0);
    expect(a.history[0].reason).toBe('liquidated');
    expect(a.usdc).toBeCloseTo(9_900);
    expect(a.kami).toBeCloseTo(100 * KAMI_PER_USD_LOST);
  });

  it('queues profit the pool cannot pay and lets the trader claim it later', () => {
    let s = funded();
    s = { ...s, pool: { ...s.pool, liquidity: 50_000 } };
    s = openPosition(s, ME, { market: 'SOL', side: 'long', collateral: 10, leverage: 100 }, 100, 1).state;
    const pos = account(s, ME).positions[0];
    s = { ...s, pool: { ...s.pool, liquidity: 30 } };
    s = closePosition(s, ME, pos.id, 110, 2).state; // +100 profit, pool only has 30
    expect(account(s, ME).pendingProfit).toBeCloseTo(70);
    expect(s.pool.liquidity).toBe(0);
    s = { ...s, pool: { ...s.pool, liquidity: 1_000 } };
    s = claimPending(s, ME).state;
    expect(account(s, ME).pendingProfit).toBe(0);
    expect(s.pool.liquidity).toBeCloseTo(930);
  });

  it('mints and burns LP shares at the current share price', () => {
    let s = poolDeposit(funded(), ME, 1_000).state;
    const shares = account(s, ME).lpShares;
    expect(shares).toBeCloseTo(1_000 / sharePrice(initialState().pool));
    s = { ...s, pool: { ...s.pool, liquidity: s.pool.liquidity * 1.1 } }; // pool earned 10%
    s = poolWithdraw(s, ME, shares).state;
    expect(account(s, ME).usdc).toBeCloseTo(9_000 + 1_100);
  });
});
