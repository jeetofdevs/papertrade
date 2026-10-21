import { useState } from 'react';
import { usd } from '../lib/format';
import { claimPromoAction, POOL_ID, refreshPool, usePool } from '../lib/pool';
import { sound } from '../lib/sound';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

/** New-user bonus: deposit the minimum, claim the bonus, trade the turnover to unlock withdrawals. */
export function PromoCard({ compact = false }: { compact?: boolean }) {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [busy, setBusy] = useState(false);
  const p = pool.promo;
  const me = pool.userPromo;
  if (!p || pool.missing) return null;
  // Already used and finished: nothing to show.
  if (me.claimed && !me.locked) return null;
  if (!me.claimed && !p.open) return null;

  const deposited = pool.totals.deposited;
  const canClaim = !!accountId && deposited >= p.minDeposit;
  const turnover = p.amount * p.multiple;

  const claim = async () => {
    setBusy(true);
    try {
      await signAndSend(POOL_ID, [claimPromoAction()]);
      sound.win();
      toast.ok(`+${usd(p.amount)} USDC bonus added`);
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
  };

  if (me.locked) {
    const pct = Math.min(100, (me.wagered / me.required) * 100);
    return (
      <div className={`promo promo-active ${compact ? 'promo-compact' : ''}`}>
        <div className="promo-top">
          <span className="promo-badge">🎁 {usd(me.bonus)} bonus active</span>
          <span className="mono small">
            {usd(me.wagered)} / {usd(me.required)} traded
          </span>
        </div>
        <div className="quest-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="muted small">
          Withdrawals unlock after {usd(me.required - me.wagered)} USDC more in wagers. Only trades held {p.minHoldSec}s or longer count.
        </p>
      </div>
    );
  }

  return (
    <div className={`promo ${compact ? 'promo-compact' : ''}`}>
      <div className="promo-top">
        <span className="promo-badge">🎁 Free {usd(p.amount)} USDC</span>
        <button className="btn btn-sm btn-primary" disabled={!canClaim || busy} onClick={claim}>
          {busy ? 'Confirm…' : 'Claim bonus'}
        </button>
      </div>
      <p className="muted small">
        {canClaim
          ? `Claim ${usd(p.amount)} USDC to trade with. `
          : `Deposit at least ${usd(p.minDeposit)} USDC to claim ${usd(p.amount)} USDC. `}
        Withdrawals unlock after {usd(turnover)} USDC in total wagers ({p.multiple}x the bonus).
      </p>
    </div>
  );
}
