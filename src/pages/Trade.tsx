import { lazy, Suspense, useState } from 'react';
import { Chart } from '../components/Chart';
import { MarketBar } from '../components/MarketBar';
import { OrderPanel } from '../components/OrderPanel';
import { Positions } from '../components/Positions';
import { PositionTrack } from '../components/PositionTrack';
import { TradeTicker } from '../components/TradeTicker';
import { account, Market } from '../lib/engine';
import { LIVE_AVAILABLE, useLiveSummary } from '../lib/live';
import { useSettings } from '../lib/settings';
import { useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';

const OrderlyLive = lazy(() => import('../live/OrderlyLive'));

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
  const liveSummary = useLiveSummary();
  const livePositions = liveSummary.positions;
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
        LIVE_AVAILABLE ? (
          <Suspense fallback={<div className="panel empty">Loading Orderly…</div>}>
            <OrderlyLive market={market} />
          </Suspense>
        ) : (
          <div className="panel pad live-off">
            <h3>Live mode is not set up yet</h3>
            <p className="muted">
              Live trading runs on Orderly Network and needs this site&apos;s Orderly broker ID. Set{' '}
              <code>VITE_ORDERLY_BROKER_ID</code> in Railway and redeploy. Until then, use Demo mode.
            </p>
          </div>
        )
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
      {!live && <Positions />}
    </div>
  );
}
