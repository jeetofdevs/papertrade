import { createPortal } from 'react-dom';
import { Batman } from './Batman';

/** Asked before UWU mode is switched off: Batman would rather you stayed. */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onStay}>
      <div className="modal panel leave" role="alertdialog" aria-modal="true" aria-label="Leave UWU mode" onClick={(e) => e.stopPropagation()}>
        <Batman mood="sad" className="leave-nia" />
        <h3>Leaving already, hooman?</h3>
        <p className="muted">Batman was just getting comfy… he will miss you. (｡•́︿•̀｡)</p>
        <div className="leave-actions">
          <button className="btn leave-stay" onClick={onStay} autoFocus>
            Stay with Batman
          </button>
          <button className="btn" onClick={onLeave}>
            Go UWU-less
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
