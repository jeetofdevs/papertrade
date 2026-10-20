import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { drawShare, H, ShareData, TemplateId, TEMPLATES, W } from '../lib/shareTemplates';
import { getSettings } from '../lib/settings';
import { recordShare } from '../lib/engine';
import { dispatch } from '../lib/store';
import { useWallet } from '../lib/wallet';
import { LogoMark } from './Logo';
import { toast } from './Toasts';
import { TokenIcon } from './TokenIcon';
import { NiaPortrait } from './NiaPortrait';

export type { ShareData };

const TEMPLATE_KEY = 'nitro:share-template';

function svgToImage(el: Element | null | undefined): Promise<HTMLImageElement | null> {
  if (!el) return Promise.resolve(null);
  const xml = new XMLSerializer().serializeToString(el);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  return img.decode().then(() => img).catch(() => null);
}

function initialTemplate(): TemplateId {
  try {
    const saved = localStorage.getItem(TEMPLATE_KEY) as TemplateId | null;
    if (saved && TEMPLATES.some((t) => t.id === saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  return getSettings().uwu ? 'uwu' : 'classic';
}

export function ShareCard({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const icons = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [template, setTemplate] = useState<TemplateId>(initialTemplate);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let alive = true;
    setBlob(null);
    const svgs = icons.current?.querySelectorAll(':scope > svg');
    Promise.all([svgToImage(svgs?.[0]), svgToImage(svgs?.[1]), svgToImage(svgs?.[2])])
      .then(([logo, token, cat]) => drawShare(c, data, template, { logo, token, cat }))
      .then(() => alive && c.toBlob((b) => alive && setBlob(b), 'image/png'));
    return () => {
      alive = false;
    };
  }, [data, template]);

  const pick = (id: TemplateId) => {
    setTemplate(id);
    try {
      localStorage.setItem(TEMPLATE_KEY, id);
    } catch {
      /* storage unavailable */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roe = (data.pnl / data.wager) * 100;
  const text = `${roe >= 0 ? '+' : ''}${roe.toFixed(2)}% on ${data.market} ${data.side} ${data.leverage}x with Nitro, 1000x perps on NEAR`;
  const fileName = `nitro-${data.market}-${data.side}-${data.leverage}x-${template}.png`;

  const { traderId } = useWallet();
  const shared = () => dispatch((s) => recordShare(s, traderId, Date.now()));

  const download = () => {
    shared();
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const copy = async () => {
    try {
      shared();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob! })]);
      toast.ok('Image copied');
    } catch {
      toast.err('Copy is not supported here. Use Download instead.');
    }
  };

  const shareX = () => {
    shared();
    const url = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`;
    window.open(url, '_blank', 'noopener');
  };

  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;
  const canNativeShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const nativeShare = () => file && navigator.share({ files: [file], text }).catch(() => {});

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-label="Share PnL" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Share PnL</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="share-templates" role="radiogroup" aria-label="Card style">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={template === t.id}
              className={`share-tpl share-tpl-${t.id} ${template === t.id ? 'share-tpl-on' : ''}`}
              onClick={() => pick(t.id)}
            >
              <span className="share-tpl-swatch" />
              {t.name}
            </button>
          ))}
        </div>
        <canvas ref={canvas} width={W} height={H} className="share-canvas" />
        <div ref={icons} hidden>
          <LogoMark size={64} />
          <TokenIcon market={data.market} size={56} />
          <NiaPortrait mood="happy" className="waifu-share" />
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
    </div>,
    document.body,
  );
}
