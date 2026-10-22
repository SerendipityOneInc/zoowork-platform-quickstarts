import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_BASE_URL } from "@zoowork-ai/sdk";
import { readPlatformConfig } from "../lib/zoowork/config";

const apiKey = "zwp_live_test";
// Next.js types NODE_ENV as required; these tests only need the ZooWork variables.
const read = (vars: Record<string, string | undefined>) => readPlatformConfig(vars as NodeJS.ProcessEnv);

test("the key is the only required setting; the base URL defaults to the SDK's", () => {
  assert.deepEqual(read({ ZOOWORK_API_KEY: apiKey }), { apiKey, baseUrl: DEFAULT_BASE_URL });
  assert.deepEqual(read({ ZOOWORK_API_KEY: apiKey, ZOOWORK_BASE_URL: " " }), { apiKey, baseUrl: DEFAULT_BASE_URL });
});

test("a set base URL is normalized and must be a public https /service/v1 URL", () => {
  assert.deepEqual(read({ ZOOWORK_API_KEY: apiKey, ZOOWORK_BASE_URL: "https://api.example.test/service/v1/" }), {
    apiKey,
    baseUrl: "https://api.example.test/service/v1",
  });
  for (const url of [
    "not a url",
    "http://api.example.test/service/v1",
    "https://user:pass@api.example.test/service/v1",
    "https://api.example.test/service/v1?key=x",
    "https://api.example.test/service/v1#x",
    "https://api.example.test",
  ]) {
    assert.throws(() => read({ ZOOWORK_API_KEY: apiKey, ZOOWORK_BASE_URL: url }), /invalid_public_base_url/, url);
  }
});

test("the key must be a Platform Project key", () => {
  for (const key of [undefined, "", "zwp_live_", "zct_work_key"]) {
    assert.throws(() => read({ ZOOWORK_API_KEY: key }), /platform_project_key_required/);
  }
});
