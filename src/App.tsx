import { useEffect, useState } from 'react';
import { ConfirmHost } from './components/Confirm';
import { UwuDecor } from './components/UwuDecor';
import { Logo } from './components/Logo';
import { ModeToggle } from './components/ModeToggle';
import { ProfileMenu } from './components/ProfileMenu';
import { SettingsMenu } from './components/SettingsMenu';
import { toast, Toasts } from './components/Toasts';
import { startActivity } from './lib/activity';
import { account, faucet, FAUCET_AMOUNT } from './lib/engine';
import { usd } from './lib/format';
import { startPrices } from './lib/prices';
import { sound } from './lib/sound';
import { dispatch, getState, onLiquidation, useStore } from './lib/store';
import { ALLOW_GUEST, NETWORK, useWallet } from './lib/wallet';
import { Earn } from './pages/Earn';
import { Landing } from './pages/Landing';
import { Nitro } from './pages/Nitro';
import { Profile } from './pages/Profile';
import { Leaderboard } from './pages/Leaderboard';
import { Trade } from './pages/Trade';

const ROUTES = {
  trade: { label: 'Trade', el: <Trade /> },
  vault: { label: 'Vault', el: <Earn /> },
  leaderboard: { label: 'Leaderboard', el: <Leaderboard /> },
  nitro: { label: '$NITRO', el: <Nitro /> },
  profile: { label: 'Profile', el: <Profile /> },
} as const;
type Route = keyof typeof ROUTES;

const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, '') as Route;
  return r in ROUTES ? r : 'trade';
};

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const { accountId, traderId, connect, ready } = useWallet();
  const acct = account(useStore(), traderId);
  const inApp = !!accountId || ALLOW_GUEST;

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
    if (!inApp) return;
    if (!getState().accounts[traderId]) {
      dispatch((s) => faucet(s, traderId, Date.now()));
      toast.ok(`Welcome! ${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added to your account`);
    }
  }, [traderId, inApp]);

  const getUsdc = () => {
    const err = dispatch((s) => faucet(s, traderId, Date.now()));
    if (err) toast.err(err);
    else toast.ok(`${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added`);
  };

  return (
    <div className="app">
      <header className={`top ${inApp ? '' : 'top-landing'}`}>
        <a href="#/trade" className="brand" aria-label="Nitro home">
          <Logo />
        </a>
        {inApp && (
        <nav className="nav">
          {(Object.keys(ROUTES) as Route[]).filter((r) => r !== 'profile').map((r) => (
            <a key={r} href={`#/${r}`} className={`nav-link ${route === r ? 'nav-on' : ''}`}>
              {ROUTES[r].label}
            </a>
          ))}
        </nav>
        )}
        <div className="top-right">
          {inApp && <ModeToggle />}
          <span className="net mono">
            <span className="near-dot" />
            NEAR {NETWORK}
          </span>
          {inApp && (
            <button className="balance mono" onClick={getUsdc} title="Get demo USDC">
              {usd(acct.usdc)} <span className="muted">USDC demo</span>
            </button>
          )}
          {inApp && <SettingsMenu />}
          {inApp ? (
            <ProfileMenu />
          ) : (
            <button className="btn btn-primary" onClick={connect} disabled={!ready}>
              Connect wallet
            </button>
          )}
        </div>
      </header>
      <main>{inApp ? ROUTES[route].el : <Landing />}</main>
      <footer className="foot">
        <span>
          Nitro · 1000x perps on NEAR · trading balances are demo funds · not financial advice
        </span>
        <span className="muted">Prices: Binance public feed, simulated when offline</span>
      </footer>
      <Toasts />
      <ConfirmHost />
      <UwuDecor />
    </div>
  );
}
