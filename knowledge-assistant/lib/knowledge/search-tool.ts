import type { CustomToolDeclaration } from "@zoowork-ai/sdk";

export const SEARCH_TOOL = "search_knowledge";

/** Declared on the Agent. The Platform pauses the run until this app returns the result. */
export const searchTool: CustomToolDeclaration = {
  name: SEARCH_TOOL,
  description:
    "Search the product help documents. Returns passages with the source to cite for each one, or no passages if nothing matches.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "What to look for, in plain words." } },
    required: ["query"],
    additionalProperties: false,
  },
  // Longer than a search with its retry takes, and long enough that a restarted
  // server can still answer a search left waiting. This is the Platform's default.
  timeoutMs: 600_000,
};
