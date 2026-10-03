import { useEffect, useRef, useState } from "react";
import {
  attributeInfo,
  categoryNames,
  formatMoney,
  formatSpec,
  mismatches,
  summaryAttributes,
  type Product,
  type Requirements,
} from "../domain/catalog.js";
import type { ConversationView } from "../domain/conversation.js";

const errors: Record<string, string> = {
  advisor_not_configured:
    "The advisor is not configured. Contact the maintainer or follow the server setup in README.",
  origin_not_allowed:
    "This address does not match the application configuration. Open the configured URL.",
  message_delivery_uncertain:
    "Delivery is unconfirmed. Keep this conversation and choose Resume delivery to recover the original request.",
  turn_in_progress:
    "This turn is still running. Complete the approval or stop the turn first.",
  mcp_connection_failed:
    "The catalog is unreachable. No new product evidence was obtained in this turn.",
  mcp_authentication_failed:
    "The catalog requires authentication that this demo cannot provide. Ask the maintainer to check the connection.",
  catalog_tool_failed:
    "A catalog query failed. Its data will not be included in recommendations.",
  approvals_unavailable:
    "Native approvals are unavailable. Details and comparisons cannot run.",
  evidence_unavailable:
    "The tool returned, but its full data is not available yet. Saved results remain available.",
  tool_receipt_missing:
    "The result has no readable receipt. Its product specifications cannot be displayed.",
  approval_not_pending:
    "This approval was handled or expired. Refresh the conversation.",
  approval_delivery_uncertain:
    "Approval delivery is unconfirmed. Wait for the state to recover.",
  approval_decision_not_allowed:
    "This decision is not allowed for this approval.",
  stream_recovery_required:
    "The connection was interrupted. Restore the conversation state.",
  turn_stopped:
    "This turn stopped. Previously retrieved results are preserved.",
  turn_failed:
    "This turn did not finish. Check the catalog connection or server configuration.",
  request_failed:
    "The request did not finish. Keep this conversation before retrying.",
  invalid_request: "Check the budget, filters, and message length.",
};
async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
    ...(body !== undefined
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(
        errors[data.error as string] ??
          "The request did not finish. Try again later.",
      ),
      { conversationId: data.conversationId },
    );
  return data as T;
}
const statusNames = {
  creating: "Creating conversation",
  running: "Querying catalog",
  awaiting_approval: "Awaiting your approval",
  finished: "Turn complete",
  failed: "Turn incomplete",
  uncertain: "Delivery unconfirmed",
  recovering: "Recovering connection",
};
const examples = [
  {
    category: "laptop" as const,
    budget: 6500,
    text: "Budget CNY 6500 for office work and coding. I travel often and need at least 16 GB RAM.",
  },
  {
    category: "monitor" as const,
    budget: 2500,
    text: "Budget CNY 2500 for an office monitor. Resolution and USB-C matter most.",
  },
  {
    category: "headphones" as const,
    budget: 1000,
    text: "Budget CNY 1000 for commuting headphones. I need active noise cancellation and good battery life.",
  },
];
function Icon({
  name,
}: {
  name: "arrow" | "plus" | "check" | "compare" | "close";
}) {
  const paths = {
    arrow: "M4 12h16m-6-6 6 6-6 6",
    plus: "M12 4v16M4 12h16",
    check: "m5 12 4 4L19 6",
    compare: "M5 5h5v14H5zm9 0h5v14h-5z",
    close: "m6 6 12 12M18 6 6 18",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function ProductCard({
  p,
  c,
  selected,
  onSelect,
  onDetails,
  rank,
  disabled,
}: {
  p: Product;
  c: ConversationView;
  selected: boolean;
  onSelect: () => void;
  onDetails: () => void;
  rank?: number;
  disabled: boolean;
}) {
  const misses = mismatches(p, c.requirements);
  const item = c.shortlist.find((s) => s.product.productId === p.productId);
  return (
    <article className={`product ${selected ? "selected" : ""}`}>
      <div className="product-visual">
        <img src={p.imagePath} alt="" />
        {rank !== undefined && <span className="rank">Pick {rank + 1}</span>}
        <label className="select-product">
          <input
            type="checkbox"
            aria-label={`Select ${p.name} for comparison`}
            checked={selected}
            onChange={onSelect}
            disabled={disabled || (!selected && c.selectedIds.length >= 4)}
          />
          <span>Compare</span>
        </label>
      </div>
      <div className="product-body">
        <div className="product-name">
          <h3>{p.name}</h3>
          <span className="product-id">{p.productId}</span>
        </div>
        <p className="price">{formatMoney(p.priceMinor)}</p>
        <dl className="specs">
          {summaryAttributes[p.category].map((k) => (
            <div key={k}>
              <dt>{attributeInfo[k]?.label}</dt>
              <dd>{formatSpec(k, p.specs[k])}</dd>
            </div>
          ))}
        </dl>
        {item ? (
          <ul className="reasons">
            {item.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="card-note">
            {misses.length
              ? misses.join("; ")
              : "Meets the confirmed catalog requirements"}
          </p>
        )}
        {!!item?.caveats.length && (
          <p className="card-note">{item.caveats.join("; ")}</p>
        )}
        <div className="card-actions">
          <button disabled={disabled} onClick={onDetails}>
            View full specifications
          </button>
          <details>
            <summary>Evidence</summary>
            <p>Synthetic demo catalog · {p.catalogVersion}</p>
            <p>Record ID: {p.productId}</p>
            <p>
              Updated: {p.updatedAt.slice(0, 10)}. All prices and specifications
              are synthetic.
            </p>
            {p.detailLevel === "full" &&
              Object.entries(p.specs).map(([k, v]) => (
                <p key={k}>
                  {attributeInfo[k]?.label ?? k}: {formatSpec(k, v)}
                </p>
              ))}
          </details>
        </div>
      </div>
    </article>
  );
}
export function App() {
  const chatLog = useRef<HTMLDivElement>(null);
  const [testMode, setTestMode] = useState(false);
  const [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [conversation, setConversation] = useState<ConversationView>(),
    [history, setHistory] = useState<
      { id: string; title: string; status: string }[]
    >([]);
  const [category, setCategory] = useState<Product["category"]>("laptop"),
    [budget, setBudget] = useState("6500"),
    [ram, setRam] = useState("16"),
    [weight, setWeight] = useState(""),
    [anc, setAnc] = useState(false),
    [refresh, setRefresh] = useState("");
  const [input, setInput] = useState(""),
    [sendingId, setSendingId] = useState<string>();
  const working =
    conversation && !["finished", "failed"].includes(conversation.status);
  const historyRefresh = () =>
    api<typeof history>("/conversations")
      .then(setHistory)
      .catch(() => {});
  useEffect(() => {
    void api<{ ready: boolean; testMode: boolean }>("/status")
      .then((s) => {
        setTestMode(s.testMode);
        setReady(s.ready);
        if (s.ready) void historyRefresh();
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!conversation?.id) return;
    const events = new EventSource(
      `/api/conversations/${conversation.id}/events`,
    );
    events.onmessage = (e) =>
      setConversation(JSON.parse(e.data) as ConversationView);
    events.onerror = () => {};
    return () => events.close();
  }, [conversation?.id]);
  useEffect(() => {
    if (chatLog.current)
      chatLog.current.scrollTop = chatLog.current.scrollHeight;
  }, [conversation?.messages.length, conversation?.approvals[0]?.approval_id]);
  useEffect(() => {
    if (
      conversation?.status === "finished" ||
      conversation?.status === "failed"
    )
      void historyRefresh();
  }, [conversation?.status]);
  useEffect(() => {
    if (conversation?.approvals.length)
      document
        .querySelector(".approval")
        ?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [conversation?.approvals[0]?.approval_id]);
  function adopt(c: ConversationView) {
    setConversation(c);
    if (c.requirements.category) setCategory(c.requirements.category);
    if (c.requirements.maxPriceMinor)
      setBudget(String(c.requirements.maxPriceMinor / 100));
    setRam(String(c.requirements.filters.minRamGB ?? ""));
    setWeight(String(c.requirements.filters.maxWeightKg ?? ""));
    setAnc(c.requirements.filters.anc ?? false);
    setRefresh(String(c.requirements.filters.minRefreshHz ?? ""));
    void historyRefresh();
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request incomplete");
    } finally {
      setBusy(false);
    }
  }
  function requirements(): Requirements {
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
      throw new Error("Enter a budget between CNY 1 and CNY 1,000,000.");
    const filters: Requirements["filters"] = {};
    if (category === "laptop" && ram) filters.minRamGB = Number(ram);
    if (category === "laptop" && weight) filters.maxWeightKg = Number(weight);
    if (category === "headphones" && anc) filters.anc = true;
    if (category === "monitor" && refresh)
      filters.minRefreshHz = Number(refresh);
    return { category, maxPriceMinor: Math.round(amount * 100), filters };
  }
  async function submit(text = input) {
    if (!text.trim()) return;
    await action(async () => {
      const requestId = sendingId ?? crypto.randomUUID();
      setSendingId(requestId);
      const body = { text, requestId, requirements: requirements() };
      let c: ConversationView;
      try {
        c = await api<ConversationView>(
          conversation
            ? `/conversations/${conversation.id}/messages`
            : "/conversations",
          body,
        );
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "conversationId" in e &&
          typeof e.conversationId === "string"
        )
          adopt(
            await api<ConversationView>(`/conversations/${e.conversationId}`),
          );
        throw e;
      }
      adopt(c);
      setInput("");
      setSendingId(undefined);
    });
  }
  function example(index: number) {
    const e = examples[index]!;
    setCategory(e.category);
    setBudget(String(e.budget));
    setRam(e.category === "laptop" ? "16" : "");
    setWeight("");
    setAnc(e.category === "headphones");
    setRefresh("");
    setInput(e.text);
  }
  const evidences = Object.values(conversation?.evidence ?? {});
  const latestSearch = evidences
    .filter((e) => e.tool === "search_products")
    .at(-1);
  const candidates = latestSearch?.result.products ?? [];
  const ranked = conversation?.shortlist.map((s) => s.product) ?? [];
  const products = ranked.length ? ranked : candidates;
  const pending = conversation?.approvals ?? [];
  const warnings = [...new Set(conversation?.warnings ?? [])];
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Product Advisor home">
          <span className="brand-mark">pa</span>
          <span>Product Advisor</span>
        </a>
        <div className="top-meta">
          <span>
            {testMode ? "Offline test: mock Platform" : "Synthetic catalog"}
          </span>
          <span className={`connection ${ready ? "ready" : ""}`}>
            {loading
              ? "Checking service"
              : ready
                ? testMode
                  ? "Offline test service"
                  : "Advisor ready"
                : "Not configured"}
          </span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <h2>Conversations</h2>
            <button
              className="icon-button"
              aria-label="New conversation"
              onClick={() => {
                setConversation(undefined);
                setInput("");
                setError("");
                setSendingId(undefined);
              }}
            >
              <Icon name="plus" />
            </button>
          </div>
          <nav aria-label="Conversation history">
            {history.length ? (
              history.map((h) => (
                <button
                  key={h.id}
                  className={`history-item ${conversation?.id === h.id ? "active" : ""}`}
                  onClick={() =>
                    void action(async () =>
                      adopt(
                        await api<ConversationView>(`/conversations/${h.id}`),
                      ),
                    )
                  }
                >
                  {h.title}
                  <small>
                    {statusNames[h.status as keyof typeof statusNames] ??
                      "Saved"}
                  </small>
                </button>
              ))
            ) : (
              <p className="history-empty">
                Your conversations and comparisons will be saved here.
              </p>
            )}
          </nav>
          <div className="sidebar-foot">
            <p>Specifications with sources. Clear trade-offs.</p>
            <span>
              Products and prices are synthetic.
              <br />
              This demo does not offer purchases.
            </span>
          </div>
        </aside>
        <main>
          <div className="page-heading">
            <div>
              <h1>Find the right fit.</h1>
              <p>
                Start with your budget and needs. Decide with verified product
                facts.
              </p>
            </div>
            <span className="category-count">
              3 categories · 18 catalog records
            </span>
          </div>
          {!ready && !loading && (
            <div className="notice">
              The advisor is not ready. Ask the maintainer to configure the
              server connection. Recommendations require a successful catalog
              query.
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <section className="requirements" aria-labelledby="needs-heading">
            <div className="section-heading">
              <h2 id="needs-heading">Your requirements</h2>
              <span>Budget and requirements filter the catalog</span>
            </div>
            <div className="conditions">
              <label>
                Category
                <select
                  value={category}
                  disabled={busy || !!working}
                  onChange={(e) =>
                    setCategory(e.target.value as Product["category"])
                  }
                >
                  {Object.entries(categoryNames).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Budget limit (CNY)
                <div className="money-input">
                  <span>¥</span>
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    value={budget}
                    disabled={busy || !!working}
                    onChange={(e) => setBudget(e.target.value)}
                    aria-label="Budget limit (CNY)"
                  />
                </div>
              </label>
              {category === "laptop" && (
                <>
                  <label>
                    Minimum RAM
                    <select
                      value={ram}
                      disabled={busy || !!working}
                      onChange={(e) => setRam(e.target.value)}
                    >
                      <option value="">Any</option>
                      {[8, 16, 32].map((v) => (
                        <option key={v} value={v}>
                          {v} GB
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Maximum weight (kg)
                    <input
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.05"
                      placeholder="Any"
                      value={weight}
                      disabled={busy || !!working}
                      onChange={(e) => setWeight(e.target.value)}
                    />
                  </label>
                </>
              )}
              {category === "headphones" && (
                <label className="toggle-condition">
                  <input
                    type="checkbox"
                    checked={anc}
                    disabled={busy || !!working}
                    onChange={(e) => setAnc(e.target.checked)}
                  />
                  Require noise cancellation
                </label>
              )}
              {category === "monitor" && (
                <label>
                  Minimum refresh rate
                  <select
                    value={refresh}
                    disabled={busy || !!working}
                    onChange={(e) => setRefresh(e.target.value)}
                  >
                    <option value="">Any</option>
                    {[60, 75, 144, 165].map((v) => (
                      <option key={v} value={v}>
                        {v} Hz
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {!conversation && (
              <div className="examples">
                <span>Try an example</span>
                {examples.map((e, i) => (
                  <button
                    key={e.category}
                    onClick={() => example(i)}
                    disabled={busy || !!working}
                  >
                    {categoryNames[e.category]} · CNY {e.budget}
                  </button>
                ))}
              </div>
            )}
          </section>
          <div className="content-columns">
            <section
              className={`conversation ${conversation ? "has-session" : "first-session"}`}
              aria-labelledby="chat-heading"
            >
              <div className="section-heading">
                <h2 id="chat-heading">Narrow down your choices</h2>
                <span>
                  {conversation ? "Conversation saved" : "Start a conversation"}
                </span>
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="sr-only" htmlFor="needs">
                  Budget and needs
                </label>
                <textarea
                  id="needs"
                  value={input}
                  maxLength={4000}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    conversation
                      ? "Ask a follow-up or change your requirements..."
                      : "For example: budget CNY 6500 for coding and frequent travel..."
                  }
                  disabled={busy || !!working}
                />
                <div>
                  <span>
                    {conversation
                      ? "Follow-ups stay in this conversation."
                      : "Choose an example, then adjust it to your needs."}
                  </span>
                  <button
                    className="primary"
                    disabled={
                      loading || !ready || busy || !!working || !input.trim()
                    }
                  >
                    {busy
                      ? "Sending"
                      : conversation
                        ? "Send follow-up"
                        : "Find products"}
                    <Icon name="arrow" />
                  </button>
                </div>
              </form>
              <div className="chat-log" ref={chatLog} aria-live="polite">
                {conversation?.messages.length ? (
                  conversation.messages.map((m) => (
                    <div className={`message ${m.role}`} key={m.id}>
                      <span>
                        {m.role === "user" ? "You" : "Product Advisor"}
                      </span>
                      <p>{m.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="chat-intro">
                    <p>What matters most to you?</p>
                    <p>
                      Office work, travel, battery life, or performance?
                      Describe how you will use it to get more relevant
                      recommendations.
                    </p>
                    <ul>
                      <li>
                        Prices and specifications come from catalog records.
                      </li>
                      <li>Unknown specifications are clearly marked.</li>
                      <li>You approve full details and comparisons.</li>
                    </ul>
                  </div>
                )}
                {working && (
                  <div className="run-status" role="status">
                    <span className="activity-dot" />
                    {statusNames[conversation.status]}
                  </div>
                )}
                {pending.map((a) => (
                  <div className="approval" key={a.approval_id}>
                    <h3>Approve this catalog query</h3>
                    <p>
                      {a.tool_name?.endsWith("compare_products")
                        ? "This will retrieve and compare specifications for the selected products."
                        : "This will retrieve full specifications for the selected product."}{" "}
                      The query goes to the public demo catalog.
                    </p>
                    {a.arguments_preview && <pre>{a.arguments_preview}</pre>}
                    {a.timeout_at && (
                      <small>
                        Deadline:
                        {new Date(a.timeout_at).toLocaleTimeString("en-US")}
                      </small>
                    )}
                    {a.signaled ? (
                      <div>
                        <p role="status">
                          {a.deliveryUncertain
                            ? "Delivery is unconfirmed. Keep the original decision."
                            : "Decision submitted. Waiting for the tool state."}
                        </p>
                        {!!a.deliveryUncertain && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  `/conversations/${conversation!.id}/approvals/${a.approval_id}`,
                                  { decision: a.decision },
                                );
                              })
                            }
                          >
                            Resubmit original decision
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="approval-actions">
                        {(!a.allowed_decisions ||
                          a.allowed_decisions.includes("allow-once")) && (
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  `/conversations/${conversation!.id}/approvals/${a.approval_id}`,
                                  { decision: "allow-once" },
                                );
                              })
                            }
                          >
                            Allow once
                          </button>
                        )}
                        {(!a.allowed_decisions ||
                          a.allowed_decisions.includes("deny")) && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  `/conversations/${conversation!.id}/approvals/${a.approval_id}`,
                                  { decision: "deny" },
                                );
                              })
                            }
                          >
                            Deny
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {warnings.map((w) => (
                  <p className="inline-warning" key={w}>
                    {errors[w] ??
                      "An operation is incomplete. Check the call log."}
                  </p>
                ))}
              </div>
              {conversation &&
                (["uncertain", "recovering"].includes(conversation.status) ||
                  conversation.warnings.includes("evidence_unavailable")) && (
                  <button
                    className="recover"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await api(
                          `/conversations/${conversation.id}/retry`,
                          {},
                        );
                        adopt(
                          await api<ConversationView>(
                            `/conversations/${conversation.id}`,
                          ),
                        );
                      })
                    }
                  >
                    {conversation.status === "uncertain"
                      ? "Resume delivery"
                      : conversation.warnings.includes("evidence_unavailable")
                        ? "Read result again"
                        : "Restore conversation"}
                  </button>
                )}
              {working && conversation && (
                <button
                  className="stop"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api(
                        `/conversations/${conversation.id}/interrupt`,
                        {},
                      );
                    })
                  }
                >
                  Stop turn
                </button>
              )}
            </section>
            <section className="results" aria-labelledby="results-heading">
              <p className="synthetic-notice">
                Products, prices, and specifications are synthetic.
              </p>
              <div className="section-heading">
                <h2 id="results-heading">
                  {ranked.length ? "Shortlist" : "Candidates"}
                </h2>
                <span>
                  {latestSearch
                    ? `${candidates.length} ${candidates.length === 1 ? "candidate" : "candidates"} · ${latestSearch.catalogVersion}`
                    : "Waiting for a catalog query"}
                </span>
              </div>
              {!products.length ? (
                <div className="empty-result">
                  <img src="/products/catalog.svg" alt="" />
                  <h3>
                    {latestSearch
                      ? "No matching products"
                      : "Good choices start with clear requirements."}
                  </h3>
                  <p>
                    {latestSearch
                      ? "Adjust your budget or filters and query again. Your requirements will not be relaxed automatically."
                      : "Choose a category, budget, and use case. Candidates, evidence, and comparisons will appear here after a query."}
                  </p>
                </div>
              ) : (
                <div className="product-grid">
                  {products.map((p, i) => (
                    <ProductCard
                      key={p.productId}
                      p={p}
                      c={conversation!}
                      disabled={busy || !!working}
                      rank={ranked.length ? i : undefined}
                      selected={conversation!.selectedIds.includes(p.productId)}
                      onSelect={() =>
                        void action(async () => {
                          const ids = conversation!.selectedIds.includes(
                            p.productId,
                          )
                            ? conversation!.selectedIds.filter(
                                (id) => id !== p.productId,
                              )
                            : [...conversation!.selectedIds, p.productId];
                          setConversation(
                            await api<ConversationView>(
                              `/conversations/${conversation!.id}/selection`,
                              { productIds: ids },
                            ),
                          );
                        })
                      }
                      onDetails={() =>
                        void action(async () =>
                          adopt(
                            await api<ConversationView>(
                              `/conversations/${conversation!.id}/details`,
                              {
                                productId: p.productId,
                                catalogVersion: p.catalogVersion,
                                requestId: crypto.randomUUID(),
                              },
                            ),
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              )}
              {!!conversation?.selectedIds.length && (
                <div className="compare-bar">
                  <span>
                    {conversation.selectedIds.length}{" "}
                    {conversation.selectedIds.length === 1
                      ? "product"
                      : "products"}{" "}
                    selected
                  </span>
                  <button
                    className="primary"
                    disabled={
                      busy || !!working || conversation.selectedIds.length < 2
                    }
                    onClick={() =>
                      void action(async () =>
                        adopt(
                          await api<ConversationView>(
                            `/conversations/${conversation.id}/compare`,
                            {
                              productIds: conversation.selectedIds,
                              requestId: crypto.randomUUID(),
                            },
                          ),
                        ),
                      )
                    }
                  >
                    <Icon name="compare" />
                    Compare selected products
                  </button>
                </div>
              )}
              {conversation?.comparison && (
                <section
                  className="comparison"
                  aria-labelledby="comparison-heading"
                >
                  <h2 id="comparison-heading">Specification comparison</h2>
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Product specifications, horizontally scrollable"
                  >
                    <table>
                      <caption>
                        Approved comparison from{" "}
                        {conversation.comparison.catalogVersion}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Specification</th>
                          {conversation.comparison.result.products.map((p) => (
                            <th scope="col" key={p.productId}>
                              {p.name}
                              <small>{formatMoney(p.priceMinor)}</small>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {conversation.comparison.result.rows?.map((row) => (
                          <tr key={row.key}>
                            <th scope="row">{row.label}</th>
                            {conversation.comparison!.result.products.map(
                              (p) => (
                                <td key={p.productId}>
                                  {formatSpec(row.key, row.values[p.productId])}
                                </td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </section>
          </div>
          {conversation && evidences.length > 1 && (
            <details className="snapshots">
              <summary>View saved query snapshots ({evidences.length})</summary>
              {evidences.map((e) => {
                const args = Object.values(conversation.tools).find(
                  (t) => t.receiptId === e.receiptId,
                )?.args;
                return (
                  <section key={e.receiptId}>
                    <h3>
                      {
                        (
                          {
                            search_products: "Product search",
                            get_products: "Full specifications",
                            compare_products: "Specification comparison",
                          } as const
                        )[e.tool]
                      }{" "}
                      · {new Date(e.issuedAt).toLocaleTimeString("en-US")}
                    </h3>
                    <p>
                      {e.catalogVersion}
                      {typeof args?.maxPriceMinor === "number"
                        ? ` · Budget at query: ${formatMoney(args.maxPriceMinor)}`
                        : ""}
                    </p>
                    {e.tool === "search_products" && !!args?.filters && (
                      <p>
                        Filters at query:
                        {Object.entries(args.filters as Record<string, unknown>)
                          .map(
                            ([key, value]) =>
                              `${({ minRamGB: "Minimum RAM (GB)", maxWeightKg: "Maximum weight (kg)", minBatteryHours: "Minimum battery life (hours)", minRefreshHz: "Minimum refresh rate (Hz)", minUsbPowerW: "Minimum USB-C power (W)", anc: "Noise cancellation" } as Record<string, string>)[key] ?? key} ${value}`,
                          )
                          .join("; ") || "Any"}
                      </p>
                    )}
                    <div
                      className="table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="Product specifications, horizontally scrollable"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Catalog price</th>
                            <th>Original specifications</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.result.products.map((p) => (
                            <tr key={p.productId}>
                              <th scope="row">{p.name}</th>
                              <td>{formatMoney(p.priceMinor)}</td>
                              <td>
                                {Object.entries(p.specs)
                                  .map(
                                    ([key, value]) =>
                                      `${attributeInfo[key]?.label ?? key} ${formatSpec(key, value)}`,
                                  )
                                  .join("; ")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!e.result.products.length && (
                      <p>This query returned no matching products.</p>
                    )}
                  </section>
                );
              })}
            </details>
          )}
          {conversation && (
            <details className="diagnostics">
              <summary>View MCP calls and request JSON</summary>
              <p>
                {testMode
                  ? "Platform events are mocked. Product tools execute through a real local HTTP MCP server."
                  : "These request arguments were recorded in Platform tool events."}
              </p>
              <div>
                {Object.values(conversation.tools).map((t) => (
                  <div key={t.id}>
                    <p>
                      <code>{t.name}</code> · {t.phase}
                      {t.deniedReason
                        ? " · Not executed"
                        : t.phase === "blocked"
                          ? " · Awaiting approval"
                          : t.phase === "end" && t.executionStarted === false
                            ? " · Not executed"
                            : t.phase === "end"
                              ? t.isError
                                ? " · Call failed"
                                : " · Returned"
                              : " · Tool request sent"}
                    </p>
                    {t.args && (
                      <pre
                        tabIndex={0}
                        role="region"
                        aria-label={`${t.name} request arguments JSON`}
                      >
                        <code>{JSON.stringify(t.args, null, 2)}</code>
                      </pre>
                    )}
                    {t.receiptId && (
                      <p>
                        receipt: <code>{t.receiptId}</code>
                      </p>
                    )}
                  </div>
                ))}
                {evidences.map((e) => (
                  <p key={e.receiptId}>
                    <code>{e.receiptId}</code> · {e.tool} · {e.catalogVersion}
                  </p>
                ))}
                {!Object.keys(conversation.tools).length && (
                  <p>No catalog tool calls yet.</p>
                )}
              </div>
            </details>
          )}
        </main>
      </div>
    </div>
  );
}
