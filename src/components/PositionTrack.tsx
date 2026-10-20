import { Position, unrealizedPnl } from '../lib/engine';
import { price } from '../lib/format';
import { usePrices } from '../lib/prices';
import { useSettings } from '../lib/settings';
import { TokenIcon } from './TokenIcon';

/**
 * Moon-style progress track for one position:
 * max loss on the left, entry in the middle, take profit on the right,
 * and a rocket that rides the live price between them.
 */
export function PositionTrack({ p }: { p: Position }) {
  const { tickers } = usePrices();
  const { uwu } = useSettings();
  const mark = tickers[p.market]?.price ?? p.entry;
  const lossDist = Math.abs(p.entry - p.liq);
  // Without a TP the right end mirrors the max loss distance (+100% on the wager).
  const target = p.tp ?? p.entry + (p.side === 'long' ? lossDist : -lossDist);
  const winDist = Math.abs(target - p.entry);
  const towardWin = p.side === 'long' ? mark - p.entry : p.entry - mark;
  // Entry sits in the middle: 0..50% is the loss side, 50..100% the win side.
  const pos = towardWin >= 0 ? 50 + Math.min(1, towardWin / winDist) * 50 : 50 - Math.min(1, -towardWin / lossDist) * 50;
  const pnl = unrealizedPnl(p, mark);
  const roe = (pnl / p.collateral) * 100;
  const danger = pos < 12;
  const toTp = Math.max(0, Math.min(100, ((pos - 50) / 50) * 100));

  return (
    <div className={`track ${danger ? 'track-danger' : ''} ${pos >= 99 ? 'track-hit' : ''}`}>
      <div className="track-head">
        <TokenIcon market={p.market} size={20} />
        <b>{p.market}</b>
        <span className={`tag tag-${p.side}`}>
          {p.side} {p.leverage}x
        </span>
        <span className={`mono track-roe ${pnl >= 0 ? 'up' : 'down'}`}>
          {roe >= 0 ? '+' : ''}
          {roe.toFixed(1)}%
        </span>
        <span className="muted small track-goal">{p.tp ? `${toTp.toFixed(0)}% to TP` : 'no TP set'}</span>
      </div>
      <div className="track-bar">
        <div className="track-zone track-zone-loss" />
        <div className="track-zone track-zone-win" />
        <div
          className={`track-fill ${towardWin >= 0 ? 'track-fill-win' : 'track-fill-loss'}`}
          style={towardWin >= 0 ? { left: '50%', width: `${pos - 50}%` } : { left: `${pos}%`, width: `${50 - pos}%` }}
        />
        <span className="track-tick" style={{ left: '50%' }} />
        <div className="track-rider" style={{ left: `${pos}%` }}>
          {uwu ? <CatRider /> : <Rocket />}
        </div>
        {p.tp && <span className="track-flag">🏁</span>}
      </div>
      <div className="track-labels mono">
        <span className="down">max loss {price(p.liq)}</span>
        <span className="muted">entry {price(p.entry)}</span>
        <span className="up">{p.tp ? `TP ${price(p.tp)}` : `+100% ${price(target)}`}</span>
      </div>
    </div>
  );
}

function Rocket() {
  return (
    <svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true">
      <path className="track-flame" d="M2 12 L12 7 L12 17 Z" fill="#FF8A3D" />
      <path d="M12 6 H28 Q38 12 28 18 H12 Z" fill="#F4F1E8" />
      <circle cx="26" cy="12" r="3" fill="#00EC97" />
      <path d="M14 6 L10 1 L18 6 Z M14 18 L10 23 L18 18 Z" fill="#FF5C7A" />
    </svg>
  );
}

function CatRider() {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
      <path className="track-flame" d="M0 20 Q6 16 8 20 Q6 24 0 20 Z" fill="#FF8FC7" />
      <path d="M10 10 L13 2 L18 8 Z M30 10 L27 2 L22 8 Z" fill="#E9DCFF" />
      <ellipse cx="20" cy="17" rx="12" ry="10" fill="#E9DCFF" />
      <circle cx="16" cy="16" r="1.8" fill="#3B2E5A" />
      <circle cx="24" cy="16" r="1.8" fill="#3B2E5A" />
      <path d="M17 21 Q18.5 23 20 21 Q21.5 23 23 21" fill="none" stroke="#3B2E5A" strokeWidth="1.2" strokeLinecap="round" />
      <ellipse cx="13" cy="20" rx="2.4" ry="1.4" fill="#FFB3D6" />
      <ellipse cx="27" cy="20" rx="2.4" ry="1.4" fill="#FFB3D6" />
    </svg>
  );
}
