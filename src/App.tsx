import { useEffect, useState } from 'react';
import { Logo } from './components/Logo';
import { ModeToggle } from './components/ModeToggle';
import { SettingsMenu } from './components/SettingsMenu';
import { toast, Toasts } from './components/Toasts';
import { startActivity } from './lib/activity';
import { account, faucet, FAUCET_AMOUNT } from './lib/engine';
import { shortAccount, usd } from './lib/format';
import { startPrices } from './lib/prices';
import { sound } from './lib/sound';
import { dispatch, getState, onLiquidation, useStore } from './lib/store';
import { NETWORK, useWallet } from './lib/wallet';
import { Earn } from './pages/Earn';
import { Nitro } from './pages/Nitro';
import { Leaderboard } from './pages/Leaderboard';
import { Trade } from './pages/Trade';

const ROUTES = {
  trade: { label: 'Trade', el: <Trade /> },
  vault: { label: 'Vault', el: <Earn /> },
  leaderboard: { label: 'Leaderboard', el: <Leaderboard /> },
  nitro: { label: '$NITRO', el: <Nitro /> },
} as const;
type Route = keyof typeof ROUTES;

const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return r in ROUTES ? r : 'trade';
};

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const { accountId, traderId, connect, disconnect, ready } = useWallet();
  const acct = account(useStore(), traderId);

  useEffect(() => {
    startPrices();
    startActivity();
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    const off = onLiquidation((m) => {
      toast.err(m);
      sound.bust();
    });
    return () => {
      window.removeEventListener('hashchange', onHash);
      off();
    };
  }, []);

  // Every account, guest or wallet, starts with demo USDC.
  useEffect(() => {
    if (!getState().accounts[traderId]) {
      dispatch((s) => faucet(s, traderId, Date.now()));
      toast.ok(`Welcome! ${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added to your account`);
    }
  }, [traderId]);

  const getUsdc = () => {
    const err = dispatch((s) => faucet(s, traderId, Date.now()));
    if (err) toast.err(err);
    else toast.ok(`${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added`);
  };

  return (
    <div className="app">
      <header className="top">
        <a href="#/trade" className="brand" aria-label="Nitro home">
          <Logo />
        </a>
        <nav className="nav">
          {(Object.keys(ROUTES) as Route[]).map((r) => (
            <a key={r} href={`#/${r}`} className={`nav-link ${route === r ? 'nav-on' : ''}`}>
              {ROUTES[r].label}
            </a>
          ))}
        </nav>
        <div className="top-right">
          <ModeToggle />
          <span className="net mono">
            <span className="near-dot" />
            NEAR {NETWORK}
          </span>
          <button className="balance mono" onClick={getUsdc} title="Get demo USDC">
            {usd(acct.usdc)} <span className="muted">USDC demo</span>
          </button>
          <SettingsMenu />
          {accountId ? (
            <button className="btn btn-ghost" onClick={() => disconnect()} title="Disconnect">
              {shortAccount(accountId)}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={connect} disabled={!ready}>
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main>{ROUTES[route].el}</main>
      <footer className="foot">
        <span>
          Nitro · 1000x perps on NEAR · trading balances are demo funds · not financial advice
        </span>
        <span className="muted">Prices: Binance public feed, simulated when offline</span>
      </footer>
      <Toasts />
    </div>
  );
}
