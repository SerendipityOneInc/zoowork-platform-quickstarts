import { requirementsSchema, type Requirements } from "./catalog.js";
export function confirmedRequirements(
  text: string,
  previous: Requirements,
): Requirements {
  const next = { ...previous, filters: { ...previous.filters } };
  const budget =
    /(?:预算|降到|降至|改为)\s*(?:上限|降到|降至|改为|控制在|是|为)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块|人民币)?/.exec(
      text,
    );
  if (budget) next.maxPriceMinor = Math.round(Number(budget[1]) * 100);
  const categories = [...text.matchAll(/笔记本|显示器|耳机/g)].map((m) => m[0]);
  if (new Set(categories).size === 1)
    next.category =
      categories[0] === "笔记本"
        ? "laptop"
        : categories[0] === "显示器"
          ? "monitor"
          : "headphones";
  const ram = /(?:至少|最低|内存)\s*(\d+)\s*(?:GB|G)(?:\s*内存)?/i.exec(text);
  if (ram && next.category === "laptop") next.filters.minRamGB = Number(ram[1]);
  const weight =
    /(?:不超过|低于|小于|最多)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)/i.exec(
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
