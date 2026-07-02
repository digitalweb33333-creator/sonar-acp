// Offering catalog: prices, discovery-optimized descriptions, strict input/output schemas.
// Descriptions are written as dense answers to what a buyer agent would actually type
// ("token price", "current gas price Base Solana Arbitrum BNB", "liquidity check") —
// this is the #1 lever for semantic ranking in the ACP registry.

export const AGENT = {
  name: "Sonar — Multichain Market Data & Gas Oracle",
  slug: "sonar",
  description:
    "Real-time multichain market data and gas oracle for AI agents. Get token price, liquidity, 24h volume, FDV, pair age, holder concentration, and current gas price across Base, Solana, Arbitrum, and BNB Chain in one fast call. Reliable pre-trade data with redundant RPC fallback (public Base/Arbitrum RPCs frequently 403 — Sonar races a pool so you always get an answer), every response timestamped with freshness_seconds. Built for the loop every agent runs before it acts: check price, check gas, check liquidity. Free gas+price resource included; watchlists and threshold alerts via ACP Accounts and Notification Memos.",
  tags: ["market-data", "price", "gas", "liquidity", "multichain", "oracle", "pre-trade", "base", "solana"],
};

export const OFFERINGS_META = [
  {
    name: "token_snapshot",
    price: 0.02,
    description:
      "Token price, liquidity, 24h volume, FDV, market cap, and pair age for any token on Base, Solana, Arbitrum, or BNB. Chain auto-detected from the address. DexScreener primary with CoinGecko fallback. Use this before quoting, routing, or trading a token. Answers: what is this token's price, how much liquidity, how old is the pair, is it liquid enough to trade.",
    input: {
      type: "object",
      required: ["address"],
      properties: {
        address: { type: "string", description: "Token contract address. EVM (0x…) or Solana base58, e.g. '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'." },
        chain: { type: "string", enum: ["base", "solana", "arbitrum", "bnb", "ethereum"], description: "Optional chain hint. Omit to auto-detect." },
      },
    },
    output_example: {
      found: true, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", timestamp: "2026-07-02T18:00:00Z",
      freshness_seconds: 1, sources: ["dexscreener"], chain: "base", price_usd: 1.0001, price_change_24h_pct: 0.01,
      liquidity_usd: 5231000, volume_24h_usd: 18400000, fdv_usd: null, pair_age_hours: 8200, dex: "aerodrome",
    },
  },
  {
    name: "gas_now",
    price: 0.01,
    description:
      "Current gas price across Base, Ethereum, Arbitrum, BNB (gwei) and Solana (base + priority fee) in one call. Redundant RPC fallback: individual public RPCs 403 or rate-limit, Sonar races a pool and reports which endpoint answered. Pass a `chain` for one network or omit for all. Answers: what is the current gas price on Base / Solana / Arbitrum / BNB right now, is gas cheap enough to execute.",
    input: {
      type: "object",
      properties: {
        chain: { type: "string", enum: ["base", "ethereum", "arbitrum", "bnb", "solana"], description: "Optional. Omit to get every supported chain at once." },
      },
    },
    output_example: {
      timestamp: "2026-07-02T18:00:00Z", freshness_seconds: 1, sources: ["rpc"], multichain: true, coverage: "5/5",
      gas: { base: { ok: true, gasPriceGwei: 0.006, rpcUsed: "https://base-rpc.publicnode.com", rpcsTried: 1 } },
    },
  },
  {
    name: "token_holders",
    price: 0.02,
    description:
      "Holder count and top-holder concentration for a token (via Blockscout, keyless). Shows whale concentration risk before you buy. Degrades cleanly with a `coverage` field when an explorer is unavailable. Answers: how many holders, how concentrated is supply, is this token whale-dominated.",
    input: {
      type: "object", required: ["address", "chain"],
      properties: {
        address: { type: "string", description: "Token contract address, e.g. '0x...' on Base." },
        chain: { type: "string", enum: ["base", "ethereum", "arbitrum", "bnb"], description: "Chain of the token (Blockscout-supported EVM chains)." },
      },
    },
    output_example: {
      address: "0x...", timestamp: "2026-07-02T18:00:00Z", freshness_seconds: 3, sources: ["blockscout"],
      chain: "base", holdersCount: 12873, top10ConcentrationPct: 41.2, coverage: "full",
    },
  },
  {
    name: "market_pulse",
    price: 0.03,
    description:
      "One-call composite snapshot: token price + liquidity + volume, current gas on its chain, and chain TVL (DeFiLlama). Everything an agent needs to decide whether and how to trade a token, in a single request. The recommended default call. Answers: give me the full pre-trade picture for this token — price, liquidity, gas cost, chain health.",
    input: {
      type: "object", required: ["address"],
      properties: {
        address: { type: "string", description: "Token contract address (EVM or Solana)." },
        chain: { type: "string", enum: ["base", "solana", "arbitrum", "bnb", "ethereum"], description: "Optional chain hint; auto-detected otherwise." },
      },
    },
    output_example: {
      address: "0x...", timestamp: "2026-07-02T18:00:00Z", freshness_seconds: 1, sources: ["dexscreener", "rpc", "defillama"],
      chain: "base", token: { price_usd: 1.0001, liquidity_usd: 5231000, volume_24h_usd: 18400000 },
      gas: { ok: true, gasPriceGwei: 0.006 }, chain_tvl_usd: 3120000000,
    },
  },
  {
    name: "watchlist_set",
    price: 0.02,
    description:
      "Register the tokens and chains you track. Sonar stores your list (ACP Accounts) and snapshots baseline prices so future calls return personalized deltas ('since you added it: +12%'). Set alert thresholds here to receive Notification Memos when price or gas crosses them. Answers: remember these tokens for me and watch them.",
    input: {
      type: "object", required: ["items"],
      properties: {
        items: {
          type: "array", description: "Tokens to watch.",
          items: { type: "object", required: ["address", "chain"], properties: {
            address: { type: "string", description: "Token address." },
            chain: { type: "string", enum: ["base", "solana", "arbitrum", "bnb", "ethereum"], description: "Chain." },
          } },
        },
        alerts: { type: "object", description: "Optional thresholds, e.g. { price_move_pct: 10, base_gas_below_gwei: 0.01 }." },
      },
    },
    output_example: { ok: true, watchlist_size: 2, items: [{ address: "0x...", chain: "base", baseline_price_usd: 1.0 }], timestamp: "2026-07-02T18:00:00Z" },
  },
  {
    name: "watchlist_status",
    price: 0.01,
    description:
      "Get your watched tokens with current price and the change since you added each one. Personalized to your ACP account. Answers: how are my watched tokens doing since last time.",
    input: { type: "object", properties: {} },
    output_example: {
      buyer: "0x...", watchlist_size: 2, personalized: true, timestamp: "2026-07-02T18:00:00Z",
      items: [{ address: "0x...", chain: "base", price_usd: 1.12, since_added_pct: 12.0 }],
    },
  },
];

export const RESOURCE_META = {
  name: "sonar_pulse",
  free: true,
  description:
    "Free read-only pulse: current Base gas (gwei) and ETH/SOL/BNB prices. No payment required. The default reflex ping for any agent — upgrade to token_snapshot / market_pulse for full multichain token data.",
  path: "/resource/pulse",
};
