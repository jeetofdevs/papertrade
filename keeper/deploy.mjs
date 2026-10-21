// Deploys the Nitro pool contract and prepares it for trading. Safe to run again:
//  1. Deploys contract/target/near/nitro_vault.wasm and calls `new` (first time only).
//  2. Adds the keeper's limited key (KEEPER_SEED) that can only push prices and close positions.
//  3. Registers the contract on the USDC token so it can receive deposits.
// An existing Nitro contract is never overwritten unless ALLOW_UPGRADE=true.

import { readFileSync } from 'node:fs';
import { Account, actions, JsonRpcProvider } from 'near-api-js';
import { KEEPER_METHODS, keeperKeyPair } from './keys.mjs';

const env = (k, d) => (process.env[k] ? process.env[k] : d);
const CONTRACT = env('CONTRACT_ID', 'nitroonnear.near');
const KEY = env('NEAR_PRIVATE_KEY');
const OWNER = env('OWNER_ID', CONTRACT);
const SEED = env('KEEPER_SEED');
const USDC = env('USDC_CONTRACT', '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
const WASM = env('WASM_PATH', new URL('../contract/target/near/nitro_vault.wasm', import.meta.url).pathname);
const RPC = env('NEAR_RPC_URL', 'https://free.rpc.fastnear.com');
const UPGRADE = env('ALLOW_UPGRADE', 'false') === 'true';
const TGAS = 10n ** 12n;
const NEAR = 10n ** 24n;

if (!KEY) {
  console.error('Set NEAR_PRIVATE_KEY (a full access key of the contract account, "ed25519:...")');
  process.exit(1);
}

const provider = new JsonRpcProvider({ url: RPC });
const account = new Account(CONTRACT, provider, KEY);
const near = (y) => (Number(y / 10n ** 21n) / 1000).toFixed(3);

const state = await account.getState().catch((e) => {
  if (/fetch failed|ECONN|ETIMEDOUT/i.test(e.message)) console.error(`Could not reach the NEAR RPC (${RPC}): ${e.message}`);
  else console.error(`Account ${CONTRACT} not found on mainnet. Create it first. (${e.message})`);
  process.exit(1);
});
console.log(`Account ${CONTRACT}: ${near(state.balance.available)} NEAR available`);
if (state.balance.available < 3n * NEAR) console.warn('Warning: keep at least 3 NEAR on the contract account for storage.');

const initialized = await provider
  .callFunction({ contractId: CONTRACT, method: 'get_config', args: {} })
  .then(() => true)
  .catch(() => false);
const hasCode = state.codeHash && state.codeHash !== '11111111111111111111111111111111';

const list = [];
if (!initialized) {
  if (hasCode && !UPGRADE) {
    console.error('This account already has a different contract. Re-run with upgrade enabled to replace it.');
    process.exit(1);
  }
  console.log(`Deploying and initialising (owner ${OWNER}, oracle ${CONTRACT})`);
  list.push(actions.deployContract(readFileSync(WASM)));
  list.push(actions.functionCall('new', { owner: OWNER, usdc: USDC, oracle: CONTRACT }, 100n * TGAS, 0n));
} else if (UPGRADE) {
  console.log('Upgrading the contract code (state is kept)');
  list.push(actions.deployContract(readFileSync(WASM)));
} else {
  console.log('Contract already deployed and initialised; code left as is.');
}

let keeperPub = null;
if (SEED) {
  const kp = keeperKeyPair(SEED);
  keeperPub = kp.getPublicKey();
  const exists = await account.getAccessKey(keeperPub).then(() => true).catch(() => false);
  if (!exists) {
    console.log(`Adding keeper key ${keeperPub.toString()} (can only call ${KEEPER_METHODS.join(', ')})`);
    list.push(actions.addFunctionCallAccessKey(keeperPub, CONTRACT, KEEPER_METHODS));
  } else console.log('Keeper key already added.');
} else console.warn('KEEPER_SEED not set: no keeper key added. Prices will not update until a keeper runs.');

if (list.length) {
  const res = await account.signAndSendTransaction({ receiverId: CONTRACT, actions: list, waitUntil: 'FINAL' });
  console.log(`Transaction ${res.transaction?.hash ?? res.transaction_outcome?.id} done.`);
}

const reg = await provider.callFunction({ contractId: USDC, method: 'storage_balance_of', args: { account_id: CONTRACT } }).catch(() => null);
if (!reg) {
  console.log('Registering the contract on USDC');
  await account.callFunction({
    contractId: USDC,
    methodName: 'storage_deposit',
    args: { account_id: CONTRACT, registration_only: true },
    deposit: 1_250_000_000_000_000_000_000n,
    gas: 30n * TGAS,
  });
} else console.log('Already registered on USDC.');

const cfg = await provider.callFunction({ contractId: CONTRACT, method: 'get_config', args: {} });
const owner = await provider.callFunction({ contractId: CONTRACT, method: 'get_owner', args: {} });
console.log('\nDone. Nitro pool is live:');
console.log(`  contract   ${CONTRACT}`);
console.log(`  owner      ${owner}  (reviews withdrawals on the Admin page)`);
console.log(`  max lev    ${cfg.max_leverage}x, profit fee ${cfg.profit_fee_bps / 100}%`);
if (keeperPub) console.log(`  keeper key ${keeperPub.toString()}`);
console.log('Next: run the keeper with CONTRACT_ID and the same KEEPER_SEED.');
