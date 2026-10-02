import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { agentResource, demo } from "../src/agent.js";
import { cleanupApplication } from "../src/cleanup.js";
import {
  FoundationError,
  newState,
  readConfig,
  requireStaging,
  runtime,
  safeError,
  saveState,
  setupAgent,
  withStateLock,
} from "../src/platform.js";
import { Store } from "../src/store.js";
import { SupportService } from "../src/service.js";

let cleaned = false;
try {
  const config = readConfig();
  requireStaging(config, process.argv.includes("--confirm-staging"));
  const rt = runtime(config),
    filename = `feature-${randomUUID()}.json`,
    path = resolve(".local", filename);
  await withStateLock(path, async () => {
    const models = await rt.client.listModels(),
      model = process.env.ZOOWORK_MODEL || models[0]?.model;
    if (!model || !models.some((value) => value.model === model))
      throw new FoundationError("model_unavailable");
    const state = newState(config, demo, {
      ...agentResource(),
      model: { primary: model, max_tokens: 700 },
    });
    state.database = filename.replace(".json", ".sqlite");
    let store: Store | undefined,
      service: SupportService | undefined,
      failure: unknown;
    try {
      const agentId = await setupAgent(rt.client, state, path);
      store = new Store(
        resolve(".local", state.database),
        `${state.baseUrl}:${state.instance}:${agentId}`,
      );
      await chmod(resolve(".local", state.database), 0o600);
      service = new SupportService(store, rt.client, agentId);
      const owner = store.visitor().id,
        value = await service.create(owner),
        id = value.conversation.id;
      const wait = async (condition: () => boolean) => {
        for (let n = 0; n < 150; n++) {
          if (condition()) return;
          const current = store!.conversation(id);
          if (current.status === "error")
            throw new FoundationError(current.error ?? "feature_turn_failed");
          await setTimeout(500);
        }
        throw new FoundationError("feature_timeout_no_paid_retry");
      };
      const send = async (text: string) => {
        await service!.send(id, owner, { id: randomUUID(), text });
      };
      console.log("RUN: actual Custom Tool order and shipment lookup");
      await send(
        "Use lookup_order and lookup_shipment to check order ORD-1001. Give its item name, shipment status and estimated delivery date.",
      );
      await wait(() => store!.conversation(id).status === "ready");
      assert.ok(
        store
          .jobs(id)
          .some((job) => job.name === "lookup_order" && job.result?.ok),
      );
      assert.ok(
        store
          .jobs(id)
          .some((job) => job.name === "lookup_shipment" && job.result?.ok),
      );
      assert.match(store.messages(id).at(-1)!.text, /Trail|Daypack/i);
      console.log("PASS: real order/shipment handlers and Agent answer");
      console.log("RUN: follow-up in the same Session");
      await send(
        "For that same order, repeat the estimated delivery date and explain what the latest shipment event says. Do not create a ticket yet.",
      );
      await wait(() => store!.conversation(id).status === "ready");
      assert.match(
        store.messages(id).at(-1)!.text,
        /Oct|October|2026-10-02|10\/02|10\/2/i,
      );
      console.log("PASS: follow-up history");
      console.log("RUN: cancelled ticket proposal");
      await send(
        "Use create_support_ticket to propose a delivery ticket for ORD-1001. Reason: Please investigate the transit delay and provide an updated delivery estimate. The app will show UI confirmation.",
      );
      await wait(() =>
        store!.jobs(id).some((job) => job.status === "waiting_confirmation"),
      );
      assert.equal(store.tickets(id).length, 0);
      const cancelled = store
        .jobs(id)
        .find((job) => job.status === "waiting_confirmation")!;
      await service.decide(id, owner, cancelled.callId, "cancel");
      await wait(() => store!.conversation(id).status === "ready");
      assert.equal(store.tickets(id).length, 0);
      console.log("PASS: cancellation unblocks the run without a write");
      console.log("RUN: confirmed ticket, restart and replay");
      await send(
        "Propose that same delivery ticket for ORD-1001 again with create_support_ticket. I will confirm it in the app, not in chat.",
      );
      await wait(() =>
        store!.jobs(id).some((job) => job.status === "waiting_confirmation"),
      );
      const confirmed = store
        .jobs(id)
        .find((job) => job.status === "waiting_confirmation")!;
      await service.stop();
      store.close();
      // Reopen the actual journal while the Platform run is waiting, with no new user input.
      store = new Store(
        resolve(".local", state.database),
        `${state.baseUrl}:${state.instance}:${agentId}`,
      );
      service = new SupportService(store, rt.client, agentId);
      await service.resume();
      assert.equal(store.snapshot(id, owner).pending.length, 1);
      await service.decide(id, owner, confirmed.callId, "confirm");
      await wait(() => store!.conversation(id).status === "ready");
      await service.decide(id, owner, confirmed.callId, "confirm");
      assert.equal(store.tickets(id).length, 1);
      assert.ok(
        store.messages(id).at(-1)!.text.includes(store.tickets(id)[0].id),
      );
      console.log(
        "PASS: confirmed ticket, pending recovery, duplicate decision and final answer",
      );
    } catch (error) {
      failure = error;
    } finally {
      await service?.stop();
      store?.close();
      rt.beginCleanup();
      try {
        if (!state.agentId)
          throw new FoundationError("agent_creation_uncertain_keep_state");
        await cleanupApplication(rt.client, state, path);
        cleaned = true;
      } catch (error) {
        failure ??= error;
        console.error(
          `Cleanup pending: ${safeError(error)}. Retain .local/${filename} and its database. Recovery: npm run cleanup -- ${filename}`,
        );
      }
    }
    if (failure) throw failure;
  });
  console.log(
    "PASS: feature staging; one Agent, one Session, four user turns; cleanup complete",
  );
} catch (error) {
  console.error(
    `FAIL: ${safeError(error)}; cleanup ${cleaned ? "complete" : "not confirmed"}`,
  );
  process.exitCode = 1;
}
