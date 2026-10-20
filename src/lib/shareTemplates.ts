// PnL share card templates, drawn on a 1200×675 canvas.

import { Market, Side } from './engine';
import { price, shortAccount, signed } from './format';

export interface ShareData {
  market: Market;
  side: Side;
  leverage: number;
  pnl: number;
  wager: number;
  entry: number;
  exit: number;
  status: 'open' | 'closed' | 'max loss';
  account?: string | null;
  time: number;
}

export interface Assets {
  logo: HTMLImageElement | null;
  token: HTMLImageElement | null;
  cat: HTMLImageElement | null;
}

export type TemplateId = 'classic' | 'moon' | 'neon' | 'paper' | 'uwu';

export const W = 1200;
export const H = 675;

interface Theme {
  text: string;
  muted: string;
  up: string;
  down: string;
  brandDot: string;
  pillBg: (c: string) => string;
  display: string; // font family for big text
  mono: string;
  /** Paint the background (and any art behind the text). */
  paint: (ctx: CanvasRenderingContext2D, win: boolean, a: Assets) => void;
  /** Width the big ROE number may use, so it never runs into the art. */
  roeMax: number;
  /** Optional big word above the ROE. */
  headline?: (win: boolean) => string;
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

function stars(ctx: CanvasRenderingContext2D, n: number, color: string, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.3 + rnd() * 0.7;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 1.1, y - r * 0.4, r * 1.2, 0, Math.PI * 2);
  ctx.arc(x + r * 2.3, y, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x, y, r * 2.3, r * 0.9);
}

const THEMES: Record<TemplateId, Theme> = {
  classic: {
    text: '#E8EFEC',
    muted: '#7E8E88',
    up: '#00EC97',
    down: '#FF5C7A',
    brandDot: '#00EC97',
    pillBg: (c) => rgba(c, 0.14),
    display: 'Inter, sans-serif',
    mono: '"JetBrains Mono", monospace',
    roeMax: 1080,
    paint(ctx, win) {
      ctx.fillStyle = '#070B0A';
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, 700);
      glow.addColorStop(0, win ? 'rgba(0,236,151,0.28)' : 'rgba(255,92,122,0.25)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 48) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    },
  },

  moon: {
    text: '#F5F3FF',
    muted: '#9C98C0',
    up: '#7CFFB2',
    down: '#FF6B8B',
    brandDot: '#FFD66B',
    pillBg: (c) => rgba(c, 0.16),
    display: 'Inter, sans-serif',
    mono: '"JetBrains Mono", monospace',
    roeMax: 700,
    headline: (win) => (win ? 'TO THE MOON' : 'REKT'),
    paint(ctx, win) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, win ? '#0B0B2A' : '#1A0710');
      g.addColorStop(1, win ? '#1C1450' : '#3A0B1E');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      stars(ctx, 140, '#fff');
      // Moon (or a cracked red planet when rekt)
      const cx = 960;
      const cy = 330;
      const r = 190;
      const halo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.8);
      halo.addColorStop(0, win ? 'rgba(255,230,150,0.25)' : 'rgba(255,80,110,0.25)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, W, H);
      const body = ctx.createRadialGradient(cx - 60, cy - 70, 20, cx, cy, r);
      body.addColorStop(0, win ? '#FFF6D6' : '#FF9AAE');
      body.addColorStop(1, win ? '#E8C877' : '#B3264A');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = win ? 'rgba(170,130,60,0.35)' : 'rgba(80,0,20,0.35)';
      for (const [dx, dy, rr] of [
        [-60, -40, 34],
        [50, 30, 46],
        [-20, 90, 24],
        [80, -80, 20],
        [-100, 50, 16],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (win) {
        // Rocket heading for the moon
        ctx.save();
        ctx.translate(760, 470);
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = '#FF8A3D';
        ctx.beginPath();
        ctx.moveTo(-14, 40);
        ctx.lineTo(0, 90);
        ctx.lineTo(14, 40);
        ctx.fill();
        ctx.fillStyle = '#F4F1E8';
        ctx.beginPath();
        ctx.moveTo(0, -60);
        ctx.quadraticCurveTo(28, -20, 22, 40);
        ctx.lineTo(-22, 40);
        ctx.quadraticCurveTo(-28, -20, 0, -60);
        ctx.fill();
        ctx.fillStyle = '#00EC97';
        ctx.beginPath();
        ctx.arc(0, -8, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FF5C7A';
        ctx.beginPath();
        ctx.moveTo(-22, 20);
        ctx.lineTo(-38, 46);
        ctx.lineTo(-22, 40);
        ctx.moveTo(22, 20);
        ctx.lineTo(38, 46);
        ctx.lineTo(22, 40);
        ctx.fill();
        ctx.restore();
      } else {
        // Crack across the planet
        ctx.strokeStyle = '#2A0010';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(cx - 120, cy - 130);
        ctx.lineTo(cx - 40, cy - 30);
        ctx.lineTo(cx - 70, cy + 20);
        ctx.lineTo(cx + 30, cy + 110);
        ctx.lineTo(cx + 10, cy + 180);
        ctx.stroke();
      }
    },
  },

  neon: {
    text: '#FFFFFF',
    muted: '#C9A7FF',
    up: '#3CFFD0',
    down: '#FF3D8B',
    brandDot: '#FF3D8B',
    pillBg: (c) => rgba(c, 0.18),
    display: 'Inter, sans-serif',
    mono: '"JetBrains Mono", monospace',
    roeMax: 700,
    paint(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#12002B');
      sky.addColorStop(0.62, '#3B0A5E');
      sky.addColorStop(1, '#12002B');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      stars(ctx, 60, '#fff', 3);
      // Striped sunset
      const cx = 950;
      const cy = 380;
      const r = 200;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      const sun = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, '#FFE66B');
      sun.addColorStop(0.5, '#FF6BB5');
      sun.addColorStop(1, '#B026FF');
      ctx.fillStyle = sun;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#3B0A5E';
      for (let i = 0; i < 7; i++) ctx.fillRect(cx - r, cy + 10 + i * 26, r * 2, 4 + i * 2.2);
      ctx.restore();
      // Perspective grid floor
      const horizon = 505;
      ctx.fillStyle = '#12002B';
      ctx.fillRect(0, horizon, W, H - horizon);
      ctx.strokeStyle = 'rgba(255,61,139,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const y = horizon + (i * i * (H - horizon)) / 121;
        ctx.globalAlpha = 0.3 + i / 16;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.6;
      for (let i = -14; i <= 14; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 40, horizon);
        ctx.lineTo(W / 2 + i * 260, H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Dark band behind the stats row so it stays readable
      const band = ctx.createLinearGradient(0, 520, 0, H);
      band.addColorStop(0, 'rgba(18,0,43,0)');
      band.addColorStop(0.4, 'rgba(18,0,43,0.85)');
      band.addColorStop(1, 'rgba(18,0,43,0.95)');
      ctx.fillStyle = band;
      ctx.fillRect(0, 500, W, H - 500);
    },
  },

  paper: {
    text: '#111412',
    muted: '#7A776C',
    up: '#0A8F5B',
    down: '#D6335A',
    brandDot: '#00B877',
    pillBg: (c) => rgba(c, 0.12),
    display: 'Inter, sans-serif',
    mono: '"JetBrains Mono", monospace',
    roeMax: 1080,
    paint(ctx, win) {
      ctx.fillStyle = '#F4F1E8';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(17,20,18,0.06)';
      ctx.lineWidth = 1;
      for (let y = 40; y < H; y += 36) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.strokeStyle = win ? 'rgba(10,143,91,0.35)' : 'rgba(214,51,90,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(40, 0);
      ctx.lineTo(40, H);
      ctx.stroke();
      // Folded corner
      ctx.fillStyle = '#E3DDCC';
      ctx.beginPath();
      ctx.moveTo(W - 90, H);
      ctx.lineTo(W, H - 90);
      ctx.lineTo(W, H);
      ctx.fill();
      ctx.fillStyle = '#D2CAB5';
      ctx.beginPath();
      ctx.moveTo(W - 90, H);
      ctx.lineTo(W, H - 90);
      ctx.lineTo(W - 90, H - 90);
      ctx.fill();
    },
  },

  uwu: {
    text: '#3B2E5A',
    muted: '#8A79B8',
    up: '#12A37A',
    down: '#E0457B',
    brandDot: '#FF6FB5',
    pillBg: (c) => rgba(c, 0.14),
    display: 'Nunito, Inter, sans-serif',
    mono: '"JetBrains Mono", monospace',
    roeMax: 720,
    headline: (win) => (win ? 'uwu gains' : 'oopsie'),
    paint(ctx, _win, a) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#FFE3F1');
      g.addColorStop(0.5, '#E9DCFF');
      g.addColorStop(1, '#D6F5FF');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      stars(ctx, 40, '#FF8FC7', 11);
      cloud(ctx, 760, 150, 34);
      cloud(ctx, 1010, 90, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(1000, 420, 220, 0, Math.PI * 2);
      ctx.fill();
      if (a.cat) ctx.drawImage(a.cat, 900, 255, 266, 337);
    },
  },
};

export const TEMPLATES: Array<{ id: TemplateId; name: string }> = [
  { id: 'classic', name: 'Classic' },
  { id: 'moon', name: 'Moon / Rekt' },
  { id: 'neon', name: 'Neon' },
  { id: 'paper', name: 'Paper' },
  { id: 'uwu', name: 'UWU' },
];

export async function drawShare(canvas: HTMLCanvasElement, d: ShareData, id: TemplateId, a: Assets) {
  await document.fonts?.ready;
  const t = THEMES[id];
  const ctx = canvas.getContext('2d')!;
  const roe = (d.pnl / d.wager) * 100;
  const win = d.pnl >= 0;
  const accent = win ? t.up : t.down;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'left';
  t.paint(ctx, win, a);

  // Brand
  if (a.logo) ctx.drawImage(a.logo, 64, 56, 64, 64);
  ctx.fillStyle = t.text;
  ctx.font = `800 44px ${t.display}`;
  ctx.fillText('nitro', 144, 104);
  ctx.fillStyle = t.brandDot;
  ctx.fillText('.', 144 + ctx.measureText('nitro').width, 104);
  ctx.textAlign = 'right';
  ctx.fillStyle = t.muted;
  ctx.font = `500 22px ${t.mono}`;
  ctx.fillText('1000x perps on NEAR', W - 64, 96);
  ctx.font = `500 18px ${t.mono}`;
  const when = new Date(d.time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  ctx.fillText(`${d.account ? shortAccount(d.account) : 'guest'} · ${when}`, W - 64, 128);
  ctx.textAlign = 'left';

  // Market line with pills
  if (a.token) ctx.drawImage(a.token, 64, 186, 56, 56);
  ctx.fillStyle = t.text;
  ctx.font = `800 40px ${t.display}`;
  ctx.fillText(`${d.market}-PERP`, 136, 228);
  let x = 136 + ctx.measureText(`${d.market}-PERP`).width + 20;
  const pill = (text: string, color: string) => {
    ctx.font = `700 22px ${t.mono}`;
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = t.pillBg(color);
    ctx.beginPath();
    ctx.roundRect(x, 196, w, 40, 10);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x + 14, 224);
    x += w + 12;
  };
  pill(d.side.toUpperCase(), d.side === 'long' ? t.up : t.down);
  pill(`${d.leverage}x`, id === 'paper' || id === 'uwu' ? '#C77800' : '#FFB547');
  if (d.status !== 'open') pill(d.status.toUpperCase(), t.muted);

  // Optional headline, then the big ROE number, shrunk to fit beside any art
  let roeY = 420;
  if (t.headline) {
    ctx.fillStyle = accent;
    ctx.font = `900 34px ${t.display}`;
    ctx.fillText(t.headline(win), 64, 300);
    roeY = 430;
  }
  const roeText = `${roe >= 0 ? '+' : '−'}${Math.abs(roe).toFixed(Math.abs(roe) >= 1000 ? 0 : 2)}%`;
  let size = 168;
  ctx.font = `900 ${size}px ${t.display}`;
  while (ctx.measureText(roeText).width > t.roeMax - 56 && size > 80) {
    size -= 8;
    ctx.font = `900 ${size}px ${t.display}`;
  }
  ctx.fillStyle = accent;
  ctx.fillText(roeText, 56, roeY);
  ctx.font = `600 40px ${t.mono}`;
  ctx.fillText(`${signed(d.pnl)} USDC`, 64, roeY + 60);

  // Stats row
  const col = (label: string, value: string, cx: number) => {
    ctx.fillStyle = t.muted;
    ctx.font = `600 20px ${t.display}`;
    ctx.fillText(label.toUpperCase(), cx, 568);
    ctx.fillStyle = t.text;
    ctx.font = `600 32px ${t.mono}`;
    ctx.fillText(value, cx, 608);
  };
  col('Entry price', price(d.entry), 64);
  col(d.status === 'open' ? 'Mark price' : 'Exit price', price(d.exit), 360);
  col('Wager', `${d.wager.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`, 656);
}
