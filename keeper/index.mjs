// Nitro keeper: the oracle, keeper and deposit indexer for the Nitro vault contract.
//
//  1. Pushes prices (8 decimals) to the contract every PRICE_INTERVAL_MS.
//  2. Closes positions that crossed their max loss or take profit (run_keeper).
//  3. Credits plain USDC transfers to the pool address (credit_transfers), found
//     automatically through NearBlocks or reported to POST /claim with a tx hash.
//
// The contract checks everything it can: only this account may push prices and report
// transfers, each transfer is credited once, and credits never exceed the USDC the
// contract holds but does not owe yet.

import http from 'node:http';
import { Account, JsonRpcProvider } from 'near-api-js';
import { needsClose, parseDeposits, toPrice8 } from './deposits.mjs';
import { keeperKeyPair } from './keys.mjs';

const env = (k, d) => process.env[k] ?? d;
const CONTRACT = env('CONTRACT_ID', 'nitroonnear.near');
// The oracle is the contract account itself, signing with the limited keeper key from KEEPER_SEED
// (added by deploy.mjs). An explicit ORACLE_ACCOUNT_ID / ORACLE_PRIVATE_KEY still works.
const ORACLE = env('ORACLE_ACCOUNT_ID', CONTRACT);
const KEY = env('ORACLE_PRIVATE_KEY') ?? (process.env.KEEPER_SEED ? keeperKeyPair(process.env.KEEPER_SEED).toString() : undefined);
const USDC = env('USDC_CONTRACT', '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
const RPC = env('NEAR_RPC_URL', 'https://free.rpc.fastnear.com');
const NEARBLOCKS = env('NEARBLOCKS_API', 'https://api.nearblocks.io');
const NEARBLOCKS_KEY = env('NEARBLOCKS_API_KEY', '');
const PRICE_MS = Number(env('PRICE_INTERVAL_MS', 10_000));
const DEPOSIT_MS = Number(env('DEPOSIT_INTERVAL_MS', 20_000));
const PORT = Number(env('PORT', 8080));
const MARKETS = env('MARKETS', 'NEAR,BTC,ETH,SOL').split(',');

if (!KEY) {
  console.error('Set KEEPER_SEED (or ORACLE_ACCOUNT_ID and ORACLE_PRIVATE_KEY)');
  process.exit(1);
}

const provider = new JsonRpcProvider({ url: RPC });
const oracle = new Account(ORACLE, provider, KEY);
const view = (method, args = {}) => provider.callFunction({ contractId: CONTRACT, method, args });
const call = (methodName, args, tgas = 100) =>
  oracle.callFunction({ contractId: CONTRACT, methodName, args, gas: BigInt(tgas) * 10n ** 12n, deposit: 0n });
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- Prices ----------

const SOURCES = [
  // Binance blocks some regions (HTTP 451), so fall back to other public feeds.
  async (m) => (await getJson(`https://api.binance.com/api/v3/ticker/price?symbol=${m}USDT`)).price,
  async (m) => (await getJson(`https://api.binance.us/api/v3/ticker/price?symbol=${m}USDT`)).price,
  async (m) => (await getJson(`https://api.coinbase.com/v2/prices/${m}-USD/spot`)).data.amount,
];

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

const lastPrice = new Map();

async function fetchPrice(m) {
  for (const src of SOURCES) {
    try {
      const p = toPrice8(await src(m));
      if (p > 0n) return p;
    } catch {
      /* try the next source */
    }
  }
  return null;
}

async function pushPrices() {
  const fresh = [];
  for (const m of MARKETS) {
    const p = await fetchPrice(m);
    if (p == null) continue;
    // Refuse a jump of more than 15% in one update: it is far more likely a bad feed than the market.
    const prev = lastPrice.get(m);
    if (prev && (p * 100n > prev * 115n || p * 115n < prev * 100n)) {
      log(`skipping suspicious ${m} price ${p} (was ${prev})`);
      lastPrice.set(m, p); // accept it next time if it holds
      continue;
    }
    lastPrice.set(m, p);
    fresh.push([m, p.toString()]);
  }
  if (fresh.length === 0) return log('no prices available');
  await call('push_prices', { prices: fresh }, 30);
  await runKeeper();
}

// ---------- Keeper ----------

async function openPositions() {
  const all = [];
  const next = Number(await view('get_next_id'));
  for (let from = 1; from < next; from += 500) {
    all.push(...(await view('get_open_positions', { from_id: from, limit: 500 })));
  }
  return all;
}

async function runKeeper() {
  const due = (await openPositions())
    .filter((p) => lastPrice.has(p.market) && needsClose(p, lastPrice.get(p.market)))
    .map((p) => p.id);
  for (let i = 0; i < due.length; i += 20) {
    const ids = due.slice(i, i + 20);
    await call('run_keeper', { ids }, 300);
    log('closed', ids.join(','));
  }
}

// ---------- Deposits ----------

const seenTx = new Set();

async function txStatus(txHash, accountId) {
  return provider.viewTransactionStatusWithReceipts({ txHash, accountId, waitUntil: 'FINAL' });
}

async function signerOf(txHash) {
  const headers = NEARBLOCKS_KEY ? { Authorization: `Bearer ${NEARBLOCKS_KEY}` } : {};
  const r = await getJson(`${NEARBLOCKS}/v1/txns/${txHash}`, headers);
  return r?.txns?.[0]?.signer_account_id;
}

/** Credit every transfer in these transactions that is not credited yet. Returns credited keys. */
async function creditTxs(list) {
  const credits = [];
  for (const { hash, signer } of list) {
    let tx;
    try {
      tx = await txStatus(hash, signer ?? (await signerOf(hash)));
    } catch (e) {
      log('could not load tx', hash, e.message);
      continue;
    }
    for (const c of parseDeposits(tx, { pool: CONTRACT, usdc: USDC })) {
      if (!(await view('is_credited', { key: c.key }))) credits.push(c);
    }
    seenTx.add(hash);
  }
  const done = [];
  for (let i = 0; i < credits.length; i += 50) {
    const res = await call('credit_transfers', { credits: credits.slice(i, i + 50) }, 120);
    const keys = Array.isArray(res) ? res : [];
    done.push(...keys);
  }
  if (credits.length) log(`credited ${done.length}/${credits.length} transfers`);
  return done;
}

async function scanDeposits() {
  const headers = NEARBLOCKS_KEY ? { Authorization: `Bearer ${NEARBLOCKS_KEY}` } : {};
  const r = await getJson(`${NEARBLOCKS}/v1/account/${CONTRACT}/ft-txns?per_page=50&order=desc`, headers);
  const fresh = (r?.txns ?? [])
    .filter((t) => (t.ft?.contract ?? USDC) === USDC && t.transaction_hash && !seenTx.has(t.transaction_hash))
    .map((t) => ({ hash: t.transaction_hash, signer: undefined }));
  const unique = [...new Map(fresh.map((t) => [t.hash, t])).values()];
  if (unique.length) await creditTxs(unique);
}

// ---------- HTTP: health + manual claim ----------

const claims = new Map(); // ip -> last claim time

http
  .createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204, {});
    if (req.url === '/health') return send(200, { ok: true, contract: CONTRACT, prices: Object.fromEntries([...lastPrice].map(([k, v]) => [k, v.toString()])) });
    if (req.url === '/claim' && req.method === 'POST') {
      const ip = req.socket.remoteAddress ?? '';
      if (Date.now() - (claims.get(ip) ?? 0) < 5000) return send(429, { error: 'Wait a few seconds' });
      claims.set(ip, Date.now());
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2000) return send(413, { error: 'Too large' });
      }
      try {
        const { txHash, accountId } = JSON.parse(body);
        if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash) || typeof accountId !== 'string') return send(400, { error: 'Send { txHash, accountId }' });
        const credited = await creditTxs([{ hash: txHash, signer: accountId }]);
        return send(200, { credited });
      } catch (e) {
        return send(500, { error: e.message });
      }
    }
    send(404, { error: 'Not found' });
  })
  .listen(PORT, () => log(`keeper for ${CONTRACT} on :${PORT}`));

// ---------- Loops ----------

function every(ms, name, fn) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      log(`${name} failed:`, e.message);
    } finally {
      busy = false;
    }
  };
  tick();
  setInterval(tick, ms);
}

every(PRICE_MS, 'prices', pushPrices);
every(DEPOSIT_MS, 'deposits', scanDeposits);
