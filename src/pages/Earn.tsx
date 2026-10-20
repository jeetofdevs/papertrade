import { useState } from 'react';
import { toast } from '../components/Toasts';
import { account, poolDeposit, poolWithdraw, sharePrice } from '../lib/engine';
import { compact, usd } from '../lib/format';
import { dispatch, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';

export function Earn() {
  const state = useStore();
  const { traderId } = useWallet();
  const acct = account(state, traderId);
  const sp = sharePrice(state.pool);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const value = parseFloat(amount) || 0;

  const submit = () => {
    const err =
      mode === 'deposit'
        ? dispatch((s) => poolDeposit(s, traderId, value))
        : dispatch((s) => poolWithdraw(s, traderId, value / sp));
    if (err) toast.err(err);
    else {
      toast.ok(mode === 'deposit' ? `Deposit ${usd(value)} USDC berhasil` : `Penarikan ${usd(value)} USDC berhasil`);
      setAmount('');
    }
  };

  const myValue = acct.lpShares * sp;
  const max = mode === 'deposit' ? acct.usdc : myValue;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Kami Vault</h1>
        <p>
          Vault adalah lawan dari setiap trade. Saat trader rugi, vault untung. Setor USDC, terima
          <b> kLP</b>, dan ikut menikmati keuntungan bandar.
        </p>
      </header>

      <div className="cards">
        <Stat label="Likuiditas vault" value={`$${compact(state.pool.liquidity)}`} />
        <Stat label="Harga kLP" value={`$${sp.toFixed(4)}`} accent={sp >= 1} />
        <Stat label="kLP Anda" value={compact(acct.lpShares)} />
        <Stat label="Nilai vault Anda" value={`$${usd(myValue)}`} />
      </div>

      <div className="split">
        <div className="panel pad">
          <div className="seg">
            <button className={`seg-btn ${mode === 'deposit' ? 'seg-long' : ''}`} onClick={() => setMode('deposit')}>
              Setor
            </button>
            <button className={`seg-btn ${mode === 'withdraw' ? 'seg-short' : ''}`} onClick={() => setMode('withdraw')}>
              Tarik
            </button>
          </div>
          <div className="field">
            <div className="field-head">
              <label htmlFor="vault-amt">Jumlah</label>
              <span className="muted">
                Tersedia <b className="mono">{usd(max)}</b> USDC
              </span>
            </div>
            <div className="input">
              <input
                id="vault-amt"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
              <button className="chip" onClick={() => setAmount(String(Math.floor(max * 100) / 100))}>
                Max
              </button>
            </div>
          </div>
          <p className="muted small">
            Anda {mode === 'deposit' ? 'menerima' : 'membakar'} ≈ <b className="mono">{compact(value / sp)}</b> kLP
          </p>
          <button className="btn btn-primary btn-block" onClick={submit} disabled={value <= 0}>
            {mode === 'deposit' ? 'Setor USDC' : 'Tarik USDC'}
          </button>
        </div>

        <div className="panel pad prose">
          <h3>Cara kerja vault</h3>
          <ol>
            <li>Trader membuka posisi hingga 1000x melawan vault. Tanpa order book dan tanpa slippage.</li>
            <li>Kolateral dari trade yang rugi dan terlikuidasi masuk ke vault, sehingga harga kLP naik.</li>
            <li>Trade yang untung dibayar dari vault. Jika vault kekurangan dana, profit masuk antrean dan dibayar saat likuiditas kembali.</li>
            <li>Setiap posisi dibatasi maksimal 2% dari likuiditas vault agar satu trade tidak terlalu berdampak.</li>
          </ol>
          <p className="muted small">Menyediakan likuiditas berisiko: jika banyak trader untung beruntun, harga kLP turun.</p>
        </div>
      </div>
    </div>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="panel stat">
      <span className="label">{label}</span>
      <b className={`mono ${accent ? 'accent' : ''}`}>{value}</b>
    </div>
  );
}
