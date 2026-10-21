import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { compact, shortAccount, signedUsd } from '../lib/format';
import { LeaderRow, loadLeaderboard, usePool } from '../lib/pool';
import { useWallet } from '../lib/wallet';

type Sort = 'pnl' | 'volume';

/** Real traders only: every account that traded USDC in the Nitro pool. */
export function Leaderboard() {
  const { accountId } = useWallet();
  const pool = usePool();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('pnl');

  useEffect(() => {
    let live = true;
    const load = () =>
      loadLeaderboard()
        .then((r) => live && (setRows(r.filter((x) => x.trades > 0)), setError(null)))
        .catch((e: Error) => live && (setRows((x) => x ?? []), setError(e.message)));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const sorted = [...(rows ?? [])].sort((a, b) => (sort === 'pnl' ? b.pnl - a.pnl : b.volume - a.volume));
  const nitroRows = [...(rows ?? [])].filter((r) => r.nitro > 0).sort((a, b) => b.nitro - a.nitro).slice(0, 10);
  const myRank = accountId ? sorted.findIndex((r) => r.account === accountId) : -1;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Leaderboard</h1>
        <p>Real USDC traders on Nitro, straight from the contract. Demo trades do not count.</p>
      </header>
      {error && !pool.missing && <p className="hint err">Could not load the leaderboard: {error}</p>}
      <div className="split split-wide">
        <div className="panel">
          <div className="tabs">
            <button className={`tab ${sort === 'pnl' ? 'tab-on' : ''}`} onClick={() => setSort('pnl')}>
              Top PnL
            </button>
            <button className={`tab ${sort === 'volume' ? 'tab-on' : ''}`} onClick={() => setSort('volume')}>
              Top volume
            </button>
            <div className="tabs-right">
              <span className="muted small">
                {rows ? `${rows.length} traders` : 'Loading…'}
                {myRank >= 0 && ` · you are #${myRank + 1}`}
              </span>
            </div>
          </div>
          <div className="table-wrap">
            {rows === null ? (
              <p className="empty">Loading traders…</p>
            ) : sorted.length === 0 ? (
              <p className="empty">{pool.missing ? 'The leaderboard opens when live trading starts.' : 'No trades yet. Be the first on the board.'}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Trader</th>
                    <th>PnL</th>
                    <th>Volume</th>
                    <th>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 100).map((r, i) => (
                    <tr key={r.account} className={r.account === accountId ? 'row-you' : ''}>
                      <td className="mono muted">{i + 1}</td>
                      <td>
                        <span className="pair">
                          <Avatar id={r.account} size={22} />
                          <b>{r.account === accountId ? 'You' : shortAccount(r.account)}</b>
                        </span>
                      </td>
                      <td className={`mono ${r.pnl >= 0 ? 'up' : 'down'}`}>{signedUsd(r.pnl)}</td>
                      <td className="mono">${compact(r.volume)}</td>
                      <td className="mono">{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel pad">
          <h3>Top NITRO holders</h3>
          {nitroRows.length === 0 ? (
            <p className="muted small">NITRO is earned on losing trades. Nobody has any yet.</p>
          ) : (
            <ul className="holders">
              {nitroRows.map((r, i) => (
                <li key={r.account} className={r.account === accountId ? 'row-you' : ''}>
                  <span className="mono muted">{i + 1}</span>
                  <b>{r.account === accountId ? 'You' : shortAccount(r.account)}</b>
                  <span className="mono accent">{compact(r.nitro)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
