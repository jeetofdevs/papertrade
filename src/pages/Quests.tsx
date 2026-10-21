import { useEffect, useState } from 'react';
import { toast } from '../components/Toasts';
import { account, claimQuest } from '../lib/engine';
import { compact } from '../lib/format';
import { LIVE_AVAILABLE, liveOpens, useLiveActivity } from '../lib/live';
import { level, nextReset, QUEST_PREFIX, QuestState, quests } from '../lib/quests';
import { setSetting, useSettings } from '../lib/settings';
import { sound } from '../lib/sound';
import { dispatch, useStore } from '../lib/store';
import { useWallet } from '../lib/wallet';

function countdown(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}m`;
}

export function Quests() {
  const state = useStore();
  const { traderId } = useWallet();
  const { mode } = useSettings();
  const live = useLiveActivity();
  const acct = account(state, traderId);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const tracking = mode === 'live' && LIVE_AVAILABLE && live.ready;
  const list = quests(
    {
      fills: tracking ? live.fills : [],
      opens: tracking ? liveOpens(live.address) : [],
      shares: acct.shares ?? [],
      claims: acct.questClaims ?? {},
    },
    now,
  );
  const volume30d = tracking ? live.fills.reduce((s, f) => s + f.usd, 0) : 0;
  const lv = level(volume30d);
  const ready = tracking ? list.filter((q) => q.done && !q.claimed) : [];
  const claimable = ready.reduce((s, q) => s + q.reward, 0);

  const claim = (q: QuestState) => {
    const err = dispatch((s) => claimQuest(s, traderId, QUEST_PREFIX + q.id, q.periodKey, q.reward));
    if (err) return toast.err(err);
    sound.win();
    toast.ok(`+${q.reward.toLocaleString('en-US')} NITRO for “${q.title}”`);
  };
  const claimAll = () => ready.forEach(claim);

  const section = (period: 'daily' | 'weekly') => (
    <section className="lp-section">
      <div className="lp-head">
        <h2>{period === 'daily' ? 'Daily quests' : 'Weekly quests'}</h2>
        <span className="muted small mono">resets in {countdown(nextReset(now, period) - now)}</span>
      </div>
      <div className={`quests ${tracking ? '' : 'quests-locked'}`}>
        {list
          .filter((q) => q.period === period)
          .map((q) => {
            const pct = Math.min(100, (q.progress / q.goal) * 100);
            const prog = q.unit === 'usd' ? `$${compact(Math.min(q.progress, q.goal))} / $${compact(q.goal)}` : `${Math.min(q.progress, q.goal)} / ${q.goal}`;
            return (
              <div key={q.id} className={`panel quest ${q.claimed ? 'quest-claimed' : q.done && tracking ? 'quest-ready' : ''}`}>
                <div className="quest-top">
                  <div>
                    <b>{q.title}</b>
                    <span className="muted small">{q.detail}</span>
                  </div>
                  <span className="quest-reward mono">+{compact(q.reward)}</span>
                </div>
                <div className="quest-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <div className="quest-bottom">
                  <span className="muted small mono">{prog}</span>
                  {q.claimed ? (
                    <span className="quest-done">✓ Claimed</span>
                  ) : q.done && tracking ? (
                    <button className="btn btn-sm btn-primary" onClick={() => claim(q)}>
                      Claim
                    </button>
                  ) : (
                    <a className="btn btn-sm" href="#/trade">
                      Go trade
                    </a>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );

  return (
    <div className="page">
      {!tracking && (
        <div className="panel pad quest-notice">
          <div>
            <b>Quests count real USDC trades only</b>
            <p className="muted small">
              {!LIVE_AVAILABLE
                ? 'Live trading is not set up on this site yet, so quests cannot be tracked.'
                : mode !== 'live'
                  ? 'Demo trades do not count. Switch to Live to make progress.'
                  : 'Connect your wallet and enable trading in Live mode to load your trades.'}
            </p>
          </div>
          {LIVE_AVAILABLE && mode !== 'live' && (
            <button className="btn btn-primary" onClick={() => setSetting('mode', 'live')}>
              Switch to Live
            </button>
          )}
          {LIVE_AVAILABLE && mode === 'live' && (
            <a className="btn btn-primary" href="#/trade">
              Set up Live
            </a>
          )}
        </div>
      )}
      <section className="panel quest-hero">
        <div className="quest-level">
          <span className="quest-badge mono">LV {lv.index}</span>
          <div>
            <h1>{lv.name}</h1>
            <span className="muted small">
              {lv.next ? `${lv.toNext.toLocaleString('en-US')} XP to ${lv.next} · 1 XP per $100 of real volume (30 days)` : 'Max level reached'}
            </span>
          </div>
        </div>
        <div className="quest-xp">
          <span style={{ width: `${lv.progress * 100}%` }} />
        </div>
        <div className="quest-hero-stats">
          <div>
            <span className="label">Real volume (30d)</span>
            <b className="mono">${compact(volume30d)}</b>
          </div>
          <div>
            <span className="label">Your NITRO</span>
            <b className="mono accent">{compact(acct.nitro)}</b>
          </div>
          <div>
            <span className="label">Ready to claim</span>
            <b className="mono">{compact(claimable)}</b>
          </div>
          <button className="btn btn-primary" disabled={!ready.length} onClick={claimAll}>
            {ready.length ? `Claim all (${ready.length})` : 'Nothing to claim'}
          </button>
        </div>
      </section>
      {section('daily')}
      {section('weekly')}
    </div>
  );
}
