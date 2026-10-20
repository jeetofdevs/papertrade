import { useState } from 'react';
import { Market, MARKETS } from '../lib/engine';
import { price, signed, usd } from '../lib/format';
import { closeMarket, HlPosition } from '../lib/hl/client';
import { refreshAccount, useHl } from '../lib/hl/store';
import { usePrices } from '../lib/prices';
import { getSettings } from '../lib/settings';
import { sound } from '../lib/sound';
import { confirmDialog } from './Confirm';
import { ShareCard, ShareData } from './ShareCard';
import { toast } from './Toasts';
import { TokenIcon } from './TokenIcon';

const isMarket = (c: string): c is Market => (MARKETS as string[]).includes(c);

export function LivePositions() {
  const hl = useHl();
  const { tickers } = usePrices();
  const [share, setShare] = useState<ShareData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const positions = hl.account?.positions ?? [];
  const total = positions.reduce((s, p) => s + p.pnl, 0);

  const close = async (p: HlPosition) => {
    if (getSettings().childproof) {
      const ok = await confirmDialog({
        title: `Close ${p.coin} on Hyperliquid?`,
        body: `Closes at market for about ${signed(p.pnl)} USDC.`,
        confirmLabel: 'Close position',
      });
      if (!ok) return;
    }
    setBusy(p.coin);
    try {
      await closeMarket(hl.user!, p);
      if (p.pnl >= 0) sound.win();
      else sound.loss();
      toast[p.pnl >= 0 ? 'ok' : 'info'](`Closed ${p.coin} for about ${signed(p.pnl)} USDC`);
      refreshAccount();
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel positions">
      <div className="tabs">
        <span className="tab tab-on">
          Hyperliquid positions <span className="count">{positions.length}</span>
        </span>
        {positions.length > 0 && (
          <div className="tabs-right">
            <span className={`mono small ${total >= 0 ? 'up' : 'down'}`}>{signed(total)} USDC</span>
          </div>
        )}
      </div>
      <div className="table-wrap">
        {hl.status !== 'ready' ? (
          <p className="empty">Enable trading to see your Hyperliquid positions.</p>
        ) : positions.length === 0 ? (
          <p className="empty">No open positions on Hyperliquid.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Size</th>
                <th>Margin</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Liq.</th>
                <th>PnL (ROE)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const long = p.size > 0;
                const mark = isMarket(p.coin) ? tickers[p.coin]?.price : undefined;
                return (
                  <tr key={p.coin}>
                    <td>
                      <span className={`tag tag-${long ? 'long' : 'short'}`}>
                        {long ? 'long' : 'short'} {p.leverage}x
                      </span>{' '}
                      <span className="pair">
                        {isMarket(p.coin) && <TokenIcon market={p.coin} size={20} />}
                        <b>{p.coin}</b>
                      </span>
                    </td>
                    <td className="mono">{usd(p.value)}</td>
                    <td className="mono">{usd(p.margin)}</td>
                    <td className="mono">{price(p.entry)}</td>
                    <td className="mono">{price(mark)}</td>
                    <td className="mono warn">{price(p.liq ?? undefined)}</td>
                    <td className={`mono ${p.pnl >= 0 ? 'up' : 'down'}`}>
                      {signed(p.pnl)} <span className="muted">({p.roe.toFixed(1)}%)</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {isMarket(p.coin) && (
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              setShare({
                                market: p.coin as Market,
                                side: long ? 'long' : 'short',
                                leverage: p.leverage,
                                pnl: p.pnl,
                                wager: p.margin,
                                entry: p.entry,
                                exit: mark ?? p.entry,
                                status: 'open',
                                account: hl.user,
                                time: Date.now(),
                              })
                            }
                          >
                            Share
                          </button>
                        )}
                        <button className="btn btn-sm" onClick={() => close(p)} disabled={busy === p.coin}>
                          {busy === p.coin ? '…' : 'Close'}
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
      {share && <ShareCard data={share} onClose={() => setShare(null)} />}
    </div>
  );
}
