import { Market, MARKETS } from '../lib/engine';
import { compact, pct, price } from '../lib/format';
import { usePrices } from '../lib/prices';

export const MARKET_NAME: Record<Market, string> = {
  NEAR: 'NEAR Protocol',
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
};

export function MarketBar({ market, onChange }: { market: Market; onChange: (m: Market) => void }) {
  const { tickers } = usePrices();
  const t = tickers[market];
  const change = t ? (t.price / t.open24h - 1) * 100 : 0;
  return (
    <div className="panel market-bar">
      <div className="market-tabs" role="tablist">
        {MARKETS.map((m) => {
          const x = tickers[m];
          const c = x ? (x.price / x.open24h - 1) * 100 : 0;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={m === market}
              className={`market-tab ${m === market ? 'market-tab-on' : ''}`}
              onClick={() => onChange(m)}
            >
              <span className={`coin coin-${m}`}>{m[0]}</span>
              <span>
                <b>{m}-PERP</b>
                <span className={`mono small ${c >= 0 ? 'up' : 'down'}`}>{price(x?.price)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="stats">
        <div>
          <span className="label">{MARKET_NAME[market]}</span>
          <b className={`mono big ${change >= 0 ? 'up' : 'down'}`}>{price(t?.price)}</b>
        </div>
        <div>
          <span className="label">Perubahan 24j</span>
          <b className={`mono ${change >= 0 ? 'up' : 'down'}`}>{t ? pct(change) : '—'}</b>
        </div>
        <div className="hide-sm">
          <span className="label">Tertinggi 24j</span>
          <b className="mono">{price(t?.high24h)}</b>
        </div>
        <div className="hide-sm">
          <span className="label">Terendah 24j</span>
          <b className="mono">{price(t?.low24h)}</b>
        </div>
        <div className="hide-sm">
          <span className="label">Volume 24j</span>
          <b className="mono">{t?.volume24h ? `$${compact(t.volume24h)}` : '—'}</b>
        </div>
        <div>
          <span className="label">Leverage maks</span>
          <b className="mono accent">1000x</b>
        </div>
      </div>
    </div>
  );
}
