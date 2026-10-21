import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { LIVE_AVAILABLE, useLiveSummary } from './lib/live';
import { useSettings } from './lib/settings';
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

const OrderlyRoot = lazy(() => import('./live/OrderlyLive').then((m) => ({ default: m.OrderlyRoot })));

const ROUTES = {
  trade: { label: 'Trade', el: <Trade /> },
  quests: { label: 'Quests', el: <Quests /> },
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
  const accountRef = useRef(accountId);
  accountRef.current = accountId;
  const { mode } = useSettings();
  const live = useLiveSummary();

  useEffect(() => {
    startPrices();
    startActivity();
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
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
          {inApp && mode === 'demo' && (
            <button className="balance mono" onClick={getUsdc} title="Get demo USDC">
              {usd(acct.usdc)} <span className="muted">USDC demo</span>
            </button>
          )}
          {inApp && mode === 'live' && (
            <span className="balance mono" title="Live account value">
              {usd(live.accountValue)} <span className="muted">USDC live</span>
            </span>
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
        ) : mode === 'live' && LIVE_AVAILABLE ? (
          <Suspense fallback={<div className="panel empty">Loading…</div>}>
            <OrderlyRoot>{ROUTES[route].el}</OrderlyRoot>
          </Suspense>
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
