import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

test.describe("Free Selling", () => {
  test("should handle sales table and scavenging workflow", async ({
    page,
  }) => {
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await test.step("locked before free selling unlocks", async () => {
      await expect(page.getByText("Errands")).not.toBeVisible();
      // Unlock only the store: the Sales Table listing is gated on freeSelling
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          progression: { ...state.progression, storeUnlocked: true },
        }));
      });
      await page.waitForTimeout(300);
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(
        page.getByText("Sales Table", { exact: true }),
      ).not.toBeVisible();
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("load free-selling fixture", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["free-selling-shop"],
        );
      });
      await page.waitForTimeout(300);
      await expect(page.getByText("Errands")).toBeVisible();
      await expect(page.getByText("Scavenge for pallets")).toBeVisible();
    });

    await test.step("selling a shelf on the sales table", async () => {
      // Player stands at the table's operation cell, so the transfer button shows
      await page
        .locator("li", { hasText: /Rustic/i })
        .getByRole("button", { name: "→ Sales Table" })
        .click();
      // Table drains automatically: money 100 -> 160
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().money === 160,
        undefined,
        { timeout: 5000 },
      );
      await expect(page.getByText("$160.00").first()).toBeVisible();
    });

    await test.step("selling a board prices by volume", async () => {
      await page
        .locator("li", { hasText: /Board/i })
        .getByRole("button", { name: "→ Sales Table" })
        .click();
      // 3x4x1 pallet board = $1.20
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().money === 161.2,
        undefined,
        { timeout: 5000 },
      );
    });

    await test.step("sales table and priced lumber in the store", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(
        page.getByText("Sales Table", { exact: true }),
      ).toBeVisible();
      // BoardSelector now shows a price (default 8' x 4" x 4/4 pine = $38.40)
      await expect(page.getByText("$38.40")).toBeVisible();
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("scavenging trip", async () => {
      await page.getByRole("button", { name: "Go" }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText(/Out scavenging/)).toBeVisible();

      const pilesBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().materialPiles.length,
      );

      // Fast-forward to just before the return tick instead of waiting 30s
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          tick: state.player.away.returnTick,
        }));
      });

      // Next real tick resolves the trip
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().player.away === null,
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.materialPiles.length).toBeGreaterThan(pilesBefore);
      const pallets = state.materialPiles.filter(
        (pile: any) => pile.material.type === "pallet",
      );
      expect(pallets.length).toBeGreaterThanOrEqual(1);
      expect(pallets.length).toBeLessThanOrEqual(2);
      // Damaged: 6-11 deck boards
      for (const pile of pallets) {
        const deckCount = pile.material.deckBoards.filter(Boolean).length;
        expect(deckCount).toBeGreaterThanOrEqual(6);
        expect(deckCount).toBeLessThanOrEqual(11);
      }
      await expect(page.getByText("Scavenge for pallets")).toBeVisible();
    });
  });
});
