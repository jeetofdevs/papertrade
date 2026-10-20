import { createPortal } from 'react-dom';
import { NiaPortrait } from './NiaPortrait';

/** Asked before UWU mode is switched off: Nia would rather you stayed. */
export function LeaveDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onStay}>
      <div className="modal panel leave" role="alertdialog" aria-modal="true" aria-label="Leave UWU mode" onClick={(e) => e.stopPropagation()}>
        <NiaPortrait mood="sad" className="leave-nia" />
        <h3>Leaving already, senpai?</h3>
        <p className="muted">Nia was just getting comfy… she will miss you. (｡•́︿•̀｡)</p>
        <div className="leave-actions">
          <button className="btn leave-stay" onClick={onStay} autoFocus>
            Stay with Nia
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
