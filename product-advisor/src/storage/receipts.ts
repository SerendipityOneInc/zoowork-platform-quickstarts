import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import {
  evidenceSchema,
  type CatalogTool,
  type Evidence,
} from "../domain/catalog.js";

export function privateDatabase(path: string): Database.Database {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  return db;
}
export class Receipts {
  readonly db: Database.Database;
  constructor(
    path: string,
    readonly retentionMs = 24 * 60 * 60 * 1000,
  ) {
    this.db = privateDatabase(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, created INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, tool TEXT NOT NULL, context TEXT NOT NULL)",
    );
  }
  create(
    tool: CatalogTool,
    catalogVersion: string,
    result: Evidence["result"],
    context: unknown = {},
  ): Evidence {
    const receipt = evidenceSchema.parse({
      receiptId: `rcp_${randomBytes(16).toString("hex")}`,
      catalogVersion,
      tool,
      issuedAt: new Date().toISOString(),
      result,
    });
    const safe: Record<string, string | number> = {};
    if (context && typeof context === "object")
      for (const k of ["agentId", "sessionId", "runId", "turn"]) {
        const v = (context as Record<string, unknown>)[k];
        if (
          (typeof v === "string" && v.length <= 128) ||
          (typeof v === "number" && Number.isFinite(v))
        )
          safe[k] = v as string | number;
      }
    this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO receipts VALUES (?, ?, ?)")
        .run(receipt.receiptId, Date.now(), JSON.stringify(receipt));
      this.db
        .prepare("INSERT INTO audit (at,tool,context) VALUES (?,?,?)")
        .run(receipt.issuedAt, tool, JSON.stringify(safe));
      this.db
        .prepare("DELETE FROM receipts WHERE created < ?")
        .run(Date.now() - this.retentionMs);
    })();
    return receipt;
  }
  get(id: string): Evidence | undefined {
    const row = this.db
      .prepare("SELECT body,created FROM receipts WHERE id=?")
      .get(id) as { body: string; created: number } | undefined;
    if (!row || Date.now() - row.created > this.retentionMs) return undefined;
    return evidenceSchema.parse(JSON.parse(row.body));
  }
  count(tool: string): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) AS n FROM audit WHERE tool=?")
        .get(tool) as { n: number }
    ).n;
  }
  forSession(agentId: string, sessionId: string): Record<string, number> {
    const counts: Record<string, number> = {
      search_products: 0,
      get_products: 0,
      compare_products: 0,
    };
    const rows = this.db
      .prepare(
        "SELECT tool FROM audit WHERE json_extract(context,'$.agentId')=? AND json_extract(context,'$.sessionId')=?",
      )
      .all(agentId, sessionId) as { tool: string }[];
    for (const row of rows) counts[row.tool] = (counts[row.tool] ?? 0) + 1;
    return counts;
  }
  close(): void {
    this.db.close();
  }
}
