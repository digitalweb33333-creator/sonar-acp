# Sonar — Multichain Market Data & Gas Oracle (Virtuals ACP)

Real-time token price, liquidity, volume, FDV, holder concentration, and **current gas** across
**Base, Solana, Arbitrum, BNB** — one fast, timestamped call. Built for the loop every AI agent
runs before it acts. **Reliability is the product:** redundant public-RPC fallback (public Base/
Arbitrum RPCs frequently 403 — Sonar races a pool), every response carries `freshness_seconds`.

## Offerings
| Offering | Price | What |
|---|---|---|
| `token_snapshot` | $0.02 | price, liquidity, 24h vol, FDV, pair age (DexScreener + CoinGecko fallback) |
| `gas_now` | $0.01 | gas across Base/ETH/Arbitrum/BNB (gwei) + Solana, RPC fallback |
| `token_holders` | $0.02 | holder count + top-holder concentration (Blockscout) |
| `market_pulse` | $0.03 | composite: price + liquidity + gas + chain TVL (the default call) |
| `watchlist_set` / `watchlist_status` | $0.02 / $0.01 | ACP Accounts — personalized deltas + alerts |
| **Free resource** | $0 | `GET /resource/pulse` — Base gas + ETH/SOL/BNB price |

## Run locally
```bash
npm install
npm start                 # HTTP-only mode if no ACP keys (offerings at POST /offering/:name)
npm test                  # unit tests
node scripts/smoke.js     # live smoke test against real public APIs (0$)
```

## Architecture
- `src/offerings.js` — pure offering functions (reused by the ACP job handler AND the HTTP layer).
- `src/sources/*` — upstream clients (dexscreener, coingecko, defillama, rpcgas, holders) with timeout+retry+fallback.
- `src/lib/*` — http, TTL cache, per-buyer store (Accounts), chain registry + RPC pools.
- `src/server.js` — Express: `/health`, free resource, `POST /offering/:name`, discovery assets.
- `src/acp.js` — ACP v2 seller adapter (`@virtuals-protocol/acp-node-v2`), **activated only when env keys present**.
- `src/worker.js` — Notification Memo worker (price/gas threshold alerts).

## Env
Copy `.env.example` → `.env`. The service runs fully in HTTP-only mode without keys. ACP wiring
needs `WHITELISTED_WALLET_PRIVATE_KEY`, `SELLER_ENTITY_ID`, `SELLER_AGENT_WALLET_ADDRESS`
(see `../HUMAIN-ACTIONS.md`). **Never commit `.env`.**

## Deploy
`render.yaml` → Render web service, `/health` check, `plan: starter` to avoid cold starts
(keeps `MINS_FROM_LAST_ONLINE` at 0 so Butler keeps routing to us).

Data is informational, aggregated from public sources (DexScreener, CoinGecko, DeFiLlama, public RPCs, Blockscout).
