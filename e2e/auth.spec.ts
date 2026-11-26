import { expect, test, type Page } from "@playwright/test";
import { resetAccounts } from "./reset-db";

const PASSWORD = "correct horse battery";

// Sign-up is limited to 5 per hour per address (SEC-20), so the account is made
// once per project and the later tests only log in. They share state: serial.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetAccounts();
});

async function logIn(page: Page, username: string, password = PASSWORD) {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("AUTH-01 AUTH-07 AUTH-14: sign up, see the account, log out, log in case-insensitively", async ({
  page,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Username").fill("owner");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByText("owner", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await logIn(page, "OWNER");
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
});

test("AUTH-16: logging in returns to the full address first asked for", async ({ page }) => {
  await page.goto("/settings?x=1#top");
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();

  await logIn(page, "owner");
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname + url.search + url.hash).toBe("/settings?x=1#top");
});

test("AUTH-09: a wrong password shows one generic error", async ({ page }) => {
  await page.goto("/login");
  await logIn(page, "owner", "not the password");
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

test("SEC-60 SEC-30: the document carries hardening headers and hides the framework", async ({
  request,
}) => {
  const res = await request.get("/", { headers: { accept: "text/html" } });
  expect(res.status()).toBe(200);
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});
