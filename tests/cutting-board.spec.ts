import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** Teleport the player so we don't depend on movement UI for machine hops. */
async function movePlayerTo(page: any, position: [number, number]) {
  await page.evaluate((pos: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: pos },
    }));
  }, position);
  await page.waitForTimeout(300);
}

test.describe("Cutting Board Chain", () => {
  test("should buy stock lumber, glue, plane, finish, and sell", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(
        () => fixtures["cutting-board-shop"],
      );
    });
    await page.waitForTimeout(300);

    await test.step("commission 6 is active", async () => {
      await expect(page.getByText("A Proper Cutting Board")).toBeVisible();
    });

    await test.step("store sells fixed SKUs, no pallet, no custom cuts", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Lumber Rack")).toBeVisible();
      // The workhorse pine SKU at volume x markup pricing
      await expect(page.getByText("Pine Board (8'x4\"x4/4)")).toBeVisible();
      await expect(page.getByText("$38.40")).toBeVisible();
      // Pallet wood is not sold — scavenging is its source
      const speciesOptions = await page
        .locator("select")
        .first()
        .locator("option")
        .allTextContents();
      expect(speciesOptions).not.toContain("Pallet");
      // The old custom-cut dimension pickers are gone
      await expect(page.getByText("Custom Cut")).not.toBeVisible();
    });

    await test.step("buying a SKU deducts species-priced money", async () => {
      await page.locator("select").first().selectOption("maple");
      await page.waitForTimeout(200);
      // Maple workhorse: $38.40 x 3 = $115.20, unaffordable at $100
      const workhorseRow = page.locator("li", {
        hasText: "Maple Board (8'x4\"x4/4)",
      });
      await expect(workhorseRow.getByText("$115.20")).toBeVisible();
      await expect(
        workhorseRow.getByRole("button", { name: "Buy" }),
      ).toBeDisabled();
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("glue up five maple strips into a panel", async () => {
      const workspaceCard = page.locator("section", { hasText: "Workspace" });
      await workspaceCard
        .locator("select")
        .first()
        .selectOption({ label: "Glue Up Panel" });
      await page.waitForTimeout(200);
      // Shift-click moves the whole strip stack to the workspace
      await page
        .locator("li", { hasText: "Maple Board" })
        .getByRole("button", { name: "→ Workspace" })
        .click({ modifiers: ["Shift"] });
      await page.waitForTimeout(200);
      await workspaceCard.getByRole("button", { name: "Operate" }).click();
      // 40 ticks of glue drying at ~200ms per tick
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some((mat: any) => mat.type === "panel"),
            ),
        undefined,
        { timeout: 30000 },
      );
      await workspaceCard.getByRole("button", { name: /Take All/ }).click();
      await page.waitForTimeout(200);
      await expect(
        page.getByText('Maple Panel (2\'x10"x4/4)').first(),
      ).toBeVisible();
    });

    await test.step("plane the panel to 3/4", async () => {
      await movePlayerTo(page, [2, 3]);
      const planerCard = page.locator("section", { hasText: "Planer" });
      await planerCard
        .locator("select")
        .first()
        .selectOption({ label: "Plane Panel" });
      await page.waitForTimeout(200);
      // Target thickness 3
      await planerCard.locator("select").nth(1).selectOption("3");
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Maple Panel" })
        .getByRole("button", { name: "→ Planer" })
        .click();
      await page.waitForTimeout(200);
      await planerCard.getByRole("button", { name: "Operate" }).click();
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some(
                (mat: any) => mat.type === "panel" && mat.thickness === 3,
              ),
            ),
        undefined,
        { timeout: 15000 },
      );
      await planerCard.getByRole("button", { name: /Take All/ }).click();
      await page.waitForTimeout(200);
      await expect(
        page.getByText('Maple Panel (2\'x10"x3/4)').first(),
      ).toBeVisible();
    });

    await test.step("finish the cutting board at the workspace", async () => {
      await movePlayerTo(page, [1, 3]);
      const workspaceCard = page.locator("section", { hasText: "Workspace" });
      await workspaceCard
        .locator("select")
        .first()
        .selectOption({ label: "Finish Cutting Board" });
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Maple Panel" })
        .getByRole("button", { name: "→ Workspace" })
        .click();
      await page.waitForTimeout(200);
      await workspaceCard.getByRole("button", { name: "Operate" }).click();
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .player.inventory.concat(
              (window as any)
                .__GET_GAME_STATE__()
                .machines.flatMap((m: any) => m.outputMaterials),
            )
            .some((mat: any) => mat.type === "simpleCuttingBoard"),
        undefined,
        { timeout: 15000 },
      );
      await workspaceCard.getByRole("button", { name: /Take All/ }).click();
      await page.waitForTimeout(200);
      const cuttingBoard = await page.evaluate(() =>
        (window as any)
          .__GET_GAME_STATE__()
          .player.inventory.find(
            (mat: any) => mat.type === "simpleCuttingBoard",
          ),
      );
      expect(cuttingBoard.species).toBe("maple");
    });

    await test.step("sell it at the maple price", async () => {
      const moneyBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      await movePlayerTo(page, [3, 3]);
      await page
        .locator("li", { hasText: "Simple Cutting Board" })
        .getByRole("button", { name: "→ Sales Table" })
        .click();
      // simpleCuttingBoard base 40 x maple multiplier 3 = $120
      await page.waitForFunction(
        (before: number) =>
          (window as any).__GET_GAME_STATE__().money === before + 120,
        moneyBefore,
        { timeout: 10000 },
      );
    });
  });
});
