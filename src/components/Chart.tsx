import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  UTCTimestamp,
} from 'lightweight-charts';
import { Market, Position } from '../lib/engine';
import { Candle, loadCandles, onTick, usePrices } from '../lib/prices';

const INTERVALS = [
  { label: '1m', sec: 60 },
  { label: '5m', sec: 300 },
  { label: '15m', sec: 900 },
  { label: '1h', sec: 3600 },
];

export function Chart({ market, positions }: { market: Market; positions: Position[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const last = useRef<Candle | null>(null);
  const [interval, setInterval_] = useState(60);
  const { source } = usePrices();
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
      timeScale: { borderColor: '#1A2421', timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: '#3A4A44' }, horzLine: { color: '#3A4A44' } },
    });
    series.current = c.addSeries(CandlestickSeries, {
      upColor: '#00EC97',
      downColor: '#FF5C7A',
      borderVisible: false,
      wickUpColor: '#00EC97',
      wickDownColor: '#FF5C7A',
    });
    chart.current = c;
    return () => {
      c.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  // Load history, then keep the last candle updated from live ticks.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    last.current = null;
    loadCandles(market, interval).then((cs) => {
      if (!alive || !series.current) return;
      const digits = cs[cs.length - 1].close < 10 ? 4 : 2;
      series.current.applyOptions({ priceFormat: { type: 'price', precision: digits, minMove: 1 / 10 ** digits } });
      series.current.setData(cs.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
      last.current = cs[cs.length - 1];
      chart.current?.timeScale().scrollToRealTime();
    });
    const off = onTick((m, t) => {
      if (m !== market || !series.current || !last.current) return;
      const bucket = Math.floor(t.time / 1000 / interval) * interval;
      const prev = last.current;
      const c: Candle =
        bucket > prev.time
          ? { time: bucket, open: prev.close, high: t.price, low: t.price, close: t.price }
          : { ...prev, high: Math.max(prev.high, t.price), low: Math.min(prev.low, t.price), close: t.price };
      if (bucket < prev.time) return;
      last.current = c;
      series.current.update({ ...c, time: c.time as UTCTimestamp });
    });
    return () => {
      alive = false;
      off();
    };
  }, [market, interval, ready]);

  // Entry and liquidation lines for open positions in this market.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const lines: IPriceLine[] = [];
    for (const p of positions.filter((x) => x.market === market)) {
      const color = p.side === 'long' ? '#00EC97' : '#FF5C7A';
      lines.push(
        s.createPriceLine({ price: p.entry, color, lineStyle: LineStyle.Solid, lineWidth: 1, title: `${p.side} ${p.leverage}x` }),
        s.createPriceLine({ price: p.liq, color: '#FFB547', lineStyle: LineStyle.Dashed, lineWidth: 1, title: 'max loss' }),
      );
    }
    return () => {
      // On unmount the chart is already disposed and takes its lines with it.
      if (chart.current) lines.forEach((l) => s.removePriceLine(l));
    };
  }, [positions, market]);

  return (
    <div className="panel chart-panel">
      <div className="chart-toolbar">
        {INTERVALS.map((i) => (
          <button key={i.sec} className={`chip ${interval === i.sec ? 'chip-on' : ''}`} onClick={() => setInterval_(i.sec)}>
            {i.label}
          </button>
        ))}
        <span className={`feed feed-${source}`}>
          <span className="feed-dot" />
          {source === 'live' ? 'Live prices' : source === 'simulated' ? 'Simulated prices' : 'Connecting…'}
        </span>
      </div>
      <div ref={el} className="chart" />
    </div>
  );
}
