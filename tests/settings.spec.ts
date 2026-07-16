import { expect, test } from "@playwright/test";

const AUDIO_KEY = "woodworking-tycoon-audio";

async function startNewGame(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("main");
  await page.getByRole("button", { name: "New Game" }).click();
  await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
}

test.describe("Settings menu & audio volume", () => {
  test("opens, adjusts volumes, mutes, and persists across reload", async ({
    page,
  }) => {
    // Accept any native confirm (e.g. New Game over an existing save) so the
    // flow is robust regardless of whether a save happens to exist.
    page.on("dialog", (d) => d.accept());

    await test.step("start a new game", async () => {
      await startNewGame(page);
    });

    await test.step("settings menu is closed until the gear is clicked", async () => {
      await expect(
        page.getByRole("dialog", { name: "Settings" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Settings" }).click();
      await expect(
        page.getByRole("dialog", { name: "Settings" }),
      ).toBeVisible();
    });

    await test.step("all three volume sliders and the mute toggle render", async () => {
      await expect(page.getByRole("slider", { name: "Master" })).toBeVisible();
      await expect(
        page.getByRole("slider", { name: "Sound Effects" }),
      ).toBeVisible();
      await expect(page.getByRole("slider", { name: "Music" })).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "Mute all" }),
      ).toBeVisible();
    });

    await test.step("dragging the master slider updates the displayed percent", async () => {
      const master = page.getByRole("slider", { name: "Master" });
      await master.fill("30");
      await expect(master).toHaveValue("30");
      // The row shows the live percentage.
      await expect(page.getByText("30%")).toBeVisible();
    });

    await test.step("muting toggles the checkbox on", async () => {
      const mute = page.getByRole("checkbox", { name: "Mute all" });
      await mute.check();
      await expect(mute).toBeChecked();
    });

    await test.step("preferences are written to their own localStorage key", async () => {
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        AUDIO_KEY,
      );
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.master).toBe(0.3);
      expect(parsed.muted).toBe(true);
    });

    await test.step("Escape closes the menu", async () => {
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Settings" }),
      ).toHaveCount(0);
    });

    await test.step("preferences survive a full page reload", async () => {
      await page.reload();
      await page.waitForSelector("main");
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        AUDIO_KEY,
      );
      const parsed = JSON.parse(raw!);
      expect(parsed.master).toBe(0.3);
      expect(parsed.muted).toBe(true);
    });

    await test.step("the reloaded store rehydrates into the UI", async () => {
      await page.getByRole("button", { name: "New Game" }).click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
      await page.getByRole("button", { name: "Settings" }).click();
      await expect(page.getByRole("slider", { name: "Master" })).toHaveValue(
        "30",
      );
      await expect(
        page.getByRole("checkbox", { name: "Mute all" }),
      ).toBeChecked();
    });
  });
});
