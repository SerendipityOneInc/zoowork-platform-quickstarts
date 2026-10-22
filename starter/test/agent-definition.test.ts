import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseAgentDefinition } from "../lib/zoowork/agent-definition";

const def = (frontmatter: string, body = "Be helpful.") => `---\n${frontmatter}\n---\n\n${body}\n`;

test("the shipped agent/agent.md parses", () => {
  const { resource } = parseAgentDefinition(readFileSync("agent/agent.md", "utf8"));
  assert.equal(resource.name, "Starter Assistant");
  assert.deepEqual(resource.tool_policy, { allow: ["web_search", "web_fetch"] });
  assert.equal(resource.include_global_skills, false);
  assert.equal(resource.persona?.docs[0]?.name, "AGENTS.md");
  assert.match(resource.persona!.docs[0]!.content, /helpful assistant/);
  assert.equal(resource.model, undefined);
});

test("maps model, thinking, skills and timezone", () => {
  const { resource } = parseAgentDefinition(
    def(
      [
        "name: Helper",
        "model: provider/model-x",
        "thinking: low",
        "max_tokens: 2048",
        "tools: [web_search, web_search]",
        "global_skills: true",
        "skills:",
        "  - pdf-reader",
        "  - { skill_id: skl_1, version: 3 }",
        "timezone: Asia/Shanghai",
      ].join("\n"),
    ),
  );
  assert.deepEqual(resource.model, { primary: "provider/model-x", thinking: "low", max_tokens: 2048 });
  assert.deepEqual(resource.tool_policy, { allow: ["web_search"] });
  assert.equal(resource.include_global_skills, true);
  assert.deepEqual(resource.skills, [{ name: "pdf-reader" }, { skill_id: "skl_1", version: 3 }]);
  assert.equal(resource.userTimezone, "Asia/Shanghai");
});

test("an empty tool list denies every tool", () => {
  const { resource } = parseAgentDefinition(def("name: Text only\ntools: []"));
  assert.deepEqual(resource.tool_policy, { deny: ["*"] });
});

test("rejects mistakes instead of ignoring them", () => {
  const bad: [string, RegExp][] = [
    [def("name: A\ntools: []\ntool: [x]"), /unknown key "tool"/],
    [def("tools: []"), /name/],
    [def("name: A"), /tools must be a list/],
    [def("name: A\ntools: []", ""), /instructions .* empty/],
    [def("name: A\ntools: []\nthinking: low"), /model is required/],
    [def("name: A\ntools: []\nmodel: m\nthinking: extreme"), /thinking must be one of/],
    [def("name: A\ntools: [\"rm -rf\"]"), /exact tool name/],
    ["name: A\n", /must start with a --- frontmatter block/],
    ["---\nname: A\n", /not closed/],
    [def("name: [unclosed"), /not valid YAML/],
  ];
  for (const [source, message] of bad) assert.throws(() => parseAgentDefinition(source), message);
});
