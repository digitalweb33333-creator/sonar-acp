import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { withExtraRpcs } from "./lib/chains.js";
import { OFFERINGS, resource_pulse, InputError } from "./offerings.js";
import { AGENT, OFFERINGS_META, RESOURCE_META } from "./schemas.js";
import { evmGas } from "./sources/rpcgas.js";

withExtraRpcs(process.env.EXTRA_RPCS);
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "256kb" }));

const PORT = process.env.PORT || 10000;
const startedAt = Date.now();

app.get("/", (_req, res) => {
  res.json({
    agent: AGENT.name,
    description: AGENT.description,
    offerings: OFFERINGS_META.map((o) => ({ name: o.name, price_usd: o.price })),
    free_resource: RESOURCE_META.path,
    docs: ["/llms.txt", "/.well-known/agent-card.json"],
  });
});

// Health: reports upstream reachability (registries use this for trust scoring).
app.get("/health", async (_req, res) => {
  const gas = await evmGas("base").catch(() => ({ ok: false }));
  res.json({
    status: "ok",
    uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
    upstream: { base_rpc: gas.ok ? "ok" : "degraded" },
    acp: process.env.WHITELISTED_WALLET_PRIVATE_KEY ? "configured" : "not_configured",
    time: new Date().toISOString(),
  });
});

// Free ACP Resource (read-only, no payment).
app.get(RESOURCE_META.path, async (_req, res) => {
  try { res.json(await resource_pulse()); }
  catch (e) { res.status(502).json({ error: "resource_unavailable", detail: String(e.message || e) }); }
});

// Offering compute endpoint — used by the ACP job handler and for local/dev testing.
// buyer identity comes from ACP; over HTTP it can be passed via x-buyer-address for watchlist.
app.post("/offering/:name", async (req, res) => {
  const name = req.params.name;
  const fn = OFFERINGS[name];
  if (!fn) return res.status(404).json({ error: "unknown_offering", available: Object.keys(OFFERINGS) });
  const buyer = req.get("x-buyer-address") || req.body?.buyer || null;
  try {
    const out = await fn(req.body || {}, { buyer });
    res.json(out);
  } catch (e) {
    const code = e instanceof InputError ? 400 : 502;
    res.status(code).json({ error: code === 400 ? "invalid_input" : "upstream_error", detail: String(e.message || e) });
  }
});

// Discovery assets
app.get("/.well-known/agent-card.json", (_req, res) => {
  const p = join(__dirname, "..", "public", "agent-card.json");
  if (existsSync(p)) return res.type("application/json").send(readFileSync(p, "utf8"));
  res.status(404).json({ error: "not_found" });
});
app.get(["/llms.txt", "/.well-known/llms.txt"], (_req, res) => {
  const p = join(__dirname, "..", "public", "llms.txt");
  if (existsSync(p)) return res.type("text/plain").send(readFileSync(p, "utf8"));
  res.status(404).send("not found");
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[sonar] http on :${PORT}`);
    // Boot ACP seller + memo worker only when configured. Never blocks the HTTP server.
    if (process.env.WHITELISTED_WALLET_PRIVATE_KEY && process.env.SELLER_ENTITY_ID) {
      Promise.all([import("./acp.js"), import("./worker.js")])
        .then(([acp, worker]) => acp.startAcp().then(() => worker.startWorker({ sendMemo: acp.sendMemo })))
        .catch((e) => console.error("[sonar] ACP/worker boot failed:", e.message));
    } else {
      console.log("[sonar] ACP keys absent → HTTP-only mode (offerings testable at POST /offering/:name).");
    }
  });
}

export { app };
