import { useEffect } from 'react';
import { startHl } from '../lib/hl/store';
import { setSetting, useSettings } from '../lib/settings';

export function ModeToggle() {
  const { mode } = useSettings();

  useEffect(() => {
    if (mode === 'live') startHl();
  }, [mode]);

  return (
    <div className="mode" role="group" aria-label="Trading mode">
      <button className={`mode-btn ${mode === 'demo' ? 'mode-on' : ''}`} onClick={() => setSetting('mode', 'demo')}>
        Demo
      </button>
      <button
        className={`mode-btn ${mode === 'live' ? 'mode-on mode-real' : ''}`}
        onClick={() => setSetting('mode', 'live')}
        title="Real USDC on Hyperliquid"
      >
        Live
      </button>
    </div>
  );
}
