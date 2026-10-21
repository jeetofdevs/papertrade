// Live mode: real USDC perps on Orderly Network through the official Orderly SDK.
// This module is lazy-loaded, so the SDK only downloads when someone opens Live mode.

import { ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  OrderlyConfigProvider,
  useAccount,
  useChains,
  useCollateral,
  useDeposit,
  useMarginModes,
  useMarkPrice,
  useMutation,
  useOrderEntry,
  usePositionStream,
  usePrivateQuery,
  useSymbolLeverage,
  WalletConnectorContext,
  type WalletState,
} from '@orderly.network/hooks';
import { AccountStatusEnum, ChainNamespace, MarginMode, OrderSide, OrderType } from '@orderly.network/types';
import { Chart } from '../components/Chart';
import { showTradeResult } from '../components/Celebration';
import { confirmDialog } from '../components/Confirm';
import { MARKET_NAME } from '../components/MarketBar';
import { ShareCard, ShareData } from '../components/ShareCard';
import { toast } from '../components/Toasts';
import { TokenIcon } from '../components/TokenIcon';
import { Market, MARKETS, Position } from '../lib/engine';
import { compact, price, signed, usd } from '../lib/format';
import { ORDERLY_BROKER_ID, ORDERLY_NETWORK, recordLiveOpen, setLiveActivity, setLiveSummary } from '../lib/live';
import { getSettings } from '../lib/settings';
import { sound } from '../lib/sound';

type Eip1193 = { request(a: { method: string; params?: unknown[] }): Promise<unknown>; on?: (e: string, f: (...a: unknown[]) => void) => void; removeListener?: (e: string, f: (...a: unknown[]) => void) => void };
const eth = () => (window as unknown as { ethereum?: Eip1193 }).ethereum;

const symbolOf = (m: Market) => `PERP_${m}_USDC`;
const marketOf = (symbol: string): Market | null => {
  const base = symbol.split('_')[1] as Market;
  return MARKETS.includes(base) ? base : null;
};
/** Chain used for deposits when the wallet is on one Orderly does not support. */
const DEFAULT_CHAIN = ORDERLY_NETWORK === 'testnet' ? 421614 : 42161; // Arbitrum (Sepolia)

// ---------- Minimal EVM wallet connector for the Orderly SDK (EIP-1193, e.g. MetaMask, Rabby) ----------

function EvmConnector({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [settingChain, setSettingChain] = useState(false);

  const build = async (address: string): Promise<WalletState> => {
    const chainHex = (await eth()!.request({ method: 'eth_chainId' })) as string;
    return {
      label: 'Browser wallet',
      icon: '',
      provider: eth() as never,
      accounts: [{ address }],
      chains: [{ id: parseInt(chainHex, 16), namespace: ChainNamespace.evm }],
    };
  };

  // Reconnect silently if the wallet already granted access, and follow account/chain changes.
  useEffect(() => {
    const p = eth();
    if (!p) return;
    const refresh = async () => {
      const accounts = (await p.request({ method: 'eth_accounts' })) as string[];
      setWallet(accounts[0] ? await build(accounts[0]) : null);
    };
    refresh();
    p.on?.('accountsChanged', refresh);
    p.on?.('chainChanged', refresh);
    return () => {
      p.removeListener?.('accountsChanged', refresh);
      p.removeListener?.('chainChanged', refresh);
    };
  }, []);

  const value = useMemo(
    () => ({
      wallet,
      connecting,
      settingChain,
      chains: [],
      namespace: wallet ? ChainNamespace.evm : null,
      connectedChain: wallet?.chains[0] ?? null,
      connect: async () => {
        const p = eth();
        if (!p) throw new Error('No EVM wallet found. Install MetaMask or Rabby.');
        setConnecting(true);
        try {
          const accounts = (await p.request({ method: 'eth_requestAccounts' })) as string[];
          const w = await build(accounts[0]);
          setWallet(w);
          return [w];
        } finally {
          setConnecting(false);
        }
      },
      disconnect: async () => {
        setWallet(null);
        return [];
      },
      setChain: async ({ chainId }: { chainId: string | number }) => {
        setSettingChain(true);
        try {
          await eth()!.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${Number(chainId).toString(16)}` }] });
          return true as never;
        } finally {
          setSettingChain(false);
        }
      },
    }),
    [wallet, connecting, settingChain],
  );

  return <WalletConnectorContext.Provider value={value as never}>{children}</WalletConnectorContext.Provider>;
}

/** Tell the Orderly account which wallet is connected. */
function AccountSync() {
  const { account } = useAccount();
  const ctx = useWalletCtx();
  const w = ctx.wallet;
  useEffect(() => {
    if (!w) return;
    account.setAddress(w.accounts[0].address, {
      provider: w.provider,
      chain: { id: w.chains[0].id, namespace: ChainNamespace.evm },
      wallet: { name: w.label },
    });
  }, [w, account]);
  return null;
}

const useWalletCtx = () => useContext(WalletConnectorContext);

// ---------- Root ----------

/** Wraps the app in Live mode: Orderly config, the EVM wallet, and the real-trade feed for quests. */
export function OrderlyRoot({ children }: { children: ReactNode }) {
  return (
    <OrderlyConfigProvider brokerId={ORDERLY_BROKER_ID} brokerName="Nitro" networkId={ORDERLY_NETWORK}>
      <EvmConnector>
        <AccountSync />
        <QuestFeed />
        {children}
      </EvmConnector>
    </OrderlyConfigProvider>
  );
}

const DAY = 24 * 60 * 60 * 1000;

interface OrderlyTradeRow {
  symbol: string;
  executed_price: number;
  executed_quantity: number;
  executed_timestamp: number;
  realized_pnl?: number;
}

/** Loads the last 30 days of real fills from Orderly and publishes them for quests. */
function QuestFeed() {
  const { state } = useAccount();
  const wallet = useWalletCtx();
  const address = wallet.wallet?.accounts[0]?.address ?? null;
  const enabled = state.status >= AccountStatusEnum.EnableTrading;
  // Round the window to the hour so the query key stays stable between renders.
  const end = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
  const { data } = usePrivateQuery<OrderlyTradeRow[]>(enabled ? `/v1/trades?start_t=${end - 30 * DAY}&end_t=${end}&size=500` : null, {
    refreshInterval: 20_000,
  });
  const key = JSON.stringify([enabled, address, data?.length ?? -1, data?.[0]?.executed_timestamp ?? 0]);
  useEffect(() => {
    setLiveActivity({
      ready: enabled && Array.isArray(data),
      address,
      fills: (Array.isArray(data) ? data : []).map((t) => ({
        at: t.executed_timestamp,
        market: t.symbol.split('_')[1] ?? t.symbol,
        usd: Math.abs(t.executed_price * t.executed_quantity),
        pnl: Number(t.realized_pnl ?? 0),
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export function LiveTrade({ market }: { market: Market }) {
  const [{ rows }] = usePositionStream();
  const { totalCollateral } = useCollateral();
  const { state } = useAccount();

  const positions: Position[] = useMemo(
    () =>
      (rows ?? [])
        .filter((r) => r.position_qty !== 0 && marketOf(r.symbol))
        .map((r) => ({
          id: `ol-${r.symbol}`,
          market: marketOf(r.symbol)!,
          side: r.position_qty > 0 ? 'long' : 'short',
          collateral: Math.abs(r.notional) / Math.max(1, r.leverage ?? 1),
          leverage: r.leverage ?? 1,
          size: Math.abs(r.notional),
          entry: r.average_open_price,
          liq: r.est_liq_price ?? r.average_open_price * (1 - (r.position_qty > 0 ? 1 : -1) / Math.max(1, r.leverage ?? 1)),
          tp: r.full_tp_sl?.tp_trigger_price ?? null,
          openedAt: 0,
        })),
    [rows],
  );

  // Publish to the header and tracks only when something actually changed (the SDK hands out new arrays often).
  const summaryKey = JSON.stringify([state.status, totalCollateral ?? 0, positions]);
  useEffect(() => {
    setLiveSummary({ ready: state.status >= AccountStatusEnum.EnableTrading, accountValue: totalCollateral ?? 0, positions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  return (
    <>
      <div className="trade-main">
        <Chart market={market} positions={positions} history={[]} />
        <LiveOrderPanel market={market} />
      </div>
      <LivePositions />
    </>
  );
}

// ---------- Order panel ----------

const TP_PRESETS = [0, 25, 50, 100, 300];

function LiveOrderPanel({ market }: { market: Market }) {
  const symbol = symbolOf(market);
  const { state, createAccount, createOrderlyKey } = useAccount();
  const wallet = useWalletCtx();
  const { data: mark } = useMarkPrice(symbol);
  const { freeCollateral } = useCollateral();
  const { maxLeverage, update: updateLeverage } = useSymbolLeverage(symbol);
  const { setMarginMode } = useMarginModes();
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [amount, setAmount] = useState('10');
  const [levRaw, setLev] = useState(10);
  const [tpRoe, setTpRoe] = useState(0);
  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState(false);
  // Until the market info loads, keep the slider at a sensible 20x cap.
  const maxLev = maxLeverage && maxLeverage > 1 ? Math.floor(maxLeverage) : 20;
  useEffect(() => {
    setLiveSummary({ maxLeverage: maxLeverage && maxLeverage > 1 ? Math.floor(maxLeverage) : null });
  }, [maxLeverage]);
  const lev = Math.min(levRaw, maxLev);
  const wager = parseFloat(amount) || 0;
  const notional = wager * lev;
  const dir = side === 'long' ? 1 : -1;
  const tpPrice = tpRoe && mark ? mark * (1 + (dir * tpRoe) / 100 / lev) : null;

  const { setValues, submit, metaState } = useOrderEntry(symbol, {
    initialOrder: { side: OrderSide.BUY, order_type: OrderType.MARKET, margin_mode: MarginMode.ISOLATED },
  });

  // Keep the SDK's order in sync with the form, so submit always sends what is on screen.
  const setValuesRef = useRef(setValues);
  setValuesRef.current = setValues;
  const hasMark = !!mark;
  const tpText = tpPrice ? String(Number(tpPrice.toPrecision(6))) : '';
  useEffect(() => {
    if (!hasMark) return;
    setValuesRef.current(
      {
        side: side === 'long' ? OrderSide.BUY : OrderSide.SELL,
        order_type: OrderType.MARKET,
        margin_mode: MarginMode.ISOLATED,
        total: String(notional),
        tp_trigger_price: tpText || undefined,
      },
    );
  }, [side, notional, tpText, hasMark]);

  const head = (
    <div className="order-head">
      <TokenIcon market={market} size={30} />
      <div>
        <b>{market}-PERP</b>
        <span className="muted small">
          {MARKET_NAME[market]}{ORDERLY_NETWORK === 'testnet' ? ' · testnet' : ''} · up to {maxLev}x
        </span>
      </div>
    </div>
  );

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.ok(ok);
    } catch (e) {
      toast.err((e as Error)?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (state.status < AccountStatusEnum.EnableTrading) {
    const hasWallet = !!eth();
    const connected = !!wallet.wallet;
    const step = !hasWallet ? 0 : !connected ? 1 : state.status <= AccountStatusEnum.NotSignedIn ? 2 : 3;
    return (
      <div className="panel order">
        {head}
        <div className="live-setup">
          <h3>Trade real USDC</h3>
          <p className="muted small">
            You need an EVM
            wallet (MetaMask, Rabby…) and USDC on a supported chain such as Arbitrum.
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
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => wallet.connect())}>
                  Connect EVM wallet
                </button>
              )}
            </li>
            <li className={step > 2 ? 'done' : step === 2 ? 'now' : ''}>
              Create your trading account
              <span className="muted small">One signature, no gas.</span>
              {step === 2 && (
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(createAccount, 'Trading account created')}>
                  Create account
                </button>
              )}
            </li>
            <li className={step === 3 ? 'now' : ''}>
              Enable trading
              <span className="muted small">Creates a trading key kept in this browser. It can trade but never withdraw.</span>
              {step === 3 && (
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => createOrderlyKey(true), 'Trading enabled')}>
                  Enable trading
                </button>
              )}
            </li>
          </ol>
        </div>
      </div>
    );
  }

  const open = async () => {
    if (getSettings().childproof) {
      const ok = await confirmDialog({
        title: `${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x with real USDC?`,
        body: `Margin ${usd(wager)} USDC for a ${usd(notional, 0)} USDC position. Your isolated margin is the most you can lose.`,
        confirmLabel: `Open ${side}`,
        danger: side === 'short',
      });
      if (!ok) return;
    }
    await run(async () => {
      try {
        await setMarginMode({ symbol_list: [symbol], default_margin_mode: MarginMode.ISOLATED });
      } catch {
        /* already isolated, or the market has a cross position open */
      }
      await updateLeverage({ leverage: lev, symbol, margin_mode: MarginMode.ISOLATED });
      let result;
      try {
        result = await submit({ resetOnSuccess: false });
      } catch (e) {
        // Validation failures throw a generic error; the details land in metaState.errors (shown below the button).
        throw new Error((e as Error)?.message === 'Order validation failed' ? 'Order not valid. See the note below the button.' : (e as Error)?.message);
      }
      // A rejected order does not throw, it returns success: false.
      if (!result?.success) throw new Error((result as { message?: string })?.message || 'The order was rejected');
      const addr = wallet.wallet?.accounts[0]?.address;
      if (addr) recordLiveOpen(addr, { at: Date.now(), market, usd: notional, leverage: lev });
      sound.open();
    }, `Opened ${side} ${market} ${lev}x`);
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
          <label htmlFor="ol-wager">Margin (max loss)</label>
          <span className="muted">
            Free <b className="mono">{usd(freeCollateral ?? 0)}</b> USDC
          </span>
        </div>
        <div className="input">
          <input id="ol-wager" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <span className="unit">USDC</span>
        </div>
        <div className="row-chips">
          {[10, 25, 50, 100].map((p) => (
            <button key={p} className="chip" onClick={() => setAmount(String(Math.floor((freeCollateral ?? 0) * p) / 100))}>
              {p === 100 ? 'Max' : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-head">
          <label htmlFor="ol-lev">Leverage</label>
          <b className="lev">{lev}x</b>
        </div>
        <input
          id="ol-lev"
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
          <dd className="mono">{usd(notional)} USDC</dd>
        </div>
        <div>
          <dt>Mark price</dt>
          <dd className="mono">{price(mark || undefined)}</dd>
        </div>
        <div>
          <dt>Margin mode</dt>
          <dd className="mono">Isolated</dd>
        </div>
      </dl>

      <button className={`btn btn-block ${side === 'long' ? 'btn-long' : 'btn-short'}`} onClick={open} disabled={busy || !mark || wager <= 0 || wager > (freeCollateral ?? 0)}>
        <TokenIcon market={market} size={22} />
        {busy ? 'Sending…' : `${side === 'long' ? 'Long' : 'Short'} ${market} ${lev}x`}
      </button>
      {wager > (freeCollateral ?? 0) && <p className="hint err">Not enough free USDC. Deposit first.</p>}
      {metaState.submitted &&
        Object.values(metaState.errors ?? {})
          .filter(Boolean)
          .map((err, i) => (
            <p key={i} className="hint err">
              {err!.message}
            </p>
          ))}
      <button className="btn btn-block btn-ghost-xl" onClick={() => setDeposit(true)}>
        Deposit USDC
      </button>
      {deposit && <DepositModal onClose={() => setDeposit(false)} />}
    </div>
  );
}

// ---------- Deposit ----------

function DepositModal({ onClose }: { onClose: () => void }) {
  const wallet = useWalletCtx();
  const chainId = Number(wallet.connectedChain?.id ?? 0);
  const [, { findByChainId }] = useChains(ORDERLY_NETWORK);
  const chain = findByChainId(chainId);
  const usdc = chain?.token_infos?.find((t) => t.symbol === 'USDC');
  const { balance, allowance, approve, deposit, quantity, setQuantity } = useDeposit({
    address: usdc?.address,
    decimals: usdc?.decimals ?? 6,
    srcChainId: chainId,
    srcToken: 'USDC',
  });
  const [busy, setBusy] = useState(false);
  const qty = Number(quantity) || 0;
  const needsApproval = qty > Number(allowance || 0);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.ok(ok);
    } catch (e) {
      toast.err((e as Error)?.message || 'Transaction failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel pad confirm" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Deposit USDC</h3>
        {!chain || !usdc ? (
          <>
            <p className="muted">Your wallet is on a chain that is not supported. Switch to Arbitrum to deposit.</p>
            <button className="btn btn-primary" onClick={() => wallet.setChain({ chainId: DEFAULT_CHAIN })}>
              Switch to Arbitrum
            </button>
          </>
        ) : (
          <>
            <p className="muted small">
              From {chain.network_infos.name}. Wallet balance <b className="mono">{usd(Number(balance || 0))}</b> USDC.
            </p>
            <div className="input">
              <input inputMode="decimal" placeholder="0.00" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ''))} />
              <button className="chip" onClick={() => setQuantity(String(balance || 0))}>
                Max
              </button>
            </div>
            {needsApproval ? (
              <button className="btn btn-primary" disabled={busy || qty <= 0} onClick={() => act(() => approve(quantity), 'USDC approved')}>
                {busy ? 'Check your wallet…' : 'Approve USDC'}
              </button>
            ) : (
              <button className="btn btn-primary" disabled={busy || qty <= 0 || qty > Number(balance || 0)} onClick={() => act(deposit, 'Deposit sent. It shows up after the chain confirms.')}>
                {busy ? 'Check your wallet…' : `Deposit ${usd(qty)} USDC`}
              </button>
            )}
          </>
        )}
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ---------- Positions ----------

function LivePositions() {
  const [{ rows, aggregated }] = usePositionStream();
  const { state } = useAccount();
  const [doOrder] = useMutation('/v1/order');
  const [busy, setBusy] = useState<string | null>(null);
  const [share, setShare] = useState<ShareData | null>(null);
  const list = (rows ?? []).filter((r) => r.position_qty !== 0);

  const close = async (r: (typeof list)[number]) => {
    if (getSettings().childproof) {
      const ok = await confirmDialog({
        title: `Close ${r.symbol.split('_')[1]} ?`,
        body: `Closes at market for about ${signed(r.unrealized_pnl)} USDC.`,
        confirmLabel: 'Close position',
      });
      if (!ok) return;
    }
    setBusy(r.symbol);
    try {
      const res = await doOrder({
        symbol: r.symbol,
        order_type: OrderType.MARKET,
        side: r.position_qty > 0 ? OrderSide.SELL : OrderSide.BUY,
        order_quantity: String(Math.abs(r.position_qty)),
        reduce_only: true,
        margin_mode: r.margin_mode ?? MarginMode.ISOLATED,
      });
      if (res && res.success === false) throw new Error(res.message || 'Close failed');
      if (r.unrealized_pnl >= 0) sound.win();
      else sound.loss();
      toast[r.unrealized_pnl >= 0 ? 'ok' : 'info'](`Closed for about ${signed(r.unrealized_pnl)} USDC`);
      const m = marketOf(r.symbol);
      if (m) {
        showTradeResult({
          market: m,
          side: r.position_qty > 0 ? 'long' : 'short',
          leverage: r.leverage ?? 1,
          pnl: r.unrealized_pnl,
          wager: Math.abs(r.notional) / Math.max(1, r.leverage ?? 1),
          entry: r.average_open_price,
          exit: r.mark_price,
          status: 'closed',
          account: null,
          time: Date.now(),
          reason: 'close',
        });
      }
    } catch (e) {
      toast.err((e as Error)?.message || 'Close failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel positions">
      <div className="tabs">
        <span className="tab tab-on">
          Live positions <span className="count">{list.length}</span>
        </span>
        {list.length > 0 && (
          <div className="tabs-right">
            <span className={`mono small ${(aggregated?.total_unreal_pnl ?? 0) >= 0 ? 'up' : 'down'}`}>
              {signed(aggregated?.total_unreal_pnl ?? 0)} USDC
            </span>
          </div>
        )}
      </div>
      <div className="table-wrap">
        {state.status < AccountStatusEnum.EnableTrading ? (
          <p className="empty">Enable trading to see your live positions.</p>
        ) : list.length === 0 ? (
          <p className="empty">No open live positions.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Size</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Liq.</th>
                <th>PnL (ROE)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const long = r.position_qty > 0;
                const m = marketOf(r.symbol);
                const margin = Math.abs(r.notional) / Math.max(1, r.leverage ?? 1);
                return (
                  <tr key={r.symbol}>
                    <td>
                      <span className={`tag tag-${long ? 'long' : 'short'}`}>
                        {long ? 'long' : 'short'} {r.leverage}x
                      </span>{' '}
                      <span className="pair">
                        {m && <TokenIcon market={m} size={20} />}
                        <b>{r.symbol.split('_')[1]}</b>
                      </span>
                    </td>
                    <td className="mono">${compact(Math.abs(r.notional))}</td>
                    <td className="mono">{price(r.average_open_price)}</td>
                    <td className="mono">{price(r.mark_price)}</td>
                    <td className="mono warn">{price(r.est_liq_price ?? undefined)}</td>
                    <td className={`mono ${r.unrealized_pnl >= 0 ? 'up' : 'down'}`}>
                      {signed(r.unrealized_pnl)} <span className="muted">({((r.unrealized_pnl_ROI ?? 0) * 100).toFixed(1)}%)</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {m && (
                          <button
                            className="btn btn-sm"
                            onClick={() =>
                              setShare({
                                market: m,
                                side: long ? 'long' : 'short',
                                leverage: r.leverage ?? 1,
                                pnl: r.unrealized_pnl,
                                wager: margin,
                                entry: r.average_open_price,
                                exit: r.mark_price,
                                status: 'open',
                                account: null,
                                time: Date.now(),
                              })
                            }
                          >
                            Share
                          </button>
                        )}
                        <button className="btn btn-sm" disabled={busy === r.symbol} onClick={() => close(r)}>
                          {busy === r.symbol ? '…' : 'Close'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {share && <ShareCard data={share} onClose={() => setShare(null)} />}
    </div>
  );
}
