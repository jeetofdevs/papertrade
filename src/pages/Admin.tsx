// Owner-only: review withdrawal requests. Approving sends the USDC from the contract to the user.

import { useCallback, useEffect, useState } from 'react';
import { ChainDeposit, loadChainDeposits } from '../lib/pool';
import { toast } from '../components/Toasts';
import { usd } from '../lib/format';
import {
  approveWithdrawAction,
  setPromoBudgetAction,
  isAdmin,
  loadPromo,
  Promo,
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

  if (!isAdmin(accountId, owner)) {
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
    if (!(n >= 0) || fund === '') return;
    setBusy(-1);
    try {
      await signAndSend(POOL_ID, [setPromoBudgetAction(n)]);
      toast.ok(`Promo cap set to ${usd(n)} USDC (${Math.floor(n / (promo?.amount || 3))} bonuses)`);
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
      {error && !pool.missing && <p className="hint err">Could not load requests: {error}</p>}

      <AdminDeposits />

      <section className="panel pad admin-promo">
        <div>
          <h3>New-user bonus</h3>
          <p className="muted small">
            {promo
              ? `${usd(promo.amount)} USDC after a ${usd(promo.minDeposit)} USDC deposit and following @nitroonnear on X, ${promo.multiple}x turnover. Paid from the vault, no transfer needed. ${promo.claims} claimed · ${usd(promo.budget)} USDC left (${Math.floor(promo.budget / (promo.amount || 1))} bonuses).`
              : 'Loading…'}
          </p>
        </div>
        <div className="admin-fund">
          <div className="input">
            <input inputMode="decimal" placeholder="New cap" value={fund} onChange={(e) => setFund(e.target.value.replace(/[^0-9.]/g, ''))} />
            <span className="unit">USDC</span>
          </div>
          <button className="btn btn-primary" disabled={fund === '' || busy === -1} onClick={addFunds}>
            Set promo cap
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
                  <th>X (follow check)</th>
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
                        {u?.xHandle ? (
                          <a href={`https://x.com/${u.xHandle}`} target="_blank" rel="noopener noreferrer">
                            @{u.xHandle} ↗
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
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

/** Every USDC and NEAR deposit into the pool account, read from the chain. */
function AdminDeposits() {
  const [rows, setRows] = useState<ChainDeposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      loadChainDeposits(10)
        .then((r) => {
          if (!live) return;
          setRows(r);
          setError(null);
        })
        .catch((e: Error) => live && setError(e.message));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  const usdcTotal = (rows ?? []).filter((r) => r.asset === 'USDC').reduce((s, r) => s + r.amount, 0);
  const nearTotal = (rows ?? []).filter((r) => r.asset === 'NEAR').reduce((s, r) => s + r.amount, 0);
  const users = new Set((rows ?? []).map((r) => r.account)).size;
  return (
    <div className="panel">
      <div className="tabs">
        <span className="tab tab-on">All deposits</span>
        <div className="tabs-right">
          <span className="muted small">
            {rows ? `${rows.length} deposits · ${users} users · ${usd(usdcTotal)} USDC · ${usd(nearTotal, 4)} NEAR` : 'Loading…'}
          </span>
        </div>
      </div>
      {error && <p className="hint err">Could not read deposits from the chain: {error}</p>}
      <div className="table-wrap">
        {rows && rows.length === 0 ? (
          <p className="empty">No deposits yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Account</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).slice(0, 200).map((d) => (
                <tr key={`${d.hash}-${d.asset}`}>
                  <td className="muted">{new Date(d.at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td className="mono">{d.account}</td>
                  <td>{d.asset}</td>
                  <td className="mono">{usd(d.amount, d.asset === 'USDC' ? 2 : 4)}</td>
                  <td>
                    <a href={`https://nearblocks.io/txns/${d.hash}`} target="_blank" rel="noopener noreferrer">
                      view ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
