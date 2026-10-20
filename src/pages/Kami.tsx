import { LogoMark } from '../components/Logo';
import { toast } from '../components/Toasts';
import { account, claimPending, KAMI_PER_USD_LOST } from '../lib/engine';
import { compact, signedUsd, usd } from '../lib/format';
import { dispatch, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { Stat } from './Earn';

export function Kami() {
  const state = useStore();
  const { traderId } = useWallet();
  const acct = account(state, traderId);
  const share = state.pool.kamiMinted > 0 ? (acct.kami / state.pool.kamiMinted) * 100 : 0;

  const claim = () => {
    const err = dispatch((s) => claimPending(s, traderId));
    if (err) toast.err(err);
    else toast.ok('Profit antrean berhasil dibayar');
  };

  return (
    <div className="page">
      <section className="hero panel">
        <div className="hero-mark">
          <LogoMark size={88} />
        </div>
        <div>
          <span className="eyebrow">$KAMI · 紙 · kertas</span>
          <h1>Rugi trading? Tetap dapat kertasnya.</h1>
          <p>
            Setiap 1 USDC yang Anda rugikan di Kami mencetak <b>{KAMI_PER_USD_LOST} KAMI</b> ke akun NEAR Anda. Likuidasi
            juga dihitung. KAMI adalah bagian komunitas dari protokol: makin besar pendapatan vault dari trader, makin
            banyak KAMI yang ikut berbagi di dalamnya.
          </p>
        </div>
      </section>

      <div className="cards">
        <Stat label="KAMI Anda" value={compact(acct.kami)} accent />
        <Stat label="Porsi suplai" value={`${share.toFixed(2)}%`} />
        <Stat label="Total KAMI tercetak" value={compact(state.pool.kamiMinted)} />
        <Stat label="PnL terealisasi" value={signedUsd(acct.realizedPnl)} />
      </div>

      {acct.pendingProfit > 0 && (
        <div className="panel pad claim">
          <div>
            <span className="label">Profit dalam antrean</span>
            <b className="mono big up">${usd(acct.pendingProfit)}</b>
            <p className="muted small">Vault sedang kekurangan likuiditas saat posisi ditutup. Klaim setelah vault terisi lagi.</p>
          </div>
          <button className="btn btn-primary" onClick={claim}>
            Klaim
          </button>
        </div>
      )}

      <div className="steps">
        {[
          ['01', 'Hubungkan', 'Masuk dengan wallet NEAR apa saja: Meteor, MyNearWallet, atau HERE.'],
          ['02', 'Trading', 'Long atau short NEAR, BTC, ETH, dan SOL dari 1x sampai 1000x. Tanpa biaya.'],
          ['03', 'Untung dalam USDC', 'Profit dibayar langsung dari vault Kami.'],
          ['04', 'Rugi jadi KAMI', `Kerugian mencetak ${KAMI_PER_USD_LOST} KAMI per USDC, jadi setiap trade tetap menyisakan sesuatu.`],
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
