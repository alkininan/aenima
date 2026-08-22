import { expect, test } from "@playwright/test";

/**
 * Route protection, end to end. The unit test covers which paths are public;
 * this proves the proxy actually runs and actually redirects — the two things
 * a pure function cannot tell you.
 */
test("an anonymous visitor is sent from /app to sign-in", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the sign-in page asks for an email and offers no other provider", async ({ page }) => {
  const response = await page.goto("/sign-in");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();

  // Google and Apple are declared but disabled: a seam, not a stub.
  await expect(page.getByRole("button", { name: /google/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /apple/i })).toHaveCount(0);
});

test("an invalid email is caught before a code is requested", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByText("That doesn't look like an email address yet.")).toBeVisible();
  // Still on step one: no six-box code entry appeared.
  await expect(page.getByRole("group", { name: /six-digit code/i })).toHaveCount(0);
});

test("the root page stays public", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
});
