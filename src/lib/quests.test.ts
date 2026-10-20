import { describe, expect, it } from 'vitest';
import { closedTrades, level, quests } from './quests';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const H = 3_600_000;

describe('quests on real fills', () => {
  it('merges partial closing fills into one trade', () => {
    const t = closedTrades([
      { at: NOW - H, market: 'BTC', usd: 500, pnl: 3 },
      { at: NOW - H + 1000, market: 'BTC', usd: 500, pnl: 2 },
      { at: NOW - 10, market: 'ETH', usd: 200, pnl: -1 },
    ]);
    expect(t).toHaveLength(2);
    expect(t[0].pnl).toBe(5);
  });

  it('counts real volume, wins, markets and leverage', () => {
    const q = quests(
      {
        fills: [
          { at: NOW - H, market: 'NEAR', usd: 600, pnl: 0 },
          { at: NOW - H / 2, market: 'BTC', usd: 500, pnl: 0 },
          { at: NOW - 60_000, market: 'NEAR', usd: 610, pnl: 4.2 },
        ],
        opens: [
          { at: NOW - H, market: 'NEAR', usd: 600, leverage: 20 },
          { at: NOW - H / 2, market: 'BTC', usd: 500, leverage: 5 },
        ],
        shares: [],
        claims: {},
      },
      NOW,
    );
    const by = Object.fromEntries(q.map((x) => [x.id, x]));
    expect(by['d-volume'].progress).toBeCloseTo(1710);
    expect(by['d-volume'].done).toBe(true);
    expect(by['d-win'].done).toBe(true);
    expect(by['d-markets'].done).toBe(true);
    expect(by['d-lev'].done).toBe(true);
    expect(by['d-trades'].progress).toBe(2);
  });

  it('ignores fills from before today for daily quests and respects claims', () => {
    const q = quests(
      { fills: [{ at: NOW - 30 * H, market: 'SOL', usd: 5000, pnl: 0 }], opens: [], shares: [], claims: { 'live:w-volume': '2026-10-19' } },
      NOW,
    );
    const by = Object.fromEntries(q.map((x) => [x.id, x]));
    expect(by['d-volume'].progress).toBe(0);
    expect(by['w-volume'].progress).toBe(5000);
    expect(by['w-volume'].claimed).toBe(true);
  });

  it('levels from real volume', () => {
    expect(level(0).name).toBe('Paper hands');
    expect(level(1_000).name).toBe('Rookie');
    expect(level(10_000).name).toBe('Degen');
  });
});
