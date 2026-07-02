import { fetchJson } from "../lib/http.js";

// DeFiLlama chain TVL. Keyless. Used by market_pulse for macro chain context.
let chainsCache = null, chainsCacheAt = 0;

export async function chainTvl(chainKey) {
  const NAME = { base: "Base", ethereum: "Ethereum", arbitrum: "Arbitrum", bnb: "BSC", solana: "Solana" };
  const wanted = NAME[chainKey];
  if (!wanted) return { ok: false, source: "defillama" };
  if (!chainsCache || Date.now() - chainsCacheAt > 60_000) {
    const r = await fetchJson("https://api.llama.fi/v2/chains", { timeoutMs: 4000, retries: 1 });
    if (!r.ok || !Array.isArray(r.json)) return { ok: false, source: "defillama", latencyMs: r.latencyMs };
    chainsCache = r.json; chainsCacheAt = Date.now();
  }
  const row = chainsCache.find((c) => c.name === wanted || c.tokenSymbol === wanted);
  if (!row) return { ok: false, source: "defillama" };
  return { ok: true, source: "defillama", data: { chain: wanted, tvlUsd: Math.round(row.tvl), chainId: row.chainId ?? null } };
}
