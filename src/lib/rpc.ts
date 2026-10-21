// NEAR JSON-RPC with failover: free public nodes rate-limit busy sites, so on a limit, timeout or
// server error the request moves on to the next node and sticks with the one that answered.

const DEFAULT_RPCS = [
  'https://free.rpc.fastnear.com',
  'https://near.lava.build',
  'https://1rpc.io/near',
  'https://near.drpc.org',
  'https://rpc.mainnet.near.org',
];

export const RPCS = ((import.meta.env?.VITE_NEAR_RPC as string | undefined) || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(DEFAULT_RPCS)
  .filter((u, i, all) => all.indexOf(u) === i);

let current = 0;
const RATE_LIMIT = /rate.?limit|too many requests|quota|exceeded/i;

/** Sends one JSON-RPC request; returns the parsed JSON body (which may itself hold an RPC error). */
export async function rpc(method: string, params: unknown): Promise<any> {
  let last: unknown = new Error('No NEAR RPC available');
  for (let i = 0; i < RPCS.length; i++) {
    const idx = (current + i) % RPCS.length;
    try {
      const r = await fetch(RPCS[idx], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'nitro', method, params }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.status === 429 || r.status >= 500) throw new Error(`RPC busy (${r.status})`);
      const text = await r.text();
      if (!r.ok && RATE_LIMIT.test(text)) throw new Error('RPC rate limited');
      const j = JSON.parse(text);
      if (RATE_LIMIT.test(JSON.stringify(j.error ?? ''))) throw new Error('RPC rate limited');
      current = idx;
      return j;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
