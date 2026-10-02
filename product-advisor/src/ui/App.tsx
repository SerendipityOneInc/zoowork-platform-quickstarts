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
    "选购服务尚未配置。请联系应用维护者，或按 README 完成服务端 setup。",
  origin_not_allowed: "请求来源不符合应用配置，请从正确的地址打开页面。",
  message_delivery_uncertain:
    "发送结果尚未确认。请保留此会话，点击“恢复本次发送”，不要创建新的请求。",
  turn_in_progress: "当前回合还在进行，请先完成审批或停止。",
  mcp_connection_failed: "暂时无法连接商品目录。本轮没有取得新的商品依据。",
  mcp_authentication_failed:
    "商品目录要求认证，当前示例连接无法提供。请联系维护者检查目录配置。",
  catalog_tool_failed: "有一次目录查询失败，相关数据不会加入推荐。",
  approvals_unavailable: "当前服务没有启用原生审批，详情和比较暂时无法执行。",
  evidence_unavailable:
    "工具已返回，但完整商品数据暂未取得。已有结果仍可查看。",
  tool_receipt_missing:
    "目录结果缺少可读取的 receipt，暂时无法展示其商品参数。",
  approval_not_pending: "审批已经处理或过期。请刷新当前会话。",
  approval_delivery_uncertain: "审批提交结果尚未确认。请等待状态恢复。",
  approval_decision_not_allowed: "当前审批不允许这个决定。",
  stream_recovery_required: "连接暂时中断，请恢复会话状态。",
  turn_stopped: "本轮已停止，之前取得的结果仍然保留。",
  turn_failed: "本轮未完成，请检查目录连接或服务端配置。",
  request_failed: "请求未完成，请保留当前会话后重试。",
  invalid_request: "请检查预算、参数和输入长度。",
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
      new Error(errors[data.error as string] ?? "请求未完成，请稍后重试。"),
      { conversationId: data.conversationId },
    );
  return data as T;
}
const statusNames = {
  creating: "正在创建会话",
  running: "正在查询目录",
  awaiting_approval: "等待你的确认",
  finished: "本轮已完成",
  failed: "本轮未完成",
  uncertain: "发送结果待确认",
  recovering: "正在恢复连接",
};
const examples = [
  {
    category: "laptop" as const,
    budget: 6500,
    text: "预算 6500 元，办公和编程，经常带出门，至少 16 GB 内存。",
  },
  {
    category: "monitor" as const,
    budget: 2500,
    text: "预算 2500 元，找一台办公显示器，重视分辨率和 USB-C。",
  },
  {
    category: "headphones" as const,
    budget: 1000,
    text: "预算 1000 元，通勤用耳机，需要主动降噪，也在意续航。",
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
        {rank !== undefined && <span className="rank">推荐 {rank + 1}</span>}
        <label className="select-product">
          <input
            type="checkbox"
            aria-label={`把${p.name}加入比较`}
            checked={selected}
            onChange={onSelect}
            disabled={disabled || (!selected && c.selectedIds.length >= 4)}
          />
          <span>比较</span>
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
            {misses.length ? misses.join("；") : "符合已确认的目录条件"}
          </p>
        )}
        {!!item?.caveats.length && (
          <p className="card-note">{item.caveats.join("；")}</p>
        )}
        <div className="card-actions">
          <button disabled={disabled} onClick={onDetails}>
            查看完整参数
          </button>
          <details>
            <summary>数据依据</summary>
            <p>自制演示目录 · {p.catalogVersion}</p>
            <p>记录 ID：{p.productId}</p>
            <p>更新：{p.updatedAt.slice(0, 10)}。所有价格和参数都是模拟值。</p>
            {p.detailLevel === "full" &&
              Object.entries(p.specs).map(([k, v]) => (
                <p key={k}>
                  {attributeInfo[k]?.label ?? k}：{formatSpec(k, v)}
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
      setError(e instanceof Error ? e.message : "请求未完成");
    } finally {
      setBusy(false);
    }
  }
  function requirements(): Requirements {
    const amount = Number(budget);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000)
      throw new Error("请输入 1–1,000,000 元之间的预算。");
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
        <a className="brand" href="/" aria-label="Product Advisor 首页">
          <span className="brand-mark">pa</span>
          <span>Product Advisor</span>
        </a>
        <div className="top-meta">
          <span>
            {testMode ? "离线测试：Platform 为模拟环境" : "演示商品目录"}
          </span>
          <span className={`connection ${ready ? "ready" : ""}`}>
            {loading
              ? "检查服务中"
              : ready
                ? testMode
                  ? "离线测试服务"
                  : "选购服务可用"
                : "服务尚未配置"}
          </span>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <h2>选购会话</h2>
            <button
              className="icon-button"
              aria-label="新建选购会话"
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
          <nav aria-label="会话历史">
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
                      "已保存"}
                  </small>
                </button>
              ))
            ) : (
              <p className="history-empty">
                开始一次选购后，会话和比较结果会保存在这里。
              </p>
            )}
          </nav>
          <div className="sidebar-foot">
            <p>参数有出处，取舍看得见。</p>
            <span>
              价格与商品均为模拟数据。
              <br />
              此示例不提供真实购买。
            </span>
          </div>
        </aside>
        <main>
          <div className="page-heading">
            <div>
              <h1>找到适合你的那一款。</h1>
              <p>先给出预算和需求，再用商品事实做决定。</p>
            </div>
            <span className="category-count">3 类商品 · 18 条目录记录</span>
          </div>
          {!ready && !loading && (
            <div className="notice">
              选购服务尚未准备完成。请联系维护者配置服务端连接；页面不会提供未经查询的推荐。
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <section className="requirements" aria-labelledby="needs-heading">
            <div className="section-heading">
              <h2 id="needs-heading">你的选购条件</h2>
              <span>预算与硬条件会用于实际筛选</span>
            </div>
            <div className="conditions">
              <label>
                商品类别
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
                预算上限
                <div className="money-input">
                  <span>¥</span>
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    value={budget}
                    disabled={busy || !!working}
                    onChange={(e) => setBudget(e.target.value)}
                    aria-label="预算上限（元）"
                  />
                </div>
              </label>
              {category === "laptop" && (
                <>
                  <label>
                    最低内存
                    <select
                      value={ram}
                      disabled={busy || !!working}
                      onChange={(e) => setRam(e.target.value)}
                    >
                      <option value="">不限</option>
                      {[8, 16, 32].map((v) => (
                        <option key={v} value={v}>
                          {v} GB
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    最大重量（kg）
                    <input
                      type="number"
                      min="0.5"
                      max="10"
                      step="0.05"
                      placeholder="不限"
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
                  需要主动降噪
                </label>
              )}
              {category === "monitor" && (
                <label>
                  最低刷新率
                  <select
                    value={refresh}
                    disabled={busy || !!working}
                    onChange={(e) => setRefresh(e.target.value)}
                  >
                    <option value="">不限</option>
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
                <span>试试这些需求</span>
                {examples.map((e, i) => (
                  <button
                    key={e.category}
                    onClick={() => example(i)}
                    disabled={busy || !!working}
                  >
                    {categoryNames[e.category]} · {e.budget} 元
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
                <h2 id="chat-heading">一起缩小范围</h2>
                <span>{conversation ? "会话已保存" : "开始一次选购"}</span>
              </div>
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <label className="sr-only" htmlFor="needs">
                  预算与需求
                </label>
                <textarea
                  id="needs"
                  value={input}
                  maxLength={4000}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    conversation
                      ? "继续追问，或写下新的选购条件…"
                      : "例如：预算 6500 元，编程用，经常带出门…"
                  }
                  disabled={busy || !!working}
                />
                <div>
                  <span>
                    {conversation
                      ? "追问会沿用当前会话。"
                      : "可以先点一个示例，再修改需求。"}
                  </span>
                  <button
                    className="primary"
                    disabled={
                      loading || !ready || busy || !!working || !input.trim()
                    }
                  >
                    {busy ? "提交中" : conversation ? "发送追问" : "开始选购"}
                    <Icon name="arrow" />
                  </button>
                </div>
              </form>
              <div className="chat-log" ref={chatLog} aria-live="polite">
                {conversation?.messages.length ? (
                  conversation.messages.map((m) => (
                    <div className={`message ${m.role}`} key={m.id}>
                      <span>{m.role === "user" ? "你" : "选购助手"}</span>
                      <p>{m.text}</p>
                    </div>
                  ))
                ) : (
                  <div className="chat-intro">
                    <p>你更在意什么？</p>
                    <p>
                      日常办公、随身携带，还是续航和性能？把使用场景写下来，推荐会更具体。
                    </p>
                    <ul>
                      <li>价格和参数来自目录记录。</li>
                      <li>未知参数会明确标注。</li>
                      <li>完整详情和比较由你确认。</li>
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
                    <h3>确认这次目录查询</h3>
                    <p>
                      {a.tool_name?.endsWith("compare_products")
                        ? "将读取所选商品的参数并进行比较。"
                        : "将读取候选商品的完整参数。"}
                      调用对象是公开演示目录。
                    </p>
                    {a.arguments_preview && <pre>{a.arguments_preview}</pre>}
                    {a.timeout_at && (
                      <small>
                        等待截止：
                        {new Date(a.timeout_at).toLocaleTimeString("zh-CN")}
                      </small>
                    )}
                    {a.signaled ? (
                      <div>
                        <p role="status">
                          {a.deliveryUncertain
                            ? "提交结果尚未确认，请保留原决策。"
                            : "决策已提交，等待工具状态。"}
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
                            重新提交原决策
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
                            允许这次
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
                            拒绝
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {warnings.map((w) => (
                  <p className="inline-warning" key={w}>
                    {errors[w] ?? "本轮有未完成的操作，请查看调用记录。"}
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
                      ? "恢复本次发送"
                      : conversation.warnings.includes("evidence_unavailable")
                        ? "重新读取目录结果"
                        : "恢复会话状态"}
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
                  停止本轮
                </button>
              )}
            </section>
            <section className="results" aria-labelledby="results-heading">
              <p className="synthetic-notice">商品、价格和参数均为模拟数据。</p>
              <div className="section-heading">
                <h2 id="results-heading">
                  {ranked.length ? "推荐清单" : "商品候选"}
                </h2>
                <span>
                  {latestSearch
                    ? `${candidates.length} 个候选 · ${latestSearch.catalogVersion}`
                    : "等待目录查询"}
                </span>
              </div>
              {!products.length ? (
                <div className="empty-result">
                  <img src="/products/catalog.svg" alt="" />
                  <h3>
                    {latestSearch
                      ? "没有符合条件的商品"
                      : "好选择，从清楚的需求开始。"}
                  </h3>
                  <p>
                    {latestSearch
                      ? "可以调整预算或参数，再发起一次查询。我们不会自动放宽你的条件。"
                      : "选一个类别，写下预算和使用场景。查询完成后，候选、来源和比较都会在这里。"}
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
                  <span>已选 {conversation.selectedIds.length} 件商品</span>
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
                    比较所选商品
                  </button>
                </div>
              )}
              {conversation?.comparison && (
                <section
                  className="comparison"
                  aria-labelledby="comparison-heading"
                >
                  <h2 id="comparison-heading">参数比较</h2>
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="商品参数表，可横向滚动"
                  >
                    <table>
                      <caption>
                        来自 {conversation.comparison.catalogVersion}{" "}
                        的已批准比较结果
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">参数</th>
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
              <summary>查看已保存的查询快照（{evidences.length}）</summary>
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
                            search_products: "商品搜索",
                            get_products: "完整参数",
                            compare_products: "参数比较",
                          } as const
                        )[e.tool]
                      }{" "}
                      · {new Date(e.issuedAt).toLocaleTimeString("zh-CN")}
                    </h3>
                    <p>
                      {e.catalogVersion}
                      {typeof args?.maxPriceMinor === "number"
                        ? ` · 当时预算 ${formatMoney(args.maxPriceMinor)}`
                        : ""}
                    </p>
                    {e.tool === "search_products" && !!args?.filters && (
                      <p>
                        当时硬条件：
                        {Object.entries(args.filters as Record<string, unknown>)
                          .map(
                            ([key, value]) =>
                              `${({ minRamGB: "最低内存 GB", maxWeightKg: "最大重量 kg", minBatteryHours: "最低续航小时", minRefreshHz: "最低刷新率 Hz", minUsbPowerW: "最低 USB-C 供电 W", anc: "主动降噪" } as Record<string, string>)[key] ?? key} ${value}`,
                          )
                          .join("；") || "不限"}
                      </p>
                    )}
                    <div
                      className="table-scroll"
                      tabIndex={0}
                      role="region"
                      aria-label="商品参数表，可横向滚动"
                    >
                      <table>
                        <thead>
                          <tr>
                            <th>商品</th>
                            <th>目录价格</th>
                            <th>原始参数</th>
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
                                  .join("；")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!e.result.products.length && <p>此查询没有匹配商品。</p>}
                  </section>
                );
              })}
            </details>
          )}
          {conversation && (
            <details className="diagnostics">
              <summary>查看 MCP 调用记录与请求 JSON</summary>
              <p>
                {testMode
                  ? "Platform 事件为模拟；商品工具通过本机 HTTP MCP 实际执行。"
                  : "以下为 Platform 工具事件记录的请求参数。"}
              </p>
              <div>
                {Object.values(conversation.tools).map((t) => (
                  <div key={t.id}>
                    <p>
                      <code>{t.name}</code> · {t.phase}
                      {t.deniedReason
                        ? "未执行"
                        : t.phase === "blocked"
                          ? " · 等待审批"
                          : t.phase === "end" && t.executionStarted === false
                            ? " · 未执行"
                            : t.phase === "end"
                              ? t.isError
                                ? " · 调用失败"
                                : " · 已返回"
                              : " · 工具请求已发起"}
                    </p>
                    {t.args && (
                      <pre
                        tabIndex={0}
                        role="region"
                        aria-label={`${t.name} 的请求参数 JSON`}
                      >
                        <code>{JSON.stringify(t.args, null, 2)}</code>
                      </pre>
                    )}
                    {t.receiptId && (
                      <p>
                        receipt：<code>{t.receiptId}</code>
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
                  <p>尚无目录工具调用。</p>
                )}
              </div>
            </details>
          )}
        </main>
      </div>
    </div>
  );
}
