import { LogoMark } from '../components/Logo';
import { toast } from '../components/Toasts';
import { account, claimPending, NITRO_PER_USD_LOST } from '../lib/engine';
import { compact, signedUsd, usd } from '../lib/format';
import { dispatch, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { Stat } from './Earn';

export function Nitro() {
  const state = useStore();
  const { traderId } = useWallet();
  const acct = account(state, traderId);
  const share = state.pool.nitroMinted > 0 ? (acct.nitro / state.pool.nitroMinted) * 100 : 0;

  const claim = () => {
    const err = dispatch((s) => claimPending(s, traderId));
    if (err) toast.err(err);
    else toast.ok('Queued profit paid out');
  };

  return (
    <div className="page">
      <section className="hero panel">
        <div className="hero-mark">
          <LogoMark size={88} />
        </div>
        <div>
          <span className="eyebrow">$NITRO · loss mining</span>
          <h1>Lose a trade. Keep the fuel.</h1>
          <p>
            Every USDC you lose on Nitro mints <b>{NITRO_PER_USD_LOST} NITRO</b> to your NEAR account. Liquidations count
            too. NITRO is the community's share of the protocol: the more the vault earns from traders, the more NITRO
            exists to share in it.
          </p>
        </div>
      </section>

      <div className="cards">
        <Stat label="Your NITRO" value={compact(acct.nitro)} accent />
        <Stat label="Share of supply" value={`${share.toFixed(2)}%`} />
        <Stat label="Total NITRO minted" value={compact(state.pool.nitroMinted)} />
        <Stat label="Realised PnL" value={signedUsd(acct.realizedPnl)} />
      </div>

      {acct.pendingProfit > 0 && (
        <div className="panel pad claim">
          <div>
            <span className="label">Queued profit</span>
            <b className="mono big up">${usd(acct.pendingProfit)}</b>
            <p className="muted small">The vault was short on liquidity when you closed. Claim once it refills.</p>
          </div>
          <button className="btn btn-primary" onClick={claim}>
            Claim
          </button>
        </div>
      )}

      <div className="steps">
        {[
          ['01', 'Connect', 'Sign in with any NEAR wallet: Meteor, MyNearWallet or HERE.'],
          ['02', 'Trade', 'Long or short NEAR, BTC, ETH and SOL from 1x to 1000x. Zero fees.'],
          ['03', 'Win in USDC', 'Profits are paid straight from the Nitro vault.'],
          ['04', 'Lose into NITRO', `Losses mint ${NITRO_PER_USD_LOST} NITRO per USDC, so every trade leaves you something.`],
        ].map(([n, t, d]) => (
          <div key={n} className="panel step">
            <span className="step-n mono">{n}</span>
            <h3>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
