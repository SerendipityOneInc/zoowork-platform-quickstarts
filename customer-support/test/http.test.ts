import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.js";
import { SupportService } from "../src/service.js";
import { supportServer } from "../src/http.js";
import { fixtureClient } from "./fixture.js";
import type { AddressInfo } from "node:net";

test("HTTP routes enforce cookie ownership, CSRF, origin, input bounds and static path allowlist", async () => {
  const store = new Store(":memory:", "offline"),
    fixture = fixtureClient(),
    service = new SupportService(store, fixture.client, "agent-synthetic");
  let origin = "";
  const server = supportServer(service, {
    origin: () => origin,
    offline: true,
  });
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  origin = `http://localhost:${(server.address() as AddressInfo).port}`;
  const bootstrap = await fetch(origin + "/api/bootstrap"),
    cookie = bootstrap.headers.get("set-cookie")!.split(";")[0],
    value = (await bootstrap.json()) as { csrf: string; offline: boolean };
  const headers = {
    cookie,
    "Content-Type": "application/json",
    "X-CSRF-Token": value.csrf,
    Origin: origin,
  };
  const post = (path: string, body: unknown, extra = {}) =>
    fetch(origin + path, {
      method: "POST",
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(value.offline, true);
    assert.equal(
      (await fetch(origin)).headers
        .get("content-security-policy")!
        .includes("script-src 'self'"),
      true,
    );
    assert.equal((await fetch(origin + "/.local/support.sqlite")).status, 404);
    assert.equal(
      (
        await post(
          "/api/conversations",
          { id: randomUUID() },
          { Origin: "https://attacker.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/api/conversations",
          { id: randomUUID() },
          { "X-CSRF-Token": "invalid" },
        )
      ).status,
      403,
    );
    const created = await post("/api/conversations", { id: randomUUID() });
    assert.equal(created.status, 201);
    const { conversation } = (await created.json()) as {
      conversation: { id: string };
    };
    const otherBootstrap = await fetch(origin + "/api/bootstrap"),
      otherCookie = otherBootstrap.headers.get("set-cookie")!.split(";")[0],
      other = (await otherBootstrap.json()) as { csrf: string };
    assert.equal(
      (
        await fetch(origin + `/api/conversations/${conversation.id}`, {
          headers: { cookie: otherCookie },
        })
      ).status,
      404,
    );
    const beforeCollision = store.conversation(conversation.id);
    assert.equal((await post('/api/conversations', { id: conversation.id }, { cookie: otherCookie, 'X-CSRF-Token': other.csrf })).status, 409);
    assert.deepEqual(store.conversation(conversation.id), beforeCollision);
    assert.equal(
      (
        await post(
          `/api/conversations/${conversation.id}/recover`,
          { retryInput: true },
          { cookie: otherCookie, "X-CSRF-Token": other.csrf },
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await post(`/api/conversations/${conversation.id}/messages`, {
          id: randomUUID(),
          text: "a".repeat(9000),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await post(`/api/conversations/${conversation.id}/messages`, {
          id: randomUUID(),
          text: "",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post(`/api/conversations/${conversation.id}/decisions`, {
          callId: "absent",
          decision: "allow-always",
        })
      ).status,
      400,
    );
    assert.equal(fixture.posts, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await service.stop();
    store.close();
  }
});
