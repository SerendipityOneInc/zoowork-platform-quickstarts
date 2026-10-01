import type Database from "better-sqlite3";
import { privateDatabase } from "./receipts.js";
import { AppError, type Conversation } from "../domain/conversation.js";

export class Conversations {
  readonly db: Database.Database;
  constructor(path: string) {
    this.db = privateDatabase(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, visitor TEXT NOT NULL, agent TEXT NOT NULL, body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS conversation_visitor ON conversations(visitor); CREATE UNIQUE INDEX IF NOT EXISTS conversation_create_key ON conversations(visitor,json_extract(body,'$.createKey'))",
    );
  }
  insert(c: Conversation): void {
    this.db
      .prepare("INSERT INTO conversations VALUES (?,?,?,?)")
      .run(c.id, c.visitorId, c.agentId, JSON.stringify(c));
  }
  createdByKey(visitor: string, key: string): Conversation | undefined {
    const row = this.db
      .prepare(
        "SELECT body FROM conversations WHERE visitor=? AND json_extract(body,'$.createKey')=?",
      )
      .get(visitor, key) as { body: string } | undefined;
    return row ? (JSON.parse(row.body) as Conversation) : undefined;
  }
  get(id: string, visitor?: string): Conversation {
    const row = this.db
      .prepare("SELECT body,visitor FROM conversations WHERE id=?")
      .get(id) as { body: string; visitor: string } | undefined;
    if (!row || (visitor !== undefined && row.visitor !== visitor))
      throw new AppError("conversation_not_found", 404);
    return JSON.parse(row.body) as Conversation;
  }
  update(id: string, fn: (c: Conversation) => void): Conversation {
    return this.db.transaction(() => {
      const c = this.get(id);
      fn(c);
      this.db
        .prepare("UPDATE conversations SET body=? WHERE id=?")
        .run(JSON.stringify(c), id);
      return c;
    })();
  }
  list(visitor: string): Conversation[] {
    return (
      this.db
        .prepare(
          "SELECT body FROM conversations WHERE visitor=? ORDER BY rowid DESC LIMIT 100",
        )
        .all(visitor) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Conversation);
  }
  forAgent(agentId: string): Conversation[] {
    return (
      this.db
        .prepare("SELECT body FROM conversations WHERE agent=?")
        .all(agentId) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Conversation);
  }
  agentIds(): string[] {
    return (
      this.db.prepare("SELECT DISTINCT agent FROM conversations").all() as {
        agent: string;
      }[]
    ).map((r) => r.agent);
  }
  active(): Conversation[] {
    return (
      this.db.prepare("SELECT body FROM conversations").all() as {
        body: string;
      }[]
    )
      .map((r) => JSON.parse(r.body) as Conversation)
      .filter((c) =>
        ["running", "awaiting_approval", "recovering"].includes(c.status),
      );
  }
  clearAgent(agentId: string): void {
    this.db.prepare("DELETE FROM conversations WHERE agent=?").run(agentId);
  }
  close(): void {
    this.db.close();
  }
}
