// Tool result previews. The Platform sends each tool's result as a short
// preview string, cut at a fixed length, so a JSON result usually cannot be parsed.

/** A preview that is structured data rather than readable text. */
export function looksLikeJson(preview: string | undefined): boolean {
  const start = preview?.trimStart()[0];
  return start === "{" || start === "[";
}
