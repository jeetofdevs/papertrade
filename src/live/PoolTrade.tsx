// Live mode: trade real USDC against the Nitro pool contract.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Chart } from '../components/Chart';
import { confirmDialog } from '../components/Confirm';
import { MARKET_NAME } from '../components/MarketBar';
import { PoolAccountCard } from '../components/PoolAccountCard';
import { PromoCard } from '../components/PromoCard';
import { TpPicker } from '../components/TpPicker';
import { ShareCard, ShareData } from '../components/ShareCard';
import { toast } from '../components/Toasts';
import { TokenIcon } from '../components/TokenIcon';
import { liquidationPrice, Market, Side, takeProfitPrice, unrealizedPnl } from '../lib/engine';
import { compact, price, signed, usd } from '../lib/format';
import {
  closeAction,
  getSlippage,
  LedgerItem,
  limitPrice,
  openAction,
  POOL_ID,
  refreshPool,
  saveSlippage,
  SLIPPAGE_CHOICES,
  tradesFromLedger,
  usePool,
  estimateSlippage,
} from '../lib/pool';
import { usePrices } from '../lib/prices';
import { getSettings, useSettings } from '../lib/settings';
import { sound } from '../lib/sound';
import { useWallet } from '../lib/wallet';

const PRESETS = [2, 10, 50, 100, 500, 1000];
const pctLabel = (v: number) => `${+(v * 100).toFixed(2)}%`;
const errText = (e: unknown) => {
  const m = (e as Error)?.message || String(e);
  const hit = /(Price moved beyond your slippage limit|Not enough free balance|Position too large for the vault|The vault cannot cover this position right now|Price is stale[^"]*|Wager below minimum|Too many open positions|New positions are paused|Deposit below the minimum)/.exec(m);
  return hit ? hit[1] : m || 'Transaction cancelled';
};

/** Deposit / withdraw in a modal, from anywhere in Live mode. */
export function FundsModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal funds-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn funds-x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <PoolAccountCard />
      </div>
    </div>,
    document.body,
  );
}

export function PoolTrade({ market }: { market: Market }) {
  const pool = usePool();
  const trades = tradesFromLedger(pool.ledger);
  return (
    <div className="trade-main">
      <Chart market={market} positions={pool.positions.filter((p) => p.market === market)} history={trades} />
      <PoolOrderPanel market={market} />
    </div>
  );
}

function PoolOrderPanel({ market }: { market: Market }) {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const { tickers } = usePrices();
  const { childproof } = useSettings();
  const mark = tickers[market]?.price ?? 0;
  const maxLev = pool.config.maxLeverage;

  const [side, setSide] = useState<Side>('long');
  const [amount, setAmount] = useState('10');
  const [lev, setLev] = useState(100);
  const [tpRoe, setTpRoe] = useState(100);
  const [slip, setSlip] = useState(getSlippage);
  const [busy, setBusy] = useState(false);
  const [funds, setFunds] = useState(false);

  const toSlider = (l: number) => Math.round((Math.log(l) / Math.log(maxLev)) * 1000);
  const fromSlider = (v: number) => Math.max(1, Math.round(Math.exp((v / 1000) * Math.log(maxLev))));

  const wager = parseFloat(amount) || 0;
  const size = wager * lev;
  // Expected fill: spread plus size-based slippage, the same way the contract fills.
  const estSlip = estimateSlippage(pool.config, pool.vault.liquidity, wager * lev);
  const entry = mark * (side === 'long' ? 1 + pool.config.spread : 1 - pool.config.spread) * (side === 'long' ? 1 + estSlip : 1 - estSlip);
  const fromBonus = pool.userPromo.locked && wager > 0 && wager <= pool.userPromo.bonus;
  const liq = mark ? liquidationPrice(entry, side, lev) : 0;
  const maxSize = pool.vault.liquidity * pool.config.maxPositionShare;
  const maxPayout = wager * Math.min(pool.config.maxProfitMultiple, tpRoe > 0 ? tpRoe / 100 : Infinity);
  const moveToLiq = (100 / lev).toFixed(lev >= 100 ? 3 : 2);

  let problem: string | null = null;
  if (!accountId) problem = 'Connect your NEAR wallet to trade.';
  else if (pool.missing) problem = 'Live USDC trading opens as soon as the Nitro contract is live on NEAR mainnet.';
  else if (wager > pool.balance && !fromBonus) problem = 'Not enough balance. Deposit USDC first.';
  else if (wager > 0 && wager < pool.config.minWager) problem = `Minimum wager is ${usd(pool.config.minWager)} USDC.`;
  else if (pool.ready && size > maxSize) problem = `Max position size right now is ${usd(maxSize, 0)} USDC.`;

  const pickSlip = (v: number) => {
    setSlip(v);
    saveSlippage(v);
  };

  const submit = async () => {
    if (problem || !mark || wager <= 0) return;
    if (getSettings().childproof) {
      const ok = await confirmDialog({
        title: `${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x with real USDC?`,
        body: `Wager ${usd(wager)} USDC for a ${usd(size, 0)} USDC position. A ${moveToLiq}% move against you loses the whole wager.`,
        confirmLabel: `Open ${side}`,
        danger: side === 'short',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await signAndSend(POOL_ID, [openAction({ market, side, wager, leverage: lev, tpRoe, limit: limitPrice(entry, side === 'long', slip) })]);
      sound.open();
      toast.ok(`Opened ${side} ${market} ${lev}x · ${usd(size, 0)} USDC`);
      refreshPool();
    } catch (e) {
      toast.err(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel order">
      <div className="order-head">
        <TokenIcon market={market} size={30} />
        <div>
          <b>{market}-PERP</b>
          <span className="muted small">
            {MARKET_NAME[market]} · real USDC · up to {maxLev}x
          </span>
        </div>
      </div>
      {childproof && <span className="childproof-badge">Childproof on · every trade asks to confirm</span>}

      <PromoCard compact />

      <div className="live-balance">
        <div>
          <span className="label">Balance</span>
          <b className="mono">{usd(pool.balance)} USDC</b>
        </div>
        {pool.userPromo.locked && (
          <div title="Bonus balance: trade with it; it becomes withdrawable after the turnover">
            <span className="label">Bonus</span>
            <b className="mono bonus-amt">🎁 {usd(pool.userPromo.bonus)}</b>
          </div>
        )}
        <button className="btn btn-sm btn-primary" onClick={() => setFunds(true)} disabled={!accountId}>
          Deposit
        </button>
      </div>

      <div className="seg">
        <button className={`seg-btn ${side === 'long' ? 'seg-long' : ''}`} onClick={() => setSide('long')}>
          Long
        </button>
        <button className={`seg-btn ${side === 'short' ? 'seg-short' : ''}`} onClick={() => setSide('short')}>
          Short
        </button>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="pool-wager">Wager (max loss)</label>
          <span className="muted">
            Balance <b className="mono">{usd(pool.balance)}</b> USDC
          </span>
        </div>
        <div className="input">
          <input id="pool-wager" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span className="unit">USDC</span>
        </div>
        <div className="row-chips">
          {[10, 25, 50, 100].map((p) => (
            <button key={p} className="chip" onClick={() => setAmount(String(Math.floor(pool.balance * p) / 100))}>
              {p === 100 ? 'Max' : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="pool-lev">Leverage</label>
          <b className={`lev ${lev >= 500 ? 'lev-hot' : ''}`}>{lev}x</b>
        </div>
        <input
          id="pool-lev"
          type="range"
          min={0}
          max={1000}
          value={toSlider(Math.min(lev, maxLev))}
          onChange={(e) => setLev(fromSlider(+e.target.value))}
          className="slider"
          style={{ ['--fill' as string]: `${toSlider(Math.min(lev, maxLev)) / 10}%` }}
        />
        <div className="row-chips">
          {PRESETS.filter((p) => p <= maxLev).map((p) => (
            <button key={p} className={`chip ${lev === p ? 'chip-on' : ''}`} onClick={() => setLev(p)}>
              {p}x
            </button>
          ))}
        </div>
      </div>

      <TpPicker value={tpRoe} onChange={setTpRoe} tpPrice={tpRoe && mark ? takeProfitPrice(entry, side, lev, tpRoe) : null} max={pool.config.maxProfitMultiple * 100} />

      <div className="field">
        <div className="field-head">
          <label>Slippage tolerance</label>
          <span className="muted mono">{pctLabel(slip)}</span>
        </div>
        <div className="row-chips">
          {SLIPPAGE_CHOICES.map((v) => (
            <button key={v} className={`chip ${slip === v ? 'chip-on' : ''}`} onClick={() => pickSlip(v)}>
              {pctLabel(v)}
            </button>
          ))}
        </div>
      </div>

      <dl className="summary">
        <div>
          <dt>Position size</dt>
          <dd className="mono">{usd(size, 2)} USDC</dd>
        </div>
        <div>
          <dt>Entry price</dt>
          <dd className="mono">{price(entry)}</dd>
        </div>
        <div>
          <dt>Est. slippage</dt>
          <dd className="mono">{(estSlip * 100).toFixed(4)}%</dd>
        </div>
        <div>
          <dt>Worst entry (your limit)</dt>
          <dd className="mono">{price(limitPrice(entry, side === 'long', slip))}</dd>
        </div>
        <div>
          <dt>Max loss price</dt>
          <dd className="mono warn">{price(liq)}</dd>
        </div>
        <div>
          <dt>Max profit</dt>
          <dd className="mono">{usd(maxPayout)} USDC</dd>
        </div>
        <div>
          <dt>Fee on profit · spread</dt>
          <dd className="mono">
            {pctLabel(pool.config.profitFee)} · {pctLabel(pool.config.spread)}
          </dd>
        </div>
        <div>
          <dt>NITRO points (held 60s+)</dt>
          <dd className="mono">{compact(fromBonus ? 0 : size / 100)}</dd>
        </div>
      </dl>

      {fromBonus && <p className="bonus-note">🎁 Paid from your bonus balance</p>}
      {pool.balance < pool.config.minWager && !(pool.userPromo.locked && pool.userPromo.bonus >= pool.config.minWager) && accountId && !pool.missing ? (
        <button className="btn btn-primary btn-block" onClick={() => setFunds(true)}>
          Deposit USDC to start
        </button>
      ) : (
        <button className={`btn btn-block ${side === 'long' ? 'btn-long' : 'btn-short'}`} onClick={submit} disabled={!!problem || busy || !mark || wager <= 0}>
          <TokenIcon market={market} size={22} />
          {busy ? 'Confirm in your wallet…' : `${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x`}
        </button>
      )}
      {problem && <p className="hint err">{problem}</p>}
      {pool.error && <p className="hint err">Could not reach the pool: {pool.error}</p>}
      {funds && <FundsModal onClose={() => setFunds(false)} />}
    </div>
  );
}

const KIND_LABEL: Record<LedgerItem['kind'], string> = {
  deposit: 'Deposit',
  deposit_near: 'Deposit (NEAR)',
  settle_near: 'NEAR settled',
  withdraw_request: 'Withdraw requested',
  withdraw: 'Withdrawn',
  withdraw_rejected: 'Withdraw rejected',
  withdraw_cancelled: 'Withdraw cancelled',
  promo_bonus: 'Bonus',
  promo_unlocked: 'Bonus unlocked',
  promo_ended: 'Bonus ended',
  nitro_convert: 'NITRO → $NTR',
  nitro_refund: 'NITRO refunded',
  refund: 'Refund',
  vault_deposit: 'Vault deposit',
  vault_withdraw: 'Vault withdraw',
  open: 'Open',
  close: 'Close',
};

/** Every deposit, withdrawal and trade the contract recorded for this user. */
export function LedgerTable({ items, limit = 100 }: { items: LedgerItem[]; limit?: number }) {
  if (items.length === 0) return <p className="empty">Your deposits, withdrawals and trades show up here.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Details</th>
          <th>Amount</th>
          <th>PnL</th>
          <th>When</th>
        </tr>
      </thead>
      <tbody>
        {items.slice(0, limit).map((e, i) => (
          <tr key={`${e.at}-${i}`}>
            <td>
              <span className={`tag ledger-${e.kind}`}>{KIND_LABEL[e.kind] ?? e.kind}</span>
              {e.kind === 'close' && e.reason === 'max_loss' && <span className="tag tag-liq">max loss</span>}
              {e.kind === 'close' && e.reason === 'take_profit' && <span className="tag tag-tp">take profit</span>}
            </td>
            <td>
              {e.market ? (
                <span className="pair">
                  <TokenIcon market={e.market} size={18} />
                  <b>
                    {e.market} {e.side} {e.leverage}x
                  </b>
                  <span className="muted mono">@ {price(e.price)}</span>
                </span>
              ) : (
                <span className="muted">USDC</span>
              )}
            </td>
            <td className={`mono ${e.kind === 'deposit' || e.kind === 'refund' || e.kind === 'promo_bonus' ? 'up' : e.kind === 'withdraw' ? 'down' : ''}`}>
              {e.kind === 'deposit' || e.kind === 'refund' || e.kind === 'promo_bonus' ? '+' : e.kind === 'withdraw' ? '−' : ''}
              {usd(e.amount)}
              {e.kind === 'withdraw_rejected' && e.reason && <span className="muted small ledger-note"> · {e.reason}</span>}
            </td>
            <td className={`mono ${e.pnl > 0 ? 'up' : e.pnl < 0 ? 'down' : 'muted'}`}>{e.kind === 'close' ? signed(e.pnl - (e.pnl > 0 ? e.fee : 0)) : '—'}</td>
            <td className="muted">{new Date(e.at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PoolPositions() {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const { tickers } = usePrices();
  const [tab, setTab] = useState<'open' | 'history' | 'funds'>('open');
  const [share, setShare] = useState<ShareData | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const trades = tradesFromLedger(pool.ledger);
  const openPnl = pool.positions.reduce((s, p) => s + unrealizedPnl(p, tickers[p.market]?.price ?? p.entry), 0);

  const close = async (id: string) => {
    const p = pool.positions.find((x) => x.id === id);
    if (!p) return;
    const mark = tickers[p.market]?.price ?? p.entry;
    if (getSettings().childproof) {
      const ok = await confirmDialog({
        title: 'Close this position?',
        body: `${p.market} ${p.side} ${p.leverage}x closes near ${price(mark)} for about ${signed(unrealizedPnl(p, mark))} USDC.`,
        confirmLabel: 'Close position',
      });
      if (!ok) return;
    }
    setClosing(id);
    try {
      // Closing a long sells, closing a short buys.
      await signAndSend(POOL_ID, [closeAction(id, limitPrice(mark, p.side === 'short', getSlippage()))]);
      refreshPool();
    } catch (e) {
      toast.err(errText(e));
    } finally {
      setClosing(null);
    }
  };

  return (
    <div className="panel positions">
      <div className="tabs">
        <button className={`tab ${tab === 'open' ? 'tab-on' : ''}`} onClick={() => setTab('open')}>
          Positions <span className="count">{pool.positions.length}</span>
        </button>
        <button className={`tab ${tab === 'history' ? 'tab-on' : ''}`} onClick={() => setTab('history')}>
          Trade history
        </button>
        <button className={`tab ${tab === 'funds' ? 'tab-on' : ''}`} onClick={() => setTab('funds')}>
          Activity
        </button>
        {tab === 'open' && pool.positions.length > 0 && (
          <div className="tabs-right">
            <span className={`mono small ${openPnl >= 0 ? 'up' : 'down'}`}>{signed(openPnl)} USDC</span>
          </div>
        )}
      </div>
      <div className="table-wrap">
        {tab === 'open' ? (
          pool.positions.length === 0 ? (
            <p className="empty">{accountId ? 'No open positions. Pick a side and a leverage to start.' : 'Connect your NEAR wallet to trade.'}</p>
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
                {pool.positions.map((p) => {
                  const mark = tickers[p.market]?.price ?? p.entry;
                  const pnl = Math.max(-p.collateral, unrealizedPnl(p, mark));
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className={`tag tag-${p.side}`}>
                          {p.side} {p.leverage}x
                        </span>{' '}
                        <span className="pair">
                          <TokenIcon market={p.market} size={20} />
                          <b>{p.market}</b>
                        </span>
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
                          <button className="btn btn-sm" onClick={() => close(p.id)} disabled={closing === p.id}>
                            {closing === p.id ? 'Closing…' : 'Close'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : tab === 'history' ? (
          trades.length === 0 ? (
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
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`tag tag-${t.side}`}>
                        {t.side} {t.leverage}x
                      </span>{' '}
                      <span className="pair">
                        <TokenIcon market={t.market} size={20} />
                        <b>{t.market}</b>
                      </span>
                      {t.reason === 'liquidated' && <span className="tag tag-liq">max loss</span>}
                      {t.reason === 'tp' && <span className="tag tag-tp">take profit</span>}
                    </td>
                    <td className="mono">{usd(t.size)}</td>
                    <td className="mono">{price(t.entry)}</td>
                    <td className="mono">{price(t.exit)}</td>
                    <td className={`mono ${t.pnl >= 0 ? 'up' : 'down'}`}>{signed(t.pnl)}</td>
                    <td className="mono accent">{t.nitro ? `+${compact(t.nitro)}` : '—'}</td>
                    <td className="muted">{new Date(t.closedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
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
          )
        ) : (
          <LedgerTable items={pool.ledger} />
        )}
      </div>
      {share && <ShareCard data={share} onClose={() => setShare(null)} />}
    </div>
  );
}
