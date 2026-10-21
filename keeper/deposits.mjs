// Finds plain USDC transfers to the pool address inside a NEAR transaction result.
// Pure functions, no network: index.mjs feeds them RPC responses.

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

/** A NEAR account id written in a transfer memo ("alice.near" or "nitro:alice.near"), or null. */
export function memoAccount(memo) {
  if (typeof memo !== 'string') return null;
  const id = memo.trim().toLowerCase().replace(/^nitro:/, '');
  if (id.length < 2 || id.length > 64 || !ACCOUNT_RE.test(id)) return null;
  return id;
}

function succeeded(status) {
  return !!status && typeof status === 'object' && ('SuccessValue' in status || 'SuccessReceiptId' in status);
}

/**
 * Plain transfers to `pool` in a transaction (RPC `EXPERIMENTAL_tx_status` / `tx` result).
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
        out.push({
          key: `${hash}:${o.id}:${li}:${di}`,
          account: memoAccount(d.memo) ?? d.old_owner_id,
          amount: String(d.amount),
        });
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
