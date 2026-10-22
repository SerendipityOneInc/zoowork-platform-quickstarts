import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../lib/chat/api";
import { sendFromComposer, type ComposerSend } from "../lib/chat/send-message";

function harness(overrides: Partial<ComposerSend> = {}) {
  const log = { restored: [] as string[], notices: [] as (string | null)[], sent: [] as [string, string][] };
  const input: ComposerSend = {
    text: "hello",
    sessionId: null,
    ensureSession: async () => "ses_1",
    send: async (id, text) => {
      log.sent.push([id, text]);
    },
    restoreText: (text) => log.restored.push(text),
    setNotice: (message) => log.notices.push(message),
    ...overrides,
  };
  return { input, log };
}

test("a new chat creates its Session, then sends", async () => {
  const { input, log } = harness();
  assert.equal(await sendFromComposer(input), true);
  assert.deepEqual(log.sent, [["ses_1", "hello"]]);
  assert.deepEqual(log.restored, []);
});

test("a failed Session create keeps the text and shows why, without throwing", async () => {
  const { input, log } = harness({
    ensureSession: async () => {
      throw new ApiError("http_502", 502, "Could not start the conversation (http_502)");
    },
  });
  assert.equal(await sendFromComposer(input), false);
  assert.deepEqual(log.restored, ["hello"]);
  assert.equal(log.notices.at(-1), "Could not start the conversation (http_502)");
  assert.deepEqual(log.sent, []);
});

test("a network failure during create gets a readable notice", async () => {
  const { input, log } = harness({
    ensureSession: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  assert.equal(await sendFromComposer(input), false);
  assert.match(log.notices.at(-1) ?? "", /Could not start the conversation/);
  assert.deepEqual(log.restored, ["hello"]);
});

test("a failed send keeps the text; the controller shows its own notice", async () => {
  const { input, log } = harness({
    sessionId: "ses_9",
    send: async () => {
      throw new Error("http_402");
    },
  });
  assert.equal(await sendFromComposer(input), false);
  assert.deepEqual(log.restored, ["hello"]);
  assert.deepEqual(log.notices, [null], "only the earlier notice is cleared");
});

test("a new attempt clears the previous page notice", async () => {
  const { input, log } = harness({ sessionId: "ses_9" });
  await sendFromComposer(input);
  assert.deepEqual(log.notices, [null]);
});
