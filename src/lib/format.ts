export function usd(n: number, digits = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Price with sensible precision for its magnitude. */
export function price(n: number | undefined) {
  if (n === undefined || !isFinite(n)) return '—';
  const d = n >= 1000 ? 2 : n >= 10 ? 3 : 4;
  return usd(n, d);
}

export function compact(n: number) {
  return n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
}

export function signed(n: number, digits = 2) {
  return `${n >= 0 ? '+' : '−'}${usd(Math.abs(n), digits)}`;
}

export function pct(n: number) {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2)}%`;
}

export function shortAccount(id: string) {
  return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}

export function signedUsd(n: number, digits = 2) {
  return `${n >= 0 ? '+' : '−'}$${usd(Math.abs(n), digits)}`;
}
