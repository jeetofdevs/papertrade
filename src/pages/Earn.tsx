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
      toast.ok(mode === 'deposit' ? `Deposited ${usd(value)} USDC` : `Withdrew ${usd(value)} USDC`);
      setAmount('');
    }
  };

  const myValue = acct.lpShares * sp;
  const max = mode === 'deposit' ? acct.usdc : myValue;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Nitro Vault</h1>
        <p>
          The vault is the other side of every trade. When traders lose, the vault earns. Deposit USDC, receive
          <b> nLP</b>, and share in the house edge.
        </p>
      </header>

      <div className="cards">
        <Stat label="Vault liquidity" value={`$${compact(state.pool.liquidity)}`} />
        <Stat label="nLP price" value={`$${sp.toFixed(4)}`} accent={sp >= 1} />
        <Stat label="Your nLP" value={compact(acct.lpShares)} />
        <Stat label="Your vault value" value={`$${usd(myValue)}`} />
      </div>

      <div className="split">
        <div className="panel pad">
          <div className="seg">
            <button className={`seg-btn ${mode === 'deposit' ? 'seg-long' : ''}`} onClick={() => setMode('deposit')}>
              Deposit
            </button>
            <button className={`seg-btn ${mode === 'withdraw' ? 'seg-short' : ''}`} onClick={() => setMode('withdraw')}>
              Withdraw
            </button>
          </div>
          <div className="field">
            <div className="field-head">
              <label htmlFor="vault-amt">Amount</label>
              <span className="muted">
                Available <b className="mono">{usd(max)}</b> USDC
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
            You {mode === 'deposit' ? 'receive' : 'burn'} ≈ <b className="mono">{compact(value / sp)}</b> nLP
          </p>
          <button className="btn btn-primary btn-block" onClick={submit} disabled={value <= 0}>
            {mode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
          </button>
        </div>

        <div className="panel pad prose">
          <h3>How the vault works</h3>
          <ol>
            <li>Traders open positions up to 1000x against the vault. No order book, no slippage.</li>
            <li>Losing trades and liquidations send their collateral to the vault, which raises the nLP price.</li>
            <li>Winning trades are paid from the vault. If it runs short, profits queue and are paid as liquidity returns.</li>
            <li>Each position is capped at 2% of vault liquidity so no single trade can drain it.</li>
          </ol>
          <p className="muted small">Providing liquidity is risky: a run of winning traders lowers the nLP price.</p>
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
