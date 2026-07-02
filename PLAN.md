# SONAR — PLAN (long-term memory across sessions)

## Goal
Maximum ACP job VOLUME = frequency × buyers × recurrence. Sonar targets the highest-frequency
loop on the network: **every agent reads price/gas/liquidity before it acts.** Win on reliability +
multichain + freshness + retention (Accounts/Memos/Resources), priced at the market floor ($0.01–0.03).
Evidence: `ANALYSE-VIRTUALS-VOLUME-2026-07-02.md` (§3 clone-fleet 57k jobs @ $0.01–0.04; §4).

## Architecture (decided)
- Offerings are **pure functions** (`src/offerings.js`) reused by both the ACP job handler and the
  HTTP layer → one code path, testable without the SDK.
- Upstream clients isolated per source with timeout+retry; gas uses a **redundant RPC pool**
  (the differentiator — public Base/Arbitrum RPCs 403 individually).
- Per-buyer state (`src/lib/store.js`) backs the ACP **Accounts** primitive (watchlists/policies).
- ACP adapter (`src/acp.js`) is **guarded on env** so the service deploys and serves the free
  Resource + health even before keys/registration exist.

## Current state (2026-07-02)
- ✅ All offerings built + unit-tested (8/8) + live-smoke-tested against real APIs (0$ spent).
- ✅ HTTP server verified: `/health`, `/resource/pulse`, `POST /offering/:name`, 400 on bad input.
- ✅ Discovery assets: `llms.txt`, `agent-card.json`, dense semantic descriptions.
- ✅ ACP v2 seller adapter written against real `acp-node-v2@0.1.7` types (setBudget→submit lifecycle).
- ⏳ ACP registration + sandbox + graduation → **needs keys + web app actions** (see HUMAIN-ACTIONS.md).

## Remaining tasks
1. Human: register seller on app.virtuals.io, create offerings with our schemas, add signer, fund.
2. Provide `.env` keys → the process auto-boots ACP mode + memo worker.
3. Run 10 sandbox jobs (varying offerings), verify deliverables, request graduation.
4. Post-graduation: register on Bazaar/x402scan/Onyx; wire ERC-8004 reputation.

## Failed approaches / gotchas (don't repeat)
- **DexScreener price bug:** `/tokens/{addr}` returns pairs where `priceUsd` is the *base token's*
  price. Querying a token that is only ever a *quote* asset (e.g. USDC) surfaced AERO/USDC and
  returned AERO's price. Fix: filter to pairs where `baseToken.address == queried address`, else
  fall back to CoinGecko. (Fixed in `sources/dexscreener.js`.)
- **Node/PATH on this machine:** `npm` on PATH is Windows npm; the real runtime is nvm node v24 at
  `/home/joachim/.nvm/versions/node/v24.18.0/bin`. Run with that on PATH. Login shells spam
  harmless `export: not a valid identifier` from Windows-interop PATH entries with spaces — ignore.
- **`isOnline`/`minsFromLastOnline` from the registry are non-discriminating** (all "online"); job
  count is the only reliable vitality metric (informs why we keep the process warm on Render starter).
- ACP v2 SDK is **beta and low-level** (on-chain client + event stream). Offerings/prices/resources
  are declared on the **web Service Registry**, not via SDK — that's the human step.
