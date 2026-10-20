import { useActivity } from '../lib/activity';
import { compact, usd } from '../lib/format';
import { useSettings } from '../lib/settings';
import { TokenIcon } from './TokenIcon';

// Live strip of trades across all markets, newest first.
export function TradeTicker() {
  const { feed } = useActivity();
  const { antiSocial } = useSettings();
  if (antiSocial) return null;
  return (
    <div className="ticker panel" aria-label="Live trades">
      <span className="ticker-label">
        <span className="feed-dot" /> Live
      </span>
      <div className="ticker-track">
        {feed.slice(0, 24).map((a) => {
          const cls = a.kind === 'open' ? (a.side === 'long' ? 'up' : 'down') : a.kind === 'win' ? 'up' : a.kind === 'bust' ? 'warn' : 'down';
          const text =
            a.kind === 'open'
              ? `${a.side === 'long' ? '▲' : '▼'} $${compact(a.amount)}`
              : a.kind === 'bust'
                ? `max loss −$${usd(Math.abs(a.amount))}`
                : `${a.amount >= 0 ? '+' : '−'}$${usd(Math.abs(a.amount))}`;
          return (
            <span key={a.id} className={`ticker-item ${a.mine ? 'ticker-mine' : ''}`} title={`${a.market} ${a.side}`}>
              <TokenIcon market={a.market} size={18} />
              <b className={`mono ${cls}`}>{text}</b>
            </span>
          );
        })}
        {feed.length === 0 && <span className="muted small">Waiting for trades…</span>}
      </div>
    </div>
  );
}
