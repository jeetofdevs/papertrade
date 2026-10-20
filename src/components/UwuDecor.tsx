import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { account, unrealizedPnl } from '../lib/engine';
import { usePrices } from '../lib/prices';
import { useSettings } from '../lib/settings';
import { useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';

type Mood = 'happy' | 'sad' | 'sleepy' | 'neutral';

const LINES: Record<Mood, string[]> = {
  happy: ['nya~ we are winning!', 'number go up uwu', 'to the moon, nya!', 'so proud of you (≧◡≦)'],
  sad: ['it will come back… right?', 'hold me (╥﹏╥)', 'mewo… red candles', 'deep breaths, nya'],
  sleepy: ['zzz… open a trade?', 'wake me for 1000x', 'napping until you trade'],
  neutral: ['watching the chart for you', 'flat like my nap', 'any second now…'],
};

// Theme switch plus the decorations for UWU mode. All art is drawn here as SVG.
export function UwuDecor() {
  const { uwu, uwuless } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('uwu', uwu);
    root.classList.toggle('uwuless', uwuless);
  }, [uwu, uwuless]);

  // Sparkles where you click.
  useEffect(() => {
    if (!uwu) return;
    const onClick = (e: MouseEvent) => {
      for (let i = 0; i < 6; i++) {
        const s = document.createElement('span');
        s.className = 'uwu-spark';
        s.textContent = i % 2 ? '✦' : '♥';
        s.style.left = `${e.clientX}px`;
        s.style.top = `${e.clientY}px`;
        s.style.setProperty('--dx', `${Math.cos((i / 6) * Math.PI * 2) * 40}px`);
        s.style.setProperty('--dy', `${Math.sin((i / 6) * Math.PI * 2) * 40}px`);
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 700);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [uwu]);

  if (!uwu) return null;
  // Portalled to <body> so the decor can sit behind the app and the mascot in front of it.
  return createPortal(
    <>
      {/* Behind the app content */}
      <div className="uwu-decor" aria-hidden="true">
        <div className="uwu-stars" />
        <span className="uwu-shoot uwu-shoot-1" />
        <span className="uwu-shoot uwu-shoot-2" />
        <Cloud className="uwu-cloud uwu-cloud-1" />
        <Cloud className="uwu-cloud uwu-cloud-2" />
      </div>
      {/* In front of it */}
      <Mascot />
    </>,
    document.body,
  );
}

function Mascot() {
  const { traderId } = useWallet();
  const state = useStore();
  const { tickers } = usePrices();
  const acct = account(state, traderId);
  const pnl = acct.positions.reduce((s, p) => s + unrealizedPnl(p, tickers[p.market]?.price ?? p.entry), 0);
  const mood: Mood = acct.positions.length === 0 ? 'sleepy' : pnl > 0.01 ? 'happy' : pnl < -0.01 ? 'sad' : 'neutral';
  const [tick, setTick] = useState(0);
  const line = useMemo(() => LINES[mood][tick % LINES[mood].length], [mood, tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 7000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className={`uwu-mascot uwu-mood-${mood}`} aria-hidden="true" onClick={() => setTick((x) => x + 1)}>
      <span className="uwu-bubble" key={line}>
        {line}
      </span>
      <Cat mood={mood} />
    </div>
  );
}

function Cloud({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 120 70">
      <g fill="#fff">
        <circle cx="35" cy="40" r="22" />
        <circle cx="60" cy="30" r="26" />
        <circle cx="86" cy="40" r="20" />
        <rect x="30" y="40" width="62" height="22" rx="11" />
      </g>
    </svg>
  );
}

export function Cat({ mood = 'neutral' }: { mood?: Mood }) {
  return (
    <svg className="uwu-cat" viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
      {/* tail */}
      <path className="uwu-tail" d="M150 168 C 190 160, 192 110, 168 100 C 160 97, 156 106, 164 110 C 178 118, 172 150, 146 154 Z" fill="#cdb8ff" />
      {/* body */}
      <ellipse cx="100" cy="160" rx="56" ry="36" fill="#e9dcff" />
      <ellipse cx="100" cy="166" rx="30" ry="20" fill="#fff" />
      {/* paws */}
      <ellipse cx="74" cy="190" rx="14" ry="8" fill="#fff" />
      <ellipse cx="126" cy="190" rx="14" ry="8" fill="#fff" />
      {/* ears */}
      <path d="M46 62 L58 18 L86 46 Z" fill="#e9dcff" />
      <path d="M154 62 L142 18 L114 46 Z" fill="#e9dcff" />
      <path d="M56 54 L61 30 L77 46 Z" fill="#ffb3d6" />
      <path d="M144 54 L139 30 L123 46 Z" fill="#ffb3d6" />
      {/* head */}
      <ellipse cx="100" cy="86" rx="62" ry="50" fill="#e9dcff" />
      {/* eyes by mood */}
      {mood === 'happy' && (
        <g stroke="#3b2e5a" strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M66 88 Q76 74 86 88" />
          <path d="M114 88 Q124 74 134 88" />
        </g>
      )}
      {mood === 'sleepy' && (
        <g stroke="#3b2e5a" strokeWidth="4" fill="none" strokeLinecap="round">
          <path d="M66 84 Q76 92 86 84" />
          <path d="M114 84 Q124 92 134 84" />
        </g>
      )}
      {(mood === 'neutral' || mood === 'sad') && (
        <g className="uwu-eyes">
          <ellipse cx="76" cy="84" rx="9" ry="11" fill="#3b2e5a" />
          <ellipse cx="124" cy="84" rx="9" ry="11" fill="#3b2e5a" />
          <circle cx="79" cy="80" r="3.5" fill="#fff" />
          <circle cx="127" cy="80" r="3.5" fill="#fff" />
        </g>
      )}
      {mood === 'sad' && (
        <g fill="#8fd3ff">
          <path className="uwu-tear" d="M70 98 Q66 108 70 112 Q74 108 70 98 Z" />
          <path className="uwu-tear uwu-tear-2" d="M130 98 Q126 108 130 112 Q134 108 130 98 Z" />
        </g>
      )}
      {/* blush */}
      <ellipse cx="62" cy="102" rx="10" ry="6" fill="#ffb3d6" opacity={mood === 'happy' ? 1 : 0.7} />
      <ellipse cx="138" cy="102" rx="10" ry="6" fill="#ffb3d6" opacity={mood === 'happy' ? 1 : 0.7} />
      {/* nose and mouth */}
      <path d="M96 96 L104 96 L100 101 Z" fill="#ff8fc7" />
      {mood === 'sad' ? (
        <path d="M90 110 Q100 102 110 110" fill="none" stroke="#3b2e5a" strokeWidth="2.5" strokeLinecap="round" />
      ) : mood === 'happy' ? (
        <path d="M88 104 Q100 120 112 104 Z" fill="#ff6fb5" stroke="#3b2e5a" strokeWidth="2.5" strokeLinejoin="round" />
      ) : (
        <path d="M88 104 Q94 112 100 104 Q106 112 112 104" fill="none" stroke="#3b2e5a" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {/* whiskers */}
      <g stroke="#bfa9ef" strokeWidth="2" strokeLinecap="round">
        <path d="M44 92 L24 88" />
        <path d="M44 100 L24 102" />
        <path d="M156 92 L176 88" />
        <path d="M156 100 L176 102" />
      </g>
      {/* bow */}
      <g transform="translate(132 40) rotate(18)">
        <path d="M0 0 L-16 -10 L-16 10 Z" fill="#ff8fc7" />
        <path d="M0 0 L16 -10 L16 10 Z" fill="#ff8fc7" />
        <circle r="5" fill="#ff6fb5" />
      </g>
      {mood === 'sleepy' && (
        <g fill="#c79bff" fontFamily="Nunito, sans-serif" fontWeight="900">
          <text className="uwu-z" x="150" y="30" fontSize="20">
            z
          </text>
          <text className="uwu-z uwu-z-2" x="166" y="14" fontSize="14">
            z
          </text>
        </g>
      )}
      {mood === 'happy' && (
        <g fill="#ff8fc7">
          <path className="uwu-heart" d="M30 40 c-6 -8 -18 -2 -12 8 l12 12 l12 -12 c6 -10 -6 -16 -12 -8 Z" />
        </g>
      )}
    </svg>
  );
}
