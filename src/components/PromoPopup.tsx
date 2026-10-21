import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAdmin, POOL_ID, usePool } from '../lib/pool';
import { ALLOW_GUEST, useWallet } from '../lib/wallet';
import { PromoCard } from './PromoCard';

const seenKey = (id: string) => `nitro:promo-seen:${id}`;

/** Shown once per wallet after sign-in: the new-user bonus. */
export function PromoPopup() {
  const { accountId: walletId, traderId } = useWallet();
  // Test builds show it to the guest account too.
  const accountId = walletId ?? (ALLOW_GUEST ? traderId : null);
  const pool = usePool();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!accountId || accountId === POOL_ID) return;
    try {
      if (localStorage.getItem(seenKey(accountId))) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [accountId]);

  if (!open || !accountId || isAdmin(accountId, pool.owner) || pool.userPromo.claimed) return null;
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(seenKey(accountId), '1');
    } catch {
      /* ignore */
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={close}>
      <div className="modal panel pad promo-popup" role="dialog" aria-modal="true" aria-label="New user bonus" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn funds-x" onClick={close} aria-label="Close">
          ✕
        </button>
        <span className="promo-gift" aria-hidden="true">
          🎁
        </span>
        <h2>Welcome bonus: 3 USDC</h2>
        <p className="muted">Follow us on X and deposit at least 2 USDC to get 3 USDC extra to trade with.</p>
        <PromoCard />
        <div className="leave-actions">
          <button className="btn" onClick={close}>
            Later
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              close();
              location.hash = '#/profile';
              setTimeout(() => document.getElementById('pool')?.scrollIntoView({ behavior: 'smooth' }), 80);
            }}
          >
            Deposit now
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
