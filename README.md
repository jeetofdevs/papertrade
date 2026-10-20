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
| `VITE_HL_NETWORK` | `mainnet` | Hyperliquid network for Live mode: `mainnet` or `testnet` |
| `VITE_HL_BUILDER` | _(empty)_ | Your EVM address that earns the builder fee on Live trades |
| `VITE_HL_BUILDER_FEE` | `0` | Builder fee in tenths of a basis point (`50` = 0.05%, max `100` = 0.1%) |

## Live mode (Hyperliquid)

Switch the header toggle to **Live** to trade real USDC on Hyperliquid's order book. There is no Nitro pool
behind Live trades, so Nitro carries no counterparty risk.

1. The trader connects an EVM wallet (MetaMask, Rabby…) that holds USDC on Hyperliquid.
2. **Enable trading** asks for one-time signatures: the builder fee (only if `VITE_HL_BUILDER` is set) and a
   trading key ("agent") that is stored in the browser. The agent can place and cancel orders but can never
   withdraw funds.
3. Orders are isolated-margin IOC orders at the mid price ± 1%, so the margin is the most a trader can lose.
   An optional take profit is placed as a reduce-only trigger order.

To earn fees, set `VITE_HL_BUILDER` to your address and `VITE_HL_BUILDER_FEE`. Hyperliquid requires the
builder address to hold at least 100 USDC in its perps account. Max leverage follows each Hyperliquid market
(for example 10x on NEAR), not the 1000x of demo mode. Try `VITE_HL_NETWORK=testnet` first.

## Project layout

- `src/lib/engine.ts`: trading rules (positions, PnL, liquidation, vault, NITRO), unit tested
- `src/lib/prices.ts`: live/simulated price feed
- `src/lib/wallet.tsx`: NEAR wallet connection
- `src/pages/`: Trade, Vault, Leaderboard, $NITRO
- `server.js`: dependency-free static server for Railway
