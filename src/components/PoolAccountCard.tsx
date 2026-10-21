import { useState } from 'react';
import { usd } from '../lib/format';
import { useEffect } from 'react';
import {
  cancelWithdrawAction,
  depositAction,
  earlyDeposits,
  MAX_DEPOSIT,
  POOL_ID,
  poolCanReceiveUsdc,
  preLaunchDepositActions,
  recordEarlyDeposit,
  refreshPool,
  requestWithdrawAction,
  USDC_ID,
  usePool,
} from '../lib/pool';
import { useWallet } from '../lib/wallet';
import { PromoCard } from './PromoCard';
import { toast } from './Toasts';

type Tab = 'deposit' | 'withdraw';

/** Live USDC balance with deposit and withdrawal requests. Withdrawals are reviewed before USDC is sent. */
export function PoolAccountCard() {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  if (pool.missing) return <EarlyDepositCard />;

  const n = Number(amount);
  const max = tab === 'deposit' ? pool.wallet : pool.balance;
  const tooSmall = tab === 'deposit' && n > 0 && n < pool.config.minDeposit;
  const tooBig = tab === 'deposit' && pool.config.maxDeposit > 0 && n > pool.config.maxDeposit;
  const locked = tab === 'withdraw' && pool.userPromo.locked;
  // If the wallet balance could not be read, let the wallet itself refuse an amount that is too high.
  const withinMax = tab === 'deposit' && !pool.walletKnown ? true : n <= max;
  const valid = n > 0 && withinMax && !tooSmall && !tooBig && !locked;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      if (tab === 'deposit') await signAndSend(USDC_ID, [depositAction(n)]);
      else await signAndSend(POOL_ID, [requestWithdrawAction(n)]);
      toast.ok(tab === 'deposit' ? `Deposited ${usd(n)} USDC` : `Withdrawal of ${usd(n)} USDC requested`);
      setAmount('');
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: number) => {
    setCancelling(id);
    try {
      await signAndSend(POOL_ID, [cancelWithdrawAction(id)]);
      toast.ok('Withdrawal request cancelled');
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <section className="panel pad pool-card" id="pool">
      <h2>USDC balance</h2>
      <PromoCard />

      <div className="pool-balances">
        <div>
          <span className="label">Trading balance</span>
          <b className="mono">${usd(pool.balance)}</b>
        </div>
        <div>
          <span className="label">In your wallet</span>
          <b className="mono">{pool.walletKnown ? `$${usd(pool.wallet)}` : "…"}</b>
        </div>
      </div>
      {pool.requests.length > 0 && (
        <div className="pool-requests">
          <span className="label">Withdrawals in review</span>
          {pool.requests.map((r) => (
            <div key={r.id} className="pool-request">
              <span className="pending-dot" aria-hidden="true" />
              <b className="mono">{usd(r.amount)} USDC</b>
              <span className="muted small">requested {new Date(r.requestedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <button className="btn btn-sm" onClick={() => cancel(r.id)} disabled={cancelling === r.id}>
                {cancelling === r.id ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          ))}
        </div>
      )}
      {pool.error && <p className="hint err">{pool.error}</p>}

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
          <button className="chip" onClick={() => setAmount(String(Math.floor(Math.min(max, tab === 'deposit' && pool.config.maxDeposit > 0 ? pool.config.maxDeposit : Infinity) * 1e6) / 1e6))}>
            Max
          </button>
          <span className="unit">USDC</span>
        </div>
        <button className="btn btn-primary pool-go" disabled={!valid || busy || !accountId} onClick={submit}>
          {busy ? 'Confirm in your wallet…' : tab === 'deposit' ? 'Deposit USDC' : 'Request withdrawal'}
        </button>
        {tooSmall && <p className="hint err">Minimum deposit is {usd(pool.config.minDeposit)} USDC.</p>}
        {tooBig && <p className="hint err">Maximum deposit is {usd(pool.config.maxDeposit, 0)} USDC per transaction.</p>}
        {locked && <p className="hint err">Withdrawals are locked until your bonus turnover is done.</p>}
        <p className="muted small">
          {tab === 'deposit'
            ? 'Confirm one transaction in your NEAR wallet. Your trading balance updates as soon as it lands.'
            : 'Withdrawals are reviewed by the Nitro team. The amount is locked while it waits, then sent to your NEAR wallet once approved. You can cancel any time before that.'}
        </p>
      </div>
    </section>
  );
}

/** Before the contract is live: deposits go straight to the pool account and are credited at launch. */
function EarlyDepositCard() {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<boolean | null>(null);
  const [list, setList] = useState(() => (accountId ? earlyDeposits(accountId) : []));

  useEffect(() => {
    poolCanReceiveUsdc().then(setOpen);
    setList(accountId ? earlyDeposits(accountId) : []);
  }, [accountId]);

  const n = Number(amount);
  const valid = !!accountId && n >= 1 && n <= MAX_DEPOSIT && (!pool.walletKnown || n <= pool.wallet);
  const reason = !accountId
    ? 'Connect your NEAR wallet first.'
    : pool.walletKnown && pool.wallet <= 0
      ? 'This wallet has no USDC on NEAR. Send native USDC (NEAR network) to it first.'
      : pool.walletKnown && n > pool.wallet
        ? `You only have ${usd(pool.wallet)} USDC in this wallet.`
        : n > 0 && n < 1
          ? 'Minimum deposit is 1 USDC.'
          : n > MAX_DEPOSIT
            ? `Maximum deposit is ${usd(MAX_DEPOSIT, 0)} USDC per transaction.`
            : null;
  const total = list.reduce((s, d) => s + d.amount, 0);

  const submit = async () => {
    if (!valid || !accountId) return;
    setBusy(true);
    try {
      await signAndSend(USDC_ID, preLaunchDepositActions(n, accountId, open === false));
      recordEarlyDeposit(accountId, { at: Date.now(), amount: n });
      setList(earlyDeposits(accountId));
      toast.ok(`Deposited ${usd(n)} USDC`);
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
          <span className="label">Deposited (early)</span>
          <b className="mono">${usd(total)}</b>
        </div>
        <div>
          <span className="label">In your wallet</span>
          <b className="mono">{pool.walletKnown ? `$${usd(pool.wallet)}` : "…"}</b>
        </div>
      </div>
      <div className="field">
        <div className="field-head">
          <label htmlFor="early-amt">Amount to deposit</label>
          <span className="muted">
            Max <b className="mono">{usd(Math.min(pool.wallet, MAX_DEPOSIT))}</b> USDC
          </span>
        </div>
        <div className="input">
          <input id="early-amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <button className="chip" onClick={() => setAmount(String(Math.floor(Math.min(pool.wallet, MAX_DEPOSIT) * 1e6) / 1e6))}>
            Max
          </button>
          <span className="unit">USDC</span>
        </div>
        <button className="btn btn-primary pool-go" disabled={!valid || busy} onClick={submit}>
          {busy ? 'Confirm in your wallet…' : 'Deposit USDC'}
        </button>
        {reason && <p className="hint err">{reason}</p>}
        {open === false && <p className="muted small">First deposit also registers the Nitro account on USDC (0.00125 NEAR, one time).</p>}
        <p className="muted small">
          Confirm one USDC transfer in your NEAR wallet. It is recorded on chain with your account, and lands in your trading balance as soon as
          live trading opens. Withdrawals open at the same time.
        </p>
      </div>
      {list.length > 0 && (
        <div className="pool-requests">
          <span className="label">Your early deposits</span>
          {list.map((d, i) => (
            <div key={i} className="pool-request early">
              <span className="pending-dot" aria-hidden="true" />
              <b className="mono">{usd(d.amount)} USDC</b>
              <span className="muted small">{new Date(d.at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span className="muted small">credited at launch</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
