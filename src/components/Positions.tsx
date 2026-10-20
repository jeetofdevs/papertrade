import { useState } from 'react';
import { account, closePosition, unrealizedPnl } from '../lib/engine';
import { compact, price, signed, usd } from '../lib/format';
import { usePrices } from '../lib/prices';
import { dispatch, getState, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

export function Positions() {
  const { traderId } = useWallet();
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
      t.pnl >= 0 ? `Posisi ditutup ${signed(t.pnl)} USDC` : `Posisi ditutup ${signed(t.pnl)} USDC · +${compact(t.kami)} KAMI`,
    );
  };

  return (
    <div className="panel positions">
      <div className="tabs">
        <button className={`tab ${tab === 'open' ? 'tab-on' : ''}`} onClick={() => setTab('open')}>
          Posisi <span className="count">{acct.positions.length}</span>
        </button>
        <button className={`tab ${tab === 'history' ? 'tab-on' : ''}`} onClick={() => setTab('history')}>
          Riwayat
        </button>
      </div>
      <div className="table-wrap">
        {tab === 'open' ? (
          acct.positions.length === 0 ? (
            <p className="empty">Belum ada posisi terbuka. Pilih Long/Short dan leverage untuk mulai.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Ukuran</th>
                  <th>Kolateral</th>
                  <th>Masuk</th>
                  <th>Mark</th>
                  <th>Likuidasi</th>
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
                        <b>{p.market}</b>
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
                        <button className="btn btn-sm" onClick={() => close(p.id, mark)}>
                          Tutup
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : acct.history.length === 0 ? (
          <p className="empty">Trade yang sudah ditutup akan muncul di sini.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Ukuran</th>
                <th>Masuk</th>
                <th>Keluar</th>
                <th>PnL</th>
                <th>KAMI didapat</th>
                <th>Ditutup</th>
              </tr>
            </thead>
            <tbody>
              {acct.history.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className={`tag tag-${t.side}`}>
                      {t.side} {t.leverage}x
                    </span>{' '}
                    <b>{t.market}</b>
                    {t.reason === 'liquidated' && <span className="tag tag-liq">terlikuidasi</span>}
                  </td>
                  <td className="mono">{usd(t.size)}</td>
                  <td className="mono">{price(t.entry)}</td>
                  <td className="mono">{price(t.exit)}</td>
                  <td className={`mono ${t.pnl >= 0 ? 'up' : 'down'}`}>{signed(t.pnl)}</td>
                  <td className="mono accent">{t.kami ? `+${compact(t.kami)}` : '—'}</td>
                  <td className="muted">{new Date(t.closedAt).toLocaleTimeString('id-ID')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
