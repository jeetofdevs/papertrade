import { useEffect, useRef, useState } from 'react';
import { CelebrationHost, resultFromTrade, showTradeResult } from './components/Celebration';
import { ConfirmHost } from './components/Confirm';
import { UwuDecor } from './components/UwuDecor';
import { Footer } from './components/Footer';
import { Logo } from './components/Logo';
import { ModeToggle } from './components/ModeToggle';
import { ProfileMenu } from './components/ProfileMenu';
import { SettingsMenu } from './components/SettingsMenu';
import { toast, Toasts } from './components/Toasts';
import { startActivity } from './lib/activity';
import { onPoolClose, usePool, watchPool } from './lib/pool';
import { getSettings, useSettings } from './lib/settings';
import { account, faucet, FAUCET_AMOUNT } from './lib/engine';
import { usd } from './lib/format';
import { startPrices } from './lib/prices';
import { sound } from './lib/sound';
import { dispatch, getState, onAutoClose, useStore } from './lib/store';
import { ALLOW_GUEST, NETWORK, useWallet } from './lib/wallet';
import { Quests } from './pages/Quests';
import { Landing } from './pages/Landing';
import { Nitro } from './pages/Nitro';
import { Profile } from './pages/Profile';
import { Leaderboard } from './pages/Leaderboard';
import { Trade } from './pages/Trade';
import { Admin } from './pages/Admin';

const ROUTES = {
  trade: { label: 'Trade', el: <Trade /> },
  quests: { label: 'Quests', el: <Quests /> },
  leaderboard: { label: 'Leaderboard', el: <Leaderboard /> },
  nitro: { label: '$NITRO', el: <Nitro /> },
  profile: { label: 'Profile', el: <Profile /> },
  admin: { label: 'Admin', el: <Admin /> },
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
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const { mode } = useSettings();
  const pool = usePool();

  // Live mode reads the user's balance, positions and history from the pool contract.
  useEffect(() => {
    // Test builds (VITE_ALLOW_GUEST) also load the guest account, so the screens can be checked without a wallet.
    watchPool(mode === 'live' ? accountId ?? (ALLOW_GUEST ? traderId : null) : null);
  }, [mode, accountId, traderId]);

  useEffect(() => {
    startPrices();
    startActivity();
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    // Live trades: every close the contract records (by hand, take profit or max loss).
    const offPool = onPoolClose((t) => {
      if (t.reason === 'tp' || t.pnl > 0) sound.win();
      else if (t.reason === 'liquidated') sound.bust();
      else sound.loss();
      if (t.reason === 'tp') toast.ok(`${t.market} ${t.side} ${t.leverage}x hit take profit: +${t.pnl.toFixed(2)} USDC`);
      else if (t.reason === 'liquidated') toast.err(`${t.market} ${t.side} ${t.leverage}x hit max loss — earned ${Math.round(t.nitro).toLocaleString('en-US')} NITRO`);
      showTradeResult(resultFromTrade(t, accountRef.current));
    });
    const off = onAutoClose((t) => {
      if (t.reason === 'tp') {
        sound.win();
        toast.ok(`${t.market} ${t.side} ${t.leverage}x hit take profit: +${t.pnl.toFixed(2)} USDC`);
      } else {
        sound.bust();
        toast.err(`${t.market} ${t.side} ${t.leverage}x hit max loss — earned ${Math.round(t.nitro).toLocaleString('en-US')} NITRO`);
      }
      showTradeResult(resultFromTrade(t, accountRef.current));
    });
    return () => {
      window.removeEventListener('hashchange', onHash);
      off();
      offPool();
    };
  }, []);

  // Every account, guest or wallet, starts with demo USDC.
  useEffect(() => {
    if (!inApp) return;
    if (!getState().accounts[traderId]) {
      dispatch((s) => faucet(s, traderId, Date.now()));
      if (getSettings().mode === 'demo') toast.ok(`Welcome! ${FAUCET_AMOUNT.toLocaleString('en-US')} demo USDC added to your account`);
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
          {(Object.keys(ROUTES) as Route[]).filter((r) => r !== 'profile' && (r !== 'admin' || (!!accountId && accountId === pool.owner))).map((r) => (
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
          {inApp && mode === 'demo' && (
            <button className="balance mono" onClick={getUsdc} title="Get demo USDC">
              {usd(acct.usdc)} <span className="muted">USDC demo</span>
            </button>
          )}
          {inApp && mode === 'live' && (
            <a className="balance mono" href="#/profile" title="Your USDC trading balance">
              {usd(pool.balance)} <span className="muted">USDC</span>
            </a>
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
      <main>
        {!inApp ? (
          <Landing />
        ) : (
          ROUTES[route].el
        )}
      </main>
      <Footer />
      <Toasts />
      <ConfirmHost />
      <CelebrationHost />
      <UwuDecor />
    </div>
  );
}
