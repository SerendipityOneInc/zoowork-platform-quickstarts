import { requirementsSchema, type Requirements } from "./catalog.js";
export function confirmedRequirements(
  text: string,
  previous: Requirements,
): Requirements {
  const next = { ...previous, filters: { ...previous.filters } };
  const budget =
    /\bbudget\s*(?:(?:limit|cap|maximum|of|is|to|at|down to|lowered to|reduced to|changed to|set to)\s*)*(?:CNY\s*|RMB\s*|¥\s*)?(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i.exec(
      text,
    );
  if (budget)
    next.maxPriceMinor = Math.round(
      Number(budget[1]!.replaceAll(",", "")) * 100,
    );
  const categories = [
    ...text.matchAll(/\b(laptops?|monitors?|headphones?)\b/gi),
  ].map((m) => m[1]!.toLowerCase().replace(/s$/, ""));
  if (new Set(categories).size === 1)
    next.category =
      categories[0] === "laptop"
        ? "laptop"
        : categories[0] === "monitor"
          ? "monitor"
          : "headphones";
  const ram =
    /\b(\d+)\s*GB\s+(?:of\s+)?(?:RAM|memory)\b|\b(?:RAM|memory)\s*(?:of|at least|minimum|:)?\s*(\d+)\s*GB\b/i.exec(
      text,
    );
  if (ram && next.category === "laptop")
    next.filters.minRamGB = Number(ram[1] ?? ram[2]);
  const weight =
    /\b(?:no more than|at most|under|below|less than|maximum(?: weight)?(?: of)?|max(?: weight)?)\s*(\d+(?:\.\d+)?)\s*kg\b/i.exec(
      text,
    );
  if (weight) next.filters.maxWeightKg = Number(weight[1]);
  if (next.category !== "laptop") delete next.filters.minRamGB;
  if (next.category !== "monitor") {
    delete next.filters.minRefreshHz;
    delete next.filters.minUsbPowerW;
  }
  if (next.category !== "headphones") delete next.filters.anc;
  return requirementsSchema.parse(next);
}
