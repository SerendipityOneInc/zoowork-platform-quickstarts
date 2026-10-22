// User-facing text for the error codes the server returns. Codes are stable
// and safe to show; see the README troubleshooting table.

export const NOTICES: Record<string, string> = {
  run_setup_first: "The Agent is not set up yet. Run npm run setup, then reload.",
  platform_project_key_required: "ZOOWORK_API_KEY is missing or is not a Platform Project key (zwp_live_). Check .env and restart.",
  explicit_public_base_url_required: "ZOOWORK_BASE_URL is missing. Check .env and restart.",
  invalid_public_base_url: "ZOOWORK_BASE_URL must be an https URL ending in /service/v1. Check .env and restart.",
  session_archived: "This conversation is archived. Start a new one to continue.",
  session_not_found: "This conversation no longer exists.",
  message_not_accepted: "The Agent did not accept the message. Wait for the current reply to finish, then try again.",
  local_only_add_authentication_first: "This starter only answers on localhost. Add authentication before exposing it.",
  http_401: "The Project key was rejected. Check ZOOWORK_API_KEY and restart.",
  http_402: "The Organization has no available credits. Check Billing in Platform Console.",
  http_403: "The Project key cannot access this Agent. Check the key and its Project.",
  http_409: "The Agent is busy or the conversation changed. Try again in a moment.",
  http_429: "Rate limited. Wait a moment, then try again.",
  timeout_or_cancelled: "The request timed out. Try again.",
};

export function describe(code: string | undefined, fallback: string): string {
  return (code && NOTICES[code]) || (code ? `${fallback} (${code})` : fallback);
}
