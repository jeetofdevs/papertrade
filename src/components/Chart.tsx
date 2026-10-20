import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineSeries,
  LineStyle,
  LineType,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { useActivity } from '../lib/activity';
import { Market, Position, Trade } from '../lib/engine';
import { Candle, loadCandles, loadTicks, onTick, usePrices } from '../lib/prices';
import { setSetting, useSettings } from '../lib/settings';

const INTERVALS = [
  { label: '1m', sec: 60 },
  { label: '5m', sec: 300 },
  { label: '15m', sec: 900 },
  { label: '1h', sec: 3600 },
];

type AnySeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;

export function Chart({ market, positions, history }: { market: Market; positions: Position[]; history: Trade[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<AnySeries | null>(null);
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const times = useRef<number[]>([]);
  const [interval, setInterval_] = useState(60);
  const [version, setVersion] = useState(0);
  const settings = useSettings();
  const tick = settings.chartType === 'tick';
  const { source } = usePrices();
  const { feed } = useActivity();
  const ready = source !== 'connecting';

  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#7E8E88',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      grid: { vertLines: { color: '#121B18' }, horzLines: { color: '#121B18' } },
      rightPriceScale: { borderColor: '#1A2421' },
      timeScale: { borderColor: '#1A2421', timeVisible: true, secondsVisible: true },
      crosshair: { vertLine: { color: '#3A4A44' }, horzLine: { color: '#3A4A44' } },
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
      markers.current = null;
    };
  }, []);

  // Grid and text colours follow the theme.
  useEffect(() => {
    const grid = settings.uwu ? 'rgba(255,255,255,0.06)' : '#121B18';
    chart.current?.applyOptions({
      layout: { textColor: settings.uwu ? '#B7A8E0' : '#7E8E88' },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: settings.uwu ? '#3A3070' : '#1A2421' },
      timeScale: { borderColor: settings.uwu ? '#3A3070' : '#1A2421' },
    });
  }, [settings.uwu]);

  // (Re)build the series for this market and chart type, then follow live ticks.
  useEffect(() => {
    const c = chart.current;
    if (!c || !ready) return;
    let alive = true;
    const s: AnySeries = tick
      ? c.addSeries(LineSeries, { color: '#E8EFEC', lineWidth: 2, lineType: LineType.WithSteps })
      : c.addSeries(CandlestickSeries, {
          upColor: '#00EC97',
          downColor: '#FF5C7A',
          borderVisible: false,
          wickUpColor: '#00EC97',
          wickDownColor: '#FF5C7A',
        });
    series.current = s;
    markers.current = createSeriesMarkers(s, []);
    times.current = [];
    let lastCandle: Candle | null = null;
    let lastTime = 0;

    const setPrecision = (p: number) => {
      const digits = p < 10 ? 4 : 2;
      s.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } });
    };

    if (tick) {
      loadTicks(market).then((pts) => {
        if (!alive || !pts.length) return;
        setPrecision(pts[pts.length - 1].value);
        (s as ISeriesApi<'Line'>).setData(pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
        times.current = pts.map((p) => p.time);
        lastTime = pts[pts.length - 1].time;
        c.timeScale().applyOptions({ secondsVisible: true });
        c.timeScale().setVisibleLogicalRange({ from: pts.length - 180, to: pts.length + 5 });
        setVersion((v) => v + 1);
      });
    } else {
      loadCandles(market, interval).then((cs) => {
        if (!alive || !cs.length) return;
        setPrecision(cs[cs.length - 1].close);
        (s as ISeriesApi<'Candlestick'>).setData(cs.map((x) => ({ ...x, time: x.time as UTCTimestamp })));
        times.current = cs.map((x) => x.time);
        lastCandle = cs[cs.length - 1];
        c.timeScale().applyOptions({ secondsVisible: false });
        c.timeScale().scrollToRealTime();
        setVersion((v) => v + 1);
      });
    }

    const off = onTick((m, t) => {
      if (m !== market || !alive) return;
      if (tick) {
        if (!lastTime) return;
        const sec = Math.floor(t.time / 1000);
        if (sec < lastTime) return;
        (s as ISeriesApi<'Line'>).update({ time: sec as UTCTimestamp, value: t.price });
        if (sec > lastTime) times.current.push(sec);
        lastTime = sec;
      } else {
        if (!lastCandle) return;
        const bucket = Math.floor(t.time / 1000 / interval) * interval;
        const prev: Candle = lastCandle;
        if (bucket < prev.time) return;
        const next: Candle =
          bucket > prev.time
            ? { time: bucket, open: prev.close, high: t.price, low: t.price, close: t.price }
            : { ...prev, high: Math.max(prev.high, t.price), low: Math.min(prev.low, t.price), close: t.price };
        if (bucket > prev.time) times.current.push(bucket);
        lastCandle = next;
        (s as ISeriesApi<'Candlestick'>).update({ ...next, time: next.time as UTCTimestamp });
      }
    });

    return () => {
      alive = false;
      off();
      if (chart.current) chart.current.removeSeries(s);
      series.current = null;
      markers.current = null;
    };
  }, [market, interval, ready, tick]);

  // Entry and max loss lines for open positions in this market.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const lines: IPriceLine[] = [];
    for (const p of positions.filter((x) => x.market === market)) {
      const color = p.side === 'long' ? '#00EC97' : '#FF5C7A';
      if (settings.showEntries) {
        lines.push(s.createPriceLine({ price: p.entry, color, lineStyle: LineStyle.Solid, lineWidth: 1, title: `${p.side} ${p.leverage}x` }));
      }
      if (settings.showMaxLoss) {
        lines.push(s.createPriceLine({ price: p.liq, color: '#FFB547', lineStyle: LineStyle.Dashed, lineWidth: 1, title: 'max loss' }));
      }
    }
    return () => {
      // Skip if the series (or the whole chart) was already removed, which drops its lines.
      if (chart.current && series.current === s) lines.forEach((l) => s.removePriceLine(l));
    };
  }, [positions, market, settings.showEntries, settings.showMaxLoss, version]);

  // Trade markers: yours, and optionally other traders'.
  useEffect(() => {
    const api = markers.current;
    const ts = times.current;
    if (!api || !ts.length) return;
    // Markers must sit on an existing data point, so snap to the closest earlier one.
    const snap = (ms: number) => {
      const t = Math.floor(ms / 1000);
      if (t < ts[0]) return null;
      let lo = 0;
      let hi = ts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ts[mid] <= t) lo = mid;
        else hi = mid - 1;
      }
      return ts[lo] as UTCTimestamp;
    };
    const out: SeriesMarker<Time>[] = [];
    const add = (ms: number, m: Omit<SeriesMarker<Time>, 'time'>) => {
      const time = snap(ms);
      if (time) out.push({ ...m, time } as SeriesMarker<Time>);
    };
    if (settings.showTrades) {
      for (const p of positions.filter((x) => x.market === market)) {
        add(p.openedAt, {
          position: p.side === 'long' ? 'belowBar' : 'aboveBar',
          shape: p.side === 'long' ? 'arrowUp' : 'arrowDown',
          color: p.side === 'long' ? '#00EC97' : '#FF5C7A',
          text: `${p.leverage}x`,
        });
      }
      for (const t of history.filter((x) => x.market === market).slice(0, 50)) {
        add(t.closedAt, {
          position: 'aboveBar',
          shape: 'circle',
          color: t.reason === 'liquidated' ? '#FFB547' : t.pnl >= 0 ? '#00EC97' : '#FF5C7A',
          text: t.reason === 'liquidated' ? 'max loss' : `${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}`,
        });
      }
      if (settings.showOthers) {
        for (const a of feed.filter((x) => x.market === market && !x.mine && x.kind === 'open').slice(0, 30)) {
          add(a.time, {
            position: a.side === 'long' ? 'belowBar' : 'aboveBar',
            shape: 'circle',
            color: a.side === 'long' ? 'rgba(0,236,151,0.45)' : 'rgba(255,92,122,0.45)',
          });
        }
      }
    }
    out.sort((a, b) => (a.time as number) - (b.time as number));
    api.setMarkers(out);
  }, [positions, history, feed, market, settings.showTrades, settings.showOthers, version]);

  const reset = () => {
    const c = chart.current;
    if (!c) return;
    c.priceScale('right').applyOptions({ autoScale: true });
    if (tick) {
      const n = times.current.length;
      c.timeScale().setVisibleLogicalRange({ from: n - 180, to: n + 5 });
    } else {
      c.timeScale().resetTimeScale();
      c.timeScale().scrollToRealTime();
    }
  };

  return (
    <div className="panel chart-panel">
      <div className="chart-toolbar">
        <button className={`chip ${tick ? 'chip-on' : ''}`} onClick={() => setSetting('chartType', 'tick')}>
          Tick
        </button>
        {INTERVALS.map((i) => (
          <button
            key={i.sec}
            className={`chip ${!tick && interval === i.sec ? 'chip-on' : ''}`}
            onClick={() => {
              setInterval_(i.sec);
              setSetting('chartType', 'candles');
            }}
          >
            {i.label}
          </button>
        ))}
        <button className="chip chip-reset" onClick={reset}>
          Reset
        </button>
        <span className={`feed feed-${source}`}>
          <span className="feed-dot" />
          {source === 'live' ? 'Live prices' : source === 'simulated' ? 'Simulated prices' : 'Connecting…'}
        </span>
      </div>
      <div ref={el} className="chart" />
    </div>
  );
}
