import { useEffect, useRef, useState } from 'react';
import { LogoMark } from '../components/Logo';
import { TokenIcon } from '../components/TokenIcon';
import { useActivity } from '../lib/activity';
import { FAUCET_AMOUNT, Market, MARKETS, MAX_LEVERAGE, NITRO_PER_USD_LOST } from '../lib/engine';
import { compact, pct, price, usd } from '../lib/format';
import { getTicks, loadTicks, Point, usePrices } from '../lib/prices';
import { useWallet } from '../lib/wallet';
import { MARKET_NAME } from '../components/MarketBar';
import { Cat } from '../components/UwuDecor';

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
    `Demo mode gives every account ${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC with up to 1000x. Live mode trades real USDC on Orderly Network's shared order book through an EVM wallet, with each market's own leverage limit.`,
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

/** Live product preview: an example 1000x position on the real NEAR price. */
function HeroMock({ history }: { history: Point[] }) {
  const { tickers } = usePrices();
  const mark = tickers.NEAR?.price ?? 0;
  const [entry, setEntry] = useState(0);
  // Example position: $10 at 1000x. Re-open it whenever it would hit max loss or +100%.
  const lev = 1000;
  const wager = 10;
  const move = entry ? (mark / entry - 1) * lev : 0;
  useEffect(() => {
    if (mark && (!entry || move <= -1 || move >= 1)) setEntry(mark);
  }, [mark, entry, move]);
  const pnl = Math.max(-wager, wager * move);
  const roe = (pnl / wager) * 100;
  const pos = 50 + Math.max(-50, Math.min(50, move * 50));
  const d = heroPath(history, 320, 110);
  const change = tickers.NEAR ? (mark / tickers.NEAR.open24h - 1) * 100 : 0;

  return (
    <div className="mock-wrap" aria-hidden="true">
      <div className="orbit">
        {(['BTC', 'ETH', 'SOL'] as Market[]).map((m, i) => (
          <span key={m} className={`orbit-coin orbit-${i}`}>
            <TokenIcon market={m} size={34} />
          </span>
        ))}
      </div>
      <div className="mock panel">
        <div className="mock-head">
          <TokenIcon market="NEAR" size={28} />
          <div>
            <b>NEAR-PERP</b>
            <span className="muted small">NEAR Protocol</span>
          </div>
          <div className="mock-price">
            <b className="mono">{price(mark || undefined)}</b>
            <span className={`mono small ${change >= 0 ? 'up' : 'down'}`}>{tickers.NEAR ? pct(change) : ''}</span>
          </div>
        </div>
        <svg className="mock-chart" viewBox="0 0 320 110" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mockFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#00EC97" stopOpacity="0.3" />
              <stop offset="1" stopColor="#00EC97" stopOpacity="0" />
            </linearGradient>
          </defs>
          {d && (
            <>
              <path d={`${d} L320,110 L0,110 Z`} fill="url(#mockFill)" />
              <path d={d} fill="none" stroke="#00EC97" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        <div className="mock-pos">
          <span className="tag tag-long">long 1000x</span>
          <span className="muted small">example · $10 wager</span>
          <b className={`mono ${pnl >= 0 ? 'up' : 'down'}`}>
            {pnl >= 0 ? '+' : '−'}${usd(Math.abs(pnl))} <span className="small">({roe >= 0 ? '+' : ''}{roe.toFixed(0)}%)</span>
          </b>
        </div>
        <div className="track-bar mock-track">
          <div className="track-zone track-zone-loss" />
          <div className="track-zone track-zone-win" />
          <div
            className={`track-fill ${pos >= 50 ? 'track-fill-win' : 'track-fill-loss'}`}
            style={pos >= 50 ? { left: '50%', width: `${pos - 50}%` } : { left: `${pos}%`, width: `${50 - pos}%` }}
          />
          <span className="track-tick" style={{ left: '50%' }} />
          <span className="mock-rocket" style={{ left: `${pos}%` }}>
            🚀
          </span>
        </div>
        <div className="track-labels mono">
          <span className="down">max loss</span>
          <span className="muted">entry</span>
          <span className="up">+100%</span>
        </div>
        <div className="mock-buttons">
          <span className="mock-btn mock-long">Long</span>
          <span className="mock-btn mock-short">Short</span>
        </div>
      </div>
      <div className="mock-float mock-float-1 panel">
        <TokenIcon market="BTC" size={18} />
        <span className="mono">{price(tickers.BTC?.price)}</span>
      </div>
      <div className="mock-float mock-float-2 panel">
        <span className="accent">+300 NITRO</span>
        <span className="muted small">quest reward</span>
      </div>
    </div>
  );
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

  const marketVol = MARKETS.reduce((s, m) => s + stats[m].marketVolume24h, 0);
  const vol = MARKETS.reduce((s, m) => s + stats[m].volume24h, 0);
  const oi = MARKETS.reduce((s, m) => s + stats[m].longOi + stats[m].shortOi, 0);
  const cta = ready ? 'Connect wallet' : 'Loading wallets…';

  return (
    <div className="landing">
      <section className="hero3">
        <div className="hero3-bg" aria-hidden="true">
          <span className="blob blob-1" />
          <span className="blob blob-2" />
          <span className="blob blob-3" />
          <span className="hero3-grid" />
        </div>
        <div className="hero3-copy">
          <span className="hero2-pill">
            <span className="near-dot" /> Built on NEAR · Live trading on Orderly
          </span>
          <h1>
            Trade with <span className="hero2-grad">{MAX_LEVERAGE}x</span> leverage. Lose only your wager.
          </h1>
          <p>
            Long or short NEAR, BTC, ETH and SOL in one tap. Set a take profit, ride the rocket, and if it goes wrong
            your loss mints $NITRO.
          </p>
          <div className="hero2-cta" ref={heroCta}>
            <button className="btn btn-primary btn-xl" onClick={connect} disabled={!ready}>
              {cta}
            </button>
            <a className="btn btn-ghost-xl" href="#how">
              How it works
            </a>
          </div>
          <div className="hero3-proof">
            <div>
              <b className="mono">${compact(marketVol)}</b>
              <span>24h market volume</span>
            </div>
            <div>
              <b className="mono">{MAX_LEVERAGE}x</b>
              <span>max leverage</span>
            </div>
            <div>
              <b className="mono">4</b>
              <span>markets</span>
            </div>
          </div>
        </div>
        <HeroMock history={history} />
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

      <section className="lp-powered" aria-label="Built with">
        <span className="muted small">Built with</span>
        <span className="lp-logo">
          <TokenIcon market="NEAR" size={22} /> NEAR Protocol
        </span>
        <span className="lp-logo">
          <span className="lp-logo-mark">◆</span> Orderly Network
        </span>
        <span className="lp-logo">
          <span className="lp-logo-mark lp-logo-bn">◈</span> Binance market data
        </span>
        <span className="lp-logo">
          <span className="lp-logo-mark">⬡</span> Meteor · HERE · MyNearWallet
        </span>
      </section>

      <section className="lp-stats">
        {[
          ['Market volume 24h', `$${compact(marketVol)}`],
          ['Nitro volume 24h', `$${compact(vol)}`],
          ['Nitro open interest', `$${compact(oi)}`],
          ['Max leverage', `${MAX_LEVERAGE}x`],
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
          <span className="muted small">Live prices and 24h volume from Binance</span>
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

      <section className="lp-section">
        <div className="lp-head">
          <h2>Everything a degen needs</h2>
          <span className="muted small">and a cat</span>
        </div>
        <div className="bento">
          <div className="panel bento-card bento-big bento-lev">
            <span className="bento-kicker">Leverage</span>
            <h3>1x to 1000x in one slider</h3>
            <p className="muted">A $10 wager controls a $10,000 position. Pick it, tap Long or Short, done.</p>
            <div className="bento-lev-bar">
              {[2, 10, 50, 100, 500, 1000].map((x) => (
                <span key={x} className={x === 1000 ? 'on' : ''}>
                  {x}x
                </span>
              ))}
            </div>
          </div>
          <div className="panel bento-card bento-loss">
            <span className="bento-kicker">Risk</span>
            <h3>Your wager is your max loss</h3>
            <p className="muted">No margin calls, no debt. The position closes at exactly 100% of the wager.</p>
          </div>
          <div className="panel bento-card bento-tp">
            <span className="bento-kicker">Take profit</span>
            <h3>Ride the rocket to your TP</h3>
            <div className="bento-track">
              <span className="bento-track-fill" />
              <span className="bento-rocket">🚀</span>
              <span className="bento-flag">🏁</span>
            </div>
          </div>
          <div className="panel bento-card bento-nitro">
            <span className="bento-kicker">Loss mining</span>
            <h3>Losses mint $NITRO</h3>
            <p className="muted">{NITRO_PER_USD_LOST} NITRO for every USDC lost. Even a max loss leaves you something.</p>
          </div>
          <div className="panel bento-card bento-quests">
            <span className="bento-kicker">Quests</span>
            <h3>Daily missions, real rewards</h3>
            <ul className="bento-list">
              <li>
                <span>Open 3 trades</span>
                <b className="accent mono">+300</b>
              </li>
              <li>
                <span>Hit a take profit</span>
                <b className="accent mono">+500</b>
              </li>
              <li>
                <span>Win 3 in a row</span>
                <b className="accent mono">+1.5K</b>
              </li>
            </ul>
          </div>
          <div className="panel bento-card bento-share">
            <span className="bento-kicker">Flex</span>
            <h3>Five PnL card styles</h3>
            <div className="bento-cards">
              <span className="mini-card mini-classic">+312%</span>
              <span className="mini-card mini-moon">TO THE MOON</span>
              <span className="mini-card mini-neon">+88%</span>
              <span className="mini-card mini-paper">+41%</span>
              <span className="mini-card mini-uwu">uwu gains</span>
            </div>
          </div>
          <div className="panel bento-card bento-uwu">
            <span className="bento-kicker">Vibes</span>
            <h3>UWU mode</h3>
            <p className="muted">A pastel night sky and a cat that cheers your wins and cries at your losses.</p>
            <Cat mood="happy" />
          </div>
          <div className="panel bento-card bento-live">
            <span className="bento-kicker">Live</span>
            <h3>Real USDC on Orderly</h3>
            <p className="muted">Switch to Live and your orders go to Orderly Network&apos;s shared order book.</p>
          </div>
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

      <section className="lp-section">
        <div className="lp-head">
          <h2>Roadmap</h2>
        </div>
        <ol className="roadmap">
          {[
            ['Now', 'Demo trading up to 1000x, take profit, quests, PnL cards, UWU mode', true],
            ['Now', 'Live trading with real USDC on Orderly Network', true],
            ['Next', 'Nitro smart contract on NEAR with a USDC vault', false],
            ['Next', '$NITRO token claims for loss-mined balances', false],
            ['Later', 'More markets, trading competitions and referral rewards', false],
          ].map(([when, what, done], i) => (
            <li key={i} className={done ? 'rm-done' : ''}>
              <span className="rm-when mono">{when}</span>
              <span>{what}</span>
            </li>
          ))}
        </ol>
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
