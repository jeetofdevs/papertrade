import { useState } from 'react';
import { Chart } from '../components/Chart';
import { MarketBar } from '../components/MarketBar';
import { OrderPanel } from '../components/OrderPanel';
import { Positions } from '../components/Positions';
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
  const positions = account(useStore(), traderId).positions;
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
        <Chart market={market} positions={positions} />
        <OrderPanel market={market} />
      </div>
      <Positions />
    </div>
  );
}
