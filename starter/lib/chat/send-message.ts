// What happens when the composer sends. Kept free of React so the failure
// paths can be tested directly.

import { ApiError } from "./api";

export type ComposerSend = {
  text: string;
  /** The open conversation's Session, or null for a new chat. */
  sessionId: string | null;
  /** Create the Session for a new chat; returns its id. */
  ensureSession: (firstText: string) => Promise<string>;
  /** Send through the Session's controller. It shows its own notice on failure. */
  send: (sessionId: string, text: string) => Promise<void>;
  /** Put the text back in the composer so the user can send it again. */
  restoreText: (text: string) => void;
  /** Show or clear a page-level notice. */
  setNotice: (message: string | null) => void;
};

/**
 * Never throws: a failure restores the text and is shown on the page, rather
 * than being lost as an unhandled rejection. Sending the same text again
 * reuses the failed attempt's idempotency key, so it cannot be delivered twice.
 */
export async function sendFromComposer(input: ComposerSend): Promise<boolean> {
  const { text, ensureSession, send, restoreText, setNotice } = input;
  setNotice(null);
  let sessionId = input.sessionId;
  if (!sessionId) {
    try {
      sessionId = await ensureSession(text);
    } catch (error) {
      restoreText(text);
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Could not start the conversation. Check that npm run dev is still running, then send again.",
      );
      return false;
    }
  }
  try {
    await send(sessionId, text);
    return true;
  } catch {
    restoreText(text);
    return false;
  }
}
