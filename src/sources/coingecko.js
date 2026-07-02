import { fetchJson } from "../lib/http.js";

const KEY = process.env.COINGECKO_API_KEY || "";
const BASE = KEY ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
const headers = KEY ? { "x-cg-pro-api-key": KEY } : {};

// Native coin prices (ETH/SOL/BNB/XRP) for the free Resource and fallbacks.
export async function nativePrices(ids = ["ethereum", "solana", "binancecoin", "ripple"]) {
  const r = await fetchJson(
    `${BASE}/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_last_updated_at=true`,
    { timeoutMs: 4000, retries: 2, headers }
  );
  if (!r.ok || !r.json) return { ok: false, source: "coingecko", latencyMs: r.latencyMs };
  return { ok: true, source: "coingecko", latencyMs: r.latencyMs, data: r.json };
}

// Fallback token price by contract on a given platform id (e.g. base, ethereum, solana...).
const CG_PLATFORM = { base: "base", ethereum: "ethereum", arbitrum: "arbitrum-one", bnb: "binance-smart-chain" };
export async function tokenPriceByContract(chainKey, address) {
  const platform = CG_PLATFORM[chainKey];
  if (!platform) return { ok: false, source: "coingecko" };
  const r = await fetchJson(
    `${BASE}/simple/token_price/${platform}?contract_addresses=${address}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`,
    { timeoutMs: 4000, retries: 1, headers }
  );
  if (!r.ok || !r.json) return { ok: false, source: "coingecko", latencyMs: r.latencyMs };
  const entry = r.json[String(address).toLowerCase()];
  if (!entry) return { ok: false, source: "coingecko", latencyMs: r.latencyMs };
  return {
    ok: true, source: "coingecko", latencyMs: r.latencyMs,
    data: { priceUsd: entry.usd, priceChange24hPct: entry.usd_24h_change ?? null, updatedAt: entry.last_updated_at ?? null },
  };
}
