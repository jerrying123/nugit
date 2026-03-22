import { test, expect } from "@playwright/test";
import path from "node:path";

test("popup fixture has all MVP controls", async ({ page }) => {
  const filePath = path.resolve(__dirname, "fixtures/popup-fixture.html");
  await page.goto(`file://${filePath}`);

  await expect(page.locator("#opt-in")).toBeVisible();
  await expect(page.locator("#auth-device")).toBeVisible();
  await expect(page.locator("#pat-input")).toBeVisible();
  await expect(page.locator("#save-pat")).toBeVisible();
  await expect(page.locator("#list-prs")).toBeVisible();
  await expect(page.locator("#status")).toBeVisible();
});
