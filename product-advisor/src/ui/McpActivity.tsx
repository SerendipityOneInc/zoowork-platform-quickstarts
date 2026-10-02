import { categoryNames, formatMoney, toolNames } from "../domain/catalog.js";
import type { ConversationView, ToolState } from "../domain/conversation.js";

const labels = {
  search_products: "搜索商品",
  get_products: "读取完整参数",
  compare_products: "比较商品参数",
};
function callState(t: ToolState, c: ConversationView) {
  if (t.phase === "end" && t.executionStarted === false)
    return {
      label: "未执行",
      tone: "neutral",
      note: "请求在执行前结束，没有执行这次商品查询。",
    };
  if (t.isError)
    return {
      label: "查询失败",
      tone: "error",
      note: "工具调用失败，没有可用于推荐的新数据。",
    };
  if (t.phase === "end") {
    if (t.receiptId && c.evidence[t.receiptId])
      return {
        label: "查询成功",
        tone: "success",
        note: "工具已返回，完整商品数据已验证。",
      };
    return {
      label: "工具已返回",
      tone: "pending",
      note: t.receiptId
        ? "等待读取并验证完整商品数据。"
        : "结果缺少 receipt，无法验证商品数据。",
    };
  }
  if (t.phase === "blocked") {
    const signaled = c.approvals.some(
      (a) => a.tool_name === t.name && a.signaled,
    );
    return {
      label: signaled ? "决策已提交" : "等待审批",
      tone: "pending",
      note: signaled
        ? "继续等待工具执行结果。"
        : "尚未执行商品工具，请在对话中允许或拒绝。",
    };
  }
  if (["finished", "failed"].includes(c.status))
    return {
      label: "调用未完成",
      tone: "error",
      note: "本轮已结束，没有收到这次调用的成功结果。",
    };
  return {
    label: "正在查询",
    tone: "pending",
    note: "已发起工具请求，正在等待结果。",
  };
}
function Json({ value, label }: { value: unknown; label: string }) {
  return (
    <pre tabIndex={0} role="region" aria-label={label}>
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  );
}

export function McpActivity({
  conversation,
  testMode,
}: {
  conversation?: ConversationView;
  testMode: boolean;
}) {
  const calls = Object.values(conversation?.tools ?? {}).filter((t) =>
    toolNames.some((name) => t.name === `mcp__catalog__${name}`),
  );
  const succeeded = calls.filter(
    (t) =>
      t.phase === "end" &&
      !t.isError &&
      t.executionStarted !== false &&
      t.receiptId &&
      conversation?.evidence[t.receiptId],
  ).length;
  const notExecuted = calls.filter(
    (t) => t.phase === "end" && t.executionStarted === false,
  ).length;
  const connectionFailed = conversation?.warnings.some(
    (w) => w === "mcp_connection_failed" || w === "mcp_authentication_failed",
  );
  return (
    <section className="mcp-activity" aria-labelledby="mcp-heading">
      <div className="mcp-heading">
        <div className="mcp-title">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="7" rx="2" />
            <rect x="3" y="14" width="18" height="7" rx="2" />
            <path d="M7 6.5h.01M7 17.5h.01M11 6.5h6M11 17.5h6M12 10v4" />
          </svg>
          <div>
            <h2 id="mcp-heading">MCP 查询记录</h2>
            <p>catalog · Streamable HTTP · 只读示例商品目录</p>
          </div>
        </div>
        <p className="mcp-counts" role="status">
          {calls.length} 次请求 · {succeeded} 次成功 · {notExecuted} 次未执行
        </p>
      </div>
      <ol className="mcp-flow" aria-label="商品查询的数据流向">
        {[
          "用户需求",
          testMode ? "Platform（模拟）" : "Platform Agent",
          testMode ? "本机 HTTP MCP" : "远程 HTTP MCP",
          "商品卡与参数表",
        ].map((step, index) => (
          <li key={step}>
            <span>{step}</span>
            {index < 3 && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              >
                <path d="M4 12h16m-6-6 6 6-6 6" />
              </svg>
            )}
          </li>
        ))}
      </ol>
      <p className="mcp-provenance">
        {testMode
          ? "当前为离线演示：Platform 事件与审批由测试程序模拟；商品工具通过本机 HTTP MCP 实际执行。"
          : "工具状态来自 Platform 事件。返回商品来自成功调用的 receipt，经应用读取并验证。"}
      </p>
      {connectionFailed && (
        <p className="mcp-failure">
          本轮 MCP 连接失败，没有取得新的目录结果。已保存的成功记录仍可查看。
        </p>
      )}
      {!calls.length ? (
        <p className="mcp-empty">
          还没有 MCP
          查询。提交选购需求后，这里会展示工具名、请求参数和返回商品。
        </p>
      ) : (
        <ol className="mcp-calls">
          {calls.map((t, index) => {
            const tool = toolNames.find(
              (name) => t.name === `mcp__catalog__${name}`,
            )!;
            const state = callState(t, conversation!);
            const evidence = t.receiptId
              ? conversation!.evidence[t.receiptId]
              : undefined;
            return (
              <li className="mcp-call" key={t.id}>
                <div className="mcp-call-heading">
                  <span
                    className="mcp-call-number"
                    aria-label={`第 ${index + 1} 次请求`}
                  >
                    {index + 1}
                  </span>
                  <h3>
                    <code>{tool}</code>
                    <span>{labels[tool]}</span>
                  </h3>
                  <span className={`mcp-state ${state.tone}`} role="status">
                    {state.label}
                  </span>
                </div>
                <div className="mcp-exchange">
                  <div className="mcp-request">
                    <h4>请求参数</h4>
                    {typeof t.args?.maxPriceMinor === "number" && (
                      <p className="mcp-input-summary">
                        预算 {formatMoney(t.args.maxPriceMinor)}
                        {typeof t.args.category === "string" &&
                        t.args.category in categoryNames
                          ? ` · ${categoryNames[t.args.category as keyof typeof categoryNames]}`
                          : ""}
                      </p>
                    )}
                    {t.args ? (
                      <Json value={t.args} label={`${tool} 的请求 JSON`} />
                    ) : (
                      <p className="mcp-result-note">事件没有提供请求参数。</p>
                    )}
                  </div>
                  <div className="mcp-response">
                    <h4>MCP 返回</h4>
                    {evidence ? (
                      <>
                        <p className="mcp-result-summary">
                          返回 {evidence.result.products.length} 件商品
                          {tool === "compare_products"
                            ? ` · ${evidence.result.rows?.length ?? 0} 行参数`
                            : tool === "get_products"
                              ? "的完整参数"
                              : "摘要"}
                        </p>
                        <ul className="mcp-returned-products">
                          {evidence.result.products.map((p) => (
                            <li key={p.productId}>
                              <span>
                                {p.name} <code>{p.productId}</code>
                              </span>
                              <span>{formatMoney(p.priceMinor)}</span>
                            </li>
                          ))}
                        </ul>
                        {!evidence.result.products.length && (
                          <p className="mcp-result-note">
                            这次查询没有匹配商品。
                          </p>
                        )}
                        <p className="mcp-result-note">{state.note}</p>
                        <p className="mcp-receipt">
                          receipt <code>{evidence.receiptId}</code>
                          <br />
                          目录版本 {evidence.catalogVersion}
                        </p>
                        <details className="mcp-raw">
                          <summary>查看完整返回 JSON</summary>
                          <Json
                            value={evidence}
                            label={`${tool} 的完整结果 JSON`}
                          />
                        </details>
                      </>
                    ) : (
                      <p className="mcp-result-note">{state.note}</p>
                    )}
                  </div>
                </div>
                <details className="mcp-call-meta">
                  <summary>调用标识</summary>
                  <p>
                    工具：<code>{t.name}</code>
                  </p>
                  <p>
                    toolCallId：<code>{t.id}</code>
                  </p>
                  <p>
                    工具 phase：<code>{t.phase}</code>
                  </p>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
