import { cached } from "./lib/cache.js";
import { getChain, CHAINS } from "./lib/chains.js";
import { dexScreenerToken } from "./sources/dexscreener.js";
import { nativePrices, tokenPriceByContract } from "./sources/coingecko.js";
import { evmGas, solanaFee, gasAll } from "./sources/rpcgas.js";
import { chainTvl } from "./sources/defillama.js";
import { tokenHolders } from "./sources/holders.js";
import { getRecord, setRecord } from "./lib/store.js";

const now = () => new Date().toISOString();
function stamp(extra, sources, freshnessSeconds) {
  return { timestamp: now(), freshness_seconds: Math.max(0, Math.round(freshnessSeconds)), sources, ...extra };
}
class InputError extends Error { constructor(m) { super(m); this.code = 400; } }
export { InputError };

const isAddr = (a) => typeof a === "string" && /^(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(a);

// ---- 1) token_snapshot ($0.02) ----
export async function token_snapshot(input = {}) {
  const { address, chain } = input;
  if (!isAddr(address)) throw new InputError("`address` must be a valid EVM (0x…) or Solana token address");
  const { value, ageMs, cached: isCached } = await cached(`snap:${address}`, 30_000, async () => {
    const ds = await dexScreenerToken(address);
    if (ds.ok) return { via: "dexscreener", ds };
    // fallback: try coingecko by contract across evm chains (or the hinted chain)
    const chainsToTry = chain ? [getChain(chain)?.key].filter(Boolean) : ["base", "ethereum", "arbitrum", "bnb"];
    for (const ck of chainsToTry) {
      const cg = await tokenPriceByContract(ck, address);
      if (cg.ok) return { via: "coingecko", chain: ck, cg };
    }
    return { via: null };
  });

  if (!value.via) {
    return { found: false, ...stamp({ address, note: "No DEX pair or price feed found for this address on supported chains." }, ["dexscreener", "coingecko"], ageMs / 1000) };
  }
  if (value.via === "dexscreener") {
    const d = value.ds.data;
    return {
      found: true,
      address,
      ...stamp({
        chain: d.chain, price_usd: d.priceUsd, price_change_24h_pct: d.priceChange24hPct,
        liquidity_usd: d.liquidityUsd, volume_24h_usd: d.volume24hUsd, fdv_usd: d.fdvUsd,
        market_cap_usd: d.marketCapUsd, pair_age_hours: d.pairAgeHours, dex: d.dexId,
        base_token: d.baseToken, quote_token: d.quoteToken, pairs_count: d.pairsCount,
      }, ["dexscreener"], isCached ? ageMs / 1000 : value.ds.latencyMs / 1000),
    };
  }
  const c = value.cg.data;
  return {
    found: true, address,
    ...stamp({ chain: value.cg.chain, price_usd: c.priceUsd, price_change_24h_pct: c.priceChange24hPct, liquidity_usd: null, note: "Price from CoinGecko fallback; DEX pair not indexed." }, ["coingecko"], ageMs / 1000),
  };
}

// ---- 2) gas_now ($0.01) ----
export async function gas_now(input = {}) {
  const { chain } = input;
  if (chain) {
    const c = getChain(chain);
    if (!c) throw new InputError(`Unknown chain '${chain}'. Supported: ${Object.keys(CHAINS).join(", ")}`);
    const { value, ageMs, cached: isCached } = await cached(`gas:${c.key}`, 15_000, async () =>
      c.evm ? evmGas(c.key) : solanaFee()
    );
    return { ...stamp({ chain: c.key, gas: value }, ["rpc"], isCached ? ageMs / 1000 : 1) };
  }
  const { value, ageMs } = await cached("gas:all", 15_000, async () => gasAll());
  return { ...stamp({ multichain: true, coverage: value.coverage, gas: value.chains }, ["rpc"], ageMs / 1000) };
}

// ---- 3) token_holders ($0.02) ----
export async function token_holders(input = {}) {
  const { address, chain } = input;
  if (!isAddr(address)) throw new InputError("`address` must be a valid token address");
  const c = getChain(chain);
  if (!c) throw new InputError(`\`chain\` is required. Supported: ${Object.keys(CHAINS).join(", ")}`);
  const { value, ageMs } = await cached(`holders:${c.key}:${address}`, 60_000, async () => tokenHolders(c.key, address));
  return { address, ...stamp({ chain: c.key, ...value }, ["blockscout"], ageMs / 1000) };
}

// ---- 4) market_pulse ($0.03) — composite best-seller ----
export async function market_pulse(input = {}) {
  const { address, chain } = input;
  if (!isAddr(address)) throw new InputError("`address` must be a valid token address");
  const [snap, gasChainKey] = [await token_snapshot({ address, chain }), getChain(chain)?.key];
  const resolvedChain = getChain(snap.chain)?.key || gasChainKey || "base";
  const [gasRes, tvlRes] = await Promise.all([
    gas_now({ chain: resolvedChain }).catch(() => null),
    chainTvl(resolvedChain).catch(() => null),
  ]);
  return {
    address,
    ...stamp({
      chain: resolvedChain,
      token: snap.found ? {
        price_usd: snap.price_usd, price_change_24h_pct: snap.price_change_24h_pct,
        liquidity_usd: snap.liquidity_usd, volume_24h_usd: snap.volume_24h_usd,
        fdv_usd: snap.fdv_usd, pair_age_hours: snap.pair_age_hours,
      } : { found: false },
      gas: gasRes ? gasRes.gas : null,
      chain_tvl_usd: tvlRes && tvlRes.ok ? tvlRes.data.tvlUsd : null,
    }, ["dexscreener", "rpc", "defillama"], snap.freshness_seconds || 1),
  };
}

// ---- 5) watchlist (Accounts primitive) ----
export async function watchlist_set(input = {}, ctx = {}) {
  const buyer = ctx.buyer || input.buyer;
  if (!buyer) throw new InputError("buyer identity required (ACP provides it automatically)");
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw new InputError("`items` must be a non-empty array of { address, chain }");
  for (const it of items) {
    if (!isAddr(it.address)) throw new InputError(`invalid address in items: ${it.address}`);
    if (!getChain(it.chain)) throw new InputError(`invalid chain in items: ${it.chain}`);
  }
  // snapshot current prices to enable "since last time" deltas later
  const withBaseline = [];
  for (const it of items) {
    let price = null;
    try { const s = await token_snapshot({ address: it.address, chain: it.chain }); price = s.found ? s.price_usd : null; } catch {}
    withBaseline.push({ address: it.address, chain: getChain(it.chain).key, baseline_price_usd: price, added_at: now() });
  }
  const existing = getRecord("watchlist", buyer) || { items: [], alerts: input.alerts || {} };
  const merged = mergeItems(existing.items, withBaseline);
  const rec = setRecord("watchlist", buyer, { items: merged, alerts: input.alerts || existing.alerts || {} });
  return { ...stamp({ ok: true, buyer, watchlist_size: rec.items.length, items: rec.items, alerts: rec.alerts }, ["store"], 0) };
}

export async function watchlist_status(input = {}, ctx = {}) {
  const buyer = ctx.buyer || input.buyer;
  if (!buyer) throw new InputError("buyer identity required");
  const rec = getRecord("watchlist", buyer);
  if (!rec || !rec.items.length) return { ...stamp({ buyer, watchlist_size: 0, items: [], note: "No watchlist yet. Call watchlist_set first." }, ["store"], 0) };
  const out = [];
  for (const it of rec.items) {
    let cur = null;
    try { const s = await token_snapshot({ address: it.address, chain: it.chain }); cur = s.found ? s.price_usd : null; } catch {}
    const change = it.baseline_price_usd && cur ? +(((cur - it.baseline_price_usd) / it.baseline_price_usd) * 100).toFixed(2) : null;
    out.push({ address: it.address, chain: it.chain, price_usd: cur, since_added_pct: change, baseline_price_usd: it.baseline_price_usd });
  }
  return { ...stamp({ buyer, watchlist_size: out.length, items: out, personalized: true }, ["dexscreener", "store"], 1) };
}

function mergeItems(oldItems, newItems) {
  const map = new Map(oldItems.map((i) => [`${i.chain}:${i.address.toLowerCase()}`, i]));
  for (const n of newItems) map.set(`${n.chain}:${n.address.toLowerCase()}`, n);
  return [...map.values()].slice(0, 50);
}

// ---- Free Resource (read-only, unpaid) ----
export async function resource_pulse() {
  const [gasBase, prices] = await Promise.all([
    evmGas("base").catch(() => null),
    nativePrices(["ethereum", "solana", "binancecoin"]).catch(() => null),
  ]);
  return stamp({
    free: true,
    base_gas_gwei: gasBase && gasBase.ok ? gasBase.gasPriceGwei : null,
    native_prices_usd: prices && prices.ok ? {
      ETH: prices.data.ethereum?.usd, SOL: prices.data.solana?.usd, BNB: prices.data.binancecoin?.usd,
    } : null,
    upgrade_hint: "Paid offerings: token_snapshot, gas_now (multichain), token_holders, market_pulse, watchlist.",
  }, ["rpc", "coingecko"], 1);
}

export const OFFERINGS = { token_snapshot, gas_now, token_holders, market_pulse, watchlist_set, watchlist_status };
