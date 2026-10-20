import { useEffect, useState } from 'react';
import { Logo } from './components/Logo';
import { toast, Toasts } from './components/Toasts';
import { account, faucet } from './lib/engine';
import { shortAccount, usd } from './lib/format';
import { startPrices } from './lib/prices';
import { dispatch, onLiquidation, useStore } from './lib/store';
import { NETWORK, useWallet } from './lib/wallet';
import { Earn } from './pages/Earn';
import { Kami } from './pages/Kami';
import { Leaderboard } from './pages/Leaderboard';
import { Trade } from './pages/Trade';

const ROUTES = {
  trade: { label: 'Trade', el: <Trade /> },
  vault: { label: 'Vault', el: <Earn /> },
  leaderboard: { label: 'Peringkat', el: <Leaderboard /> },
  kami: { label: '$KAMI', el: <Kami /> },
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
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    const off = onLiquidation((m) => toast.err(m));
    return () => {
      window.removeEventListener('hashchange', onHash);
      off();
    };
  }, []);

  const getUsdc = () => {
    const err = dispatch((s) => faucet(s, traderId, Date.now()));
    if (err) toast.err(err);
    else toast.ok('10.000 USDC demo ditambahkan');
  };

  return (
    <div className="app">
      <header className="top">
        <a href="#/trade" className="brand" aria-label="Beranda Kami">
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
          <span className="net mono">
            <span className="near-dot" />
            NEAR {NETWORK}
          </span>
          <button className="balance mono" onClick={getUsdc} title="Ambil USDC demo">
            {usd(acct.usdc)} <span className="muted">USDC demo</span>
          </button>
          {accountId ? (
            <button className="btn btn-ghost" onClick={() => disconnect()} title="Putuskan wallet">
              {shortAccount(accountId)}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={connect} disabled={!ready}>
              Hubungkan wallet
            </button>
          )}
        </div>
      </header>
      <main>{ROUTES[route].el}</main>
      <footer className="foot">
        <span>
          Kami · perps 1000x di NEAR · saldo trading masih demo, bukan nasihat keuangan
        </span>
        <span className="muted">Harga: feed publik Binance, simulasi saat offline</span>
      </footer>
      <Toasts />
    </div>
  );
}
