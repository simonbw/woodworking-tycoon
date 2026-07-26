import { test, expect } from "@playwright/test";
import { selectMode } from "./machine-panel";
import { goToStore, leaveStore } from "./navigation";

/**
 * The UI end of the consumables loop: how a recipe reads when the shop is
 * short of supplies, the supply cabinet that only exists once there's stock
 * to put in it, and the store aisle the packs come off.
 *
 * The loop's arithmetic — five pry-aparts yielding exactly the eight nails
 * one rustic shelf costs, the shelf refusing to start at seven, the 4 oz a
 * wipe-down spends — is in `src/game/sequences/consumables-chain.test.ts`.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** The workspace's spec-sheet card. */
function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Makeshift Workbench" });
}

test.describe("Consumables", () => {
  test("reads the shortfall, reveals the cabinet, and sells the packs", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(() => fixtures["consumables-shop"]);
    });
    await page.waitForTimeout(30);

    await test.step("shelf recipe shows its nail shortfall", async () => {
      await selectMode(
        page,
        "Makeshift Workbench",
        "Build Rustic Pallet Shelf",
      );
      await expect(page.getByText("8 nails (have 0)")).toBeVisible();
      // Nothing to run without the nails — the sheet says so where the
      // run button used to be
      await expect(
        workspaceCard(page).getByText("Load the bay to run it"),
      ).toBeVisible();
      // The sidebar supply cabinet stays hidden while everything is at zero
      await expect(page.getByText("Supplies", { exact: true })).toBeHidden();
    });

    await test.step("the cabinet appears once there's stock, and the count reads", async () => {
      // Salvaging the nails is the sequence test's job; what's on trial here
      // is the cabinet appearing and the readout following the count.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          consumables: { ...state.consumables, nails: 8 },
        }));
      });
      await page.waitForTimeout(30);
      const suppliesCard = page
        .locator("section", { hasText: /^Supplies/ })
        .first();
      await expect(suppliesCard.getByText("Nails")).toBeVisible();
      await expect(suppliesCard.getByText("8", { exact: true })).toBeVisible();
      // And the recipe's shortfall line clears
      await expect(page.getByText("8 nails (have 8)")).toBeVisible();
    });

    await test.step("the store's supplies aisle sells packs", async () => {
      const returnTo = await goToStore(page);
      await expect(page.getByText("Shop Supplies")).toBeVisible();
      await expect(page.getByText("Box of Nails")).toBeVisible();
      await expect(page.getByText("Mineral Oil Bottle")).toBeVisible();

      await page
        .locator("li", { hasText: "Mineral Oil Bottle" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("In your shop: 16 oz")).toBeVisible();
      const money = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      expect(money).toBe(10);
      await leaveStore(page, returnTo);
    });

    await test.step("the oil recipe reads its cost against the bottle", async () => {
      await selectMode(page, "Makeshift Workbench", "Oil Cutting Board");
      await expect(page.getByText("4 oz Mineral Oil (have 16)")).toBeVisible();
    });
  });
});
