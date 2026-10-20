import { TokenIcon } from './TokenIcon';
import { MARKET_NAME } from './MarketBar';
import { useState } from 'react';
import {
  account,
  faucet,
  FAUCET_AMOUNT,
  NITRO_PER_USD_LOST,
  liquidationPrice,
  Market,
  MAX_LEVERAGE,
  MAX_SIZE_OF_POOL,
  openPosition,
  Side,
} from '../lib/engine';
import { compact, price, usd } from '../lib/format';
import { usePrices } from '../lib/prices';
import { dispatch, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { getSettings } from '../lib/settings';
import { sound } from '../lib/sound';
import { toast } from './Toasts';

const PRESETS = [2, 10, 50, 100, 500, 1000];

// Slider is logarithmic so 1x–10x is as easy to pick as 100x–1000x.
const toSlider = (lev: number) => Math.round((Math.log(lev) / Math.log(MAX_LEVERAGE)) * 1000);
const fromSlider = (v: number) => Math.max(1, Math.round(Math.exp((v / 1000) * Math.log(MAX_LEVERAGE))));

export function OrderPanel({ market }: { market: Market }) {
  const { traderId, accountId, connect } = useWallet();
  const state = useStore();
  const { tickers } = usePrices();
  const acct = account(state, traderId);
  const mark = tickers[market]?.price ?? 0;

  const [side, setSide] = useState<Side>('long');
  const [amount, setAmount] = useState('100');
  const [lev, setLev] = useState(100);

  const collateral = parseFloat(amount) || 0;
  const size = collateral * lev;
  const liq = mark ? liquidationPrice(mark, side, lev) : 0;
  const maxSize = state.pool.liquidity * MAX_SIZE_OF_POOL;
  const moveToLiq = (100 / lev).toFixed(lev >= 100 ? 3 : 2);

  const submit = () => {
    if (getSettings().childproof && (lev > 100 || collateral > acct.usdc / 2)) {
      const ok = window.confirm(
        `Childproof check: ${side} ${market} at ${lev}x with ${usd(collateral)} USDC. ` +
          `A ${moveToLiq}% move against you loses the whole wager. Continue?`,
      );
      if (!ok) return;
    }
    const err = dispatch((s) => openPosition(s, traderId, { market, side, collateral, leverage: lev }, mark, Date.now()));
    if (err) toast.err(err);
    else {
      sound.open();
      toast.ok(`Opened ${side} ${market} ${lev}x · ${usd(size, 0)} USDC`);
    }
  };

  const claimFaucet = () => {
    const err = dispatch((s) => faucet(s, traderId, Date.now()));
    if (err) toast.err(err);
    else toast.ok(`${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added`);
  };

  return (
    <div className="panel order">
      <div className="order-head">
        <TokenIcon market={market} size={30} />
        <div>
          <b>{market}-PERP</b>
          <span className="muted small">{MARKET_NAME[market]} · up to {MAX_LEVERAGE}x</span>
        </div>
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
          <label htmlFor="collateral">Wager (max loss)</label>
          <span className="muted">
            Demo balance <b className="mono">{usd(acct.usdc)}</b> USDC
          </span>
        </div>
        <div className="input">
          <input
            id="collateral"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <span className="unit">USDC</span>
        </div>
        <div className="row-chips">
          {[10, 25, 50, 100].map((p) => (
            <button key={p} className="chip" onClick={() => setAmount(String(Math.floor(acct.usdc * p) / 100))}>
              {p === 100 ? 'Max' : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="lev">Leverage</label>
          <b className={`lev ${lev >= 500 ? 'lev-hot' : ''}`}>{lev}x</b>
        </div>
        <input
          id="lev"
          type="range"
          min={0}
          max={1000}
          value={toSlider(lev)}
          onChange={(e) => setLev(fromSlider(+e.target.value))}
          className="slider"
          style={{ ['--fill' as string]: `${toSlider(lev) / 10}%` }}
        />
        <div className="row-chips">
          {PRESETS.map((p) => (
            <button key={p} className={`chip ${lev === p ? 'chip-on' : ''}`} onClick={() => setLev(p)}>
              {p}x
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
          <dd className="mono">{price(mark)}</dd>
        </div>
        <div>
          <dt>Max loss price</dt>
          <dd className="mono warn">{price(liq)}</dd>
        </div>
        <div>
          <dt>Max loss after</dt>
          <dd className="mono">{moveToLiq}% move</dd>
        </div>
        <div>
          <dt>Fees · slippage · funding</dt>
          <dd className="mono accent">0 · 0 · 0</dd>
        </div>
        <div>
          <dt>NITRO at max loss</dt>
          <dd className="mono">{compact(collateral * NITRO_PER_USD_LOST)}</dd>
        </div>
      </dl>

      {acct.usdc < 1 && acct.positions.length === 0 ? (
        <button className="btn btn-primary btn-block" onClick={claimFaucet}>
          Get {FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC
        </button>
      ) : (
        <button
          className={`btn btn-block ${side === 'long' ? 'btn-long' : 'btn-short'}`}
          onClick={submit}
          disabled={!mark || collateral <= 0}
        >
          <TokenIcon market={market} size={22} />
          {side === 'long' ? 'Long' : 'Short'} {market} {lev}x
        </button>
      )}
      {size > maxSize && <p className="hint err">Max size per position is {usd(maxSize, 0)} USDC (2% of the vault).</p>}
      {!accountId && (
        <p className="hint">
          Trading as guest.{' '}
          <button className="link" onClick={connect}>
            Connect a NEAR wallet
          </button>{' '}
          to keep your own account.
        </p>
      )}
    </div>
  );
}
