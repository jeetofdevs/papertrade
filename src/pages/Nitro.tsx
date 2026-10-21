import { useEffect, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { toast } from '../components/Toasts';
import { compact, usd } from '../lib/format';
import { convertNitroAction, loadNitroStats, NitroStats, POOL_ID, refreshPool, tokenDecimals, usePool } from '../lib/pool';
import { useWallet } from '../lib/wallet';
import { Stat } from './Earn';

const NITRO_PER_USDC = 10;

/** NITRO points (earned on real USDC losses only) and their conversion to the $NITRO token. */
export function Nitro() {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [stats, setStats] = useState<NitroStats | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () =>
      loadNitroStats()
        .then((s) => {
          if (!live) return;
          setStats(s);
          if (s.token) tokenDecimals(s.token).then((d) => live && setDecimals(d), () => {});
        })
        .catch(() => live && setStats(null));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const mine = pool.nitro;
  const total = stats?.totalMinted ?? 0;
  const share = total > 0 ? (mine / total) * 100 : 0;
  const rate = stats && decimals != null ? Number(stats.tokensPerPointRaw) / 10 ** decimals : null;
  const open = !!stats?.open;
  const n = Number(amount);
  const valid = open && !!accountId && n > 0 && n <= mine;

  const convert = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await signAndSend(POOL_ID, [convertNitroAction(n)]);
      toast.ok(`Converted ${compact(n)} NITRO to $NITRO`);
      setAmount('');
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
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
            Every USDC you lose trading real USDC on Nitro earns <b>{NITRO_PER_USDC} NITRO points</b>, recorded on chain in the Nitro
            contract. Demo trades never count. When the <b>$NITRO</b> token launches, points convert into tokens here.
          </p>
        </div>
      </section>

      <div className="cards">
        <Stat label="Your NITRO points" value={compact(mine)} accent />
        <Stat label="Share of all points" value={`${share.toFixed(2)}%`} />
        <Stat label="Total NITRO minted" value={compact(total)} />
        <Stat label="Converted to $NITRO" value={compact(stats?.totalConverted ?? 0)} />
      </div>

      <section className="panel pad convert">
        <div className="convert-head">
          <div>
            <span className="eyebrow">Convert</span>
            <h2>NITRO points → $NITRO token</h2>
          </div>
          <span className={`convert-status ${open ? 'on' : ''}`}>{open ? 'Open' : 'Opens at token launch'}</span>
        </div>

        <div className="convert-grid">
          <div className="convert-box">
            <span className="label">You convert</span>
            <div className="input">
              <input inputMode="decimal" placeholder="0" value={amount} disabled={!open} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
              <button className="chip" disabled={!open} onClick={() => setAmount(String(Math.floor(mine * 1e6) / 1e6))}>
                Max
              </button>
              <span className="unit">NITRO</span>
            </div>
            <span className="muted small">Available: {usd(mine)} points</span>
          </div>
          <div className="convert-arrow" aria-hidden="true">
            →
          </div>
          <div className="convert-box">
            <span className="label">You receive</span>
            <b className="mono convert-out">{open && rate != null ? usd(n * rate, 4) : '—'} $NITRO</b>
            <span className="muted small">{open && rate != null ? `1 NITRO = ${rate} $NITRO` : 'Rate announced at launch'}</span>
          </div>
        </div>

        <button className="btn btn-primary btn-block" disabled={!valid || busy} onClick={convert}>
          {busy ? 'Confirm in your wallet…' : open ? 'Convert to $NITRO' : 'Conversion opens at the $NITRO launch'}
        </button>
        <ul className="convert-notes muted small">
          <li>Points are safe on chain until then: nothing to claim now, just keep trading.</li>
          <li>Converting attaches 0.00125 NEAR so the token can register your wallet. If the transfer fails, your points come back.</li>
          <li>Only real USDC trades earn points. Demo mode and quests in demo never count.</li>
        </ul>
      </section>

      <div className="steps">
        {[
          ['01', 'Deposit USDC', 'Connect a NEAR wallet and deposit real USDC.'],
          ['02', 'Trade', 'Long or short NEAR, BTC, ETH and SOL up to 1000x. Your wager is your max loss.'],
          ['03', 'Win in USDC', 'Profits are paid from the Nitro vault (10% fee on profit).'],
          ['04', 'Lose into NITRO', `Every USDC lost earns ${NITRO_PER_USDC} NITRO points, convertible to $NITRO at launch.`],
        ].map(([num, t, d]) => (
          <div key={num} className="panel step">
            <span className="step-n mono">{num}</span>
            <h3>{t}</h3>
            <p className="muted">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
