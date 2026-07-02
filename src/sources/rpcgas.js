import { sleep } from "../lib/http.js";
import { CHAINS } from "../lib/chains.js";

// EVM gas via redundant RPC fallback. THE product edge: individual public RPCs 403 /
// rate-limit, so we race across a pool and report which endpoint answered + health.
async function rpcCall(url, method, params = [], timeoutMs = 3500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "sonar-acp/0.1" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, url, status: res.status, latencyMs: Date.now() - started };
    const j = await res.json();
    if (j.error) return { ok: false, url, error: j.error?.message, latencyMs: Date.now() - started };
    return { ok: true, url, result: j.result, latencyMs: Date.now() - started };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, url, error: String(e.message || e), latencyMs: Date.now() - started };
  }
}

// Try RPCs in order, return first success. Records attempts for observability.
async function firstWorkingRpc(rpcs, method, params) {
  const attempts = [];
  for (const url of rpcs) {
    const r = await rpcCall(url, method, params);
    attempts.push({ url, ok: r.ok, latencyMs: r.latencyMs, status: r.status, error: r.error });
    if (r.ok) return { ...r, attempts };
  }
  return { ok: false, attempts };
}

export async function evmGas(chainKey) {
  const chain = CHAINS[chainKey];
  if (!chain || !chain.evm) return { ok: false, chain: chainKey, reason: "not_evm" };
  const r = await firstWorkingRpc(chain.rpcs, "eth_gasPrice", []);
  if (!r.ok) return { ok: false, chain: chainKey, reason: "all_rpcs_failed", attempts: r.attempts };
  const wei = typeof r.result === "string" ? parseInt(r.result, 16) : Number(r.result);
  return {
    ok: true,
    chain: chainKey,
    label: chain.label,
    gasPriceWei: wei,
    gasPriceGwei: +(wei / 1e9).toFixed(4),
    rpcUsed: r.url,
    rpcLatencyMs: r.latencyMs,
    rpcsTried: r.attempts.length,
  };
}

// Solana "gas" is a flat per-signature base fee plus optional priority fee (micro-lamports/CU).
export async function solanaFee() {
  const chain = CHAINS.solana;
  const base = await firstWorkingRpc(chain.rpcs, "getFees", []).catch(() => ({ ok: false }));
  let priority = null, rpcUsed = null;
  const pr = await firstWorkingRpc(chain.rpcs, "getRecentPrioritizationFees", [[]]);
  if (pr.ok && Array.isArray(pr.result) && pr.result.length) {
    const fees = pr.result.map((x) => x.prioritizationFee).filter((n) => typeof n === "number");
    priority = fees.length ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : 0;
    rpcUsed = pr.url;
  }
  return {
    ok: pr.ok || base.ok,
    chain: "solana",
    label: "Solana",
    baseFeeLamportsPerSig: 5000,
    avgPriorityFeeMicroLamportsPerCU: priority,
    rpcUsed: rpcUsed || (base.ok ? base.url : null),
    note: "Solana fee = 5000 lamports/signature base + priority (micro-lamports per compute unit).",
  };
}

// Gas across all supported chains in one shot (parallel).
export async function gasAll() {
  const evmKeys = Object.values(CHAINS).filter((c) => c.evm).map((c) => c.key);
  const [evm, sol] = await Promise.all([
    Promise.all(evmKeys.map((k) => evmGas(k))),
    solanaFee(),
  ]);
  const chains = {};
  for (const g of evm) chains[g.chain] = g;
  chains.solana = sol;
  const okCount = Object.values(chains).filter((c) => c.ok).length;
  return { chains, coverage: `${okCount}/${Object.keys(chains).length}` };
}
