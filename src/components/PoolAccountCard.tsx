import { useState } from 'react';
import { depositAction, POOL_AVAILABLE, POOL_ID, USDC_ID, usePoolAccount, withdrawAction } from '../lib/pool';
import { usd } from '../lib/format';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

type Tab = 'deposit' | 'withdraw';

/** The user's account in the Nitro pool: balance, deposit, withdraw and the pool's deposit address. */
export function PoolAccountCard() {
  const { accountId, signAndSend } = useWallet();
  const { data, error, refresh } = usePoolAccount(accountId);
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  if (!POOL_AVAILABLE) {
    return (
      <section className="panel pad pool-card" id="pool">
        <h2>Nitro Pool account</h2>
        <p className="muted">The Nitro Pool contract is not deployed yet. Once it is live, you deposit USDC on NEAR here and trade from your pool balance.</p>
      </section>
    );
  }

  const n = Number(amount);
  const max = tab === 'deposit' ? data?.wallet ?? 0 : data?.pool.balance ?? 0;
  const valid = n > 0 && n <= max;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (tab === 'deposit') await signAndSend(USDC_ID, [depositAction(n)]);
      else await signAndSend(POOL_ID, [withdrawAction(n)]);
      toast.ok(tab === 'deposit' ? `Deposited ${usd(n)} USDC` : `Withdrawing ${usd(n)} USDC`);
      setAmount('');
      refresh();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel pad pool-card" id="pool">
      <div className="pool-head">
        <h2>Nitro Pool account</h2>
        <span className="chip mono" title="Pool contract">
          {POOL_ID}
        </span>
      </div>

      <div className="pool-balances">
        <div>
          <span className="label">Pool balance</span>
          <b className="mono">{data ? `$${usd(data.pool.balance)}` : '—'}</b>
        </div>
        <div>
          <span className="label">Wallet USDC</span>
          <b className="mono">{data ? `$${usd(data.wallet)}` : '—'}</b>
        </div>
        <div>
          <span className="label">NITRO earned</span>
          <b className="mono">{data ? usd(data.pool.nitro) : '—'}</b>
        </div>
      </div>
      {error && <p className="hint err">Could not read the pool: {error}</p>}

      <div className="pool-tabs">
        {(['deposit', 'withdraw'] as Tab[]).map((t) => (
          <button key={t} className={`seg-btn${tab === t ? ' pool-tab-on' : ''}`} onClick={() => setTab(t)}>
            {t === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        ))}
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="pool-amt">{tab === 'deposit' ? 'Deposit from your wallet' : 'Withdraw to your wallet'}</label>
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
        <button className="btn btn-primary pool-go" disabled={!valid || busy} onClick={submit}>
          {busy ? 'Confirm in your wallet…' : tab === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'}
        </button>
        <p className="muted small">
          {tab === 'deposit'
            ? `You sign one contract call from your NEAR wallet. Your USDC goes to the Nitro pool (${POOL_ID}) and is added to your balance there as soon as it confirms.`
            : 'Free balance only. USDC arrives in your NEAR wallet in a few seconds.'}
        </p>
      </div>
    </section>
  );
}
