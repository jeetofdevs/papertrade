import { useState } from 'react';
import { claimTransfer, depositAction, KEEPER_URL, POOL_AVAILABLE, POOL_ID, USDC_ID, usePoolAccount, withdrawAction } from '../lib/pool';
import { usd } from '../lib/format';
import { useWallet } from '../lib/wallet';
import { toast } from './Toasts';

type Tab = 'deposit' | 'withdraw' | 'address';

/** The user's account in the Nitro pool: balance, deposit, withdraw and the pool's deposit address. */
export function PoolAccountCard() {
  const { accountId, signAndSend } = useWallet();
  const { data, error, refresh } = usePoolAccount(accountId);
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState('');

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

  const copy = (text: string, what: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.ok(`${what} copied`));
  };

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

  const claim = async () => {
    if (!accountId || !txHash.trim()) return;
    setBusy(true);
    try {
      const done = await claimTransfer(txHash, accountId);
      (done.length ? toast.ok : toast.info)(done.length ? 'Transfer credited to your pool balance' : 'Nothing new to credit in that transaction');
      setTxHash('');
      refresh();
    } catch (e) {
      toast.err((e as Error).message);
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
        {(['deposit', 'withdraw', 'address'] as Tab[]).map((t) => (
          <button key={t} className={`seg-btn${tab === t ? ' pool-tab-on' : ''}`} onClick={() => setTab(t)}>
            {t === 'deposit' ? 'Deposit' : t === 'withdraw' ? 'Withdraw' : 'Send from anywhere'}
          </button>
        ))}
      </div>

      {tab !== 'address' ? (
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
              ? 'One transaction from your NEAR wallet. Your pool balance updates as soon as it confirms.'
              : 'Free balance only. USDC arrives in your NEAR wallet in a few seconds.'}
          </p>
        </div>
      ) : (
        <div className="pool-address">
          <p className="muted small">Send native USDC on the NEAR network to the pool address. Your balance is counted from your transfers to it.</p>
          <div className="pool-copy">
            <span className="label">Pool address</span>
            <code className="mono">{POOL_ID}</code>
            <button className="chip" onClick={() => copy(POOL_ID, 'Pool address')}>
              Copy
            </button>
          </div>
          <div className="pool-copy">
            <span className="label">Memo</span>
            <code className="mono">{accountId ?? "your NEAR account"}</code>
            <button className="chip" onClick={() => accountId && copy(accountId, 'Memo')}>
              Copy
            </button>
          </div>
          <ul className="pool-rules small">
            <li>
              <b>From your own NEAR wallet:</b> credited to you automatically. The memo is optional.
            </li>
            <li>
              <b>From an exchange or another account:</b> put your NEAR account in the memo, or the deposit is credited to the sending account.
            </li>
            <li>Only USDC on NEAR. Other tokens or networks cannot be credited.</li>
            <li>Plain transfers usually show up within a minute.</li>
          </ul>
          {KEEPER_URL && (
            <div className="field">
              <div className="field-head">
                <label htmlFor="pool-tx">Not showing up? Paste the transaction hash</label>
              </div>
              <div className="input">
                <input id="pool-tx" placeholder="Transaction hash" value={txHash} onChange={(e) => setTxHash(e.target.value.trim())} />
              </div>
              <button className="btn btn-sm" disabled={!txHash || busy} onClick={claim}>
                Check transfer
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
