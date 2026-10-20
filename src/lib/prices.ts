// Live mark prices. Uses Binance public market data (no key needed) and falls
// back to a local random-walk simulation if the feed is unreachable.

import { useSyncExternalStore } from 'react';
import { Market, MARKETS } from './engine';

export interface Ticker {
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export interface Tick {
  time: number;
  price: number;
}

type Snapshot = { source: 'connecting' | 'live' | 'simulated'; tickers: Partial<Record<Market, Ticker>>; version: number };

const SYMBOL: Record<Market, string> = { NEAR: 'NEARUSDT', BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' };
const FALLBACK: Record<Market, number> = { NEAR: 3.1, BTC: 112_000, ETH: 4_100, SOL: 210 };
const API = 'https://api.binance.com/api/v3';
const WS = 'wss://stream.binance.com:9443/stream?streams=';
const HISTORY = 600;

let snap: Snapshot = { source: 'connecting', tickers: {}, version: 0 };
const ticks: Record<Market, Tick[]> = { NEAR: [], BTC: [], ETH: [], SOL: [] };
const listeners = new Set<() => void>();
const tickListeners = new Set<(m: Market, t: Tick) => void>();
let started = false;

function emit() {
  snap = { ...snap, version: snap.version + 1 };
  listeners.forEach((l) => l());
}

function push(m: Market, price: number, time = Date.now()) {
  const prev = snap.tickers[m];
  const t: Ticker = prev
    ? { ...prev, price, high24h: Math.max(prev.high24h, price), low24h: Math.min(prev.low24h, price) }
    : { price, open24h: price, high24h: price, low24h: price, volume24h: 0 };
  snap.tickers = { ...snap.tickers, [m]: t };
  const tick = { time, price };
  const arr = ticks[m];
  arr.push(tick);
  if (arr.length > HISTORY * 10) arr.splice(0, arr.length - HISTORY * 10);
  tickListeners.forEach((l) => l(m, tick));
}

function simulate() {
  if (snap.source === 'simulated') return;
  snap = { ...snap, source: 'simulated' };
  for (const m of MARKETS) {
    if (!snap.tickers[m]) push(m, FALLBACK[m]);
  }
  setInterval(() => {
    for (const m of MARKETS) {
      const p = snap.tickers[m]!.price;
      // Small random walk, slightly fat-tailed so liquidations happen now and then.
      const shock = (Math.random() - 0.5) * 0.0012 * (Math.random() < 0.05 ? 4 : 1);
      push(m, p * (1 + shock));
    }
    emit();
  }, 700);
  emit();
}

async function loadTickers() {
  const symbols = encodeURIComponent(JSON.stringify(MARKETS.map((m) => SYMBOL[m])));
  const res = await fetch(`${API}/ticker/24hr?symbols=${symbols}`);
  if (!res.ok) throw new Error(`ticker ${res.status}`);
  const rows: Array<Record<string, string>> = await res.json();
  for (const m of MARKETS) {
    const r = rows.find((x) => x.symbol === SYMBOL[m]);
    if (!r) continue;
    snap.tickers = {
      ...snap.tickers,
      [m]: {
        price: +r.lastPrice,
        open24h: +r.openPrice,
        high24h: +r.highPrice,
        low24h: +r.lowPrice,
        volume24h: +r.quoteVolume,
      },
    };
  }
}

function connectSocket() {
  const streams = MARKETS.map((m) => `${SYMBOL[m].toLowerCase()}@aggTrade`).join('/');
  const ws = new WebSocket(WS + streams);
  let pending = false;
  // REST worked but the socket stays silent (e.g. blocked): keep prices moving locally.
  const silent = setTimeout(() => {
    ws.close();
    simulate();
  }, 10_000);
  ws.onmessage = (ev) => {
    clearTimeout(silent);
    const msg = JSON.parse(ev.data);
    const m = MARKETS.find((x) => SYMBOL[x] === msg.data?.s);
    if (!m) return;
    push(m, +msg.data.p, msg.data.T);
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        emit();
      });
    }
  };
  ws.onclose = () => {
    if (snap.source === 'live') setTimeout(connectSocket, 2000);
  };
}

export function startPrices() {
  if (started) return;
  started = true;
  const timeout = setTimeout(simulate, 5000);
  loadTickers()
    .then(() => {
      clearTimeout(timeout);
      if (snap.source === 'simulated') return;
      snap = { ...snap, source: 'live' };
      for (const m of MARKETS) ticks[m].push({ time: Date.now(), price: snap.tickers[m]!.price });
      emit();
      connectSocket();
    })
    .catch(() => {
      clearTimeout(timeout);
      simulate();
    });
}

export function usePrices(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap,
  );
}

export function getMarks(): Partial<Record<Market, number>> {
  const out: Partial<Record<Market, number>> = {};
  for (const m of MARKETS) if (snap.tickers[m]) out[m] = snap.tickers[m]!.price;
  return out;
}

export function onTick(fn: (m: Market, t: Tick) => void) {
  tickListeners.add(fn);
  return () => tickListeners.delete(fn);
}

export interface Candle {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Historical 1-minute candles, from Binance when live or generated when simulated. */
export async function loadCandles(m: Market, intervalSec: number): Promise<Candle[]> {
  if (snap.source === 'live') {
    const interval = { 60: '1m', 300: '5m', 900: '15m', 3600: '1h' }[intervalSec] ?? '1m';
    try {
      const res = await fetch(`${API}/klines?symbol=${SYMBOL[m]}&interval=${interval}&limit=500`);
      const rows: Array<Array<string | number>> = await res.json();
      return rows.map((r) => ({
        time: Math.floor(+r[0] / 1000),
        open: +r[1],
        high: +r[2],
        low: +r[3],
        close: +r[4],
      }));
    } catch {
      /* fall through to synthetic history */
    }
  }
  const end = snap.tickers[m]?.price ?? FALLBACK[m];
  const now = Math.floor(Date.now() / 1000 / intervalSec) * intervalSec;
  const out: Candle[] = [];
  let price = end;
  const vol = 0.0025 * Math.sqrt(intervalSec / 60);
  for (let i = 0; i < 300; i++) {
    const open = price * (1 + (Math.random() - 0.5) * vol);
    const high = Math.max(open, price) * (1 + Math.random() * vol * 0.5);
    const low = Math.min(open, price) * (1 - Math.random() * vol * 0.5);
    out.unshift({ time: now - i * intervalSec, open, high, low, close: price });
    price = open;
  }
  return out;
}

export interface Point {
  time: number; // seconds
  value: number;
}

/** Recent per-second prices for the tick chart. */
export async function loadTicks(m: Market): Promise<Point[]> {
  const bySecond = new Map<number, number>();
  if (snap.source === 'live') {
    try {
      const res = await fetch(`${API}/aggTrades?symbol=${SYMBOL[m]}&limit=1000`);
      const rows: Array<{ p: string; T: number }> = await res.json();
      for (const r of rows) bySecond.set(Math.floor(r.T / 1000), +r.p);
    } catch {
      /* fall back to what we have */
    }
  }
  for (const t of ticks[m]) bySecond.set(Math.floor(t.time / 1000), t.price);
  if (bySecond.size < 30) {
    // Not enough history yet: backfill a short random walk that joins the oldest known price.
    const first = bySecond.size ? Math.min(...bySecond.keys()) : Math.floor(Date.now() / 1000);
    let p = bySecond.get(first) ?? snap.tickers[m]?.price ?? FALLBACK[m];
    for (let i = 1; i <= 240; i++) {
      if (Math.random() < 0.35) p *= 1 + (Math.random() - 0.5) * 0.0015;
      bySecond.set(first - i, p);
    }
  }
  return [...bySecond.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}

/** Recent raw ticks for a market (for sparklines). */
export function getTicks(m: Market): Tick[] {
  return ticks[m];
}
