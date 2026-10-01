import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ZooworkError } from "@zoowork-ai/sdk";
import { startupFailure } from "../src/startup.js";

test("fresh setup and server commands explain missing configuration without creating state", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "support-first-run-"));
  const env = { ...process.env };
  delete env.ZOOWORK_API_KEY;
  delete env.ZOOWORK_BASE_URL;
  const run = (script: string, args: string[] = [], extra = {}) =>
    spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)),
        ...args,
      ],
      { cwd, env: { ...env, ...extra }, encoding: "utf8", timeout: 10000 },
    );
  try {
    for (const [script, args] of [
      ["platform.ts", ["setup"]],
      ["server.ts", []],
    ] as const) {
      const result = run(script, [...args]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /platform_project_key_required/);
      assert.match(result.stderr, /https:\/\/platform\.zoowork\.ai/);
      assert.match(result.stderr, /API Keys/);
      assert.match(result.stderr, /ZOOWORK_API_KEY/);
      assert.match(result.stderr, /npm run setup/);
    }
    const key = "zwp_live_synthetic_first_run_key";
    const missingUrl = run("platform.ts", ["setup"], { ZOOWORK_API_KEY: key });
    assert.match(missingUrl.stderr, /Set ZOOWORK_BASE_URL/);
    assert.ok(!missingUrl.stderr.includes(key));
    const missingAgent = run("server.ts", [], {
      ZOOWORK_API_KEY: key,
      ZOOWORK_BASE_URL: "https://synthetic.example/service/v1",
    });
    assert.equal(missingAgent.status, 1);
    assert.match(missingAgent.stderr, /Run npm run setup/);
    assert.match(
      missingAgent.stderr,
      /do not need to create an Agent manually/,
    );
    assert.deepEqual(await readdir(cwd), []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("startup guidance offers credential and billing recovery without disclosing provider content", () => {
  const secret = "synthetic-private-provider-content";
  const invalidKey = startupFailure("FAIL", new ZooworkError(401, secret));
  assert.match(invalidKey, /Project key was rejected/);
  const billing = startupFailure("FAIL", new ZooworkError(402, secret));
  assert.match(billing, /Organization billing and available credits/);
  for (const output of [
    invalidKey,
    billing,
    startupFailure("FAIL", new Error(secret)),
  ])
    assert.ok(!output.includes(secret));
});
