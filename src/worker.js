// Notification Memo worker — the retention engine. Periodically evaluates every buyer's
// watchlist against their alert thresholds and emits memos ("gas < X", "price ±Y%").
// Pure evaluation (computeDueAlerts) is unit-tested; delivery is injected so the worker
// runs in HTTP-only mode (logs) or ACP mode (sends real memos).
import { allRecords, setRecord } from "./lib/store.js";
import { token_snapshot } from "./offerings.js";
import { evmGas } from "./sources/rpcgas.js";

export async function computeDueAlerts() {
  const due = [];
  const records = allRecords("watchlist");
  let baseGasGwei = null;
  const g = await evmGas("base").catch(() => null);
  if (g && g.ok) baseGasGwei = g.gasPriceGwei;

  for (const rec of records) {
    const alerts = rec.alerts || {};
    const updatedItems = [];
    for (const it of rec.items || []) {
      let cur = null;
      try { const s = await token_snapshot({ address: it.address, chain: it.chain }); cur = s.found ? s.price_usd : null; } catch {}
      let movePct = null;
      if (it.baseline_price_usd && cur) movePct = ((cur - it.baseline_price_usd) / it.baseline_price_usd) * 100;
      if (alerts.price_move_pct && movePct != null && Math.abs(movePct) >= alerts.price_move_pct) {
        due.push({ buyer: rec.buyer, type: "price_move", address: it.address, chain: it.chain, movePct: +movePct.toFixed(2), price_usd: cur });
        it.baseline_price_usd = cur; // reset baseline so we don't spam
      }
      updatedItems.push(it);
    }
    if (alerts.base_gas_below_gwei && baseGasGwei != null && baseGasGwei <= alerts.base_gas_below_gwei) {
      due.push({ buyer: rec.buyer, type: "gas_low", chain: "base", gasPriceGwei: baseGasGwei, threshold: alerts.base_gas_below_gwei });
    }
    // persist any baseline resets
    setRecord("watchlist", rec.buyer, { items: updatedItems, alerts });
  }
  return due;
}

function messageFor(a) {
  if (a.type === "price_move") return `Sonar alert: ${a.address.slice(0, 8)}… on ${a.chain} moved ${a.movePct}% (now $${a.price_usd}).`;
  if (a.type === "gas_low") return `Sonar alert: Base gas is ${a.gasPriceGwei} gwei (≤ your ${a.threshold} threshold) — good window to execute.`;
  return "Sonar alert.";
}

export function startWorker({ sendMemo } = {}) {
  const intervalMs = Number(process.env.MEMO_INTERVAL_MS || 300_000); // 5 min default
  const tick = async () => {
    try {
      const due = await computeDueAlerts();
      for (const a of due) {
        const msg = messageFor(a);
        if (sendMemo) await sendMemo(a.buyer, msg, a);
        else console.log(`[worker] (HTTP-only) would memo ${a.buyer}: ${msg}`);
      }
      if (due.length) console.log(`[worker] processed ${due.length} alert(s)`);
    } catch (e) { console.error("[worker] tick error:", e.message); }
  };
  console.log(`[worker] memo worker started, interval ${intervalMs}ms`);
  tick();
  return setInterval(tick, intervalMs);
}
