const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const date = (value) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "CNY" }).format(
    value,
  );
const title = (value) =>
  String(value)
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
const category = {
  delivery: "Delivery issue",
  refund: "Refund request",
  return: "Return request",
  damage: "Damaged item",
};
const errors = {
  conversation_busy:
    "This conversation is still working. Review a pending ticket or wait for the reply.",
  order_not_found: "No matching order belongs to this sample customer.",
  session_not_ready:
    "The session is not ready. Use Recover conversation to resume setup.",
  message_replay_mismatch:
    "This saved message has different contents. Start a new message.",
  conversation_limit_reached:
    "This browser has reached the limit of 20 conversations.",
  http_401: "The Project key was rejected. Check the server configuration.",
  http_402: "The Project needs credits before the conversation can continue.",
  http_403: "The Project key does not have access to this resource.",
  http_404:
    "The recorded Platform resource was not found. Check the key and deployment before recreating anything.",
  timeout_or_cancelled:
    "The request timed out. Saved business results are retained.",
  turn_failed:
    "The Agent could not finish this turn. Recover the conversation before continuing.",
  turn_aborted:
    "The turn was interrupted. Recover the conversation before continuing.",
};
let bootstrap,
  snapshot,
  conversationId,
  selectedOrder = "ORD-1001",
  busy = false,
  polling = false,
  pendingMessage;
let messageSignature = "",
  confirmationSignature = "";
const welcome =
  '<div class="welcome"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 13h30v22H22L9 43V13Z"/><path d="M17 22h14M17 28h9"/></svg><h2>Let’s sort it out.</h2><p>Find your order, follow its delivery, or request after-sales help. You review every ticket before it’s created.</p></div>';

const toolLabels = {
  lookup_order: "Order lookup",
  lookup_shipment: "Shipment lookup",
  create_support_ticket: "After-sales ticket",
};
function toolStep(job) {
  const waiting = job.status === "waiting_confirmation";
  const state = waiting
    ? "waiting"
    : job.decision === "cancel" || job.decision === "timeout"
      ? "stopped"
      : job.isError
        ? "failed"
        : "complete";
  const label = waiting
    ? "Awaiting confirmation"
    : job.decision === "cancel"
      ? "Cancelled"
      : job.decision === "timeout"
        ? "Expired"
        : job.isError
          ? "Failed"
          : job.status === "result"
            ? "Result saved"
            : "Result returned";
  const result = job.result ?? {};
  const orderId =
    job.input?.order_id ??
    result.order?.id ??
    result.shipment?.orderId ??
    result.ticket?.orderId ??
    "";
  let summary;
  if (waiting)
    summary = "Review the request before the backend creates a ticket.";
  else if (job.decision === "cancel")
    summary = "You cancelled the request. No ticket was created.";
  else if (job.decision === "timeout" || result.code === "confirmation_timeout")
    summary = "Confirmation expired. No ticket was created.";
  else if (job.isError)
    summary =
      errors[result.code] ??
      "The tool could not complete this operation. See tool call details.";
  else if (result.order)
    summary = `${result.order.items.map((item) => item.name).join(", ")} · ${title(result.order.status)} · ${money(result.order.total)}`;
  else if (result.shipment)
    summary = `${title(result.shipment.status)} · Estimated ${result.shipment.estimatedDelivery} · ${result.shipment.carrier}`;
  else if (result.ticket)
    summary = `${result.ticket.id} · ${title(result.ticket.status)} · ${category[result.ticket.category] ?? title(result.ticket.category)}`;
  else summary = "The backend saved the tool result.";
  const flow = waiting
    ? "Agent requested → Awaiting your confirmation"
    : job.status === "result"
      ? "Agent requested → Backend result saved; delivery pending"
      : job.status === "terminal" &&
          String(result.code ?? "").startsWith("tool_")
        ? "Agent requested → Platform call ended"
        : "Agent requested → Backend result returned to Agent";
  return `<article class="tool-step" data-state="${state}" data-tool-call="${escape(job.callId)}" aria-label="${escape(toolLabels[job.name] ?? job.name)}: ${label}"><div class="tool-step-heading"><span class="tool-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m8 5-6 7 6 7M16 5l6 7-6 7M14 4l-4 16"/></svg></span><strong>${escape(toolLabels[job.name] ?? job.name)}</strong><span class="tool-state">${label}</span></div><div class="tool-meta"><code>${escape(job.name)}</code>${orderId ? `<span>${escape(orderId)}</span>` : ""}</div><p class="tool-result">${escape(summary)}</p><p class="tool-flow">${flow}</p>${waiting ? `<button class="secondary tool-review" data-review-call="${escape(job.callId)}">Review ticket request <span aria-hidden="true">→</span></button>` : ""}</article>`;
}
function renderTimeline(messages, trace) {
  const entries = [
    ...messages.map((message, index) => ({
      at: Date.parse(message.at),
      rank: message.role === "user" ? 0 : 2,
      index,
      html: `<article class="message ${escape(message.role)}"><div class="message-header"><strong>${message.role === "user" ? "You" : "Customer Support"}</strong><time>${escape(date(message.at))}</time></div><div class="message-body">${escape(message.text)}</div></article>`,
    })),
    ...trace.map((job, index) => ({
      at: Number.isFinite(Date.parse(job.requestedAt))
        ? Date.parse(job.requestedAt)
        : Infinity,
      rank: 1,
      index,
      html: toolStep(job),
    })),
  ];
  entries.sort((a, b) => a.at - b.at || a.rank - b.rank || a.index - b.index);
  return entries.length ? entries.map((entry) => entry.html).join("") : welcome;
}

function replaceRegion(element, html) {
  if (element.innerHTML === html) return;
  const active = element.contains(document.activeElement)
    ? document.activeElement
    : undefined;
  const key = active?.dataset.conversation
    ? "conversation"
    : active?.dataset.order
      ? "order"
      : active?.dataset.reviewCall
        ? "reviewCall"
        : undefined;
  const value = key ? active.dataset[key] : undefined;
  element.innerHTML = html;
  if (key)
    [...element.querySelectorAll("button")]
      .find((button) => button.dataset[key] === value)
      ?.focus({ preventScroll: true });
}

function notice(message) {
  $("#notice").textContent = message;
  $("#notice").hidden = !message;
}
async function api(path, input) {
  const response = await fetch(path, {
    method: input === undefined ? "GET" : "POST",
    headers:
      input === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "X-CSRF-Token": bootstrap.csrf,
          },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "request_failed");
  return result;
}
function showError(error) {
  notice(
    errors[error.message] ??
      `The request could not complete (${error.message === "Failed to fetch" ? "connection unavailable" : error.message}). Your saved state is retained. Refresh or recover the conversation.`,
  );
}
function controls() {
  const status = snapshot?.conversation.status ?? "ready";
  $("#send").disabled = busy || (!!conversationId && status !== "ready");
  $("#new").disabled = busy;
  $("#recover").disabled = busy;
  for (const button of document.querySelectorAll("[data-decision]"))
    button.disabled = busy;
  $("#send").firstChild.textContent = busy ? "Sending " : "Send ";
  $("#composer-hint").textContent =
    status === "waiting_confirmation"
      ? "Review the ticket request in the order panel to continue."
      : status === "running"
        ? "Your Agent is working. You can write your next message while you wait."
        : "Enter to send · Shift + Enter for a new line";
}
function renderConversations() {
  replaceRegion(
    $("#conversations"),
    bootstrap.conversations.length
      ? bootstrap.conversations
          .map(
            (conversation, index) =>
              `<button class="conversation-link" data-conversation="${escape(conversation.id)}" aria-current="${conversation.id === conversationId}"><strong>Conversation ${bootstrap.conversations.length - index}</strong><span>${escape(date(conversation.createdAt))}</span></button>`,
          )
          .join("")
      : '<p class="empty-copy">Start with an order below.</p>',
  );
}
function renderContext() {
  const orders = snapshot?.orders ?? bootstrap.orders;
  if (!orders.some((order) => order.id === selectedOrder))
    selectedOrder = orders[0]?.id;
  replaceRegion(
    $("#order-tabs"),
    orders
      .map(
        (order) =>
          `<button data-order="${escape(order.id)}" aria-pressed="${order.id === selectedOrder}">${escape(order.id)}</button>`,
      )
      .join(""),
  );
  const order = orders.find((value) => value.id === selectedOrder);
  $("#order").innerHTML = order
    ? `<div class="order-title"><h3>${escape(order.id)}</h3><span class="badge">${escape(title(order.status))}</span></div>${order.items.map((item) => `<div class="item"><div class="item-symbol"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 8V5h12v3M8 8h16v20H8V8Z"/><path d="M8 16h16M12 21h8"/></svg></div><div class="item-text"><strong>${escape(item.name)}</strong><p>Quantity ${item.quantity}</p></div><span class="money">${escape(money(item.price))}</span></div>`).join("")}<dl class="facts"><dt>Placed</dt><dd>${escape(date(order.placedAt))}</dd><dt>Order total</dt><dd>${escape(money(order.total))}</dd></dl>`
    : '<p class="empty-copy">No orders available.</p>';
  const shipment = snapshot?.shipments.find(
    (value) => value.orderId === selectedOrder,
  );
  $("#shipment").innerHTML = shipment
    ? `<div class="shipment-header"><h2>Shipment</h2><span class="badge ${shipment.status === "delayed" ? "delayed" : ""}">${escape(title(shipment.status))}</span></div><p>${escape(shipment.carrier)} · Estimated ${escape(shipment.estimatedDelivery)}</p><p class="tracking">${escape(shipment.trackingId)}</p><ol class="timeline">${[
        ...shipment.timeline,
      ]
        .reverse()
        .map(
          (event) =>
            `<li>${escape(event.detail)}<time>${escape(date(event.at))}</time></li>`,
        )
        .join("")}</ol>`
    : '<div class="shipment-header"><h2>Shipment</h2></div><p class="empty-copy">Start a conversation to see this order’s shipment details.</p>';
  const tickets = snapshot?.tickets ?? [];
  $("#ticket-count").textContent = String(tickets.length);
  $("#tickets").innerHTML = tickets.length
    ? tickets
        .map(
          (ticket) =>
            `<article class="ticket"><div class="ticket-title"><strong>${escape(ticket.id)}</strong><span class="badge">Open</span></div><p>${escape(category[ticket.category])} · ${escape(ticket.orderId)}</p><p>${escape(ticket.reason)}</p><small>Created ${escape(date(ticket.createdAt))}</small></article>`,
        )
        .join("")
    : '<p class="empty-copy">No tickets yet. Ask for help in the conversation to prepare a request.</p>';
  const jobs = snapshot?.pending ?? [];
  const signature = JSON.stringify(jobs);
  $("#confirmation").hidden = !jobs.length;
  if (signature !== confirmationSignature) {
    confirmationSignature = signature;
    $("#confirmation").innerHTML = jobs
      .map(
        (job) =>
          `<div class="confirmation-job"><h2>Review your ticket</h2><p>We’ll save the request below. Creating a ticket does not approve a refund or a return.</p><dl class="facts"><dt>Order</dt><dd>${escape(job.input.order_id)}</dd><dt>Request</dt><dd>${escape(category[job.input.category])}</dd></dl><div class="confirmation-reason">${escape(job.input.reason)}</div><div class="confirmation-actions"><button class="primary" data-decision="confirm" data-call="${escape(job.callId)}">Confirm & create ticket</button><button class="secondary" data-decision="cancel" data-call="${escape(job.callId)}">Cancel request</button></div><p class="expiry">Confirmation expires <time>${escape(date(job.expiresAt))}</time>. No ticket is created if it expires.</p></div>`,
      )
      .join("");
  }
  const trace = snapshot?.trace ?? [];
  $("#trace-count").textContent = trace.length ? `(${trace.length})` : "";
  $("#trace").innerHTML = trace.length
    ? trace
        .map(
          (job) =>
            `<div class="trace-entry"><strong>${escape(job.name)}</strong><p>${escape(title(job.status))}${job.decision ? ` · ${escape(job.decision)}` : ""}${job.isError ? " · Error result" : ""}</p><pre>${escape(JSON.stringify({ callId: job.callId, input: job.input, result: job.result ?? { waiting: "UI confirmation" } }, null, 2))}</pre></div>`,
        )
        .join("")
    : '<p class="empty-copy">Tool results will appear here.</p>';
}
function render(value) {
  if (value) snapshot = value;
  const conversation = snapshot?.conversation;
  const status = conversation?.status ?? "ready";
  $("#status").textContent = {
    ready: conversation ? "Ready" : "Ready to start",
    creating: "Connecting",
    running: "Working",
    waiting_confirmation: "Review needed",
    error: "Needs attention",
  }[status];
  $("#status").dataset.state = status;
  $("#activity").textContent =
    status === "running"
      ? "Checking your request…"
      : status === "waiting_confirmation"
        ? "A ticket is waiting for your confirmation."
        : "";
  $("#recovery").hidden =
    status !== "error" && status !== "creating" && !pendingMessage;
  $("#recovery-copy").textContent = pendingMessage
    ? "The message response was not received. Recovery uses the same saved message ID."
    : status === "creating"
      ? "Session creation was interrupted. Recovery reuses the recorded request."
      : `${errors[conversation?.error] ?? "The conversation needs recovery."} Recovery reads saved history and retries an uncertain message with its original idempotency key.`;
  const messages = snapshot?.messages ?? [];
  const trace = snapshot?.trace ?? [];
  const signature = JSON.stringify({ messages, trace });
  if (signature !== messageSignature) {
    const log = $("#messages"),
      stick = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    replaceRegion(log, renderTimeline(messages, trace));
    messageSignature = signature;
    if (stick || messages.at(-1)?.role === "user")
      log.scrollTop = log.scrollHeight;
  }
  renderConversations();
  renderContext();
  controls();
}
async function load(id) {
  const value = await api(`/api/conversations/${id}`);
  conversationId = id;
  localStorage.setItem("support.conversation", id);
  snapshot = value;
  selectedOrder = value.conversation.selectedOrder ?? selectedOrder;
  messageSignature = "";
  confirmationSignature = "";
  render(value);
}
async function create() {
  let value;
  try {
    value = await api("/api/conversations", { id: crypto.randomUUID() });
  } catch (error) {
    bootstrap = await api("/api/bootstrap");
    if (bootstrap.conversations[0]) await load(bootstrap.conversations[0].id);
    throw error;
  }
  conversationId = value.conversation.id;
  localStorage.setItem("support.conversation", conversationId);
  bootstrap = await api("/api/bootstrap");
  snapshot = value;
  messageSignature = "";
  confirmationSignature = "";
  render(value);
}
async function send(text) {
  if (busy || $("#send").disabled) return;
  busy = true;
  notice("");
  controls();
  try {
    if (!conversationId) await create();
    const input = { id: crypto.randomUUID(), text };
    pendingMessage = { conversationId, input };
    localStorage.setItem(
      "support.pending-message",
      JSON.stringify(pendingMessage),
    );
    const value = await api(
      `/api/conversations/${conversationId}/messages`,
      input,
    );
    pendingMessage = undefined;
    localStorage.removeItem("support.pending-message");
    $("#message").value = "";
    render(value);
  } catch (error) {
    showError(error);
    bootstrap = await api("/api/bootstrap").catch(() => bootstrap);
    render();
  } finally {
    busy = false;
    controls();
  }
}
$("#composer").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("#message").value.trim();
  if (text) void send(text);
});
$("#message").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("#composer").requestSubmit();
  }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.dataset.prompt) {
    $("#message").value = button.dataset.prompt;
    $("#message").focus();
    return;
  }
  if (button.dataset.order) {
    selectedOrder = button.dataset.order;
    renderContext();
    return;
  }
  if (button.dataset.reviewCall) {
    const confirm = [
      ...document.querySelectorAll('[data-decision="confirm"]'),
    ].find((control) => control.dataset.call === button.dataset.reviewCall);
    confirm?.scrollIntoView({ block: "center", behavior: "auto" });
    confirm?.focus({ preventScroll: true });
    return;
  }
  if (busy) return;
  if (button.dataset.conversation) {
    try {
      await load(button.dataset.conversation);
    } catch (error) {
      showError(error);
    }
    return;
  }
  if (
    button.id === "new" ||
    button.id === "recover" ||
    button.dataset.decision
  ) {
    busy = true;
    controls();
    notice("");
    const target = conversationId;
    try {
      if (button.id === "new") {
        pendingMessage = undefined;
        localStorage.removeItem("support.pending-message");
        await create();
        $("#message").focus();
      } else if (button.id === "recover") {
        if (pendingMessage?.conversationId === target) {
          await api(
            `/api/conversations/${target}/messages`,
            pendingMessage.input,
          );
          pendingMessage = undefined;
          localStorage.removeItem("support.pending-message");
          $("#message").value = "";
        }
        render(
          await api(`/api/conversations/${target}/recover`, {
            retryInput: true,
          }),
        );
      } else {
        render(
          await api(`/api/conversations/${target}/decisions`, {
            callId: button.dataset.call,
            decision: button.dataset.decision,
          }),
        );
      }
    } catch (error) {
      showError(error);
    } finally {
      busy = false;
      controls();
    }
  }
});
async function start() {
  bootstrap = await api("/api/bootstrap");
  $("#mode").textContent = bootstrap.offline
    ? "Offline test fixture"
    : "Synthetic shop";
  try {
    pendingMessage =
      JSON.parse(localStorage.getItem("support.pending-message") ?? "null") ??
      undefined;
  } catch {
    localStorage.removeItem("support.pending-message");
  }
  const saved = localStorage.getItem("support.conversation");
  const id = bootstrap.conversations.some((value) => value.id === saved)
    ? saved
    : bootstrap.conversations[0]?.id;
  if (id) await load(id);
  else render();
  setInterval(async () => {
    if (!conversationId || busy || polling) return;
    polling = true;
    const target = conversationId;
    try {
      const value = await api(`/api/conversations/${target}`);
      if (target === conversationId) {
        if (
          value.conversation.selectedOrder &&
          value.conversation.selectedOrder !==
            snapshot?.conversation.selectedOrder
        )
          selectedOrder = value.conversation.selectedOrder;
        render(value);
      }
    } catch (error) {
      showError(error);
    } finally {
      polling = false;
    }
  }, 1200);
}
void start().catch((error) => {
  showError(error);
  $("#send").disabled = true;
  $("#new").disabled = true;
});
