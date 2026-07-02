// Live smoke test against real upstreams (run manually: node scripts/smoke.js).
import { token_snapshot, gas_now, token_holders, market_pulse, watchlist_set, watchlist_status, resource_pulse } from "../src/offerings.js";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BUYER = "0xTESTBUYER000000000000000000000000000001";

function show(label, obj) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(obj, null, 2).slice(0, 900));
}

const t = (label, p) => p.then((r) => show(label, r)).catch((e) => console.log(`\n=== ${label} ERROR: ${e.message}`));

console.log("SONAR live smoke test — hitting real public APIs (0$).");
await t("resource_pulse (free)", resource_pulse());
await t("gas_now (all chains)", gas_now({}));
await t("token_snapshot USDC/base", token_snapshot({ address: USDC_BASE }));
await t("token_holders USDC/base", token_holders({ address: USDC_BASE, chain: "base" }));
await t("market_pulse USDC/base", market_pulse({ address: USDC_BASE }));
await t("watchlist_set", watchlist_set({ items: [{ address: USDC_BASE, chain: "base" }], alerts: { price_move_pct: 5 } }, { buyer: BUYER }));
await t("watchlist_status", watchlist_status({}, { buyer: BUYER }));
console.log("\nSmoke test complete.");
