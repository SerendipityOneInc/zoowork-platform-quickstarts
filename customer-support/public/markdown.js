// Renders the small Markdown subset Agent replies use. Every piece of source text is
// HTML-escaped before any tag is added, so model or tool text can never become markup.
// Supported: paragraphs and line breaks, **bold**, *italic*, `code`, fenced code, headings
// (shown as bold lines), bullet and numbered lists, horizontal rules and https/http links.

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

// Placeholders use a control character that is removed from the source first.
const MARK = "\u0000";

function emphasis(text) {
  return text
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/__(?=\S)([^_\n]*?\S)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, "$1<em>$2</em>");
}

function inline(source) {
  const kept = [];
  const keep = (html) => `${MARK}${kept.push(html) - 1}${MARK}`;
  let text = escapeHtml(source);
  text = text.replace(/`([^`\n]+)`/g, (_, code) =>
    keep(`<code>${code}</code>`),
  );
  // The label and URL are already escaped, so quotes cannot leave the attribute.
  text = text.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, href) =>
      keep(
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${emphasis(label)}</a>`,
      ),
  );
  text = emphasis(text);
  return text.replace(
    new RegExp(`${MARK}(\\d+)${MARK}`, "g"),
    (_, index) => kept[Number(index)],
  );
}

export function renderMarkdown(source) {
  const lines = String(source ?? "")
    .replaceAll(MARK, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const html = [];
  let paragraph = [];
  let list;
  let fence;
  const flushParagraph = () => {
    if (paragraph.length)
      html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const start =
      list.type === "ol" && list.start !== 1 ? ` start="${list.start}"` : "";
    html.push(
      `<${list.type}${start}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.type}>`,
    );
    list = undefined;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (fence) {
      if (/^\s*```/.test(line)) {
        html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
        fence = undefined;
      } else fence.push(raw);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      fence = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      html.push("<hr>");
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      html.push(
        `<p class="md-heading"><strong>${inline(heading[1])}</strong></p>`,
      );
      continue;
    }
    const bullet = /^\s{0,3}[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s{0,3}(\d{1,6})[.)]\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (list?.type !== type) {
        flushList();
        list = { type, start: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      list.items.push(bullet ? bullet[1] : ordered[2]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (fence)
    html.push(`<pre><code>${escapeHtml(fence.join("\n"))}</code></pre>`);
  flushParagraph();
  flushList();
  return html.join("");
}
