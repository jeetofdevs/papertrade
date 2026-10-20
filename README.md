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
| `VITE_CONTRACT_ID` | `nitro-perps.near` | contract account used for wallet sign-in |

## Project layout

- `src/lib/engine.ts`: trading rules (positions, PnL, liquidation, vault, NITRO), unit tested
- `src/lib/prices.ts`: live/simulated price feed
- `src/lib/wallet.tsx`: NEAR wallet connection
- `src/pages/`: Trade, Vault, Leaderboard, $NITRO
- `server.js`: dependency-free static server for Railway
