import { useState } from 'react';
import { price } from '../lib/format';

const PRESETS = [0, 25, 50, 100, 300, 1000];

/** Take profit as a return on the wager: preset chips or a custom percentage. */
export function TpPicker({ value, onChange, tpPrice, max = 100_000 }: { value: number; onChange: (v: number) => void; tpPrice: number | null; max?: number }) {
  const [custom, setCustom] = useState(() => (PRESETS.includes(value) ? '' : String(value)));
  const isCustom = custom !== '';
  const set = (raw: string) => {
    const clean = raw.replace(/[^0-9.]/g, '');
    setCustom(clean);
    const n = Number(clean);
    if (clean === '') onChange(100);
    else if (n > 0) onChange(Math.min(n, max));
  };
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor="tp-custom">Take profit</label>
        <span className="muted mono">{value && tpPrice ? `${price(tpPrice)} · +${value}%` : 'off'}</span>
      </div>
      <div className="row-chips tp-chips">
        {PRESETS.map((r) => (
          <button
            key={r}
            className={`chip ${!isCustom && value === r ? 'chip-on' : ''}`}
            onClick={() => {
              setCustom('');
              onChange(r);
            }}
          >
            {r ? `+${r}%` : 'Off'}
          </button>
        ))}
      </div>
      <div className={`input tp-input ${isCustom ? 'tp-input-on' : ''}`}>
        <span className="unit">+</span>
        <input id="tp-custom" inputMode="decimal" placeholder="Custom %" value={custom} onChange={(e) => set(e.target.value)} />
        <span className="unit">% profit</span>
      </div>
    </div>
  );
}
