import { useState } from 'react';
import { Chart } from '../components/Chart';
import { MarketBar } from '../components/MarketBar';
import { OrderPanel } from '../components/OrderPanel';
import { Positions } from '../components/Positions';
import { TradeTicker } from '../components/TradeTicker';
import { account, Market } from '../lib/engine';
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
        <Chart market={market} positions={acct.positions} history={acct.history} />
        <OrderPanel market={market} />
      </div>
      <TradeTicker />
      <Positions />
    </div>
  );
}
