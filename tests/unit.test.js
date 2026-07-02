import { test } from "node:test";
import assert from "node:assert/strict";
import { getChain, CHAINS } from "../src/lib/chains.js";
import { cached, cacheGet } from "../src/lib/cache.js";
import { token_snapshot, gas_now, token_holders, watchlist_status, InputError } from "../src/offerings.js";
import { computeDueAlerts } from "../src/worker.js";

test("chain aliases resolve", () => {
  assert.equal(getChain("base").chainId, 8453);
  assert.equal(getChain("bsc").key, "bnb");
  assert.equal(getChain("arb").key, "arbitrum");
  assert.equal(getChain("sol").key, "solana");
  assert.equal(getChain("nope"), null);
});

test("token_snapshot rejects bad address", async () => {
  await assert.rejects(() => token_snapshot({ address: "not-an-address" }), (e) => e instanceof InputError && e.code === 400);
  await assert.rejects(() => token_snapshot({}), InputError);
});

test("gas_now rejects unknown chain", async () => {
  await assert.rejects(() => gas_now({ chain: "dogechain" }), InputError);
});

test("token_holders requires chain", async () => {
  await assert.rejects(() => token_holders({ address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }), InputError);
});

test("watchlist_status requires buyer identity", async () => {
  await assert.rejects(() => watchlist_status({}, {}), InputError);
});

test("cache returns cached flag and stable value", async () => {
  let calls = 0;
  const producer = async () => { calls++; return { n: calls }; };
  const a = await cached("t:1", 1000, producer);
  const b = await cached("t:1", 1000, producer);
  assert.equal(a.cached, false);
  assert.equal(b.cached, true);
  assert.deepEqual(a.value, b.value);
  assert.ok(cacheGet("t:1"));
});

test("computeDueAlerts runs with empty store", async () => {
  const due = await computeDueAlerts();
  assert.ok(Array.isArray(due));
});

test("every chain has required upstream identifiers", () => {
  for (const c of Object.values(CHAINS)) {
    assert.ok(c.label && c.coingeckoNative && c.nativeSymbol, `chain ${c.key} missing fields`);
    if (c.evm) assert.ok(Array.isArray(c.rpcs) && c.rpcs.length >= 3, `chain ${c.key} needs >=3 rpcs`);
  }
});
