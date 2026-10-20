import { useEffect, useRef, useState } from 'react';
import { Market, Side } from '../lib/engine';
import { price, shortAccount, signed } from '../lib/format';
import { LogoMark } from './Logo';
import { toast } from './Toasts';
import { TokenIcon } from './TokenIcon';

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

const W = 1200;
const H = 675;

function svgToImage(el: Element | null): Promise<HTMLImageElement | null> {
  if (!el) return Promise.resolve(null);
  const xml = new XMLSerializer().serializeToString(el);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return img.decode().then(() => img).catch(() => null);
}

async function drawCard(canvas: HTMLCanvasElement, d: ShareData, logo: Element | null, token: Element | null) {
  await document.fonts?.ready;
  const ctx = canvas.getContext('2d')!;
  const roe = (d.pnl / d.wager) * 100;
  const win = d.pnl >= 0;
  const accent = win ? '#00EC97' : '#FF5C7A';

  // Background
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

  // Brand
  const [logoImg, tokenImg] = await Promise.all([svgToImage(logo), svgToImage(token)]);
  if (logoImg) ctx.drawImage(logoImg, 64, 56, 64, 64);
  ctx.fillStyle = '#F4F1E8';
  ctx.font = '800 44px Inter, sans-serif';
  ctx.fillText('nitro', 144, 104);
  const brandW = ctx.measureText('nitro').width;
  ctx.fillStyle = '#00EC97';
  ctx.fillText('.', 144 + brandW, 104);
  ctx.fillStyle = '#7E8E88';
  ctx.font = '500 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('1000x perps on NEAR', W - 64, 96);
  ctx.textAlign = 'left';

  // Market line
  if (tokenImg) ctx.drawImage(tokenImg, 64, 186, 56, 56);
  ctx.fillStyle = '#E8EFEC';
  ctx.font = '700 40px Inter, sans-serif';
  ctx.fillText(`${d.market}-PERP`, 136, 228);
  let x = 136 + ctx.measureText(`${d.market}-PERP`).width + 20;
  const pill = (text: string, color: string, bg: string) => {
    ctx.font = '700 22px "JetBrains Mono", monospace';
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(x, 196, w, 40, 10);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x + 14, 224);
    x += w + 12;
  };
  pill(d.side.toUpperCase(), d.side === 'long' ? '#00EC97' : '#FF5C7A', d.side === 'long' ? 'rgba(0,236,151,0.14)' : 'rgba(255,92,122,0.14)');
  pill(`${d.leverage}x`, '#FFB547', 'rgba(255,181,71,0.14)');
  if (d.status !== 'open') pill(d.status.toUpperCase(), '#7E8E88', 'rgba(255,255,255,0.06)');

  // ROE
  ctx.fillStyle = accent;
  ctx.font = '800 168px Inter, sans-serif';
  ctx.fillText(`${roe >= 0 ? '+' : '−'}${Math.abs(roe).toFixed(roe >= 1000 || roe <= -1000 ? 0 : 2)}%`, 56, 420);
  ctx.font = '600 40px "JetBrains Mono", monospace';
  ctx.fillText(`${signed(d.pnl)} USDC`, 64, 480);

  // Prices
  const col = (label: string, value: string, cx: number) => {
    ctx.fillStyle = '#7E8E88';
    ctx.font = '500 20px Inter, sans-serif';
    ctx.fillText(label.toUpperCase(), cx, 560);
    ctx.fillStyle = '#E8EFEC';
    ctx.font = '600 32px "JetBrains Mono", monospace';
    ctx.fillText(value, cx, 600);
  };
  col('Entry price', price(d.entry), 64);
  col(d.status === 'open' ? 'Mark price' : 'Exit price', price(d.exit), 420);
  col('Wager', `${d.wager.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC`, 776);

  // Who and when, under the tagline
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7E8E88';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  const when = new Date(d.time).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  ctx.fillText(`${d.account ? shortAccount(d.account) : 'guest'} · ${when}`, W - 64, 128);
  ctx.textAlign = 'left';
}

export function ShareCard({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const icons = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const svgs = icons.current?.querySelectorAll('svg');
    drawCard(c, data, svgs?.[0] ?? null, svgs?.[1] ?? null).then(() => c.toBlob((b) => setBlob(b), 'image/png'));
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roe = (data.pnl / data.wager) * 100;
  const text = `${roe >= 0 ? '+' : ''}${roe.toFixed(2)}% on ${data.market} ${data.side} ${data.leverage}x with Nitro, 1000x perps on NEAR`;
  const fileName = `nitro-${data.market}-${data.side}-${data.leverage}x.png`;

  const download = () => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
      toast.ok('Image copied');
    } catch {
      toast.err('Copy is not supported here. Use Download instead.');
    }
  };

  const shareX = () => {
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`;
    window.open(url, '_blank', 'noopener');
  };

  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canNativeShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const nativeShare = () => file && navigator.share({ files: [file], text }).catch(() => {});

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-label="Share PnL" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Share PnL</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <canvas ref={canvas} width={W} height={H} className="share-canvas" />
        <div ref={icons} hidden>
          <LogoMark size={64} />
          <TokenIcon market={data.market} size={56} />
        </div>
        <div className="share-actions">
          <button className="btn btn-primary" onClick={download} disabled={!blob}>
            Download PNG
          </button>
          <button className="btn" onClick={copy} disabled={!blob}>
            Copy image
          </button>
          <button className="btn" onClick={shareX}>
            Post on X
          </button>
          {canNativeShare && (
            <button className="btn" onClick={nativeShare}>
              Share…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
