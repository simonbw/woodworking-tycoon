import { expect, Page, test } from "@playwright/test";

const getState = (page: Page) =>
  page.evaluate(() => (window as any).__GET_GAME_STATE__());

test.describe("Shop manual", () => {
  test("greets a new game, tracks read state, and unlocks articles with features", async ({
    page,
  }) => {
    page.on("dialog", (d) => d.accept());
    const manual = page.getByRole("dialog", { name: "Shop manual" });

    await test.step("auto-opens to Welcome on a brand-new game", async () => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("main");
      await page.getByRole("button", { name: "New Game" }).click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);

      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Welcome to the Shop" }),
      ).toBeVisible();
    });

    await test.step("locked articles are hidden entirely", async () => {
      await expect(manual.getByRole("button", { name: /Sawdust/ })).toHaveCount(
        0,
      );
      await expect(
        manual.getByRole("button", { name: /Marketplace/ }),
      ).toHaveCount(0);
    });

    await test.step("closing acknowledges Welcome and stays closed", async () => {
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      const state = await getState(page);
      expect(state.progression.readArticles).toContain("welcome");
    });

    await test.step("the ? badge shows while Controls is still unread", async () => {
      await expect(page.getByTestId("manual-badge")).toBeVisible();
    });

    await test.step("? reopens to the first unread article and marks it read", async () => {
      await page.keyboard.press("Shift+/");
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Controls" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      await expect(page.getByTestId("manual-badge")).toHaveCount(0);
    });

    await test.step("unlocking features reveals their articles", async () => {
      // Dust past the sweeping threshold unlocks Sawdust & Cleaning; the
      // marketplace flag unlocks Marketplace & Jobs. The milestone check
      // picks both up on the next tick.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          dust: { "1,1": { pine: 80 } },
          progression: { ...s.progression, marketplaceUnlocked: true },
        }));
      });
      await expect
        .poll(async () => (await getState(page)).progression.unlockedArticles)
        .toContain("marketplace");
      await expect(page.getByTestId("manual-badge")).toBeVisible();
    });

    await test.step("a freshly unlocked article wears a NEW tab until opened", async () => {
      // Opening jumps to the first unread article (dust), so the
      // marketplace tab is still unread and marked NEW.
      await page.keyboard.press("Shift+/");
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Sawdust & Cleaning" }),
      ).toBeVisible();

      const marketTab = manual.getByRole("button", {
        name: /Marketplace & Jobs/,
      });
      await expect(marketTab).toContainText("New");
      await marketTab.click();
      await expect(
        manual.getByRole("heading", { name: "Marketplace & Jobs" }),
      ).toBeVisible();
      await expect(marketTab).not.toContainText("New");
    });

    await test.step("with everything read, the badge stays gone", async () => {
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      await expect(page.getByTestId("manual-badge")).toHaveCount(0);
    });

    await test.step("the dust card deep-links into its article", async () => {
      // The one-shot sawdust note is still up (never dismissed); its manual
      // link opens the binder straight to Sawdust & Cleaning.
      await page
        .getByRole("button", { name: "Shop Manual → Sawdust & Cleaning" })
        .click();
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Sawdust & Cleaning" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
    });
  });
});
