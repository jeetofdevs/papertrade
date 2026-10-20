import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface Request {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let show: (r: Request) => void = (r) => r.resolve(true);

/** Ask the user to confirm. Resolves true when they confirm. */
export function confirmDialog(opts: Omit<Request, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => show({ ...opts, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => {
    show = setReq;
  }, []);
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!req) return null;
  const done = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };
  return createPortal(
    <div className="modal-backdrop" onClick={() => done(false)}>
      <div className="modal panel pad confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className="confirm-badge">Childproof mode</span>
        <h3>{req.title}</h3>
        <p className="muted">{req.body}</p>
        <div className="confirm-actions">
          <button className="btn" onClick={() => done(false)}>
            Cancel
          </button>
          <button className={`btn ${req.danger ? 'btn-short' : 'btn-primary'}`} onClick={() => done(true)} autoFocus>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
