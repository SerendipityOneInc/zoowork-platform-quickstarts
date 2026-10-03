import { safeError } from "./platform.js";

/** Actionable startup errors without reflecting credentials or provider responses. */
export function startupFailure(prefix: string, error: unknown): string {
  const code = safeError(error);
  const guidance: Record<string, string> = {
    platform_project_key_required:
      "Get a Platform Project key at https://platform.zoowork.ai: sign in, select a Project, then open API Keys and create a key.\nCopy .env.example to .env and set ZOOWORK_API_KEY to the zwp_live_ key. Keep it server-side.\nThen run npm run setup followed by npm run dev. See README.md: Get your Project key.",
    explicit_public_base_url_required:
      "Set ZOOWORK_BASE_URL in .env to the public /service/v1 API URL. The production URL is in .env.example; a staging key needs the staging URL. Then retry the command.",
    invalid_public_base_url:
      "Use an HTTPS API URL ending in /service/v1 with no query, credentials or fragment. See .env.example. The Platform Console URL is not the API URL.",
    run_setup_first:
      "Run npm run setup to create and start this application's Agent, then npm run dev. You do not need to create an Agent manually in the Console.",
    http_401:
      "The Project key was rejected. Check ZOOWORK_API_KEY and its matching API deployment in .env, then restart. Get a Project key at https://platform.zoowork.ai.",
    http_402:
      "Check Organization billing and available credits at https://platform.zoowork.ai. Model turns use the Organization wallet shared by its Projects. Retry after billing is ready.",
    http_403:
      "Check the selected Project, key permissions and account access at https://platform.zoowork.ai. Keep the same Project and deployment for recorded resources.",
    http_400:
      "Check Platform account setup, Organization billing and the configured model. See README.md: Troubleshooting. Keep retained .local state before retrying.",
    agent_config_outdated_cleanup_then_setup:
      "Stop the app, run npm run cleanup for the recorded old Agent, then npm run setup and npm run dev. Keep .local state if cleanup fails.",
  };
  return `${prefix}: ${code}.\n${guidance[code] ?? "See README.md: Troubleshooting. Check configuration and keep retained .local state; do not delete records to bypass an uncertain request."}`;
}
