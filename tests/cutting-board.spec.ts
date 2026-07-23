import { test, expect } from "@playwright/test";
import { modesOf, selectMode } from "./machine-panel";

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

/** Run one sanding pass on the panel currently in inventory. */
async function sandPanelOnce(page: any, expectSurface: string) {
  await page
    .locator("li", { hasText: "Maple Panel" })
    .getByRole("button", { name: "→ Makeshift Workbench" })
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
  await workspaceCard(page)
    .getByRole("button", { name: /Take All/ })
    .click();
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

    await test.step("store: tool wall and reputation-gated lumber channels", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Tool Wall")).toBeVisible();
      await expect(page.getByText("Sanding Block")).toBeVisible();
      // Scoped: the supplies aisle sells a $10.00 oil bottle too
      await expect(
        page.locator("section", { hasText: "Tool Wall" }).getByText("$10.00"),
      ).toBeVisible();
      await expect(page.getByText("Random Orbit Sander")).toBeVisible();
      // Cheap channels: framing pine and marked-up big-box S4S hardwood.
      // Rows carry dimensions only — species lives in the channel header.
      await expect(page.getByText("Construction Lumber")).toBeVisible();
      await expect(page.getByText("1x4 — 8'")).toBeVisible();
      await expect(page.getByText("$38.40")).toBeVisible();
      await expect(page.getByText("S4S Hardwood Rack")).toBeVisible();
      // At 17 reputation the lumberyard (12) has appeared...
      await expect(page.getByText("Lumberyard — S2S")).toBeVisible();
      // ...but the rough rack (22) doesn't exist yet — not even greyed out
      await expect(page.getByText("Rough Rack")).not.toBeVisible();
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("mount the sander at the workspace", async () => {
      await expect(page.getByText("1/2 slots")).not.toBeVisible();
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(200);
      await expect(page.getByText("1/2 slots")).toBeVisible();
      // The sander's operations joined the workspace's Mode list
      const modeOptions = await modesOf(page, "Makeshift Workbench");
      expect(modeOptions).toContain("Sand Panel");
    });

    await test.step("glue up five smooth maple strips", async () => {
      await selectMode(page, "Makeshift Workbench", "Glue Up Panel");
      await page
        .locator("li", { hasText: "Maple 4/4" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
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
        page
          .locator("li", { hasText: "Maple Panel 4/4 — 10\" × 2'" })
          .filter({ hasText: "rough" })
          .first(),
      ).toBeVisible();
    });

    await test.step("sand the panel to smooth, then to sanded", async () => {
      await selectMode(page, "Makeshift Workbench", "Sand Panel");
      await sandPanelOnce(page, "smooth");
      await expect(
        page
          .locator("li", { hasText: "Maple Panel 4/4 — 10\" × 2'" })
          .filter({ hasText: "smooth" })
          .first(),
      ).toBeVisible();
      await sandPanelOnce(page, "sanded");
      await expect(
        page
          .locator("li", { hasText: "Maple Panel 4/4 — 10\" × 2'" })
          .filter({ hasText: "sanded" })
          .first(),
      ).toBeVisible();
    });

    await test.step("finish the cutting board — full thickness, no planer", async () => {
      await selectMode(page, "Makeshift Workbench", "Finish Cutting Board");
      await page
        .locator("li", { hasText: "Maple Panel" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
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
      await page.getByText("Marketplace", { exact: true }).click();
      await page.waitForTimeout(300);
      await page
        .locator("li", { hasText: "Simple Cutting Board" })
        .getByRole("button", { name: "List" })
        .click();
      // Fair-value listings are guaranteed by the pity timer — jump past it
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) =>
          state.listings.length === 0
            ? state
            : { ...state, tick: state.listings[0].listedAtTick + 2 * 600 },
        );
      });
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
