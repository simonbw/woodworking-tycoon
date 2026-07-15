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

/** The workspace's spec-sheet card. */
function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Workspace" });
}

/** Run one sanding pass on the panel currently in inventory. */
async function sandPanelOnce(page: any, expectSurface: string) {
  await page
    .locator("li", { hasText: "Maple Panel" })
    .getByRole("button", { name: "→ Workspace" })
    .click();
  await page.waitForTimeout(200);
  await workspaceCard(page).getByRole("button", { name: "Operate" }).click();
  await page.waitForFunction(
    (surface: string) =>
      (window as any)
        .__GET_GAME_STATE__()
        .machines.some((m: any) =>
          m.outputMaterials.some(
            (mat: any) => mat.type === "panel" && mat.surface === surface,
          ),
        ),
    expectSurface,
    { timeout: 15000 },
  );
  await workspaceCard(page).getByRole("button", { name: /Take All/ }).click();
  await page.waitForTimeout(200);
}

test.describe("Cutting Board Chain (no planer required)", () => {
  test("should mount a sander, glue, sand, finish, and sell", async ({
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

    await test.step("store: tool wall, S4S and rough lumber prices", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Tool Wall")).toBeVisible();
      await expect(page.getByText("Sanding Block")).toBeVisible();
      await expect(page.getByText("$10.00")).toBeVisible();
      await expect(page.getByText("Random Orbit Sander")).toBeVisible();
      // Default finish is S4S: workhorse pine at full price
      await expect(
        page.getByText("Pine Board (8'x4\"x4/4, smooth)"),
      ).toBeVisible();
      await expect(page.getByText("$38.40")).toBeVisible();
      // Rough sawn is 65% of that
      await page.locator("select").nth(1).selectOption("rough");
      await page.waitForTimeout(200);
      await expect(
        page.getByText("Pine Board (8'x4\"x4/4, rough)"),
      ).toBeVisible();
      await expect(page.getByText("$24.96")).toBeVisible();
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("mount the sander at the workspace", async () => {
      await expect(page.getByText("1/1 slots")).not.toBeVisible();
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(200);
      await expect(page.getByText("1/1 slots")).toBeVisible();
      // The sander's operations joined the workspace's Mode list
      const modeOptions = await workspaceCard(page)
        .locator("select")
        .first()
        .locator("option")
        .allTextContents();
      expect(modeOptions).toContain("Sand Panel");
    });

    await test.step("glue up five smooth maple strips", async () => {
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Glue Up Panel" });
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Maple Board" })
        .getByRole("button", { name: "→ Workspace" })
        .click({ modifiers: ["Shift"] });
      await page.waitForTimeout(200);
      await workspaceCard(page)
        .getByRole("button", { name: "Operate" })
        .click();
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
      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      // Fresh glue-up is rough
      await expect(
        page.getByText("Maple Panel (2'x10\"x4/4, rough)").first(),
      ).toBeVisible();
    });

    await test.step("sand the panel to smooth, then to sanded", async () => {
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Sand Panel" });
      await page.waitForTimeout(200);
      await sandPanelOnce(page, "smooth");
      await expect(
        page.getByText("Maple Panel (2'x10\"x4/4, smooth)").first(),
      ).toBeVisible();
      await sandPanelOnce(page, "sanded");
      await expect(
        page.getByText("Maple Panel (2'x10\"x4/4, sanded)").first(),
      ).toBeVisible();
    });

    await test.step("finish the cutting board — full thickness, no planer", async () => {
      await workspaceCard(page)
        .locator("select")
        .first()
        .selectOption({ label: "Finish Cutting Board" });
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Maple Panel" })
        .getByRole("button", { name: "→ Workspace" })
        .click();
      await page.waitForTimeout(200);
      await workspaceCard(page)
        .getByRole("button", { name: "Operate" })
        .click();
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some(
                (mat: any) => mat.type === "simpleCuttingBoard",
              ),
            ),
        undefined,
        { timeout: 15000 },
      );
      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
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
