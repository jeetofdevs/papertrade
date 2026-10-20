import { useState } from 'react';
import { createPortal } from 'react-dom';
import { setSetting, useSettings } from '../lib/settings';
import { REAL_MODE_AVAILABLE } from '../lib/wallet';

export function ModeToggle() {
  const { mode } = useSettings();
  const [info, setInfo] = useState(false);

  const pick = (m: 'demo' | 'real') => {
    if (m === 'real' && !REAL_MODE_AVAILABLE) return setInfo(true);
    setSetting('mode', m);
  };

  return (
    <>
      <div className="mode" role="group" aria-label="Trading mode">
        <button className={`mode-btn ${mode === 'demo' ? 'mode-on' : ''}`} onClick={() => pick('demo')}>
          Demo
        </button>
        <button className={`mode-btn ${mode === 'real' ? 'mode-on mode-real' : ''}`} onClick={() => pick('real')}>
          Real USDC
        </button>
      </div>
      {info &&
        createPortal(
        <div className="modal-backdrop" onClick={() => setInfo(false)}>
          <div className="modal panel pad" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Real USDC mode is coming</h3>
            <p className="muted">
              Real trading settles in native USDC on NEAR through the Nitro smart contract. It switches on as soon as
              the contract is deployed. Until then, practise with your demo balance.
            </p>
            <button className="btn btn-primary" onClick={() => setInfo(false)}>
              Keep trading demo
            </button>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
