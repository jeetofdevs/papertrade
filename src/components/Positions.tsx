import { ShareCard, ShareData } from './ShareCard';
import { TokenIcon } from './TokenIcon';
import { useState } from 'react';
import { account, closePosition, unrealizedPnl } from '../lib/engine';
import { compact, price, signed, usd } from '../lib/format';
import { usePrices } from '../lib/prices';
import { dispatch, getState, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

export function Positions() {
  const { traderId, accountId } = useWallet();
  const [share, setShare] = useState<ShareData | null>(null);
  const state = useStore();
  const { tickers } = usePrices();
  const acct = account(state, traderId);
  const [tab, setTab] = useState<'open' | 'history'>('open');

  const close = (id: string, mark: number) => {
    const before = account(state, traderId);
    const err = dispatch((s) => closePosition(s, traderId, id, mark, Date.now()));
    if (err) return toast.err(err);
    const t = account(getState(), traderId).history[0];
    if (!t || before.history[0]?.id === t.id) return;
    toast[t.pnl >= 0 ? 'ok' : 'info'](
      t.pnl >= 0 ? `Closed for ${signed(t.pnl)} USDC` : `Closed for ${signed(t.pnl)} USDC · +${compact(t.nitro)} NITRO`,
    );
  };

  return (
    <div className="panel positions">
      <div className="tabs">
        <button className={`tab ${tab === 'open' ? 'tab-on' : ''}`} onClick={() => setTab('open')}>
          Positions <span className="count">{acct.positions.length}</span>
        </button>
        <button className={`tab ${tab === 'history' ? 'tab-on' : ''}`} onClick={() => setTab('history')}>
          History
        </button>
      </div>
      <div className="table-wrap">
        {tab === 'open' ? (
          acct.positions.length === 0 ? (
            <p className="empty">No open positions. Pick a side and a leverage to start.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Size</th>
                  <th>Wager</th>
                  <th>Entry</th>
                  <th>Mark</th>
                  <th>Max loss</th>
                  <th>PnL (ROE)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {acct.positions.map((p) => {
                  const mark = tickers[p.market]?.price ?? p.entry;
                  const pnl = unrealizedPnl(p, mark);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className={`tag tag-${p.side}`}>
                          {p.side} {p.leverage}x
                        </span>{' '}
                        <span className="pair"><TokenIcon market={p.market} size={20} /><b>{p.market}</b></span>
                      </td>
                      <td className="mono">{usd(p.size)}</td>
                      <td className="mono">{usd(p.collateral)}</td>
                      <td className="mono">{price(p.entry)}</td>
                      <td className="mono">{price(mark)}</td>
                      <td className="mono warn">{price(p.liq)}</td>
                      <td className={`mono ${pnl >= 0 ? 'up' : 'down'}`}>
                        {signed(pnl)} <span className="muted">({((pnl / p.collateral) * 100).toFixed(1)}%)</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              setShare({
                                market: p.market,
                                side: p.side,
                                leverage: p.leverage,
                                pnl,
                                wager: p.collateral,
                                entry: p.entry,
                                exit: mark,
                                status: 'open',
                                account: accountId,
                                time: Date.now(),
                              })
                            }
                          >
                            Share
                          </button>
                          <button className="btn btn-sm" onClick={() => close(p.id, mark)}>
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : acct.history.length === 0 ? (
          <p className="empty">Closed trades show up here.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>PnL</th>
                <th>NITRO earned</th>
                <th>Closed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {acct.history.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className={`tag tag-${t.side}`}>
                      {t.side} {t.leverage}x
                    </span>{' '}
                    <span className="pair"><TokenIcon market={t.market} size={20} /><b>{t.market}</b></span>
                    {t.reason === 'liquidated' && <span className="tag tag-liq">max loss</span>}
                  </td>
                  <td className="mono">{usd(t.size)}</td>
                  <td className="mono">{price(t.entry)}</td>
                  <td className="mono">{price(t.exit)}</td>
                  <td className={`mono ${t.pnl >= 0 ? 'up' : 'down'}`}>{signed(t.pnl)}</td>
                  <td className="mono accent">{t.nitro ? `+${compact(t.nitro)}` : '—'}</td>
                  <td className="muted">{new Date(t.closedAt).toLocaleTimeString('en-US')}</td>
                  <td>
                    <button
                      className="btn btn-sm"
                      onClick={() =>
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
                        })
                      }
                    >
                      Share
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {share && <ShareCard data={share} onClose={() => setShare(null)} />}
    </div>
  );
}
