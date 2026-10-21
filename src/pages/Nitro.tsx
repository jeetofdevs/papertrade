import { useEffect, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { toast } from '../components/Toasts';
import { compact, usd } from '../lib/format';
import { convertNitroAction, loadNitroStats, NitroStats, POOL_ID, refreshPool, tokenDecimals, usePool } from '../lib/pool';
import { useWallet } from '../lib/wallet';
import { Stat } from './Earn';

/** NITRO points per 100 USDC of position size on real trades held 60s+. */
const POINTS_PER_100 = 1;
/** $NITRO total supply and the share of it set aside for NITRO points (split pro rata at conversion). */
const SUPPLY = Number(import.meta.env.VITE_NITRO_SUPPLY ?? 1_000_000_000);
const POINTS_SHARE = Number(import.meta.env.VITE_NITRO_POINTS_SHARE ?? 0.1);
const POINTS_POOL = SUPPLY * POINTS_SHARE;
const MCAPS = [5_000, 100_000, 1_000_000, 2_400_000];
/** Used for the estimate until real points exist. */
const EXAMPLE_TOTAL_POINTS = 1_000_000;

/** NITRO points (earned on real USDC losses only) and their conversion to the $NITRO token. */
export function Nitro() {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [stats, setStats] = useState<NitroStats | null>(null);
  const [decimals, setDecimals] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [mcap, setMcap] = useState(5_000);

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
          <span className="eyebrow">$NITRO · volume mining</span>
          <h1>Trade the size. Earn the fuel.</h1>
          <p>
            Every <b>$100 of position size</b> (wager × leverage) on a real USDC trade earns <b>{POINTS_PER_100} NITRO point</b>, win or lose,
            recorded on chain in the Nitro contract. Demo trades never count. When the <b>$NITRO</b> token launches, points convert into tokens
            here.
          </p>
        </div>
      </section>

      <div className="cards">
        <Stat label="Your NITRO points" value={compact(mine)} accent />
        <Stat label="Share of all points" value={`${share.toFixed(2)}%`} />
        <Stat label="Total NITRO minted" value={compact(total)} />
        <Stat label="Converted to $NITRO" value={compact(stats?.totalConverted ?? 0)} />
      </div>

      <section className="panel pad points-rules">
        <div>
          <span className="eyebrow">Rules</span>
          <h2>How NITRO points work</h2>
        </div>
        <ul className="rules-list">
          <li>
            <b>Earn:</b> {POINTS_PER_100} NITRO point per $100 of position size (wager × leverage) on real USDC trades held at least 60 seconds,
            win or lose. Example: $10 at 100x = $1,000 size = 10 points. Demo trades and the bonus balance earn none.
          </li>
          <li>
            <b>Points pool:</b> {(POINTS_SHARE * 100).toFixed(0)}% of the {compact(SUPPLY)} $NITRO supply ({compact(POINTS_POOL)} $NITRO) is
            reserved for NITRO points.
          </li>
          <li>
            <b>Convert:</b> at launch the pool is split pro rata: rate = {compact(POINTS_POOL)} $NITRO ÷ all points earned. Conversions can never
            exceed the pool, and per-wallet and daily limits keep it fair and spread out.
          </li>
          <li>
            <b>Value:</b> $NITRO price = market cap ÷ {compact(SUPPLY)}. At a ${usd(5_000, 0)} launch market cap that is ${(5_000 / SUPPLY).toFixed(6)} per
            token.
          </li>
        </ul>
        <PointsEstimator mine={mine} total={total} mcap={mcap} setMcap={setMcap} />
      </section>

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
        {open && decimals != null && stats && (
          <dl className="summary">
            <div>
              <dt>Points pool left</dt>
              <dd className="mono">{compact(Number(stats.budgetRaw) / 10 ** decimals)} $NITRO</dd>
            </div>
            <div>
              <dt>Limit per wallet</dt>
              <dd className="mono">{stats.maxPerAccountRaw === '0' ? 'none' : `${compact(Number(stats.maxPerAccountRaw) / 10 ** decimals)} $NITRO`}</dd>
            </div>
            <div>
              <dt>Daily limit (everyone)</dt>
              <dd className="mono">{stats.dailyLimitRaw === '0' ? 'none' : `${compact(Number(stats.dailyLimitRaw) / 10 ** decimals)} $NITRO`}</dd>
            </div>
          </dl>
        )}
        <ul className="convert-notes muted small">
          <li>Points are safe on chain until then: nothing to claim now, just keep trading.</li>
          <li>Converting attaches 0.00125 NEAR so the token can register your wallet. If the transfer fails, your points come back.</li>
          <li>Only real USDC trades earn points. Demo mode never counts.</li>
          <li>Conversions come from a fixed pool and have per-wallet and daily limits, so the supply released stays under control.</li>
        </ul>
      </section>

      <div className="steps">
        {[
          ['01', 'Deposit USDC', 'Connect a NEAR wallet and deposit real USDC.'],
          ['02', 'Trade', 'Long or short NEAR, BTC, ETH and SOL up to 1000x. Your wager is your max loss.'],
          ['03', 'Win in USDC', 'Profits are paid from the Nitro vault (10% fee on profit).'],
          ['04', 'Earn NITRO', `Every $100 of position size earns ${POINTS_PER_100} NITRO point, convertible to $NITRO at launch.`],
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

function PointsEstimator({ mine, total, mcap, setMcap }: { mine: number; total: number; mcap: number; setMcap: (n: number) => void }) {
  const realTotal = total > 0;
  const totalPoints = realTotal ? total : EXAMPLE_TOTAL_POINTS;
  const tokensPerPoint = POINTS_POOL / totalPoints;
  const tokenPrice = mcap / SUPPLY;
  const pointValue = tokensPerPoint * tokenPrice;
  const per1000Volume = pointValue * POINTS_PER_100 * 10;
  return (
    <div className="estimator">
      <div className="field-head">
        <span className="label">Estimate at a $NITRO market cap of</span>
      </div>
      <div className="row-chips">
        {MCAPS.map((m) => (
          <button key={m} className={`chip ${mcap === m ? 'chip-on' : ''}`} onClick={() => setMcap(m)}>
            ${compact(m)}
          </button>
        ))}
      </div>
      <dl className="summary">
        <div>
          <dt>$NITRO price</dt>
          <dd className="mono">${tokenPrice < 0.0001 ? tokenPrice.toFixed(7) : tokenPrice.toFixed(5)}</dd>
        </div>
        <div>
          <dt>{realTotal ? 'Points earned so far' : 'Example total points'}</dt>
          <dd className="mono">{compact(totalPoints)}</dd>
        </div>
        <div>
          <dt>$NITRO per point</dt>
          <dd className="mono">{compact(tokensPerPoint)}</dd>
        </div>
        <div>
          <dt>Value per $1,000 traded</dt>
          <dd className="mono accent">${per1000Volume < 0.01 ? per1000Volume.toFixed(4) : usd(per1000Volume)}</dd>
        </div>
        <div>
          <dt>Your points now worth</dt>
          <dd className="mono">
            {compact(mine * tokensPerPoint)} $NITRO ≈ ${usd(mine * pointValue)}
          </dd>
        </div>
      </dl>
      <p className="muted small">
        Estimates only: the final rate is set at launch from the real total of points, and the market sets the price.
      </p>
    </div>
  );
}
