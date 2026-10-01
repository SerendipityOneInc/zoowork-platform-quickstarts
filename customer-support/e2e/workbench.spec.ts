import { test, expect, type Page } from "@playwright/test";

async function send(page: Page, text: string) {
  await page.getByLabel("Message Customer Support").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}
test("track an order, ask a follow-up, cancel and then confirm a ticket; reload retains state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("Offline test fixture", { exact: true }),
  ).toBeVisible();
  await send(page, "Check ORD-1001 and its shipment.");
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(page.locator("#shipment")).toContainText("Transit delay");
  await expect(page.locator("#messages")).toContainText("delayed");
  await expect(page.locator(".tool-step code")).toHaveText([
    "lookup_order",
    "lookup_shipment",
  ]);
  await expect(page.locator(".tool-step").first()).toContainText(
    "Result returned",
  );
  await expect(page.locator(".tool-step").last()).toContainText(
    "Estimated 2026-10-02",
  );
  await expect(page.locator("details.trace")).not.toHaveAttribute("open", "");
  const sequence = await page
    .locator("#messages > article")
    .evaluateAll((nodes) => nodes.map((node) => node.className));
  expect(sequence).toEqual([
    "message user",
    "tool-step",
    "tool-step",
    "message assistant",
  ]);
  await send(page, "When should it arrive?");
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(page.locator(".message.assistant")).toHaveCount(2);
  await send(page, "Create a delivery ticket for ORD-1001.");
  await expect(
    page.getByRole("button", { name: "Cancel request" }),
  ).toBeVisible();
  await expect(page.locator("#ticket-count")).toHaveText("0");
  await expect(page.locator('.tool-step[data-state="waiting"]')).toContainText(
    "create_support_ticket",
  );
  const review = page.getByRole("button", { name: "Review ticket request" });
  await review.focus();
  await page.waitForTimeout(1600);
  await expect(review).toBeFocused();
  await review.press("Enter");
  await expect(
    page.getByRole("button", { name: "Confirm & create ticket" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(page.locator("#ticket-count")).toHaveText("0");
  await expect(page.locator('.tool-step[data-state="stopped"]')).toContainText(
    "No ticket was created",
  );
  await send(page, "Create a delivery ticket for ORD-1001.");
  await expect(
    page.getByRole("button", { name: "Confirm & create ticket" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Confirm & create ticket" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/workbench-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Confirm & create ticket" }).click();
  await expect(page.locator("#ticket-count")).toHaveText("1");
  await expect(page.locator("#status")).toHaveText("Ready");
  const ticketId = await page.locator(".ticket-title strong").innerText();
  await page.reload();
  await expect(page.locator("#ticket-count")).toHaveText("1");
  await expect(page.locator("#messages")).toContainText(ticketId);
  await expect(page.locator(".tool-step").last()).toContainText(ticketId);
  await expect(page.locator(".tool-step").last()).toContainText(
    "Result returned",
  );
  await page.getByText("Tool call details", { exact: false }).click();
  await expect(page.locator("#trace")).toContainText("confirmation_cancelled");
  await page.screenshot({
    path: ".local/workbench-confirmed.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("unknown orders and hostile tool data render safely without a ticket write", async ({
  page,
}) => {
  await page.goto("/");
  await send(page, "Check ORD-9999.");
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(page.locator("#messages")).toContainText("order_not_found");
  await expect(page.locator('.tool-step[data-state="failed"]')).toContainText([
    "No matching order",
    "No matching order",
  ]);
  await send(
    page,
    'Create a ticket for ORD-1001. <script>alert("fixture")</script>',
  );
  await expect(page.locator("#confirmation")).toContainText(
    '<script>alert("fixture")</script>',
  );
  expect(await page.locator("#confirmation script").count()).toBe(0);
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.locator("#status")).toHaveText("Ready");
  await expect(page.locator("#ticket-count")).toHaveText("0");
});
test("mobile layout retains conversation, order and confirmation controls without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await send(page, "Check ORD-1001 and its shipment.");
  await expect(page.locator("#status")).toHaveText("Ready");
  await send(page, "Create a delivery ticket for ORD-1001.");
  await expect(
    page.getByRole("button", { name: "Confirm & create ticket" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review ticket request" }).click();
  await expect(
    page.getByRole("button", { name: "Confirm & create ticket" }),
  ).toBeFocused();
  await page.screenshot({
    path: ".local/workbench-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.locator("#ticket-count")).toHaveText("0");
});
test("switching back to an empty conversation clears the previous conversation’s messages", async ({
  page,
}) => {
  await page.goto("/");
  await send(page, "Check ORD-1001 and its shipment.");
  await expect(page.locator("#status")).toHaveText("Ready");
  await page.getByRole("button", { name: "Start a new conversation" }).click();
  await expect(page.locator("#conversations button")).toHaveCount(2);
  await page.getByRole("button", { name: "Conversation 1" }).click();
  await expect(page.locator("#messages")).toContainText("Check ORD-1001");
  await page.getByRole("button", { name: "Conversation 2" }).click();
  await expect(page.locator("#messages .message")).toHaveCount(0);
  await expect(page.locator("#messages")).toContainText("Let’s sort it out.");
});
test("polling preserves keyboard focus on order and conversation controls", async ({
  page,
}) => {
  await page.goto("/");
  await send(page, "Check ORD-1001 and its shipment.");
  await expect(page.locator("#status")).toHaveText("Ready");
  const order = page.getByRole("button", { name: "ORD-1002", exact: true });
  await order.focus();
  await page.waitForTimeout(1600);
  await expect(order).toBeFocused();
  await order.press("Enter");
  await expect(order).toBeFocused();
  const conversation = page.getByRole("button", { name: "Conversation 1" });
  await conversation.focus();
  await page.waitForTimeout(1600);
  await expect(conversation).toBeFocused();
  await page.screenshot({ path: ".local/workbench-focus.png", fullPage: true });
});
