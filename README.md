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
| `VITE_CONTRACT_ID` | _(empty)_ | NEAR contract account used for wallet sign-in |
| `VITE_ORDERLY_BROKER_ID` | _(empty)_ | Your Orderly broker (builder) ID. Live mode stays off until it is set |
| `VITE_NIA_IMAGE` | _(empty)_ | Optional custom mascot illustration (for example `/nia.png` placed in `public/`) |
| `VITE_ORDERLY_NETWORK` | `mainnet` | Orderly network for Live mode. Leave unset for real trading on mainnet |

## Live mode (Orderly Network)

Switch the header toggle to **Live** to trade real USDC on Orderly Network's shared order book. There is no
Nitro pool behind Live trades.

1. Register as an Orderly builder to get a broker ID (Orderly docs → Broker onboarding) and set
   `VITE_ORDERLY_BROKER_ID`. Your fee rates are configured on Orderly's side for that broker.
2. Traders connect an EVM wallet (MetaMask, Rabby…), create their Orderly account (one gasless signature) and
   enable trading. That creates an Orderly trading key in the browser that can trade but never withdraw.
3. Deposits go from the wallet's chain (for example Arbitrum) into Orderly from the **Deposit USDC** button.
4. Orders are isolated-margin market orders, so the margin is the most a trader can lose, with an optional
   take profit. Max leverage follows each Orderly market.


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
- `server.js`: dependency-free static server for Railway
