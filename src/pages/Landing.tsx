import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { TokenIcon } from '../components/TokenIcon';
import { useActivity } from '../lib/activity';
import { FAUCET_AMOUNT, Market, MARKETS, MAX_LEVERAGE, NITRO_PER_USD_LOST } from '../lib/engine';
import { compact, pct, price, usd } from '../lib/format';
import { getTicks, loadTicks, Point, usePrices } from '../lib/prices';
import { useWallet } from '../lib/wallet';
import { MARKET_NAME } from '../components/MarketBar';

/** SVG path for the last n ticks, scaled into a w×h box. */
function sparkPath(m: Market, w: number, h: number, n = 160) {
  const pts = getTicks(m).slice(-n);
  if (pts.length < 2) return '';
  const vals = pts.map((p) => p.price);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || hi * 0.001 || 1;
  return vals
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / span) * h).toFixed(1)}`)
    .join(' ');
}

function Spark({ market, up }: { market: Market; up: boolean }) {
  const d = sparkPath(market, 100, 32, 90);
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={up ? '#00EC97' : '#FF5C7A'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const FAQ = [
  [
    'What is the most I can lose?',
    'Your wager. Pick how much you are willing to lose and a leverage. If the price reaches your max loss price, the position closes at a 100% loss of the wager and nothing more.',
  ],
  [
    'Are there any fees?',
    'No trading fees, no spread, no slippage and no funding payments. You trade at the mark price.',
  ],
  [
    'Who pays my profit?',
    'The Nitro vault is the other side of every trade. Profits are paid from it in USDC; losses flow into it.',
  ],
  [
    'What is $NITRO?',
    `Every USDC you lose mints ${NITRO_PER_USD_LOST} NITRO to your NEAR account, so even a max loss leaves you with something.`,
  ],
  [
    'Is this real money?',
    `New accounts start in demo mode with ${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC. Real USDC trading on NEAR switches on once the Nitro contract is live.`,
  ],
];

/** Hero background: loaded history plus live ticks, as a path in a w×h box. */
function heroPath(history: Point[], w: number, h: number) {
  const live = getTicks('NEAR').map((t) => ({ time: t.time / 1000, value: t.price }));
  const last = history.length ? history[history.length - 1].time : 0;
  const vals = [...history, ...live.filter((p) => p.time > last)].slice(-300).map((p) => p.value);
  if (vals.length < 10) return '';
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  return vals
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / span) * h).toFixed(1)}`)
    .join(' ');
}

export function Landing() {
  const { connect, ready } = useWallet();
  const { tickers, source } = usePrices();
  const { feed, stats } = useActivity();
  const [faq, setFaq] = useState<number | null>(0);
  const heroCta = useRef<HTMLDivElement>(null);
  const [showSticky, setShowSticky] = useState(false);
  const [history, setHistory] = useState<Point[]>([]);

  useEffect(() => {
    if (source === 'connecting') return;
    loadTicks('NEAR').then(setHistory);
  }, [source]);

  // The sticky mobile button appears only once the hero button scrolls away.
  useEffect(() => {
    const el = heroCta.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setShowSticky(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const vol = MARKETS.reduce((s, m) => s + stats[m].volume24h, 0);
  const oi = MARKETS.reduce((s, m) => s + stats[m].longOi + stats[m].shortOi, 0);
  const near = tickers.NEAR;
  const nearUp = near ? near.price >= near.open24h : true;
  const cta = ready ? 'Connect wallet' : 'Loading wallets…';

  return (
    <div className="landing">
      <section className="hero2">
        <svg className="hero2-chart" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#00EC97" stopOpacity="0.22" />
              <stop offset="1" stopColor="#00EC97" stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            const d = heroPath(history, 400, 100);
            return d ? (
              <>
                <path d={`${d} L400,120 L0,120 Z`} transform="translate(0,10)" fill="url(#heroFill)" />
                <path d={d} transform="translate(0,10)" fill="none" stroke="#00EC97" strokeOpacity="0.55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </>
            ) : null;
          })()}
        </svg>

        <div className="hero2-body">
          <div className="hero2-mark">
            <LogoMark size={72} />
          </div>
          <span className="hero2-pill">
            <span className="near-dot" /> Live on NEAR · {MAX_LEVERAGE}x max leverage
          </span>
          <h1>
            Trade with <span className="hero2-grad">{MAX_LEVERAGE}x</span>
            <br />
            leverage on NEAR.
          </h1>
          <p>Zero fees. Zero slippage. Your wager is your max loss, and every loss mints $NITRO.</p>
          <div className="hero2-cta" ref={heroCta}>
            <button className="btn btn-primary btn-xl" onClick={connect} disabled={!ready}>
              {cta}
            </button>
            <a className="btn btn-ghost-xl" href="#how">
              How it works
            </a>
          </div>
          {near && (
            <div className="hero2-live mono">
              <TokenIcon market="NEAR" size={18} />
              NEAR <b>{price(near.price)}</b>
              <span className={nearUp ? 'up' : 'down'}>{pct((near.price / near.open24h - 1) * 100)}</span>
            </div>
          )}
        </div>
      </section>

      {feed.length > 0 && (
        <section className="lp-ticker" aria-label="Live trades">
          <div className="lp-ticker-track">
            {[...feed.slice(0, 16), ...feed.slice(0, 16)].map((a, i) => (
              <span key={`${a.id}-${i}`} className="ticker-item">
                <TokenIcon market={a.market} size={16} />
                <b
                  className={`mono ${a.kind === 'open' ? (a.side === 'long' ? 'up' : 'down') : a.amount >= 0 ? 'up' : a.kind === 'bust' ? 'warn' : 'down'}`}
                >
                  {a.kind === 'open'
                    ? `${a.side === 'long' ? '▲' : '▼'} $${compact(a.amount)}`
                    : `${a.amount >= 0 ? '+' : '−'}$${usd(Math.abs(a.amount))}`}
                </b>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="lp-stats">
        {[
          ['24h volume', `$${compact(vol)}`],
          ['Open interest', `$${compact(oi)}`],
          ['Max leverage', `${MAX_LEVERAGE}x`],
          ['Trading fees', '$0'],
        ].map(([l, v]) => (
          <div key={l} className="lp-stat">
            <b className="mono">{v}</b>
            <span>{l}</span>
          </div>
        ))}
      </section>

      <section className="lp-section">
        <div className="lp-head">
          <h2>Markets</h2>
          <span className="muted small">Live mark prices</span>
        </div>
        <div className="lp-markets">
          {MARKETS.map((m) => {
            const t = tickers[m];
            const c = t ? (t.price / t.open24h - 1) * 100 : 0;
            return (
              <button key={m} className="panel lp-market" onClick={connect} disabled={!ready}>
                <div className="lp-market-top">
                  <TokenIcon market={m} size={34} />
                  <div className="lp-market-name">
                    <b>{m}-PERP</b>
                    <span className="muted small">{MARKET_NAME[m]}</span>
                  </div>
                  <span className={`lp-chip mono ${c >= 0 ? 'up' : 'down'}`}>{t ? pct(c) : '—'}</span>
                </div>
                <Spark market={m} up={c >= 0} />
                <div className="lp-market-bottom">
                  <b className="mono">{price(t?.price)}</b>
                  <span className="muted small">up to {MAX_LEVERAGE}x</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="lp-section lp-example panel">
        <div>
          <span className="eyebrow">Example</span>
          <h2>$10 wager × 1000x</h2>
          <p className="muted">
            That is a $10,000 position. A 1% move your way pays <b className="up">+$100</b>. A 0.1% move against you
            closes it at your max loss of <b className="down">$10</b>, and mints <b className="accent">100 NITRO</b>.
          </p>
        </div>
        <div className="lp-calc mono">
          <div>
            <span>Wager</span>
            <b>$10</b>
          </div>
          <div>
            <span>Leverage</span>
            <b className="warn">1000x</b>
          </div>
          <div>
            <span>Position</span>
            <b>$10,000</b>
          </div>
          <div>
            <span>+1% move</span>
            <b className="up">+$100</b>
          </div>
          <div>
            <span>Max loss</span>
            <b className="down">−$10</b>
          </div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <div className="lp-head">
          <h2>How it works</h2>
        </div>
        <ol className="lp-steps">
          {[
            ['Connect', 'Sign in with Meteor, MyNearWallet or HERE. No sign-up, no KYC.'],
            ['Pick a wager', 'Choose what you are willing to lose and a leverage from 1x to 1000x.'],
            ['Win in USDC', 'Close any time. Profits are paid straight from the Nitro vault.'],
            ['Lose into NITRO', `Every USDC lost mints ${NITRO_PER_USD_LOST} NITRO to your account.`],
          ].map(([t, d], i) => (
            <li key={t} className="panel lp-step">
              <span className="lp-step-n mono">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{t}</h3>
                <p className="muted">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section">
        <div className="lp-head">
          <h2>FAQ</h2>
        </div>
        <div className="lp-faq">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`panel lp-q ${faq === i ? 'lp-q-open' : ''}`}>
              <button className="lp-q-btn" aria-expanded={faq === i} onClick={() => setFaq(faq === i ? null : i)}>
                <span>{q}</span>
                <span className="lp-q-icon" aria-hidden="true">
                  +
                </span>
              </button>
              {faq === i && <p className="muted">{a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="lp-final panel">
        <LogoMark size={48} />
        <h2>Ready to go {MAX_LEVERAGE}x?</h2>
        <p className="muted">Connect your NEAR wallet and get {FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC to start.</p>
        <button className="btn btn-primary btn-xl" onClick={connect} disabled={!ready}>
          {cta}
        </button>
      </section>

      <div className={`lp-sticky ${showSticky ? 'lp-sticky-on' : ''}`}>
        <button className="btn btn-primary btn-block" onClick={connect} disabled={!ready}>
          {cta}
        </button>
      </div>
    </div>
  );
}
