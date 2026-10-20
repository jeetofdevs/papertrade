import { useState } from 'react';
import { Market, Side } from '../lib/engine';
import { compact, price, usd } from '../lib/format';
import { HL_APP_URL, HL_BUILDER_FEE, HL_MIN_NOTIONAL, HL_TESTNET, hasEvmWallet, openMarket } from '../lib/hl/client';
import { connectHl, refreshAccount, setupHl, useHl } from '../lib/hl/store';
import { usePrices } from '../lib/prices';
import { getSettings } from '../lib/settings';
import { sound } from '../lib/sound';
import { confirmDialog } from './Confirm';
import { MARKET_NAME } from './MarketBar';
import { toast } from './Toasts';
import { TokenIcon } from './TokenIcon';

const TP_PRESETS = [0, 25, 50, 100, 300];

export function LiveOrderPanel({ market }: { market: Market }) {
  const hl = useHl();
  const { tickers } = usePrices();
  const mark = tickers[market]?.price ?? 0;
  const maxLev = hl.assets?.[market]?.maxLeverage ?? 20;
  const [side, setSide] = useState<Side>('long');
  const [amount, setAmount] = useState('10');
  const [levRaw, setLev] = useState(10);
  const [tpRoe, setTpRoe] = useState(0);
  const [busy, setBusy] = useState(false);
  const lev = Math.min(levRaw, maxLev);
  const wager = parseFloat(amount) || 0;
  const size = wager * lev;
  const dir = side === 'long' ? 1 : -1;
  const tpPrice = tpRoe && mark ? mark * (1 + (dir * tpRoe) / 100 / lev) : null;
  const balance = hl.account?.withdrawable ?? 0;

  const head = (
    <div className="order-head">
      <TokenIcon market={market} size={30} />
      <div>
        <b>{market}-PERP</b>
        <span className="muted small">
          {MARKET_NAME[market]} · Hyperliquid{HL_TESTNET ? ' testnet' : ''} · up to {maxLev}x
        </span>
      </div>
    </div>
  );

  if (hl.status !== 'ready') {
    const step = !hasEvmWallet() ? 0 : !hl.user ? 1 : 2;
    return (
      <div className="panel order">
        {head}
        <div className="live-setup">
          <h3>Trade real USDC on Hyperliquid</h3>
          <p className="muted small">
            Orders route to Hyperliquid&apos;s order book, so there is no Nitro pool behind them. You need an EVM wallet
            (MetaMask, Rabby…) with USDC on Hyperliquid.
          </p>
          <ol className="live-steps">
            <li className={step > 0 ? 'done' : 'now'}>
              Install an EVM wallet
              {step === 0 && (
                <a className="btn btn-sm" href="https://rabby.io" target="_blank" rel="noopener noreferrer">
                  Get Rabby ↗
                </a>
              )}
            </li>
            <li className={step > 1 ? 'done' : step === 1 ? 'now' : ''}>
              Connect it
              {step === 1 && (
                <button className="btn btn-sm btn-primary" onClick={connectHl} disabled={hl.status === 'connecting'}>
                  {hl.status === 'connecting' ? 'Connecting…' : 'Connect EVM wallet'}
                </button>
              )}
            </li>
            <li className={step === 2 ? 'now' : ''}>
              Enable trading
              <span className="muted small">
                {HL_BUILDER_FEE > 0 ? 'Two one-time signatures: the Nitro fee and a trading key.' : 'One signature that creates a trading key.'}{' '}
                The key trades without popups and can never withdraw.
              </span>
              {step === 2 && (
                <button className="btn btn-sm btn-primary" onClick={setupHl} disabled={hl.status === 'setting-up'}>
                  {hl.status === 'setting-up' ? 'Check your wallet…' : 'Enable trading'}
                </button>
              )}
            </li>
          </ol>
          {hl.error && <p className="hint err">{hl.error}</p>}
        </div>
      </div>
    );
  }

  const submit = async () => {
    if (getSettings().childproof) {
      const ok = await confirmDialog({
        title: `${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x with real USDC?`,
        body: `Margin ${usd(wager)} USDC for a ${usd(size, 0)} USDC position on Hyperliquid. Your margin is the most you can lose.`,
        confirmLabel: `Open ${side}`,
        danger: side === 'short',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await openMarket(hl.user!, { market, isLong: side === 'long', wager, leverage: lev, takeProfit: tpPrice });
      sound.open();
      toast.ok(`Opened ${side} ${market} ${lev}x on Hyperliquid`);
      refreshAccount();
    } catch (e) {
      toast.err((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel order">
      {head}
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
          <label htmlFor="live-wager">Margin (max loss)</label>
          <span className="muted">
            Available <b className="mono">{usd(balance)}</b> USDC
          </span>
        </div>
        <div className="input">
          <input id="live-wager" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span className="unit">USDC</span>
        </div>
        <div className="row-chips">
          {[10, 25, 50, 100].map((p) => (
            <button key={p} className="chip" onClick={() => setAmount(String(Math.floor(balance * p) / 100))}>
              {p === 100 ? 'Max' : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="live-lev">Leverage</label>
          <b className="lev">{lev}x</b>
        </div>
        <input
          id="live-lev"
          type="range"
          min={1}
          max={maxLev}
          value={lev}
          onChange={(e) => setLev(+e.target.value)}
          className="slider"
          style={{ ['--fill' as string]: `${((lev - 1) / Math.max(1, maxLev - 1)) * 100}%` }}
        />
      </div>

      <div className="field">
        <div className="field-head">
          <label>Take profit</label>
          <span className="muted mono">{tpPrice ? price(tpPrice) : 'off'}</span>
        </div>
        <div className="row-chips">
          {TP_PRESETS.map((r) => (
            <button key={r} className={`chip ${tpRoe === r ? 'chip-on' : ''}`} onClick={() => setTpRoe(r)}>
              {r ? `+${r}%` : 'Off'}
            </button>
          ))}
        </div>
      </div>

      <dl className="summary">
        <div>
          <dt>Position size</dt>
          <dd className="mono">{usd(size)} USDC</dd>
        </div>
        <div>
          <dt>Mark price</dt>
          <dd className="mono">{price(mark)}</dd>
        </div>
        <div>
          <dt>Margin mode</dt>
          <dd className="mono">Isolated</dd>
        </div>
        <div>
          <dt>Nitro fee</dt>
          <dd className="mono">{HL_BUILDER_FEE ? `${HL_BUILDER_FEE / 1000}%` : '0'}</dd>
        </div>
      </dl>

      <button
        className={`btn btn-block ${side === 'long' ? 'btn-long' : 'btn-short'}`}
        onClick={submit}
        disabled={busy || !mark || size < HL_MIN_NOTIONAL || wager > balance}
      >
        <TokenIcon market={market} size={22} />
        {busy ? 'Sending…' : `${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x`}
      </button>
      {size < HL_MIN_NOTIONAL && <p className="hint">Hyperliquid needs a position of at least ${HL_MIN_NOTIONAL}.</p>}
      {wager > balance && <p className="hint err">Not enough USDC on Hyperliquid.</p>}
      <p className="hint">
        Account value <b className="mono">${compact(hl.account?.accountValue ?? 0)}</b> ·{' '}
        <a className="link" href={HL_APP_URL} target="_blank" rel="noopener noreferrer">
          Deposit on Hyperliquid ↗
        </a>
      </p>
    </div>
  );
}
