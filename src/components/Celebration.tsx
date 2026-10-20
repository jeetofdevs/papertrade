import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSettings } from '../lib/settings';

type Kind = 'tp' | 'bust';
interface Burst {
  id: number;
  kind: Kind;
  title: string;
  sub: string;
}

let fire: (b: Omit<Burst, 'id'>) => void = () => {};

/** Full-screen burst: confetti for a take profit, a flash for a max loss. */
export function celebrate(kind: Kind, title: string, sub: string) {
  if (getSettings().uwuless) return;
  fire({ kind, title, sub });
}

const COLORS = ['#00EC97', '#F4F1E8', '#FFB547', '#7CF5C8', '#FF8FC7', '#C79BFF'];

export function CelebrationHost() {
  const [burst, setBurst] = useState<Burst | null>(null);
  useEffect(() => {
    let n = 0;
    fire = (b) => {
      const id = ++n;
      setBurst({ ...b, id });
      setTimeout(() => setBurst((x) => (x?.id === id ? null : x)), 2600);
    };
  }, []);
  if (!burst) return null;
  return createPortal(
    <div className={`celebrate celebrate-${burst.kind}`} key={burst.id} aria-live="polite">
      {burst.kind === 'tp' &&
        Array.from({ length: 70 }, (_, i) => (
          <span
            key={i}
            className="confetti"
            style={{
              left: `${(i * 37) % 100}%`,
              background: COLORS[i % COLORS.length],
              animationDelay: `${(i % 10) * 0.04}s`,
              animationDuration: `${1.6 + ((i * 13) % 10) / 10}s`,
              ['--drift' as string]: `${((i * 53) % 200) - 100}px`,
              ['--spin' as string]: `${(i * 97) % 720}deg`,
            }}
          />
        ))}
      <div className="celebrate-card">
        <b>{burst.title}</b>
        <span>{burst.sub}</span>
      </div>
    </div>,
    document.body,
  );
}
