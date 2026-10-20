import { useMemo } from 'react';
import { compact, shortAccount, signedUsd } from '../lib/format';
import { useStore } from '../lib/store';
import { GUEST, useWallet } from '../lib/wallet';

interface Row {
  id: string;
  pnl: number;
  volume: number;
  kami: number;
  you?: boolean;
}

// Sample traders so the board is not empty in demo mode.
const SAMPLE: Row[] = [
  ['degen.near', 48_210, 9_400_000, 1_200],
  ['shiba-paper.near', 31_902, 12_100_000, 88_000],
  ['kirigami.near', 22_740, 4_800_000, 4_100],
  ['origami.near', 15_005, 2_600_000, 15_300],
  ['liq-me.near', -8_120, 21_000_000, 1_520_000],
  ['ngmi.near', -12_430, 7_300_000, 2_480_000],
  ['whale.tg', 9_880, 18_500_000, 61_000],
  ['senpai.near', 6_420, 1_900_000, 9_800],
  ['hodl.near', 3_150, 640_000, 2_200],
  ['paperhands.near', -1_970, 950_000, 412_000],
].map(([id, pnl, volume, kami]) => ({ id: id as string, pnl: pnl as number, volume: volume as number, kami: kami as number }));

export function Leaderboard() {
  const state = useStore();
  const { traderId } = useWallet();

  const rows = useMemo(() => {
    const real: Row[] = Object.entries(state.accounts)
      .filter(([, a]) => a.volume > 0)
      .map(([id, a]) => ({ id: id === GUEST ? 'Anda (tamu)' : id, pnl: a.realizedPnl, volume: a.volume, kami: a.kami, you: id === traderId }));
    return [...SAMPLE.filter((s) => !real.some((r) => r.id === s.id)), ...real].sort((a, b) => b.pnl - a.pnl);
  }, [state.accounts, traderId]);

  const kamiRows = [...rows].sort((a, b) => b.kami - a.kami).slice(0, 5);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Papan Peringkat</h1>
        <p>Trader teratas berdasarkan PnL terealisasi, dan pemegang KAMI terbesar yang naik peringkat lewat kerugian.</p>
      </header>
      <div className="split split-wide">
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Trader</th>
                <th>PnL</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={r.you ? 'row-you' : ''}>
                  <td className="mono muted">{i + 1}</td>
                  <td>
                    <b>{shortAccount(r.id)}</b>
                  </td>
                  <td className={`mono ${r.pnl >= 0 ? 'up' : 'down'}`}>{signedUsd(r.pnl, 0)}</td>
                  <td className="mono">${compact(r.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel pad">
          <h3>Pemegang KAMI teratas</h3>
          <ul className="holders">
            {kamiRows.map((r, i) => (
              <li key={r.id} className={r.you ? 'row-you' : ''}>
                <span className="mono muted">{i + 1}</span>
                <b>{shortAccount(r.id)}</b>
                <span className="mono accent">{compact(r.kami)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Trader contoh ditampilkan untuk demo, bersama akun di perangkat ini.</p>
        </div>
      </div>
    </div>
  );
}
