import { useEffect, useRef, useState } from 'react';
import { setSetting, Settings, useSettings } from '../lib/settings';

const OPTIONS: Array<{ key: keyof Settings; label: string; hint: string; indent?: boolean }> = [
  { key: 'showEntries', label: 'Entries on chart', hint: 'Entry price line for each open position' },
  { key: 'showMaxLoss', label: 'Max loss on chart', hint: 'Price where each position closes at 100% loss' },
  { key: 'showTrades', label: 'Trades on chart', hint: 'Markers where you opened and closed' },
  { key: 'showOthers', label: 'Others on chart', hint: 'Markers for other traders', indent: true },
  { key: 'antiSocial', label: 'Anti-social', hint: 'Hide the live trades ticker' },
  { key: 'childproof', label: 'Childproof mode', hint: 'Confirm before trades above 100x or half your balance' },
  { key: 'sound', label: 'Sound', hint: 'Sound effects for opens, wins and max losses' },
];

export function SettingsMenu() {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="icon-btn" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="menu panel" role="menu">
          {OPTIONS.map((o) => (
            <label key={o.key} className={`menu-row ${o.indent ? 'menu-indent' : ''}`} title={o.hint}>
              <span>{o.label}</span>
              <input
                type="checkbox"
                checked={s[o.key] as boolean}
                disabled={o.key === 'showOthers' && !s.showTrades}
                onChange={(e) => setSetting(o.key, e.target.checked as never)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
