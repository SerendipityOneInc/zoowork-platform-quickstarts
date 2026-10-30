import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../public/markdown.js";

test("renders the reply formatting Agents use", () => {
  assert.equal(
    renderMarkdown(
      "Order **ORD-1001** is *delayed*.\nTracking `DEMO-SF-1001`.\n\n- One\n- Two\n\n1. First\n2. Second",
    ),
    "<p>Order <strong>ORD-1001</strong> is <em>delayed</em>.<br>Tracking <code>DEMO-SF-1001</code>.</p>" +
      "<ul><li>One</li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol>",
  );
  assert.equal(
    renderMarkdown("## Next steps\n3. Third\n4. Fourth"),
    '<p class="md-heading"><strong>Next steps</strong></p><ol start="3"><li>Third</li><li>Fourth</li></ol>',
  );
  assert.equal(
    renderMarkdown("```\n**not bold** <b>\n```"),
    "<pre><code>**not bold** &lt;b&gt;</code></pre>",
  );
  assert.equal(renderMarkdown("a\n\n---\n\nb"), "<p>a</p><hr><p>b</p>");
});

test("leaves identifiers and unmatched markers as text", () => {
  assert.equal(
    renderMarkdown("Call lookup_order then create_support_ticket. 2 * 3 * 4"),
    "<p>Call lookup_order then create_support_ticket. 2 * 3 * 4</p>",
  );
  assert.equal(renderMarkdown("**open"), "<p>**open</p>");
});

test("links only for http and https, with safe attributes", () => {
  assert.equal(
    renderMarkdown("[Docs](https://zoowork.ai/docs?a=1&b=2)"),
    '<p><a href="https://zoowork.ai/docs?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Docs</a></p>',
  );
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example",
  ]) {
    const html = renderMarkdown(`[click](${href})`);
    assert.doesNotMatch(html, /<a /, href);
  }
  assert.doesNotMatch(
    renderMarkdown('[x](https://a.example/"onmouseover="alert(1))'),
    /"onmouseover/,
  );
});

test("model text cannot inject markup", () => {
  const payloads = [
    '<script>alert("x")</script>',
    '<IMG src=x onerror=alert("event")>',
    "**<img src=x onerror=alert(1)>**",
    "`<svg onload=alert(1)>`",
    "- <iframe src=javascript:alert(1)>",
    "[<img src=x onerror=alert(1)>](https://a.example)",
    "\u00000\u0000<script>alert(1)</script>",
  ];
  for (const payload of payloads) {
    const html = renderMarkdown(payload);
    assert.doesNotMatch(html, /<(script|img|svg|iframe)\b/i, payload);
    assert.doesNotMatch(html, /\u0000/, payload);
  }
  assert.equal(
    renderMarkdown('He said "hi" & <b>left</b>'),
    "<p>He said &quot;hi&quot; &amp; &lt;b&gt;left&lt;/b&gt;</p>",
  );
});
