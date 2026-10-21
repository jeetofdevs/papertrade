import { toast } from './Toasts';

/** The $NITRO token contract on NEAR. */
export const NITRO_TOKEN = (import.meta.env.VITE_NITRO_TOKEN as string | undefined) || 'nitro.nearlytrade.near';

/** "CA: nitro.nearlytrade.near" with copy and explorer links. */
export function TokenCA({ compact = false }: { compact?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(NITRO_TOKEN);
      toast.ok('$NITRO CA copied');
    } catch {
      toast.err('Could not copy');
    }
  };
  return (
    <div className={`token-ca ${compact ? 'token-ca-compact' : ''}`}>
      <span className="token-ca-label">$NITRO CA</span>
      <code className="mono">{NITRO_TOKEN}</code>
      <button className="chip" onClick={copy} aria-label="Copy the $NITRO contract address">
        Copy
      </button>
      <a className="chip" href={`https://nearblocks.io/token/${NITRO_TOKEN}`} target="_blank" rel="noopener noreferrer">
        NearBlocks ↗
      </a>
    </div>
  );
}
