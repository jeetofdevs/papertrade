import { useEffect, useState } from 'react';
import { usd } from '../lib/format';
import {
  cancelWithdrawAction,
  ChainDeposit,
  depositAction,
  earlyDeposits,
  isAdmin,
  loadChainDeposits,
  MAX_DEPOSIT,
  nearDepositAction,
  POOL_ID,
  poolCanReceiveUsdc,
  preLaunchDepositActions,
  preLaunchNearDepositAction,
  recordEarlyDeposit,
  refreshPool,
  requestWithdrawAction,
  USDC_ID,
  usePool,
} from '../lib/pool';
import { usePrices } from '../lib/prices';
import { useWallet } from '../lib/wallet';
import { PromoCard } from './PromoCard';
import { toast } from './Toasts';

type Tab = 'deposit' | 'withdraw';
type Asset = 'USDC' | 'NEAR';

/** Deposit USDC or NEAR. Live: through the contract. Before launch: straight to the pool account, credited at launch. */
function DepositForm({ early }: { early: boolean }) {
  const { accountId, signAndSend } = useWallet();
  const pool = usePool();
  const { tickers } = usePrices();
  const [asset, setAsset] = useState<Asset>('USDC');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<boolean | null>(null);

  useEffect(() => {
    if (early) poolCanReceiveUsdc().then(setRegistered);
  }, [early]);

  const nearPrice = tickers.NEAR?.price ?? 0;
  const minUsd = early ? 1 : pool.config.minDeposit;
  const maxUsd = early ? MAX_DEPOSIT : pool.config.maxDeposit || Infinity;
  const n = Number(amount);
  const usdValue = asset === 'USDC' ? n : n * nearPrice;
  const walletAmt = asset === 'USDC' ? pool.wallet : pool.walletNear;
  const maxAmount = Math.max(0, asset === 'USDC' ? Math.min(walletAmt, maxUsd) : nearPrice ? Math.min(walletAmt, maxUsd / nearPrice) : walletAmt);
  const team = !!accountId && (accountId === POOL_ID || isAdmin(accountId, pool.owner));

  const reason = !accountId
    ? 'Connect your NEAR wallet first.'
    : team
      ? 'This is the Nitro team wallet. Deposit from a user wallet instead.'
      : asset === 'NEAR' && !nearPrice
        ? 'Waiting for the NEAR price…'
        : pool.walletKnown && walletAmt <= 0
          ? `This wallet has no ${asset === 'USDC' ? 'USDC on NEAR' : 'NEAR'} to deposit.`
          : n > 0 && pool.walletKnown && n > walletAmt
            ? `You only have ${usd(walletAmt, asset === 'USDC' ? 2 : 4)} ${asset} in this wallet.`
            : n > 0 && usdValue < minUsd
              ? `Minimum deposit is ${usd(minUsd)} USDC${asset === 'NEAR' ? ' worth of NEAR' : ''}.`
              : usdValue > maxUsd
                ? `Maximum deposit is ${usd(maxUsd, 0)} USDC${asset === 'NEAR' ? ' worth of NEAR' : ''} per transaction.`
                : null;
  const valid = n > 0 && !reason;

  const submit = async () => {
    if (!valid || !accountId) return;
    setBusy(true);
    try {
      if (asset === 'USDC') {
        await signAndSend(USDC_ID, early ? preLaunchDepositActions(n, accountId, registered === false) : [depositAction(n)]);
      } else {
        await signAndSend(POOL_ID, [early ? preLaunchNearDepositAction(n) : nearDepositAction(n)]);
      }
      if (early) recordEarlyDeposit(accountId, { at: Date.now(), amount: usdValue, asset, units: n });
      toast.ok(`Deposited ${asset === 'USDC' ? `${usd(n)} USDC` : `${n} NEAR (≈ ${usd(usdValue)} USDC)`}`);
      setAmount('');
      refreshPool();
    } catch (e) {
      toast.err((e as Error).message || 'Transaction cancelled');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <div className="asset-pick" role="radiogroup" aria-label="Deposit with">
        {(['USDC', 'NEAR'] as Asset[]).map((a) => (
          <button
            key={a}
            role="radio"
            aria-checked={asset === a}
            className={`chip ${asset === a ? 'chip-on' : ''}`}
            onClick={() => {
              setAsset(a);
              setAmount('');
            }}
          >
            {a === 'USDC' ? 'Deposit USDC' : 'Deposit NEAR'}
          </button>
        ))}
      </div>
      <div className="field-head">
        <label htmlFor="pool-amt">Amount ({asset})</label>
        <span className="muted">
          Max <b className="mono">{usd(maxAmount, asset === 'USDC' ? 2 : 4)}</b> {asset}
        </span>
      </div>
      <div className="input">
        <input id="pool-amt" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
        <button className="chip" onClick={() => setAmount(String(Math.floor(maxAmount * 1e4) / 1e4))}>
          Max
        </button>
        <span className="unit">{asset}</span>
      </div>
      {asset === 'NEAR' && n > 0 && nearPrice > 0 && (
        <p className="muted small">
          ≈ <b className="mono">{usd(usdValue)}</b> USDC at {usd(nearPrice, 3)} per NEAR.{' '}
          {early ? 'Credited at the NEAR price of your deposit time.' : 'Credited in USDC at the on-chain NEAR price.'}
        </p>
      )}
      <button className="btn btn-primary pool-go" disabled={!valid || busy} onClick={submit}>
        {busy ? 'Confirm in your wallet…' : `Deposit ${asset}`}
      </button>
      {reason && (n > 0 || team || !accountId) && <p className="hint err">{reason}</p>}
      {early && asset === 'USDC' && registered === false && (
        <p className="muted small">First deposit also registers the Nitro account on USDC (0.00125 NEAR, one time).</p>
      )}
      <p className="muted small">
        {early
          ? 'Your transfer goes straight to the Nitro account and is recorded on chain with your wallet. It lands in your trading balance as soon as live trading opens.'
          : 'Confirm one transaction in your NEAR wallet. Your trading balance updates as soon as it lands.'}
        {` Limit: ${usd(minUsd)} to ${usd(MAX_DEPOSIT, 0)} USDC per deposit.`}
      </p>
    </div>
  );
}

/** The user's deposits as recorded on chain (falls back to this browser's list if the indexer is unavailable). */
function DepositHistory() {
  const { accountId } = useWallet();
  const pool = usePool();
  const [list, setList] = useState<ChainDeposit[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let live = true;
    const load = () =>
      loadChainDeposits(2)
        .then((all) => {
          if (!live) return;
          setList(all.filter((d) => d.account === accountId));
          setFailed(false);
        })
        .catch(() => live && setFailed(true));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [accountId, pool.ledger.length]);

  if (!accountId) return null;
  const local = earlyDeposits(accountId);
  const rows: ChainDeposit[] =
    list && list.length
      ? list
      : failed || !list
        ? local.map((d, i) => ({ hash: `local-${i}`, account: accountId, asset: d.asset ?? 'USDC', amount: d.units ?? d.amount, at: d.at }))
        : [];
  if (!rows.length) return null;
  return (
    <div className="pool-requests">
      <span className="label">Your deposits{pool.missing ? ' (credited at launch)' : ''}</span>
      {rows.slice(0, 20).map((d) => (
        <div key={d.hash} className="pool-request early">
          <span className="pending-dot" aria-hidden="true" />
          <b className="mono">
            {usd(d.amount, d.asset === 'USDC' ? 2 : 4)} {d.asset}
          </b>
          <span className="muted small">{new Date(d.at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}</span>
          {d.hash.startsWith('local') ? (
            <span className="muted small">this browser</span>
          ) : (
            <a className="muted small" href={`https://nearblocks.io/txns/${d.hash}`} target="_blank" rel="noopener noreferrer">
              on chain ↗
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

/** Live USDC balance with deposit and withdrawal requests. Withdrawals are reviewed before USDC is sent. */
export function PoolAccountCard() {
  const { signAndSend } = useWallet();
  const pool = usePool();
  const [tab, setTab] = useState<Tab>('deposit');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);

  if (pool.missing) return <EarlyDepositCard />;

  const n = Number(amount);
  const locked = pool.userPromo.locked;
  const valid = n > 0 && n <= pool.balance && !locked;

  const withdraw = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await signAndSend(POOL_ID, [requestWithdrawAction(n)]);
      toast.ok(`Withdrawal of ${usd(n)} USDC requested`);
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
          <b className="mono">
            {pool.walletKnown ? `$${usd(pool.wallet)}` : '…'} · {usd(pool.walletNear, 2)} NEAR
          </b>
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

      {tab === 'deposit' ? (
        <DepositForm early={false} />
      ) : (
        <div className="field">
          <div className="field-head">
            <label htmlFor="pool-wd">Amount to withdraw</label>
            <span className="muted">
              Max <b className="mono">{usd(pool.balance)}</b> USDC
            </span>
          </div>
          <div className="input">
            <input id="pool-wd" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            <button className="chip" onClick={() => setAmount(String(Math.floor(pool.balance * 1e6) / 1e6))}>
              Max
            </button>
            <span className="unit">USDC</span>
          </div>
          <button className="btn btn-primary pool-go" disabled={!valid || busy} onClick={withdraw}>
            {busy ? 'Confirm in your wallet…' : 'Request withdrawal'}
          </button>
          {locked && <p className="hint err">Withdrawals are locked until your bonus turnover is done.</p>}
          <p className="muted small">
            Withdrawals are paid in USDC and reviewed by the Nitro team. The amount is locked while it waits, then sent to your NEAR wallet once
            approved. You can cancel any time before that.
          </p>
        </div>
      )}
      <DepositHistory />
    </section>
  );
}

/** Before the contract is live: deposits go straight to the pool account and are credited at launch. */
function EarlyDepositCard() {
  const pool = usePool();
  return (
    <section className="panel pad pool-card" id="pool">
      <h2>Deposit</h2>
      <PromoCard />
      <div className="pool-balances">
        <div>
          <span className="label">USDC in your wallet</span>
          <b className="mono">{pool.walletKnown ? `$${usd(pool.wallet)}` : '…'}</b>
        </div>
        <div>
          <span className="label">NEAR in your wallet</span>
          <b className="mono">{usd(pool.walletNear, 4)}</b>
        </div>
      </div>
      <DepositForm early />
      <DepositHistory />
    </section>
  );
}
