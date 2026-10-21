import { useEffect, useRef, useState } from 'react';
import { account, faucet, FAUCET_AMOUNT, FAUCET_COOLDOWN_MS } from '../lib/engine';
import { compact, shortAccount, signedUsd, usd } from '../lib/format';
import { explorerUrl, profileStats } from '../lib/profile';
import { useSettings } from '../lib/settings';
import { dispatch, useStore } from '../lib/store';
import { NETWORK, useWallet } from '../lib/wallet';
import { Avatar } from './Avatar';
import { useUserProfile } from '../lib/userProfile';
import { isAdmin, tradesFromLedger, usePool } from '../lib/pool';
import { toast } from './Toasts';

export function ProfileMenu() {
  const { accountId, traderId, disconnect } = useWallet();
  const state = useStore();
  const { mode } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const demoAcct = account(state, traderId);
  const id = accountId ?? traderId;
  const nextFaucet = demoAcct.lastFaucet + FAUCET_COOLDOWN_MS - Date.now();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.ok('Address copied');
    } catch {
      toast.err('Could not copy');
    }
  };

  const refill = () => {
    const err = dispatch((s) => faucet(s, traderId, Date.now()));
    if (err) toast.err(err);
    else toast.ok(`${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added`);
  };
  const me = useUserProfile(id);
  const pool = usePool();
  const live = mode === 'live';
  // Live: real USDC numbers from the contract. Demo: the local demo account.
  const acct = live
    ? {
        ...demoAcct,
        usdc: pool.balance,
        nitro: pool.nitro,
        positions: pool.positions,
        history: tradesFromLedger(pool.ledger),
        pendingProfit: 0,
        lpShares: 0,
        realizedPnl: pool.totals.profit - pool.totals.loss,
        volume: pool.totals.volume,
      }
    : demoAcct;
  const st = profileStats(state, acct);

  const go = (hash: string) => {
    location.hash = hash;
    setOpen(false);
  };

  return (
    <div className="menu-wrap" ref={ref}>
      <button className="profile-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar id={id} size={26} />
        <span className={`profile-btn-name ${me.name ? '' : 'mono'}`}>{me.name || shortAccount(id)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="menu panel profile-menu" role="menu">
          <div className="pm-head">
            <Avatar id={id} size={44} />
            <div className="pm-id">
              <b className={me.name ? '' : 'mono'}>{me.name || shortAccount(id)}</b>
              <span className="muted small">
                NEAR {NETWORK} · {mode === 'live' ? 'Live' : 'Demo'}
              </span>
            </div>
            <button className="icon-btn icon-btn-sm" onClick={copy} aria-label="Copy address" title="Copy address">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="12" height="12" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            </button>
          </div>

          <div className="pm-balance">
            <span className="label">{live ? 'Account equity · real USDC' : 'Demo equity · not real money'}</span>
            <b className="mono">${usd(st.equity)}</b>
            <span className={`mono small ${st.openPnl >= 0 ? 'up' : 'down'}`}>{signedUsd(st.openPnl)} open PnL</span>
          </div>

          <div className="pm-grid">
            <div>
              <span className="label">{live ? 'USDC' : 'Demo USDC'}</span>
              <b className="mono">{usd(acct.usdc)}</b>
            </div>
            <div>
              <span className="label">NITRO points</span>
              <b className="mono accent">{compact(pool.nitro)}</b>
            </div>
            <div>
              <span className="label">Realised PnL</span>
              <b className={`mono ${st.realizedPnl >= 0 ? 'up' : 'down'}`}>{signedUsd(st.realizedPnl)}</b>
            </div>
            <div>
              <span className="label">Win rate</span>
              <b className="mono">{st.trades ? `${st.winRate.toFixed(0)}%` : '—'}</b>
            </div>
          </div>

          <div className="pm-links">
            <button className="pm-link" onClick={() => go('#/profile')}>
              Profile & stats
            </button>
            {isAdmin(accountId, pool.owner) && (
              <button className="pm-link" onClick={() => go('#/admin')}>
                Admin <span className="muted small">withdrawals · promo</span>
              </button>
            )}
            <button
              className="pm-link"
              onClick={() => {
                go('#/profile');
                setTimeout(() => document.getElementById('pool')?.scrollIntoView({ behavior: 'smooth' }), 60);
              }}
            >
              Deposit / withdraw <span className="muted small">Nitro Pool</span>
            </button>
            <button className="pm-link" onClick={() => go('#/trade')}>
              Positions <span className="count">{acct.positions.length}</span>
            </button>
            <button className="pm-link" onClick={() => go('#/quests')}>
              Quests <span className="muted small">daily NITRO</span>
            </button>
            {mode === 'demo' && (
              <button className="pm-link" onClick={refill} disabled={nextFaucet > 0}>
                Get demo USDC
                <span className="muted small">
                  {nextFaucet > 0 ? `in ${Math.ceil(nextFaucet / 3_600_000)}h` : `+${FAUCET_AMOUNT.toLocaleString('en-US')}`}
                </span>
              </button>
            )}
            {accountId && (
              <a className="pm-link" href={explorerUrl(accountId, NETWORK)} target="_blank" rel="noopener noreferrer">
                View on NearBlocks <span aria-hidden="true">↗</span>
              </a>
            )}
          </div>

          {accountId && (
            <button
              className="btn btn-block pm-disconnect"
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
}
