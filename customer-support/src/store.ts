import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}
export const categories = ["delivery", "return", "refund", "damage"] as const;
export interface Order {
  id: string;
  customerId: string;
  placedAt: string;
  status: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  currency: string;
}
export interface Shipment {
  orderId: string;
  carrier: string;
  trackingId: string;
  status: string;
  estimatedDelivery: string;
  timeline: { at: string; detail: string }[];
}
export interface Conversation {
  id: string;
  owner: string;
  customerId: string;
  sessionId?: string;
  request: { metadata: Record<string, string>; initial_events: [] };
  status: "ready" | "creating" | "running" | "waiting_confirmation" | "error";
  error?: string;
  cursor?: string;
  seq: number;
  runId?: string;
  selectedOrder?: string;
  createdAt: string;
}
export interface Turn {
  id: string;
  conversationId: string;
  text: string;
  status: "posting" | "posted" | "uncertain" | "done";
  at: string;
  runId?: string;
}
export interface ToolJob {
  conversationId: string;
  callId: string;
  name: string;
  input: Record<string, unknown>;
  requestedAt?: string;
  expiresAt: string;
  status: "waiting_confirmation" | "result" | "delivered" | "terminal";
  result?: Record<string, unknown>;
  isError?: boolean;
  decision?: "confirm" | "cancel" | "timeout";
}
export interface Ticket {
  id: string;
  conversationId: string;
  orderId: string;
  category: string;
  reason: string;
  status: "open";
  createdAt: string;
}
type Row = Record<string, unknown>;
const decode = <T>(row: Row | undefined): T | undefined =>
  row ? (JSON.parse(String(row.data)) as T) : undefined;

/** Synchronous, bounded transactions: never hold a SQLite transaction across an API call. */
export class Store {
  readonly db: DatabaseSync;
  constructor(
    path: string,
    readonly scope: string,
  ) {
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, csrf TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES visitors(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs (conversation TEXT NOT NULL REFERENCES conversations(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(conversation,id));
      CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, conversation TEXT NOT NULL REFERENCES conversations(id), fingerprint TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (conversation TEXT NOT NULL REFERENCES conversations(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(conversation,id));`);
    const existing = this.db
      .prepare("SELECT value FROM meta WHERE key=?")
      .get("scope");
    if (existing && existing.value !== scope) {
      this.db.close();
      throw new AppError("database_scope_mismatch", 409);
    }
    this.db
      .prepare("INSERT OR IGNORE INTO meta VALUES (?,?)")
      .run("scope", scope);
    this.seed();
  }
  close() {
    this.db.close();
  }
  claimProcess() {
    this.transaction(() => {
      const row = this.db
        .prepare("SELECT value FROM meta WHERE key=?")
        .get("process");
      if (row) {
        const pid = Number(row.value);
        if (!Number.isSafeInteger(pid) || pid < 1)
          throw new AppError("invalid_process_lease", 409);
        try {
          process.kill(pid, 0);
          throw new AppError("app_already_running", 409);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      this.db
        .prepare(
          "INSERT INTO meta VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run("process", String(process.pid));
    });
  }
  releaseProcess() {
    this.db
      .prepare("DELETE FROM meta WHERE key=? AND value=?")
      .run("process", String(process.pid));
  }
  transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = action();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private seed() {
    for (const [id, customerId, status, name, total] of [
      ["ORD-1001", "customer-lin", "shipped", "Trail Daypack", 329],
      ["ORD-1002", "customer-lin", "delivered", "Field Insulated Bottle", 129],
      ["ORD-2001", "customer-other", "shipped", "Another customer’s order", 99],
    ]) {
      const order: Order = {
        id: String(id),
        customerId: String(customerId),
        placedAt: "2026-09-26T09:30:00+08:00",
        status: String(status),
        items: [{ name: String(name), quantity: 1, price: Number(total) }],
        total: Number(total),
        currency: "CNY",
      };
      this.db
        .prepare("INSERT OR IGNORE INTO orders VALUES (?,?,?)")
        .run(order.id, order.customerId, JSON.stringify(order));
    }
    const shipments: Shipment[] = [
      {
        orderId: "ORD-1001",
        carrier: "Demo Express",
        trackingId: "DEMO-SF-1001",
        status: "delayed",
        estimatedDelivery: "2026-10-02",
        timeline: [
          {
            at: "2026-09-27T11:20:00+08:00",
            detail: "Dispatched from warehouse",
          },
          {
            at: "2026-09-28T16:45:00+08:00",
            detail: "Arrived at Hangzhou sorting hub",
          },
          {
            at: "2026-09-30T08:10:00+08:00",
            detail: "Transit delay. Awaiting the next transfer.",
          },
        ],
      },
      {
        orderId: "ORD-1002",
        carrier: "Demo Express",
        trackingId: "DEMO-SF-1002",
        status: "delivered",
        estimatedDelivery: "2026-09-29",
        timeline: [
          {
            at: "2026-09-27T14:00:00+08:00",
            detail: "Dispatched from warehouse",
          },
          {
            at: "2026-09-29T10:05:00+08:00",
            detail: "Delivered and signed for",
          },
        ],
      },
    ];
    for (const shipment of shipments)
      this.db
        .prepare("INSERT OR IGNORE INTO shipments VALUES (?,?)")
        .run(shipment.orderId, JSON.stringify(shipment));
  }
  visitor(id?: string) {
    if (id && /^[0-9a-f-]{36}$/.test(id)) {
      const row = this.db.prepare("SELECT * FROM visitors WHERE id=?").get(id);
      if (row) return { id, csrf: String(row.csrf) };
    }
    const visitor = { id: randomUUID(), csrf: randomUUID() };
    this.db
      .prepare("INSERT INTO visitors VALUES (?,?)")
      .run(visitor.id, visitor.csrf);
    return visitor;
  }
  verifyVisitor(id: string, csrf?: string) {
    const row = this.db.prepare("SELECT * FROM visitors WHERE id=?").get(id);
    if (!row || (csrf !== undefined && row.csrf !== csrf))
      throw new AppError("browser_identity_required", 403);
  }
  newConversation(owner: string, id: string = randomUUID()): Conversation {
    this.verifyVisitor(owner);
    if (this.db.prepare("SELECT id FROM conversations WHERE id=?").get(id)) {
      throw new AppError("conversation_id_conflict", 409);
    }
    const conversation: Conversation = {
      id,
      owner,
      customerId: "customer-lin",
      request: {
        metadata: {
          source: "customer-support",
          conversation: id,
          customer: "customer-lin",
        },
        initial_events: [],
      },
      status: "creating",
      seq: 0,
      createdAt: new Date().toISOString(),
    };
    this.saveConversation(conversation);
    return conversation;
  }
  saveConversation(value: Conversation) {
    const existing = this.db
      .prepare("SELECT owner FROM conversations WHERE id=?")
      .get(value.id);
    if (existing && existing.owner !== value.owner)
      throw new AppError("conversation_owner_immutable", 409);
    this.db
      .prepare(
        "INSERT INTO conversations VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(value.id, value.owner, JSON.stringify(value));
  }
  conversation(id: string, owner?: string): Conversation {
    const row = this.db
      .prepare("SELECT * FROM conversations WHERE id=?")
      .get(id);
    if (!row || (owner !== undefined && row.owner !== owner))
      throw new AppError("conversation_not_found", 404);
    return decode<Conversation>(row)!;
  }
  conversations(owner?: string) {
    return (
      owner
        ? this.db
            .prepare(
              "SELECT * FROM conversations WHERE owner=? ORDER BY rowid DESC",
            )
            .all(owner)
        : this.db
            .prepare("SELECT * FROM conversations ORDER BY rowid DESC")
            .all()
    ).map((row) => decode<Conversation>(row)!);
  }
  order(id: string, customer: string): Order {
    const row = this.db
      .prepare("SELECT * FROM orders WHERE id=? AND customer=?")
      .get(id, customer);
    if (!row) throw new AppError("order_not_found", 404);
    return decode<Order>(row)!;
  }
  orders(customer: string) {
    return this.db
      .prepare("SELECT * FROM orders WHERE customer=? ORDER BY id")
      .all(customer)
      .map((row) => decode<Order>(row)!);
  }
  shipment(id: string, customer: string): Shipment {
    this.order(id, customer);
    const result = decode<Shipment>(
      this.db.prepare("SELECT * FROM shipments WHERE id=?").get(id),
    );
    if (!result) throw new AppError("shipment_not_available", 404);
    return result;
  }
  turn(id: string) {
    return decode<Turn>(
      this.db.prepare("SELECT * FROM turns WHERE id=?").get(id),
    );
  }
  saveTurn(turn: Turn) {
    this.db
      .prepare(
        "INSERT INTO turns VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(turn.id, turn.conversationId, JSON.stringify(turn));
  }
  turns(id: string) {
    return this.db
      .prepare("SELECT * FROM turns WHERE conversation=? ORDER BY rowid")
      .all(id)
      .map((row) => decode<Turn>(row)!);
  }
  job(conversation: string, id: string) {
    return decode<ToolJob>(
      this.db
        .prepare("SELECT * FROM jobs WHERE conversation=? AND id=?")
        .get(conversation, id),
    );
  }
  jobs(conversation: string) {
    return this.db
      .prepare("SELECT * FROM jobs WHERE conversation=? ORDER BY rowid")
      .all(conversation)
      .map((row) => decode<ToolJob>(row)!);
  }
  saveJob(job: ToolJob) {
    this.db
      .prepare(
        "INSERT INTO jobs VALUES (?,?,?) ON CONFLICT(conversation,id) DO UPDATE SET data=excluded.data",
      )
      .run(job.conversationId, job.callId, JSON.stringify(job));
  }
  addTicket(job: ToolJob): Ticket {
    const input = job.input as {
      order_id: string;
      category: string;
      reason: string;
    };
    const fingerprint = JSON.stringify([
      job.conversationId,
      input.order_id,
      input.category,
      input.reason,
    ]);
    const existing = decode<Ticket>(
      this.db
        .prepare("SELECT * FROM tickets WHERE fingerprint=?")
        .get(fingerprint),
    );
    if (existing) return existing;
    const ticket: Ticket = {
      id: "TKT-" + randomUUID().slice(0, 8).toUpperCase(),
      conversationId: job.conversationId,
      orderId: input.order_id,
      category: input.category,
      reason: input.reason,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare("INSERT INTO tickets VALUES (?,?,?,?)")
      .run(ticket.id, job.conversationId, fingerprint, JSON.stringify(ticket));
    return ticket;
  }
  tickets(conversation: string) {
    return this.db
      .prepare("SELECT * FROM tickets WHERE conversation=? ORDER BY rowid DESC")
      .all(conversation)
      .map((row) => decode<Ticket>(row)!);
  }
  message(
    conversation: string,
    id: string,
    role: string,
    text: string,
    at: string,
  ) {
    this.db
      .prepare("INSERT OR IGNORE INTO messages VALUES (?,?,?)")
      .run(conversation, id, JSON.stringify({ id, role, text, at }));
  }
  messages(conversation: string) {
    return this.db
      .prepare("SELECT * FROM messages WHERE conversation=? ORDER BY rowid")
      .all(conversation)
      .map(
        (row) =>
          decode<{ id: string; role: string; text: string; at: string }>(row)!,
      );
  }
  snapshot(id: string, owner: string) {
    const conversation = this.conversation(id, owner);
    const orders = this.orders(conversation.customerId);
    return {
      conversation: {
        id,
        status: conversation.status,
        error: conversation.error,
        createdAt: conversation.createdAt,
        selectedOrder: conversation.selectedOrder,
      },
      customer: { name: "Lin Xia", id: "customer-lin", synthetic: true },
      orders,
      shipments: orders
        .map((order) => {
          try {
            return this.shipment(order.id, conversation.customerId);
          } catch {
            return null;
          }
        })
        .filter(Boolean),
      tickets: this.tickets(id),
      messages: this.messages(id),
      turns: this.turns(id),
      pending: this.jobs(id).filter(
        (job) => job.status === "waiting_confirmation",
      ),
      trace: this.jobs(id).map((job) => ({
        callId: job.callId,
        name: job.name,
        input: job.input,
        requestedAt: job.requestedAt,
        status: job.status,
        decision: job.decision,
        isError: job.isError,
        result: job.result,
      })),
    };
  }
}
