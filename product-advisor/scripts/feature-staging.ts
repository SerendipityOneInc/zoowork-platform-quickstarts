import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { demo, agentResource, publicMcpUrl } from "../src/agent.js";
import {
  newState,
  setupAgent,
  saveState,
  cleanupAgent,
  requireStaging,
  readConfig,
  runtime,
  safeError,
  FoundationError,
  withStateLock,
} from "../src/platform.js";
import { Advisor } from "../src/server/advisor.js";
import { Conversations } from "../src/storage/conversations.js";
import { Receipts } from "../src/storage/receipts.js";
import { cleanupConversations } from "../src/server/cleanup.js";

// User authorization is still required. The flag is an acknowledgement, not permission.
const run = randomUUID(),
  filename = `feature-${run}.json`,
  path = resolve(".local", filename);
let cleaned = false;
try {
  const config = readConfig();
  requireStaging(config, process.argv.includes("--confirm-staging"));
  const url = publicMcpUrl();
  const auditPath = process.env.MCP_AUDIT_DB;
  if (!auditPath || !existsSync(auditPath))
    throw new FoundationError("existing_mcp_audit_db_required");
  const audit = new Receipts(auditPath),
    store = new Conversations(resolve(".local", "conversations.sqlite"));
  const rt = runtime(config);
  await withStateLock(path, async () => {
    const state = newState(config, demo, agentResource());
    let advisor: Advisor | undefined;
    let failure: unknown;
    try {
      const id = await setupAgent(rt.client, state, path);
      advisor = new Advisor(store, rt.client, id, url);
      const visitor = `feature-${run}`,
        requirements = {
          category: "laptop" as const,
          maxPriceMinor: 650000,
          filters: { minRamGB: 16 },
        };
      async function turn(
        conversationId: string,
        decision?: "allow-once" | "deny",
        approvalLimit = 1,
      ) {
        const timeout = Date.now() + 85_000;
        let resolved = 0;
        while (Date.now() < timeout) {
          const c = store.get(conversationId);
          for (const a of c.approvals) {
            if (a.signaled) continue;
            if (!decision || resolved >= approvalLimit)
              throw new FoundationError("unexpected_additional_approval");
            await advisor!.decide(visitor, c.id, a.approval_id!, decision);
            resolved++;
            console.log(
              JSON.stringify({ phase: "approval", decision, resolved }),
            );
          }
          if (
            ["finished", "failed", "recovering", "uncertain"].includes(c.status)
          ) {
            await advisor!.idle(c.id);
            return resolved;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
        await advisor!.interrupt(visitor, conversationId);
        throw new FoundationError("turn_timeout_no_paid_retry");
      }
      // 2 Sessions, 4 user turns. Details and comparison share the first turn.
      const a = await advisor.create(
        visitor,
        "Budget CNY 6500 for coding, with at least 16 GB RAM. Search first, then use get_products for full details of the first two candidates, then compare_products for those two products. Wait for my approval each time before recommending.",
        requirements,
        "feature-first",
      );
      assert.equal(await turn(a.id, "allow-once", 2), 2);
      let c = store.get(a.id);
      assert.equal(c.status, "finished");
      assert.ok(c.shortlist.length);
      assert.ok(
        c.shortlist.every(
          (s) =>
            s.product.priceMinor <= 650000 &&
            Number(s.product.specs.ramGB) >= 16,
        ),
      );
      const sidA = c.sessionId!,
        countsA = audit.forSession(id, sidA);
      assert.ok(countsA.search_products! >= 1);
      assert.equal(countsA.get_products, 1);
      assert.equal(countsA.compare_products, 1);
      assert.equal(c.comparison?.result.products.length, 2);
      console.log(
        JSON.stringify({
          phase: "search_details_comparison",
          pass: true,
          counts: countsA,
        }),
      );
      const replay = await rt.client.listAllEvents(id, sidA);
      assert.ok(
        c.events.every((e) =>
          replay.some((r) => r.seq === e.seq && r.eventType === e.eventType),
        ),
      );
      await advisor.message(
        visitor,
        a.id,
        "Lower the budget to CNY 5000. Search and recommend using the new budget.",
        requirements,
        "feature-budget",
      );
      assert.equal(await turn(a.id), 0);
      c = store.get(a.id);
      assert.equal(c.status, "finished");
      assert.ok(c.shortlist.length);
      assert.ok(c.shortlist.every((s) => s.product.priceMinor <= 500000));
      console.log(JSON.stringify({ phase: "budget_followup", pass: true }));
      const b = await advisor.create(
        visitor,
        "Budget CNY 6500, with at least 16 GB RAM. Search first, then use get_products for full details of one candidate. Wait for my approval.",
        requirements,
        "feature-deny",
      );
      assert.equal(await turn(b.id, "deny"), 1);
      const sidB = store.get(b.id).sessionId!,
        countsB = audit.forSession(id, sidB);
      assert.ok(countsB.search_products! >= 1);
      assert.equal(countsB.get_products, 0);
      assert.ok(store.get(b.id).denied);
      console.log(
        JSON.stringify({ phase: "denial", pass: true, counts: countsB }),
      );
      const broken = {
        ...state.resource,
        mcp: state.resource.mcp!.map((m) => ({
          ...m,
          url: new URL("/unavailable/mcp", url).href,
        })),
      };
      state.pendingResource = broken;
      await saveState(path, state);
      await rt.client.updateAgent(id, { ...broken });
      state.resource = broken;
      delete state.pendingResource;
      await saveState(path, state);
      await advisor.message(
        visitor,
        b.id,
        "Search again using the current requirements.",
        requirements,
        "feature-unavailable",
      );
      await turn(b.id);
      const failed = store.get(b.id);
      assert.ok(failed.warnings.includes("mcp_connection_failed"));
      assert.equal(failed.shortlist.length, 0);
      const report = {
        pass: true,
        scope: "feature-staging",
        agentId: id,
        sessionIds: [sidA, sidB],
        turns: 4,
        allowCounts: countsA,
        denyCounts: countsB,
        receiptCount: Object.keys(c.evidence).length,
        preview: true,
        historyReplay: true,
        connectionFailure: true,
        comparisonLive: true,
      };
      await writeFile(
        resolve(".local", `feature-report-${run}.json`),
        JSON.stringify(report, null, 2),
        { mode: 0o600 },
      );
      console.log(JSON.stringify(report));
    } catch (error) {
      failure = error;
    } finally {
      await advisor?.close();
      rt.beginCleanup();
      try {
        if (!state.agentId)
          throw new FoundationError("agent_creation_uncertain_keep_state");
        await cleanupConversations(rt.client, state, store);
        await cleanupAgent(rt.client, state, path);
        store.clearAgent(state.agentId);
        cleaned = true;
      } catch (error) {
        failure ??= error;
        console.error(
          `Cleanup pending: ${safeError(error)}; npm run cleanup -- ${filename}`,
        );
      }
    }
    if (failure) throw failure;
  });
  store.close();
  audit.close();
  console.log("PASS: feature staging; cleanup complete");
} catch (error) {
  console.error(
    `FAIL: ${safeError(error)}; cleanup ${cleaned ? "complete" : "not confirmed"}`,
  );
  process.exitCode = 1;
}
