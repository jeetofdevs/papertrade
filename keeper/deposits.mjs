// Finds plain USDC transfers to the pool address inside a NEAR transaction result.
// Pure functions, no network: index.mjs feeds them RPC responses.

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** The NEAR account in a Nitro deposit memo ("nitro:alice.near"), or null for any other memo. */
export function memoAccount(memo) {
  if (typeof memo !== 'string') return null;
  const m = /^\s*nitro:(.+)$/i.exec(memo);
  if (!m) return null;
  const id = m[1].trim().toLowerCase();
  if (id.length < 2 || id.length > 64 || !ACCOUNT_RE.test(id)) return null;
  return id;
}

function succeeded(status) {
  return !!status && typeof status === 'object' && ('SuccessValue' in status || 'SuccessReceiptId' in status);
}

/**
 * Nitro deposits made as plain transfers to `pool` in a transaction (RPC `EXPERIMENTAL_tx_status` / `tx` result).
 * Transfers made with ft_transfer_call are skipped: the contract already credited those itself.
 * Returns [{ key, account, amount }] where amount is a base-unit string.
 */
export function parseDeposits(tx, { pool, usdc }) {
  const hash = tx?.transaction?.hash ?? tx?.transaction_outcome?.id;
  const outcomes = tx?.receipts_outcome ?? [];
  if (!hash) return [];
  // Anything that ran on the pool contract means this was ft_transfer_call (or another call to us).
  if (outcomes.some((o) => o.outcome?.executor_id === pool)) return [];

  const out = [];
  for (const o of outcomes) {
    const { executor_id, logs = [], status } = o.outcome ?? {};
    if (executor_id !== usdc || !succeeded(status)) continue;
    logs.forEach((log, li) => {
      if (!log.startsWith('EVENT_JSON:')) return;
      let ev;
      try {
        ev = JSON.parse(log.slice('EVENT_JSON:'.length));
      } catch {
        return;
      }
      if (ev.standard !== 'nep141' || ev.event !== 'ft_transfer' || !Array.isArray(ev.data)) return;
      ev.data.forEach((d, di) => {
        if (d.new_owner_id !== pool || !/^\d+$/.test(String(d.amount)) || BigInt(d.amount) === 0n) return;
        // Only transfers tagged by the Nitro site ("nitro:<account>") are user deposits. Anything else
        // sent to the pool account (for example the team moving its own funds) is left alone.
        const account = memoAccount(d.memo);
        if (!account) return;
        out.push({ key: `${hash}:${o.id}:${li}:${di}`, account, amount: String(d.amount) });
      });
    });
  }
  return out;
}

/** "3.1415" -> 314150000n with 8 decimals, without float rounding. */
export function toPrice8(s) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(String(s).trim());
  if (!m) throw new Error(`Bad price: ${s}`);
  const frac = (m[2] ?? '').slice(0, 8).padEnd(8, '0');
  return BigInt(m[1]) * 100_000_000n + BigInt(frac);
}

/** Has the price crossed this position's max loss or take profit? (prices as bigint, 8 decimals) */
export function needsClose(pos, mark) {
  const liq = BigInt(pos.liq);
  const tp = pos.tp == null ? null : BigInt(pos.tp);
  if (pos.long ? mark <= liq : mark >= liq) return true;
  if (tp != null && (pos.long ? mark >= tp : mark <= tp)) return true;
  return false;
}
