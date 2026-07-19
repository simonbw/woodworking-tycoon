import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

test.describe("Marketplace", () => {
  test("should handle listings, sales, and scavenging workflow", async ({
    page,
  }) => {
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await test.step("locked before the marketplace unlocks", async () => {
      await expect(page.getByText("Errands")).not.toBeVisible();
      await expect(
        page.getByText("Marketplace", { exact: true }),
      ).not.toBeVisible();
    });

    await test.step("load marketplace fixture", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["marketplace-shop"],
        );
      });
      await page.waitForTimeout(300);
      await expect(page.getByText("Errands")).toBeVisible();
      await expect(
        page.getByText("Marketplace", { exact: true }),
      ).toBeVisible();
    });

    await test.step("list a shelf at fair value", async () => {
      await page.getByText("Marketplace", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("SawdustList")).toBeVisible();

      // The shelf row in "List an item" is pre-priced at fair value ($60)
      await page
        .locator("li", { hasText: /Rustic/i })
        .getByRole("button", { name: "List" })
        .click();
      await page.waitForTimeout(300);

      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.listings.length).toBe(1);
      expect(state.listings[0].askingPrice).toBe(60);
      // Listing boxes the item up: it leaves the inventory unpaid
      expect(state.money).toBe(100);
      expect(
        state.player.inventory.some((m: any) => m.type === "rusticShelf"),
      ).toBe(false);
    });

    await test.step("a fairly priced listing sells within the pity window", async () => {
      // Fast-forward past the pity window rather than waiting out the roll
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          tick: state.listings[0].listedAtTick + 2 * 600,
        }));
      });
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().money === 160,
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.listings.length).toBe(0);
      // The buyer left a review
      expect(state.reputation).toBeGreaterThan(5);
    });

    await test.step("scavenging trip", async () => {
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
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
