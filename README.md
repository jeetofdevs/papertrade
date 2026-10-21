# Nitro — 1000x Perps on NEAR

<img src="public/logo.svg" width="72" alt="Nitro logo" />

**Nitro** is a papertrade.xyz-style perpetuals DEX for the NEAR ecosystem:

- Long or short **NEAR, BTC, ETH and SOL** with **1x–1000x** leverage
- **Zero fees**: no trading fees, no slippage, no funding
- A shared **USDC vault** is the counterparty to every trade; depositors receive nLP
- **Loss mining**: every 1 USDC lost mints 10 **$NITRO**
- Sign in with a NEAR wallet (Meteor, MyNearWallet, HERE) on **mainnet**
- Live prices from Binance's public feed, with an automatic simulated feed if it can't be reached

> **Status:** wallet sign-in runs on NEAR mainnet, but trading balances are still **demo funds**
> stored in the browser. Real-money trading needs a smart contract deployed to mainnet and audited.

## Run locally

```bash
npm install
npm run dev                  # dev server
npm test                     # trading engine tests
npm run build && npm start   # production build, open http://localhost:3000
```

## Deploy to Railway

1. In Railway: **New Project → Deploy from GitHub repo**, then pick this repo and branch.
2. Railway runs `npm install`, `npm run build`, then `npm start` automatically.
3. Open **Settings → Networking → Generate Domain** to get a public URL.

Optional variables (Settings → Variables), read at build time:

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_NEAR_NETWORK` | `mainnet` | `mainnet` or `testnet` |
| `VITE_CONTRACT_ID` | `nitroonnear.near` | The Nitro pool contract used by Live mode |
| `VITE_NEAR_RPC` | `https://free.rpc.fastnear.com` | NEAR RPC used for reads |
| `VITE_NIA_IMAGE` | _(empty)_ | Optional custom mascot illustration (for example `/nia.png` placed in `public/`) |

## Live mode (real USDC)

Switch the header toggle to **Live** to trade real USDC against the Nitro pool contract (default
`nitroonnear.near`, override with `VITE_CONTRACT_ID`).

- **Deposit:** 1 to 1,000 USDC per transaction (`min_deposit` / `max_deposit` in `set_config`). Enter an amount and press Deposit. The user signs one contract call from their NEAR wallet
  (`ft_transfer_call` on USDC) and the contract adds it to their trading balance.
- **Trade:** open and close call the contract directly with a slippage limit the trader picks (0.1–2%).
  The owner can also set a spread with `set_config`. Wallets that support it sign trades without a popup.
- **History:** every deposit, withdrawal, open and close is recorded per user in the contract (`get_ledger`)
  and shown on the Profile page together with lifetime totals.
- Until the contract is deployed, Live mode shows "launching soon".

## Nitro Pool (our own USDC pool on NEAR)

`contract/` is a NEAR smart contract that holds the pool. The contract account is the pool's deposit address,
and every user's balance is the sum of their transactions with it:

- **Deposit** (Profile → Nitro Pool account): the user signs one contract call (`ft_transfer_call`) from their
  NEAR wallet. The USDC moves to the pool wallet and the contract adds it to that user's balance immediately.
- Plain USDC transfers to the pool address are not part of the normal flow. As a safety net, the keeper still
  credits them to the sender (or the account in the memo), once each and never beyond unassigned USDC.
- The pool wallet is whatever account the contract is deployed to. Deploy it to your own NEAR account if you want
  deposits to land in that wallet; the contract still decides who owns which balance.
- Winners are paid from the vault, losers' wagers go to the vault (and earn NITRO). Each open position reserves
  its maximum payout. The owner can pause, tune limits and collect fees, but cannot move user balances.

Launch with small limits (`set_config`) until the contract has been audited. Oracle prices are pushed every
10 s, so a faster interval reduces how stale a close price can be.

**Deploy from GitHub (no local tools needed):**

1. Create the NEAR account `nitroonnear.near` and fund it with at least 3–5 NEAR (storage for the contract
   and every user's history).
2. GitHub → Settings → Secrets and variables → Actions → add:
   - `NEAR_PRIVATE_KEY`: a full access key of `nitroonnear.near` (`ed25519:...`, exported from your wallet)
   - `KEEPER_SEED`: any long random phrase (at least 16 characters). The keeper uses the same phrase.
3. GitHub → Actions → **Deploy NEAR contract** → Run workflow. The admin (owner) defaults to
   `nitroonnear.near`: sign in to the website with that wallet to see the **Admin** page. The owner can hand
   the role to another account later with `set_owner`.

The workflow tests and builds the contract, deploys and initialises it (first run only), adds a limited
keeper key that can only call `push_prices`, `run_keeper` and `credit_transfers`, and registers the
contract on USDC. Running it again is safe; an existing contract is only replaced when **upgrade** is ticked.

To deploy by hand instead: `cd contract && cargo near build non-reproducible-wasm`, then
`cd keeper && NEAR_PRIVATE_KEY=... KEEPER_SEED=... node deploy.mjs`.

**New-user bonus.** After depositing at least 2 USDC a user can claim a 3 USDC bonus once. Withdrawals stay
locked until their wagers (positions held 60 s or longer) reach 20x the bonus, 60 USDC; the bonus ends if the
balance runs out. Bonuses are paid from a promo budget the owner funds on the Admin page (USDC with msg
`"promo"`), so they never touch user balances or the vault. Amount, minimum deposit, multiple and hold time
are in `set_config`; set `promo_amount` to 0 to stop the promo.

The profile and the leaderboard only use real USDC stats from the contract (`get_users_stats`); demo trades
are never counted.

**NITRO points and $NITRO.** Every USDC lost on a real trade earns 10 NITRO points on chain (`get_account`,
total in `get_nitro`); demo trades never count. At token launch the owner sends $NITRO tokens to the contract
account and calls `set_nitro_conversion(token, tokens_per_point, true)` (`tokens_per_point` in token base units
per point; points have 6 decimals). Users then convert on the **$NITRO** page; failed transfers refund points.

**Withdrawals are reviewed.** Users request a withdrawal (the amount is locked and they can cancel); the
owner approves on the website's **Admin** page (USDC is sent) or rejects with a reason (the amount returns).

**Keeper** (`keeper/`, a second Railway service with root directory `keeper`, start command `npm start`):

| Variable | Notes |
| --- | --- |
| `CONTRACT_ID` | The pool contract (default `nitroonnear.near`) |
| `KEEPER_SEED` | Same phrase as the GitHub secret; the keeper signs with the limited key derived from it |
| `NEAR_RPC_URL` | Optional, default `https://free.rpc.fastnear.com` |
| `NEARBLOCKS_API_KEY` | Optional, raises NearBlocks rate limits for the deposit scan |
| `PRICE_INTERVAL_MS` / `DEPOSIT_INTERVAL_MS` | Optional, default 10000 / 20000 |

The keeper pushes prices (Binance, then Binance US, then Coinbase), closes positions past max loss or take
profit, scans NearBlocks for plain transfers to the pool, and serves `GET /health` and `POST /claim`
(`{ txHash, accountId }`). Set its public URL as `VITE_KEEPER_URL`.

## Auto deploy with GitHub Actions

`.github/workflows/railway.yml` deploys to Railway on every push, even if Railway's own auto-deploy is off.
Add two repository secrets (GitHub → Settings → Secrets and variables → Actions):

- `RAILWAY_TOKEN`: Railway → project → Settings → Tokens → new project token
- `RAILWAY_SERVICE_ID`: Railway → service → Settings → Service ID

## Project layout

- `src/lib/engine.ts`: trading rules (positions, PnL, liquidation, vault, NITRO), unit tested
- `src/lib/prices.ts`: live/simulated price feed
- `src/lib/wallet.tsx`: NEAR wallet connection
- `src/pages/`: Trade, Vault, Leaderboard, $NITRO
- `src/lib/pool.ts`, `src/components/PoolAccountCard.tsx`: Nitro Pool reads, deposit and withdraw
- `contract/`: Nitro Pool smart contract (Rust, `cargo test`)
- `keeper/`: oracle, keeper and deposit indexer (`npm test` inside `keeper/`)
- `server.js`: dependency-free static server for Railway
