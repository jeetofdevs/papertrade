import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { account, unrealizedPnl } from '../lib/engine';
import { usePrices } from '../lib/prices';
import { useSettings } from '../lib/settings';
import { useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { Batman, type Mood } from './Batman';


const LINES: Record<Mood, string[]> = {
  happy: ['woof! we are so up! (≧◡≦)', 'number go up = treats', 'to the moon, hooman!', 'good trade! *wags*'],
  sad: ['it will come back… right?', '*sad whimper* (╥﹏╥)', 'red candles again…', 'belly rubs fix everything'],
  sleepy: ['zzz… open a trade?', 'wake me for 1000x', 'napping until you trade'],
  neutral: ['sniffing the chart for you', 'any second now…', 'I believe in you, hooman'],
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
      {/* Behind the app content (UWU mode only) */}
      {uwu && (
      <div className="uwu-decor" aria-hidden="true">
        <div className="uwu-stars" />
        <span className="uwu-shoot uwu-shoot-1" />
        <span className="uwu-shoot uwu-shoot-2" />
        <Cloud className="uwu-cloud uwu-cloud-1" />
        <Cloud className="uwu-cloud uwu-cloud-2" />
      </div>
      )}
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
      <Batman mood={mood} className="nia-corner" />
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
