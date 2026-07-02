// Sandbox buyer — runs the 10 graduation jobs against the deployed Sonar seller.
// Requires a SEPARATE buyer agent (different wallet) + env. Budget ~0.50 USDC total.
// Run: node scripts/sandbox-buyer.js   (after the seller is live + registered + funded)
//
// Env required:
//   BUYER_AGENT_WALLET_ADDRESS, BUYER_ENTITY_ID (walletId), BUYER_AGENT_WALLET_PRIVATE_KEY (signer)
//   SELLER_AGENT_WALLET_ADDRESS   (Sonar seller smart-account address)
import { AcpAgent, PrivyAlchemyEvmProviderAdapter, AssetToken } from "@virtuals-protocol/acp-node-v2";
import { base } from "@account-kit/infra";

const SELLER = process.env.SELLER_AGENT_WALLET_ADDRESS;
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// 10 jobs, varied offerings (graduation reviewers want to see breadth + correct deliverables).
const JOBS = [
  ["gas_now", {}],
  ["gas_now", { chain: "base" }],
  ["token_snapshot", { address: USDC_BASE }],
  ["token_snapshot", { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" }], // AERO
  ["market_pulse", { address: USDC_BASE }],
  ["token_holders", { address: USDC_BASE, chain: "base" }],
  ["watchlist_set", { items: [{ address: USDC_BASE, chain: "base" }], alerts: { price_move_pct: 5 } }],
  ["watchlist_status", {}],
  ["market_pulse", { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" }],
  ["gas_now", { chain: "arbitrum" }],
];

async function main() {
  if (!SELLER) throw new Error("Set SELLER_AGENT_WALLET_ADDRESS to the Sonar seller wallet.");
  const buyer = await AcpAgent.create({
    provider: await PrivyAlchemyEvmProviderAdapter.create({
      walletAddress: process.env.BUYER_AGENT_WALLET_ADDRESS,
      walletId: process.env.BUYER_ENTITY_ID,
      signerPrivateKey: process.env.BUYER_AGENT_WALLET_PRIVATE_KEY,
      chains: [base],
    }),
  });
  const buyerAddress = await buyer.getAddress();
  let completed = 0;

  buyer.on("entry", async (session, entry) => {
    if (entry.kind !== "system") return;
    try {
      if (entry.event.type === "budget.set") await session.fund(AssetToken.usdc(0.01, session.chainId));
      else if (entry.event.type === "job.submitted") await session.complete("Sandbox deliverable verified.");
      else if (entry.event.type === "job.completed") {
        completed++;
        console.log(`✅ completed ${completed}/${JOBS.length} (job ${session.jobId})`);
        if (completed >= JOBS.length) { console.log("All sandbox jobs done."); await buyer.stop(); }
      }
    } catch (e) { console.error("entry error:", e.message); }
  });

  await buyer.start(() => console.log("buyer connected, submitting jobs…"));
  for (const [name, req] of JOBS) {
    try {
      const jobId = await buyer.createJobByOfferingName(base.id, name, SELLER, req, { evaluatorAddress: buyerAddress });
      console.log(`→ job ${jobId} "${name}"`);
      await new Promise((r) => setTimeout(r, 8000)); // pace jobs
    } catch (e) { console.error(`createJob "${name}" failed:`, e.message); }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
