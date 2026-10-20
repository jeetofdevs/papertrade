import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { ShareCard, ShareData } from '../components/ShareCard';
import { toast } from '../components/Toasts';
import { TokenIcon } from '../components/TokenIcon';
import { account, Trade } from '../lib/engine';
import { compact, price, shortAccount, signed, signedUsd, usd } from '../lib/format';
import { explorerUrl, profileStats } from '../lib/profile';
import { useStore } from '../lib/store';
import { NETWORK, useWallet } from '../lib/wallet';
import { Stat } from './Earn';

/** Cumulative realised PnL, oldest trade first. */
function PnlChart({ history }: { history: Trade[] }) {
  const pts = [...history].reverse().reduce<number[]>((acc, t) => [...acc, (acc[acc.length - 1] ?? 0) + t.pnl], [0]);
  if (pts.length < 2) return <p className="empty">Close a trade to start your PnL curve.</p>;
  const lo = Math.min(0, ...pts);
  const hi = Math.max(0, ...pts);
  const span = hi - lo || 1;
  const W = 600;
  const H = 160;
  const y = (v: number) => H - ((v - lo) / span) * H;
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= 0;
  const color = up ? '#00EC97' : '#FF5C7A';
  return (
    <svg className="pnl-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Cumulative PnL">
      <defs>
        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#24312D" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#pnlFill)" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Profile() {
  const { accountId, traderId } = useWallet();
  const state = useStore();
  const acct = account(state, traderId);
  const st = profileStats(state, acct);
  const id = accountId ?? traderId;
  const [share, setShare] = useState<ShareData | null>(null);

  const shareTrade = (t: Trade) =>
    setShare({
      market: t.market,
      side: t.side,
      leverage: t.leverage,
      pnl: t.pnl,
      wager: t.size / t.leverage,
      entry: t.entry,
      exit: t.exit,
      status: t.reason === 'liquidated' ? 'max loss' : 'closed',
      account: accountId,
      time: t.closedAt,
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast.ok('Address copied');
    } catch {
      toast.err('Could not copy');
    }
  };

  const highlight = (label: string, t: Trade | null) => (
    <div className="panel pad trade-highlight">
      <span className="label">{label}</span>
      {t ? (
        <>
          <div className="th-row">
            <TokenIcon market={t.market} size={28} />
            <b>
              {t.market} {t.side} {t.leverage}x
            </b>
          </div>
          <b className={`mono big ${t.pnl >= 0 ? 'up' : 'down'}`}>
            {signed(t.pnl)} USDC <span className="muted small">({((t.pnl / (t.size / t.leverage)) * 100).toFixed(1)}%)</span>
          </b>
          <button className="btn btn-sm" onClick={() => shareTrade(t)}>
            Share
          </button>
        </>
      ) : (
        <p className="muted small">No trades yet.</p>
      )}
    </div>
  );

  return (
    <div className="page">
      <section className="panel profile-hero">
        <Avatar id={id} size={72} />
        <div className="profile-id">
          <h1 className="mono">{shortAccount(id)}</h1>
          <div className="profile-actions">
            <button className="chip" onClick={copy}>
              Copy address
            </button>
            {accountId && (
              <a className="chip" href={explorerUrl(accountId, NETWORK)} target="_blank" rel="noopener noreferrer">
                NearBlocks ↗
              </a>
            )}
            {st.favourite && <span className="chip">Favourite: {st.favourite}-PERP</span>}
          </div>
        </div>
        <div className="profile-equity">
          <span className="label">Account equity</span>
          <b className="mono">${usd(st.equity)}</b>
        </div>
      </section>

      <div className="cards">
        <Stat label="Realised PnL" value={signedUsd(st.realizedPnl)} accent={st.realizedPnl > 0} />
        <Stat label="Win rate" value={st.trades ? `${st.winRate.toFixed(1)}%` : '—'} />
        <Stat label="Trades" value={`${st.trades}`} />
        <Stat label="Volume" value={`$${compact(st.volume)}`} />
        <Stat label="NITRO earned" value={compact(acct.nitro)} accent />
        <Stat label="Max losses hit" value={`${st.maxLosses}`} />
        <Stat label="Open PnL" value={signedUsd(st.openPnl)} accent={st.openPnl > 0} />
        <Stat label="Vault value" value={`$${usd(st.vaultValue)}`} />
      </div>

      <div className="panel pad">
        <div className="lp-head">
          <h3>Cumulative PnL</h3>
          <span className="muted small">{st.trades} closed trades</span>
        </div>
        <PnlChart history={acct.history} />
      </div>

      <div className="split-2">
        {highlight('Best trade', st.best && st.best.pnl > 0 ? st.best : null)}
        {highlight('Worst trade', st.worst && st.worst.pnl < 0 ? st.worst : null)}
      </div>

      <div className="panel">
        <div className="tabs">
          <span className="tab tab-on">Recent trades</span>
        </div>
        {acct.history.length === 0 ? (
          <p className="empty">Your closed trades show up here.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>PnL</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {acct.history.slice(0, 30).map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`tag tag-${t.side}`}>
                        {t.side} {t.leverage}x
                      </span>{' '}
                      <span className="pair">
                        <TokenIcon market={t.market} size={20} />
                        <b>{t.market}</b>
                      </span>
                    </td>
                    <td className="mono">{price(t.entry)}</td>
                    <td className="mono">{price(t.exit)}</td>
                    <td className={`mono ${t.pnl >= 0 ? 'up' : 'down'}`}>{signed(t.pnl)}</td>
                    <td className="muted">{new Date(t.closedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => shareTrade(t)}>
                        Share
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {share && <ShareCard data={share} onClose={() => setShare(null)} />}
    </div>
  );
}
