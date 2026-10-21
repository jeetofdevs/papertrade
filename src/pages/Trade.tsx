import { useState } from 'react';
import { Chart } from '../components/Chart';
import { MarketBar } from '../components/MarketBar';
import { OrderPanel } from '../components/OrderPanel';
import { Positions } from '../components/Positions';
import { PositionTrack } from '../components/PositionTrack';
import { TradeTicker } from '../components/TradeTicker';
import { account, Market } from '../lib/engine';
import { usePool } from '../lib/pool';
import { PoolPositions, PoolTrade } from '../live/PoolTrade';
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
  const livePositions = usePool().positions;
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
      {live ? (
        <PoolTrade market={market} />
      ) : (
        <div className="trade-main">
          <Chart market={market} positions={acct.positions} history={acct.history} />
          <OrderPanel market={market} />
        </div>
      )}
      {(live ? livePositions : acct.positions).length > 0 && (
        <div className="tracks">
          {(live ? livePositions : acct.positions).slice(0, 6).map((p) => (
            <PositionTrack key={p.id} p={p} />
          ))}
        </div>
      )}
      <TradeTicker />
      {live ? <PoolPositions /> : <Positions />}
    </div>
  );
}
