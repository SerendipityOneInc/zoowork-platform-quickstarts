import { readFileSync } from "node:fs";
import {
  compareSchema,
  defaultAttributes,
  detailSchema,
  mismatches,
  productSchema,
  searchSchema,
  summaryAttributes,
  attributeInfo,
  type Product,
  type CatalogTool,
  type Evidence,
} from "../src/domain/catalog.js";

export class CatalogError extends Error {}
export class Catalog {
  readonly products: Product[];
  readonly version: string;
  constructor(
    products: unknown = JSON.parse(
      readFileSync(new URL("../data/catalog.json", import.meta.url), "utf8"),
    ),
  ) {
    this.products = productSchema.array().min(1).max(100).parse(products);
    this.version = this.products[0]!.catalogVersion;
    if (
      this.products.some((p) => p.catalogVersion !== this.version) ||
      new Set(this.products.map((p) => p.productId)).size !==
        this.products.length
    )
      throw new CatalogError("invalid_catalog");
  }
  execute(tool: CatalogTool, input: unknown): Evidence["result"] {
    if (tool === "search_products") {
      const query = searchSchema.parse(input);
      const all = this.products
        .filter(
          (p) =>
            !mismatches(p, query).length &&
            (!query.query ||
              `${p.name} ${p.description} ${Object.values(p.specs).join(" ")}`
                .toLowerCase()
                .includes(query.query.toLowerCase())),
        )
        .sort(
          (a, b) =>
            a.priceMinor - b.priceMinor ||
            a.productId.localeCompare(b.productId),
        );
      const products = all.slice(0, query.limit).map((p) => ({
        ...p,
        detailLevel: "summary" as const,
        description: "",
        specs: Object.fromEntries(
          summaryAttributes[p.category].map((k) => [k, p.specs[k] ?? null]),
        ),
      }));
      return { products, total: all.length };
    }
    const query =
      tool === "compare_products"
        ? compareSchema.parse(input)
        : detailSchema.parse(input);
    if (query.catalogVersion !== this.version)
      throw new CatalogError("catalog_version_not_found");
    if (new Set(query.productIds).size !== query.productIds.length)
      throw new CatalogError("duplicate_product_ids");
    const products = query.productIds.map((id) => {
      const p = this.products.find((p) => p.productId === id);
      if (!p) throw new CatalogError("product_not_found");
      return p;
    });
    if (tool === "get_products") return { products };
    if (products.some((p) => p.category !== products[0]!.category))
      throw new CatalogError("cannot_compare_categories");
    const attrs: string[] =
      tool === "compare_products"
        ? (compareSchema.parse(input).attributes ??
          defaultAttributes[products[0]!.category])
        : defaultAttributes[products[0]!.category];
    if (
      attrs.some(
        (k) =>
          !defaultAttributes[products[0]!.category].includes(k) &&
          !summaryAttributes[products[0]!.category].includes(k),
      )
    )
      throw new CatalogError("invalid_comparison_attribute");
    return {
      products,
      rows: attrs.map((key) => ({
        key,
        ...attributeInfo[key]!,
        values: Object.fromEntries(
          products.map((p) => [p.productId, p.specs[key] ?? null]),
        ),
      })),
    };
  }
}
