import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** The workspace's spec-sheet card. */
function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Workspace" });
}

async function nailCount(page: any): Promise<number> {
  return page.evaluate(
    () => (window as any).__GET_GAME_STATE__().consumables.nails,
  );
}

test.describe("Consumables", () => {
  test("salvaged nails build the shelf, store oil finishes the board", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(
        () => fixtures["consumables-shop"],
      );
    });
    await page.waitForTimeout(300);
    // 20 ticks/second so the timed operations fly by
    await page.keyboard.press("3");

    await test.step("shelf recipe shows its nail shortfall", async () => {
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Build Rustic Pallet Shelf" });
      await page.waitForTimeout(200);
      await expect(page.getByText("8 nails (have 0)")).toBeVisible();
      await expect(
        workspaceCard(page).getByRole("button", { name: "Operate" }),
      ).toBeDisabled();
    });

    await test.step("dismantling the pallet returns its nails", async () => {
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Dismantle Pallet" });
      await page.waitForTimeout(200);
      // Four single deck boards, then the final pry-apart (3 stringers + 1
      // deck board): 8 boards and 8 nails all told
      const outputsAfterRun = [1, 2, 3, 4, 8];
      for (const expected of outputsAfterRun) {
        await workspaceCard(page)
          .getByRole("button", { name: "Operate" })
          .click();
        await page.waitForFunction(
          (count: number) => {
            const machine = (window as any).__GET_GAME_STATE__().machines[0];
            return (
              machine.operationProgress.status === "notStarted" &&
              machine.outputMaterials.length === count
            );
          },
          expected,
          { timeout: 15000 },
        );
      }
      expect(await nailCount(page)).toBe(8);
    });

    await test.step("the salvaged nails cover one rustic shelf", async () => {
      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Build Rustic Pallet Shelf" });
      await page.waitForTimeout(200);
      await expect(page.getByText("8 nails (have 8)")).toBeVisible();

      // Load exactly 2 stringers and 3 deck boards
      for (let i = 0; i < 2; i++) {
        await page
          .locator("li", { hasText: 'x6"x3/4' })
          .getByRole("button", { name: "→ Workspace" })
          .click();
        await page.waitForTimeout(150);
      }
      for (let i = 0; i < 3; i++) {
        await page
          .locator("li", { hasText: 'x4"x1/4' })
          .getByRole("button", { name: "→ Workspace" })
          .click();
        await page.waitForTimeout(150);
      }

      await workspaceCard(page)
        .getByRole("button", { name: "Operate" })
        .click();
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines[0].outputMaterials.some(
              (mat: any) => mat.type === "rusticShelf",
            ),
        undefined,
        { timeout: 15000 },
      );
      expect(await nailCount(page)).toBe(0);
      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
    });

    await test.step("the store's supplies aisle sells packs", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Shop Supplies")).toBeVisible();
      await expect(page.getByText("Box of Nails")).toBeVisible();
      await expect(page.getByText("Mineral Oil Bottle")).toBeVisible();

      await page
        .locator("li", { hasText: "Mineral Oil Bottle" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(200);
      await expect(page.getByText("In your shop: 16 oz")).toBeVisible();
      const money = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      expect(money).toBe(10);
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("mineral oil turns the board into an oiled board", async () => {
      // The ticker remounts on returning Home, so speed up again
      await page.keyboard.press("3");
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Oil Cutting Board" });
      await page.waitForTimeout(200);
      await expect(page.getByText("4 oz Mineral Oil (have 16)")).toBeVisible();

      await page
        .locator("li", { hasText: "Simple cutting board" })
        .getByRole("button", { name: "→ Workspace" })
        .click();
      await page.waitForTimeout(200);
      await workspaceCard(page)
        .getByRole("button", { name: "Operate" })
        .click();
      // The oil leaves the bottle the moment the wipe-down starts
      await page.waitForFunction(
        () =>
          (window as any).__GET_GAME_STATE__().consumables.mineralOil === 12,
        undefined,
        { timeout: 10000 },
      );
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines[0].outputMaterials.some(
              (mat: any) => mat.finish === "mineralOil",
            ),
        undefined,
        { timeout: 15000 },
      );
      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      await expect(
        page.getByText("Oiled Simple cutting board"),
      ).toBeVisible();
    });
  });
});
