import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAdmin, POOL_ID, usePool } from '../lib/pool';
import { ALLOW_GUEST, useWallet } from '../lib/wallet';
import { Batman } from './Batman';
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
    <div className="modal-backdrop promo-backdrop" onClick={close}>
      <div className="promo-pop" role="dialog" aria-modal="true" aria-label="Welcome bonus" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn promo-pop-x" onClick={close} aria-label="Close">
          ✕
        </button>
        <div className="promo-pop-hero">
          <div className="promo-confetti" aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => (
              <i key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 0.35}s`, background: CONFETTI[i % CONFETTI.length] }} />
            ))}
          </div>
          <span className="promo-pop-kicker">Welcome bonus</span>
          <div className="promo-pop-amount">
            <span className="promo-pop-dollar">$</span>3
          </div>
          <span className="promo-pop-sub">FREE USDC TO TRADE</span>
          <Batman mood="happy" className="promo-pop-dog" />
        </div>
        <div className="promo-pop-body">
          <p className="muted">Follow us on X and deposit at least 2 USDC. We add 3 USDC of trading balance, on the house.</p>
          <PromoCard />
          <div className="promo-pop-actions">
            <button className="btn" onClick={close}>
              Maybe later
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                close();
                location.hash = '#/profile';
                setTimeout(() => document.getElementById('pool')?.scrollIntoView({ behavior: 'smooth' }), 80);
              }}
            >
              Deposit &amp; claim
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CONFETTI = ['#00EC97', '#F4F1E8', '#FFB547', '#C9B8FF', '#FF8FC7'];
