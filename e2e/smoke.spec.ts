import { expect, test } from "@playwright/test";

test("root page responds 200 and renders", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
});
