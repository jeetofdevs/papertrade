import { useState } from 'react';
import { usd } from '../lib/format';
import { claimPromoAction, earlyDeposits, isAdmin, POOL_ID, Promo, refreshPool, usePool, X_ACCOUNT } from '../lib/pool';

/** Default promo terms shown before the contract is live. */
export const PRELAUNCH: Promo = { amount: 3, minDeposit: 2, multiple: 20, minHoldSec: 60, budget: 300, claims: 0, open: true };
import { sound } from '../lib/sound';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

const FOLLOWED_KEY = 'nitro:followed-x';
const HANDLE_KEY = 'nitro:x-handle';
const HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

/** New-user bonus: follow on X, deposit the minimum, claim, then trade the turnover to unlock withdrawals. */
export function PromoCard({ compact = false }: { compact?: boolean }) {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [busy, setBusy] = useState(false);
  const [handle, setHandleState] = useState(() => {
    try {
      return localStorage.getItem(HANDLE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const setHandle = (v: string) => {
    setHandleState(v);
    try {
      localStorage.setItem(HANDLE_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [followed, setFollowed] = useState(() => {
    try {
      return localStorage.getItem(FOLLOWED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const me = pool.userPromo;
  if (isAdmin(accountId, pool.owner) || accountId === POOL_ID) return null;
  // Before launch the promo is announced with its default terms; claiming opens with live trading.
  const p = pool.promo ?? (pool.missing ? PRELAUNCH : null);
  if (!p) return null;
  if (me.claimed && !me.locked) return null;
  if (!me.claimed && !p.open) return null;

  const turnover = p.amount * p.multiple;

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

  const deposited = pool.missing ? !!accountId && earlyDeposits(accountId).reduce((s, d) => s + d.amount, 0) >= p.minDeposit : pool.totals.deposited >= p.minDeposit;
  const handleOk = HANDLE_RE.test(handle.trim());
  const canClaim = !pool.missing && !!accountId && deposited && followed && handleOk;

  const follow = () => {
    window.open(`https://x.com/intent/follow?screen_name=${X_ACCOUNT}`, '_blank', 'noopener,noreferrer');
    setFollowed(true);
    try {
      localStorage.setItem(FOLLOWED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const claim = async () => {
    if (!canClaim) return;
    setBusy(true);
    try {
      await signAndSend(POOL_ID, [claimPromoAction(handle)]);
      sound.win();
      toast.ok(`+${usd(p.amount)} USDC bonus added`);
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`promo ${compact ? 'promo-compact' : ''}`}>
      <div className="promo-top">
        <span className="promo-badge">🎁 Free {usd(p.amount)} USDC</span>
        <span className="muted small">{p.multiple}x turnover to withdraw</span>
      </div>
      <ol className="promo-steps">
        <li className={followed ? 'done' : ''}>
          <span>Follow @{X_ACCOUNT} on X</span>
          <button className="btn btn-sm" onClick={follow}>
            {followed ? 'Followed ✓' : 'Follow'}
          </button>
        </li>
        <li className={handleOk ? 'done' : ''}>
          <input className="promo-handle" placeholder="Your X username" maxLength={16} value={handle} onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))} />
        </li>
        <li className={deposited ? 'done' : ''}>
          <span>Deposit at least {usd(p.minDeposit)} USDC</span>
          {deposited && <span className="small up">✓</span>}
        </li>
      </ol>
      <button className="btn btn-primary btn-block" disabled={!canClaim || busy} onClick={claim}>
        {busy ? 'Confirm in your wallet…' : pool.missing ? 'Claim opens when live trading starts' : `Claim ${usd(p.amount)} USDC`}
      </button>
      <p className="muted small">
        Withdrawals unlock after {usd(turnover)} USDC in total wagers. We check the follow when you withdraw.
      </p>
    </div>
  );
}
