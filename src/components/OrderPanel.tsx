import { useState } from 'react';
import {
  account,
  faucet,
  KAMI_PER_USD_LOST,
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
  const moveToLiq = (90 / lev).toFixed(lev >= 100 ? 3 : 2);

  const submit = () => {
    const err = dispatch((s) => openPosition(s, traderId, { market, side, collateral, leverage: lev }, mark, Date.now()));
    if (err) toast.err(err);
    else toast.ok(`Posisi ${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x dibuka · ${usd(size, 0)} USDC`);
  };

  const claimFaucet = () => {
    const err = dispatch((s) => faucet(s, traderId, Date.now()));
    if (err) toast.err(err);
    else toast.ok('10.000 USDC demo ditambahkan');
  };

  return (
    <div className="panel order">
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
          <label htmlFor="collateral">Kolateral</label>
          <span className="muted">
            Saldo demo <b className="mono">{usd(acct.usdc)}</b> USDC
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
          <dt>Ukuran posisi</dt>
          <dd className="mono">{usd(size, 2)} USDC</dd>
        </div>
        <div>
          <dt>Harga masuk</dt>
          <dd className="mono">{price(mark)}</dd>
        </div>
        <div>
          <dt>Harga likuidasi</dt>
          <dd className="mono warn">{price(liq)}</dd>
        </div>
        <div>
          <dt>Terlikuidasi setelah</dt>
          <dd className="mono">gerak {moveToLiq}%</dd>
        </div>
        <div>
          <dt>Biaya · slippage · funding</dt>
          <dd className="mono accent">0 · 0 · 0</dd>
        </div>
        <div>
          <dt>KAMI jika rugi total</dt>
          <dd className="mono">{compact(collateral * 0.9 * KAMI_PER_USD_LOST)}</dd>
        </div>
      </dl>

      {acct.usdc < 1 && acct.positions.length === 0 ? (
        <button className="btn btn-primary btn-block" onClick={claimFaucet}>
          Ambil 10.000 USDC demo
        </button>
      ) : (
        <button
          className={`btn btn-block ${side === 'long' ? 'btn-long' : 'btn-short'}`}
          onClick={submit}
          disabled={!mark || collateral <= 0}
        >
          {side === 'long' ? 'Long' : 'Short'} {market} {lev}x
        </button>
      )}
      {size > maxSize && <p className="hint err">Ukuran maksimal per posisi {usd(maxSize, 0)} USDC (2% dari vault).</p>}
      {!accountId && (
        <p className="hint">
          Trading sebagai tamu.{' '}
          <button className="link" onClick={connect}>
            Hubungkan wallet NEAR
          </button>{' '}
          untuk akun Anda sendiri.
        </p>
      )}
    </div>
  );
}
