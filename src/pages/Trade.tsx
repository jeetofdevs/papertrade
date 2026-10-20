import { useState } from 'react';
import { Chart } from '../components/Chart';
import { LiveOrderPanel } from '../components/LiveOrderPanel';
import { LivePositions } from '../components/LivePositions';
import { MarketBar } from '../components/MarketBar';
import { OrderPanel } from '../components/OrderPanel';
import { Positions } from '../components/Positions';
import { PositionTrack } from '../components/PositionTrack';
import { TradeTicker } from '../components/TradeTicker';
import { account, Market, MARKETS, Position } from '../lib/engine';
import { useHl } from '../lib/hl/store';
import { useSettings } from '../lib/settings';
import { useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';

export function Trade() {
  const [market, setMarket] = useState<Market>(() => {
    try {
      return (localStorage.getItem('nitro:market') as Market) || 'NEAR';
    } catch {
      return 'NEAR';
    }
  });
  const { traderId } = useWallet();
  const acct = account(useStore(), traderId);
  const { mode } = useSettings();
  const live = mode === 'live';
  const hl = useHl();
  // Hyperliquid positions drawn on the chart like demo positions.
  const livePositions: Position[] = (hl.account?.positions ?? [])
    .filter((p) => (MARKETS as string[]).includes(p.coin))
    .map((p) => ({
      id: `hl-${p.coin}`,
      market: p.coin as Market,
      side: p.size > 0 ? 'long' : 'short',
      collateral: p.margin,
      leverage: p.leverage,
      size: p.value,
      entry: p.entry,
      liq: p.liq ?? p.entry * (1 - (p.size > 0 ? 1 : -1) / p.leverage),
      openedAt: 0,
    }));
  const pick = (m: Market) => {
    setMarket(m);
    try {
      localStorage.setItem('nitro:market', m);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="trade">
      <MarketBar market={market} onChange={pick} />
      <div className="trade-main">
        <Chart market={market} positions={live ? livePositions : acct.positions} history={live ? [] : acct.history} />
        {live ? <LiveOrderPanel market={market} /> : <OrderPanel market={market} />}
      </div>
      {(live ? livePositions : acct.positions).length > 0 && (
        <div className="tracks">
          {(live ? livePositions : acct.positions).slice(0, 6).map((p) => (
            <PositionTrack key={p.id} p={p} />
          ))}
        </div>
      )}
      <TradeTicker />
      {live ? <LivePositions /> : <Positions />}
    </div>
  );
}
