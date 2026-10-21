import { setSetting, useSettings } from '../lib/settings';

export function ModeToggle() {
  const { mode } = useSettings();

  return (
    <div className="mode" role="group" aria-label="Trading mode">
      <button className={`mode-btn ${mode === 'demo' ? 'mode-on' : ''}`} onClick={() => setSetting('mode', 'demo')}>
        Demo
      </button>
      <button
        className={`mode-btn ${mode === 'live' ? 'mode-on mode-real' : ''}`}
        onClick={() => setSetting('mode', 'live')}
        title="Real USDC"
      >
        Live
      </button>
    </div>
  );
}
