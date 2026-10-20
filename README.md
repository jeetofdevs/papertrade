# Kami — Perps 1000x di NEAR

<img src="public/logo.svg" width="72" alt="Logo Kami" />

**Kami** (紙, "kertas" dalam bahasa Jepang) adalah DEX perpetual ala papertrade.xyz untuk ekosistem NEAR:

- Long/short **NEAR, BTC, ETH, SOL** dengan leverage **1x–1000x**
- **Tanpa biaya**: tanpa fee, slippage, maupun funding
- **Vault USDC** jadi lawan semua trade; penyetor dapat token kLP
- **Rugi jadi KAMI**: setiap 1 USDC kerugian mencetak 10 KAMI
- Login dengan wallet NEAR (Meteor, MyNearWallet, HERE) di **mainnet**
- Harga live dari feed publik Binance (otomatis pakai simulasi kalau feed tidak bisa diakses)

> **Status:** login wallet sudah di NEAR mainnet, tetapi saldo trading masih **saldo demo** yang
> disimpan di browser. Trading dengan uang asli butuh smart contract yang di-deploy ke mainnet dan diaudit.

## Jalankan lokal

```bash
npm install
npm run dev        # mode pengembangan
npm test           # tes mesin trading
npm run build && npm start   # build produksi, buka http://localhost:3000
```

## Deploy ke Railway

1. Di Railway: **New Project → Deploy from GitHub repo** → pilih repo ini dan branch-nya.
2. Railway otomatis menjalankan `npm install`, `npm run build`, lalu `npm start`.
3. Buka **Settings → Networking → Generate Domain** untuk dapat URL publik.

Variabel opsional (Settings → Variables), dibaca saat build:

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `VITE_NEAR_NETWORK` | `mainnet` | `mainnet` atau `testnet` |
| `VITE_CONTRACT_ID` | `kami-perps.near` | akun kontrak untuk login wallet |

## Struktur

- `src/lib/engine.ts`: aturan trading (posisi, PnL, likuidasi, vault, KAMI), sudah diuji
- `src/lib/prices.ts`: feed harga live/simulasi
- `src/lib/wallet.tsx`: koneksi wallet NEAR
- `src/pages/`: Trade, Vault, Peringkat, $KAMI
- `server.js`: server statis untuk Railway (tanpa dependensi)
