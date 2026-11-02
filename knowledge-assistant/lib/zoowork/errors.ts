import { ZooworkError } from "@zoowork-ai/sdk";

/**
 * A failure with a stable, printable code. Codes are safe to show in a
 * terminal or a browser: they never carry keys, request bodies or provider
 * error text. The README's troubleshooting table is keyed by these codes.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

/** Reduce any thrown value to a safe code. */
export function errorCode(error: unknown): string {
  if (error instanceof AppError) return error.code;
  if (error instanceof ZooworkError) return `http_${error.status}`;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "timeout_or_cancelled";
  }
  return "request_failed";
}

/** HTTP status for a route response. Platform 4xx keep their status; anything else is 502. */
export function errorStatus(error: unknown): number {
  if (error instanceof AppError) return error.status;
  if (error instanceof ZooworkError && error.status >= 400 && error.status < 500) return error.status;
  return 502;
}

export const isCode = (error: unknown, code: string) => error instanceof AppError && error.code === code;

/** The request never got an answer: a network failure or a timeout. A cancelled request does not count. */
export function isTransportFailure(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return false;
  return error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError");
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ZooworkError && error.status === 404;
}
