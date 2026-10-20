import { MARKETS } from '../lib/engine';
import { pct, price } from '../lib/format';
import { LIVE_AVAILABLE } from '../lib/live';
import { usePrices } from '../lib/prices';
import { useSettings } from '../lib/settings';
import { NETWORK } from '../lib/wallet';
import { Logo } from './Logo';
import { TokenIcon } from './TokenIcon';

const env = import.meta.env;
// Social links appear only when configured, so the footer never points at accounts that do not exist.
const SOCIALS = [
  { name: 'X', href: env.VITE_LINK_X as string | undefined, path: 'M17.5 3h3.2l-7 8 8.3 10h-6.5l-5.1-6.2L4.6 21H1.4l7.5-8.6L1 3h6.6l4.6 5.7L17.5 3Zm-1.1 16.2h1.8L6.7 4.7H4.8l11.6 14.5Z' },
  { name: 'Telegram', href: env.VITE_LINK_TELEGRAM as string | undefined, path: 'M21.4 3.6 2.9 10.7c-1.3.5-1.3 1.2-.2 1.6l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.8 3.5c.9.5 1.5.2 1.7-.8l3.1-14.7c.3-1.3-.5-1.9-1.5-1.5ZM9.6 14.2l8.6-7.6-10.5 6.6' },
  { name: 'Discord', href: env.VITE_LINK_DISCORD as string | undefined, path: 'M19.6 5.3A16.5 16.5 0 0 0 15.5 4l-.5 1a15.3 15.3 0 0 0-6 0l-.5-1a16.5 16.5 0 0 0-4.1 1.3C1.8 9.2 1.1 13 1.4 16.7a16.6 16.6 0 0 0 5 2.5l1-1.6a10.7 10.7 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.8 0l.4.3c-.5.3-1.1.6-1.7.8l1 1.6a16.5 16.5 0 0 0 5-2.5c.4-4.3-.7-8-3-11.4ZM8.7 14.5c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z' },
  { name: 'GitHub', href: env.VITE_LINK_GITHUB as string | undefined, path: 'M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.6 2.4 1.1 3 .9.1-.7.4-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z' },
].filter((s) => !!s.href);

const COLUMNS: Array<{ title: string; links: Array<[string, string]> }> = [
  {
    title: 'Product',
    links: [
      ['Trade', '#/trade'],
      ['Quests', '#/quests'],
      ['Leaderboard', '#/leaderboard'],
      ['$NITRO', '#/nitro'],
      ['Profile', '#/profile'],
    ],
  },
  {
    title: 'Trading',
    links: [
      ['NEAR-PERP', '#/trade'],
      ['BTC-PERP', '#/trade'],
      ['ETH-PERP', '#/trade'],
      ['SOL-PERP', '#/trade'],
    ],
  },
  {
    title: 'Ecosystem',
    links: [
      ['NEAR Protocol', 'https://near.org'],
      ['Orderly Network', 'https://orderly.network'],
      ['NearBlocks', 'https://nearblocks.io'],
      ['Binance market data', 'https://www.binance.com/en/markets'],
    ],
  },
];

export function Footer() {
  const { tickers, source } = usePrices();
  const { mode } = useSettings();

  return (
    <footer className="foot2">
      <div className="foot2-strip">
        <div className="foot2-tickers">
          {MARKETS.map((m) => {
            const t = tickers[m];
            const c = t ? (t.price / t.open24h - 1) * 100 : 0;
            return (
              <span key={m} className="foot2-tick mono">
                <TokenIcon market={m} size={16} />
                {m} <b>{price(t?.price)}</b>
                <span className={c >= 0 ? 'up' : 'down'}>{t ? pct(c) : ''}</span>
              </span>
            );
          })}
        </div>
        <div className="foot2-status mono">
          <span className={`foot2-dot ${source === 'live' ? 'ok' : 'warn'}`} />
          {source === 'live' ? 'Live prices' : source === 'simulated' ? 'Simulated prices' : 'Connecting'}
          <span className="foot2-sep">·</span>
          NEAR {NETWORK}
          <span className="foot2-sep">·</span>
          {mode === 'live' ? (LIVE_AVAILABLE ? 'Orderly live' : 'Orderly not set up') : 'Demo mode'}
        </div>
      </div>

      <div className="foot2-main">
        <div className="foot2-brand">
          <Logo />
          <p>1000x perpetuals on NEAR. Your wager is your max loss, and every loss mints $NITRO.</p>
          <div className="foot2-badges">
            <span className="foot2-badge">
              <TokenIcon market="NEAR" size={16} /> Built on NEAR
            </span>
            <span className="foot2-badge">◆ Live trading by Orderly</span>
          </div>
          {SOCIALS.length > 0 && (
            <div className="foot2-socials">
              {SOCIALS.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name} title={s.name}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          )}
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} className="foot2-col" aria-label={c.title}>
            <b>{c.title}</b>
            {c.links.map(([label, href]) => (
              <a key={label} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {label}
                {href.startsWith('http') && <span aria-hidden="true"> ↗</span>}
              </a>
            ))}
          </nav>
        ))}
      </div>

      <div className="foot2-bottom">
        <span>© {new Date().getFullYear()} Nitro</span>
        <span className="foot2-legal">
          {mode === 'live'
            ? 'Live trading uses real funds on Orderly Network. Leverage trading is high risk.'
            : 'Demo balances are not real money.'}{' '}
          Not financial advice. Market data from Binance.
        </span>
        <span className="mono">
          build {__BUILD_COMMIT__} · {__BUILD_TIME__}
        </span>
      </div>
    </footer>
  );
}
