import { z } from "zod";

export const categories = ["laptop", "monitor", "headphones"] as const;
export const categoryNames = {
  laptop: "笔记本",
  monitor: "显示器",
  headphones: "耳机",
};
export const categorySchema = z.enum(categories);
export const scalarSchema = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const productSchema = z
  .object({
    productId: z.string().regex(/^(lap|mon|aud)-\d{2}$/),
    category: categorySchema,
    name: z.string().min(1).max(80),
    priceMinor: z.number().int().nonnegative().max(100_000_000),
    currency: z.literal("CNY"),
    specs: z.record(scalarSchema),
    availability: z.enum(["available", "unavailable"]),
    description: z.string().max(600),
    imagePath: z.string().regex(/^\/products\/[a-z]+\.svg$/),
    sourcePath: z.string().regex(/^\/products\/(lap|mon|aud)-\d{2}$/),
    catalogVersion: z.string().max(40),
    updatedAt: z.string().datetime(),
    synthetic: z.literal(true),
    detailLevel: z.enum(["summary", "full"]),
  })
  .strict();
export type Product = z.infer<typeof productSchema>;
export const filtersSchema = z
  .object({
    minRamGB: z.number().int().min(1).max(128).optional(),
    maxWeightKg: z.number().positive().max(10).optional(),
    minBatteryHours: z.number().positive().max(200).optional(),
    minRefreshHz: z.number().int().min(30).max(500).optional(),
    minUsbPowerW: z.number().int().min(1).max(250).optional(),
    anc: z.boolean().optional(),
  })
  .strict();
export const requirementsSchema = z
  .object({
    category: categorySchema.optional(),
    maxPriceMinor: z.number().int().positive().max(100_000_000).optional(),
    filters: filtersSchema.default({}),
  })
  .strict();
export type Requirements = z.infer<typeof requirementsSchema>;
export const searchSchema = z
  .object({
    category: categorySchema,
    query: z.string().max(200).optional(),
    maxPriceMinor: z.number().int().positive().max(100_000_000).optional(),
    filters: filtersSchema.default({}),
    limit: z.number().int().min(1).max(12).default(6),
  })
  .strict();
export const detailSchema = z
  .object({
    productIds: z.array(productSchema.shape.productId).min(1).max(4),
    catalogVersion: z.string().min(1).max(40),
  })
  .strict();
export const compareSchema = detailSchema.extend({
  productIds: z.array(productSchema.shape.productId).min(2).max(4),
  attributes: z.array(z.string().max(40)).min(1).max(10).optional(),
});
export const toolNames = [
  "search_products",
  "get_products",
  "compare_products",
] as const;
export type CatalogTool = (typeof toolNames)[number];
export const attributeInfo: Record<string, { label: string; unit: string }> = {
  ramGB: { label: "内存", unit: "GB" },
  weightKg: { label: "重量", unit: "kg" },
  batteryHours: { label: "目录续航", unit: "小时" },
  cpu: { label: "处理器", unit: "" },
  screenInches: { label: "屏幕尺寸", unit: "英寸" },
  resolution: { label: "分辨率", unit: "" },
  refreshHz: { label: "刷新率", unit: "Hz" },
  usbPowerW: { label: "USB-C 供电", unit: "W" },
  anc: { label: "主动降噪", unit: "" },
  connection: { label: "连接方式", unit: "" },
  ports: { label: "接口", unit: "" },
  warrantyMonths: { label: "保修", unit: "个月" },
};
export const summaryAttributes: Record<Product["category"], string[]> = {
  laptop: ["ramGB", "weightKg", "batteryHours"],
  monitor: ["screenInches", "resolution", "refreshHz", "usbPowerW"],
  headphones: ["anc", "batteryHours", "weightKg"],
};
export const defaultAttributes: Record<Product["category"], string[]> = {
  laptop: ["ramGB", "weightKg", "batteryHours", "cpu", "ports"],
  monitor: ["screenInches", "resolution", "refreshHz", "usbPowerW"],
  headphones: ["anc", "batteryHours", "weightKg", "connection"],
};
const numericFilters = [
  ["minRamGB", "ramGB", "min"],
  ["maxWeightKg", "weightKg", "max"],
  ["minBatteryHours", "batteryHours", "min"],
  ["minRefreshHz", "refreshHz", "min"],
  ["minUsbPowerW", "usbPowerW", "min"],
] as const;
export function mismatches(p: Product, r: Requirements): string[] {
  const reasons: string[] = [];
  if (r.category && p.category !== r.category) reasons.push("商品类别不同");
  if (p.availability !== "available") reasons.push("目录标记为不可选购");
  if (r.maxPriceMinor !== undefined && p.priceMinor > r.maxPriceMinor)
    reasons.push("超过预算");
  for (const [filter, attribute, direction] of numericFilters) {
    const target = r.filters[filter];
    if (target === undefined) continue;
    const value = p.specs[attribute];
    if (typeof value !== "number")
      reasons.push(`${attributeInfo[attribute]!.label}未提供`);
    else if (direction === "min" ? value < target : value > target)
      reasons.push(`${attributeInfo[attribute]!.label}不满足条件`);
  }
  if (r.filters.anc !== undefined && p.specs.anc !== r.filters.anc)
    reasons.push("降噪条件未满足");
  return reasons;
}
export const matrixRowSchema = z
  .object({
    key: z.string(),
    label: z.string(),
    unit: z.string(),
    values: z.record(scalarSchema),
  })
  .strict();
export const evidenceSchema = z
  .object({
    receiptId: z.string().regex(/^rcp_[a-f0-9]{32}$/),
    catalogVersion: z.string().min(1).max(40),
    tool: z.enum(toolNames),
    issuedAt: z.string().datetime(),
    result: z
      .object({
        products: z.array(productSchema).max(12),
        total: z.number().int().nonnegative().optional(),
        rows: z.array(matrixRowSchema).max(10).optional(),
      })
      .strict(),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
export function formatMoney(minor: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}
export function formatSpec(key: string, value: unknown): string {
  if (value === null || value === undefined) return "目录未提供";
  if (typeof value === "boolean") return value ? "支持" : "不支持";
  return `${String(value)}${attributeInfo[key]?.unit ? ` ${attributeInfo[key]!.unit}` : ""}`;
}
