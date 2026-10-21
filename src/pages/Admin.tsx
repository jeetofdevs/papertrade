// Owner-only: review withdrawal requests. Approving sends the USDC from the contract to the user.

import { useCallback, useEffect, useState } from 'react';
import { toast } from '../components/Toasts';
import { usd } from '../lib/format';
import {
  approveWithdrawAction,
  fundPromoAction,
  loadPromo,
  Promo,
  USDC_ID,
  loadAllRequests,
  loadUserSummary,
  POOL_ID,
  refreshPool,
  rejectWithdrawAction,
  usePool,
  view,
  WithdrawRequest,
} from '../lib/pool';
import { ALLOW_GUEST, useWallet } from '../lib/wallet';

type Summary = Awaited<ReturnType<typeof loadUserSummary>>;

export function Admin() {
  const { accountId: walletId, traderId, signAndSend } = useWallet();
  // Test builds treat the guest account as the signed-in user.
  const accountId = walletId ?? (ALLOW_GUEST ? traderId : null);
  const pool = usePool();
  const [owner, setOwner] = useState<string | null>(pool.owner);
  const [requests, setRequests] = useState<WithdrawRequest[] | null>(null);
  const [users, setUsers] = useState<Record<string, Summary>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [promo, setPromo] = useState<Promo | null>(null);
  const [fund, setFund] = useState('');

  const load = useCallback(async () => {
    try {
      const [o, list] = await Promise.all([view<string>(POOL_ID, 'get_owner'), loadAllRequests()]);
      setOwner(o);
      setRequests(list);
      loadPromo().then(setPromo).catch(() => {});
      setError(null);
      const names = [...new Set(list.map((r) => r.account))];
      const sums = await Promise.all(names.map((n) => loadUserSummary(n).catch(() => null)));
      setUsers(Object.fromEntries(names.flatMap((n, i) => (sums[i] ? [[n, sums[i]!]] : []))));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (owner && accountId !== owner) {
    return (
      <div className="page">
        <div className="panel pad">
          <h2>Admin</h2>
          <p className="muted">Only the contract owner can review withdrawals.</p>
        </div>
      </div>
    );
  }

  const act = async (r: WithdrawRequest, approve: boolean) => {
    setBusy(r.id);
    try {
      await signAndSend(POOL_ID, [approve ? approveWithdrawAction(r.id) : rejectWithdrawAction(r.id, reasons[r.id]?.trim() ?? '')]);
      toast.ok(approve ? `Sent ${usd(r.amount)} USDC to ${r.account}` : `Rejected ${usd(r.amount)} USDC for ${r.account}`);
      await load();
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(null);
    }
  };

  const total = (requests ?? []).reduce((s, r) => s + r.amount, 0);

  const addFunds = async () => {
    const n = Number(fund);
    if (!(n > 0)) return;
    setBusy(-1);
    try {
      await signAndSend(USDC_ID, [fundPromoAction(n)]);
      toast.ok(`Added ${usd(n)} USDC to the promo budget`);
      setFund('');
      await load();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <section className="panel pad admin-head">
        <div>
          <h1>Withdrawal requests</h1>
          <p className="muted small">Approve to send USDC from the pool contract to the user. Reject to return it to their balance.</p>
        </div>
        <div className="admin-total">
          <span className="label">Waiting</span>
          <b className="mono">
            {requests?.length ?? 0} · ${usd(total)}
          </b>
        </div>
      </section>
      {error && <p className="hint err">Could not load requests: {error}</p>}

      <section className="panel pad admin-promo">
        <div>
          <h3>New-user bonus</h3>
          <p className="muted small">
            {promo
              ? `${usd(promo.amount)} USDC after a ${usd(promo.minDeposit)} USDC deposit, ${promo.multiple}x turnover. ${promo.claims} claimed · budget left ${usd(promo.budget)} USDC (${Math.floor(promo.budget / (promo.amount || 1))} bonuses).`
              : 'Loading…'}
          </p>
        </div>
        <div className="admin-fund">
          <div className="input">
            <input inputMode="decimal" placeholder="Amount" value={fund} onChange={(e) => setFund(e.target.value.replace(/[^0-9.]/g, ''))} />
            <span className="unit">USDC</span>
          </div>
          <button className="btn btn-primary" disabled={!(Number(fund) > 0) || busy === -1} onClick={addFunds}>
            Fund promo
          </button>
        </div>
      </section>

      <div className="panel">
        <div className="table-wrap">
          {requests === null ? (
            <p className="empty">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="empty">No withdrawals waiting for review.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Account</th>
                  <th>Amount</th>
                  <th>Requested</th>
                  <th>Deposited · withdrawn</th>
                  <th>Trades · PnL</th>
                  <th>Reject reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const u = users[r.account];
                  return (
                    <tr key={r.id}>
                      <td className="mono muted">{r.id}</td>
                      <td className="mono">{r.account}</td>
                      <td className="mono">
                        <b>{usd(r.amount)}</b> USDC
                      </td>
                      <td className="muted">{new Date(r.requestedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="mono">{u ? `${usd(u.deposited)} · ${usd(u.withdrawn)}` : '—'}</td>
                      <td className={`mono ${u && u.profit - u.loss < 0 ? 'down' : 'up'}`}>{u ? `${u.trades} · ${usd(u.profit - u.loss)}` : '—'}</td>
                      <td>
                        <input
                          className="admin-reason"
                          placeholder="Optional"
                          maxLength={140}
                          value={reasons[r.id] ?? ''}
                          onChange={(e) => setReasons((x) => ({ ...x, [r.id]: e.target.value }))}
                        />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-sm btn-primary" disabled={busy === r.id} onClick={() => act(r, true)}>
                            Approve & send
                          </button>
                          <button className="btn btn-sm" disabled={busy === r.id} onClick={() => act(r, false)}>
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
