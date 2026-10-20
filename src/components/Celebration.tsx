import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compact, price, signed } from '../lib/format';
import { getSettings } from '../lib/settings';
import type { Trade } from '../lib/engine';
import type { ShareData } from '../lib/shareTemplates';
import { ShareCard } from './ShareCard';
import { TokenIcon } from './TokenIcon';

export interface TradeResult extends ShareData {
  reason: 'close' | 'tp' | 'liquidated';
  nitro?: number;
}

let show: (r: TradeResult) => void = () => {};

/** Moon-style result screen after a trade closes (by hand, take profit or max loss). */
export function showTradeResult(r: TradeResult) {
  show(r);
}

/** Build a result from a closed demo trade. */
export function resultFromTrade(t: Trade, account: string | null): TradeResult {
  return {
    market: t.market,
    side: t.side,
    leverage: t.leverage,
    pnl: t.pnl,
    wager: t.size / t.leverage,
    entry: t.entry,
    exit: t.exit,
    status: t.reason === 'liquidated' ? 'max loss' : 'closed',
    account,
    time: t.closedAt,
    reason: t.reason,
    nitro: t.nitro,
  };
}

const COLORS = ['#00EC97', '#F4F1E8', '#FFB547', '#7CF5C8', '#FF8FC7', '#C79BFF'];

function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function CelebrationHost() {
  const [result, setResult] = useState<TradeResult | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const [key, setKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    show = (r) => {
      setResult(r);
      setKey((k) => k + 1);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setResult(null), 7000);
    };
  }, []);

  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setResult(null);
  };

  return (
    <>
      {result && createPortal(<ResultCard key={key} r={result} onClose={close} onShare={() => (setShare(result), close())} hold={() => timer.current && clearTimeout(timer.current)} />, document.body)}
      {share && <ShareCard data={share} onClose={() => setShare(null)} />}
    </>
  );
}

function ResultCard({ r, onClose, onShare, hold }: { r: TradeResult; onClose: () => void; onShare: () => void; hold: () => void }) {
  const win = r.pnl >= 0;
  const roe = (r.pnl / r.wager) * 100;
  const pnl = useCountUp(r.pnl);
  const roeUp = useCountUp(roe);
  const calm = getSettings().uwuless;
  const title = r.reason === 'tp' ? 'Take profit hit!' : r.reason === 'liquidated' ? 'Max loss' : win ? 'Nice trade!' : 'Trade closed';
  // A little price path from entry to exit for the drawing animation.
  const up = (r.exit >= r.entry) === true;
  const path = up ? 'M0,46 C30,44 40,30 60,34 S95,12 120,16 S160,4 180,6' : 'M0,6 C30,8 40,22 60,18 S95,40 120,36 S160,48 180,46';

  return (
    <div className={`result-backdrop ${win ? 'result-win' : 'result-loss'}`} onClick={onClose}>
      {!calm && win &&
        Array.from({ length: 60 }, (_, i) => (
          <span
            key={i}
            className="confetti"
            style={{
              left: `${(i * 37) % 100}%`,
              background: COLORS[i % COLORS.length],
              animationDelay: `${(i % 10) * 0.05}s`,
              animationDuration: `${1.8 + ((i * 13) % 10) / 10}s`,
              ['--drift' as string]: `${((i * 53) % 200) - 100}px`,
              ['--spin' as string]: `${(i * 97) % 720}deg`,
            }}
          />
        ))}
      <div className="result-card panel" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} onMouseEnter={hold}>
        <div className="result-art" aria-hidden="true">
          {win ? (
            <svg viewBox="0 0 120 120" className="result-rocket">
              <circle cx="60" cy="60" r="56" fill="rgba(0,236,151,0.12)" />
              <g transform="translate(60 62) rotate(-35)">
                <path className="result-flame" d="M-10 30 L0 62 L10 30 Z" fill="#FF8A3D" />
                <path d="M0 -44 Q22 -14 18 30 L-18 30 Q-22 -14 0 -44 Z" fill="#F4F1E8" />
                <circle cy="-6" r="8" fill="#00EC97" />
                <path d="M-18 14 L-32 36 L-18 30 Z M18 14 L32 36 L18 30 Z" fill="#FF5C7A" />
              </g>
            </svg>
          ) : (
            <svg viewBox="0 0 120 120" className="result-sad">
              <circle cx="60" cy="60" r="56" fill="rgba(255,92,122,0.12)" />
              <g transform="translate(60 60)">
                <path d="M-34 -6 L34 -22 L-4 34 L-8 6 Z" fill="#F4F1E8" />
                <path d="M-8 6 L34 -22 L-4 14 Z" fill="#C9C4B5" />
              </g>
            </svg>
          )}
        </div>

        <span className={`result-title ${win ? 'up' : 'down'}`}>{title}</span>
        <div className="result-market">
          <TokenIcon market={r.market} size={22} />
          <b>{r.market}-PERP</b>
          <span className={`tag tag-${r.side}`}>
            {r.side} {r.leverage}x
          </span>
        </div>

        <b className={`result-pnl mono ${win ? 'up' : 'down'}`}>{signed(pnl)} USDC</b>
        <span className={`result-roe mono ${win ? 'up' : 'down'}`}>
          {roeUp >= 0 ? '+' : '−'}
          {Math.abs(roeUp).toFixed(1)}% ROE
        </span>

        <svg className="result-path" viewBox="0 0 180 52" preserveAspectRatio="none" aria-hidden="true">
          <path d={path} fill="none" stroke={win ? '#00EC97' : '#FF5C7A'} strokeWidth="3" strokeLinecap="round" />
        </svg>
        <div className="result-prices mono">
          <span>
            <span className="muted">Entry</span> {price(r.entry)}
          </span>
          <span>→</span>
          <span>
            <span className="muted">Exit</span> {price(r.exit)}
          </span>
        </div>
        {!!r.nitro && <span className="result-nitro">+{compact(r.nitro)} NITRO earned</span>}

        <div className="result-actions">
          <button className="btn btn-primary" onClick={onShare}>
            Share PnL
          </button>
          <button className="btn" onClick={onClose}>
            Trade again
          </button>
        </div>
      </div>
    </div>
  );
}
