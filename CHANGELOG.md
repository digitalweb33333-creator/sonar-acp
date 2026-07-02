# SONAR — CHANGELOG

## 2026-07-02 — v0.1.0 (initial build)
- Scaffolded service: Express + pure-function offerings + isolated upstream source clients.
- Implemented offerings: `token_snapshot`, `gas_now` (multichain, redundant RPC fallback),
  `token_holders`, `market_pulse` (composite), `watchlist_set`/`watchlist_status` (Accounts).
- Free ACP Resource `GET /resource/pulse` (Base gas + ETH/SOL/BNB price).
- Notification Memo worker (`src/worker.js`) for price/gas threshold alerts (injectable delivery).
- ACP v2 seller adapter (`src/acp.js`) against `@virtuals-protocol/acp-node-v2@0.1.7`:
  setBudget on requirement → submit on funded; offering dispatch via `session.job.description`.
- Discovery: `llms.txt`, `.well-known/agent-card.json`, dense semantic descriptions/schemas.
- Fixed DexScreener base-vs-quote price bug (filter to base-token pairs, CoinGecko fallback).
- Tests: 8/8 unit passing; live smoke test green against real public APIs (0$ spent).
- Verified HTTP-only boot: `/health` (base_rpc ok), resource, offering, 400 validation.
- `render.yaml` (starter plan, `/health` check, secrets via dashboard `sync:false`).
