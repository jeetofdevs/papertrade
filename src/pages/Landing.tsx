import { LogoMark } from '../components/Logo';
import { TokenIcon } from '../components/TokenIcon';
import { FAUCET_AMOUNT, MARKETS, MAX_LEVERAGE, NITRO_PER_USD_LOST } from '../lib/engine';
import { pct, price } from '../lib/format';
import { usePrices } from '../lib/prices';
import { useWallet } from '../lib/wallet';

// Shown until a NEAR wallet is connected.
export function Landing() {
  const { connect, ready } = useWallet();
  const { tickers } = usePrices();

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-mark">
          <LogoMark size={96} />
        </div>
        <span className="eyebrow">Perpetuals on NEAR</span>
        <h1>
          Up to <span className="accent">{MAX_LEVERAGE}x</span> on NEAR, BTC, ETH and SOL.
        </h1>
        <p>
          Zero fees, zero slippage, zero funding. Your wager is your max loss. Every USDC you lose mints{' '}
          {NITRO_PER_USD_LOST} $NITRO.
        </p>
        <button className="btn btn-primary btn-xl" onClick={connect} disabled={!ready}>
          {ready ? 'Connect wallet' : 'Loading wallets…'}
        </button>
        <span className="muted small">
          Meteor · MyNearWallet · HERE — new accounts get {FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC
        </span>
      </section>

      <section className="landing-prices">
        {MARKETS.map((m) => {
          const t = tickers[m];
          const c = t ? (t.price / t.open24h - 1) * 100 : 0;
          return (
            <div key={m} className="panel landing-price">
              <TokenIcon market={m} size={36} />
              <div>
                <b>{m}-PERP</b>
                <span className="mono">{price(t?.price)}</span>
              </div>
              <span className={`mono small ${c >= 0 ? 'up' : 'down'}`}>{t ? pct(c) : '—'}</span>
            </div>
          );
        })}
      </section>

      <section className="steps">
        {[
          ['01', 'Connect', 'Sign in with your NEAR wallet. No sign-up, no KYC.'],
          ['02', 'Pick a wager', 'Choose how much you are willing to lose and a leverage from 1x to 1000x.'],
          ['03', 'Win in USDC', 'Profits are paid straight from the Nitro vault in USDC.'],
          ['04', 'Lose into NITRO', `Max loss hits mint ${NITRO_PER_USD_LOST} NITRO per USDC lost.`],
        ].map(([n, t, d]) => (
          <div key={n} className="panel step">
            <span className="step-n mono">{n}</span>
            <h3>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
