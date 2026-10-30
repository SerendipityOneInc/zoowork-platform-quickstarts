import type { Product } from "./catalog.js";

export interface ApprovalSummary {
  action: string;
  products: string[];
  catalogVersion?: string;
}

/**
 * Describe a pending catalog approval in words. The argument preview is the
 * raw tool input; it may be truncated, in which case only the action is known.
 */
export function approvalSummary(
  toolName: string | undefined,
  argumentsPreview: string | undefined,
  known: Product[],
): ApprovalSummary {
  const action = toolName?.endsWith("compare_products")
    ? "Compare specifications"
    : "Retrieve full specifications";
  let args: unknown;
  try {
    args = JSON.parse(argumentsPreview ?? "");
  } catch {
    return { action, products: [] };
  }
  const input = (args && typeof args === "object" ? args : {}) as Record<
    string,
    unknown
  >;
  const ids = Array.isArray(input.productIds)
    ? input.productIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    action,
    products: ids.map((id) => {
      const name = known.find((p) => p.productId === id)?.name;
      return name ? `${name} (${id})` : id;
    }),
    ...(typeof input.catalogVersion === "string"
      ? { catalogVersion: input.catalogVersion }
      : {}),
  };
}
