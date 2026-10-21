import { useState } from 'react';
import { usd } from '../lib/format';
import { depositAction, POOL_ID, refreshPool, USDC_ID, usePool, withdrawAction } from '../lib/pool';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

type Tab = 'deposit' | 'withdraw';

/** Live USDC balance with deposit and withdraw. Depositing is one contract call signed by the user's NEAR wallet. */
export function PoolAccountCard() {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  if (pool.missing) {
    return (
      <section className="panel pad pool-card" id="pool">
        <h2>USDC balance</h2>
        <p className="muted">USDC deposits are not open yet. They open as soon as the Nitro trading contract is live on NEAR mainnet.</p>
      </section>
    );
  }

  const n = Number(amount);
  const max = tab === 'deposit' ? pool.wallet : pool.balance;
  const tooSmall = tab === 'deposit' && n > 0 && n < pool.config.minDeposit;
  const valid = n > 0 && n <= max && !tooSmall;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (tab === 'deposit') await signAndSend(USDC_ID, [depositAction(n)]);
      else await signAndSend(POOL_ID, [withdrawAction(n)]);
      toast.ok(tab === 'deposit' ? `Deposited ${usd(n)} USDC` : `Withdrew ${usd(n)} USDC`);
      setAmount('');
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel pad pool-card" id="pool">
      <h2>USDC balance</h2>

      <div className="pool-balances">
        <div>
          <span className="label">Trading balance</span>
          <b className="mono">${usd(pool.balance)}</b>
        </div>
        <div>
          <span className="label">In your wallet</span>
          <b className="mono">${usd(pool.wallet)}</b>
        </div>
      </div>
      {pool.error && <p className="hint err">Could not load your balance: {pool.error}</p>}

      <div className="pool-tabs">
        {(['deposit', 'withdraw'] as Tab[]).map((t) => (
          <button key={t} className={`seg-btn${tab === t ? ' pool-tab-on' : ''}`} onClick={() => setTab(t)}>
            {t === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        ))}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="pool-amt">{tab === 'deposit' ? 'Amount to deposit' : 'Amount to withdraw'}</label>
          <span className="muted">
            Max <b className="mono">{usd(max)}</b> USDC
          </span>
        </div>
        <div className="input">
          <input id="pool-amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <button className="chip" onClick={() => setAmount(String(Math.floor(max * 1e6) / 1e6))}>
            Max
          </button>
          <span className="unit">USDC</span>
        </div>
        <button className="btn btn-primary pool-go" disabled={!valid || busy || !accountId} onClick={submit}>
          {busy ? 'Confirm in your wallet…' : tab === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
        </button>
        {tooSmall && <p className="hint err">Minimum deposit is {usd(pool.config.minDeposit)} USDC.</p>}
        <p className="muted small">
          {tab === 'deposit'
            ? 'Confirm one transaction in your NEAR wallet. Your trading balance updates as soon as it lands.'
            : 'Your free balance goes back to your NEAR wallet in a few seconds.'}
        </p>
      </div>
    </section>
  );
}
