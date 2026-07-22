import { test, expect } from "@playwright/test";
import { machineCard, modesOf, selectMode, setParameter } from "./machine-panel";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** The workspace's spec-sheet card. */
function workspaceCard(page: any) {
  return machineCard(page, "Makeshift Workbench");
}

test.describe("Hand tools", () => {
  test("buys the hand saw and drill, cuts by hand, and screws a planter box together", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(() => fixtures["hand-tools-shop"]);
    });
    await page.waitForTimeout(300);

    await test.step("the tool wall sells the hand saw and drill, supplies sell screws", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      const toolWall = page.locator("section", { hasText: "Tool Wall" });
      await expect(toolWall.getByText("Hand Saw")).toBeVisible();
      await expect(toolWall.getByText("Drill")).toBeVisible();

      await page
        .locator("li", { hasText: "Hand Saw" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Drill" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(200);

      await expect(page.getByText("Box of Screws")).toBeVisible();
      await page
        .locator("li", { hasText: "Box of Screws" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(200);
      await expect(page.getByText("In your shop: 50 screws")).toBeVisible();

      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("both tools mount at the workbench and add their trades", async () => {
      await page
        .locator("li", { hasText: "Hand Saw (stored)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Drill (stored)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(200);
      await expect(page.getByText("2/2 slots")).toBeVisible();

      const modes = await modesOf(page, "Makeshift Workbench");
      expect(modes).toContain("Cut Board by Hand");
      expect(modes).toContain("Build Rustic Planter Box");
    });

    await test.step("the hand saw crosscuts with the miter saw's full setup", async () => {
      // 20 ticks/second so the slow hand work flies by
      await page.keyboard.press("3");
      await selectMode(page, "Makeshift Workbench", "Cut Board by Hand");
      const card = workspaceCard(page);
      await expect(card.getByRole("radiogroup", { name: "Angle" })).toBeVisible();
      await expect(
        card.getByRole("radiogroup", { name: "Cut End" }),
      ).toBeVisible();
      await setParameter(page, "Makeshift Workbench", "Target Length", "2");

      await page
        .locator("li", { hasText: "Pallet Wood 1/4 — 4\" × 3'" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click();
      await page.waitForTimeout(200);
      await card.getByRole("button", { name: "Operate" }).click();
      // The cut leaves the kept 2' slat and a 1' offcut
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines[0].outputMaterials.filter(
              (mat: any) => mat.type === "board",
            ).length === 2,
        undefined,
        { timeout: 20000 },
      );
      await card.getByRole("button", { name: /Take All/ }).click();
      await page.waitForTimeout(200);
    });

    await test.step("five slats and eight screws become a planter box", async () => {
      await selectMode(page, "Makeshift Workbench", "Build Rustic Planter Box");
      await expect(page.getByText("8 screws (have 50)")).toBeVisible();

      // Shift-click loads every matching 2' slat — all five at once
      await page
        .locator("li", { hasText: "Pallet Wood 1/4 — 4\" × 2'" })
        .first()
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
            .machines[0].outputMaterials.some(
              (mat: any) => mat.type === "planterBox",
            ),
        undefined,
        { timeout: 20000 },
      );
      const screws = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().consumables.screws,
      );
      expect(screws).toBe(42);

      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      await expect(page.getByText("Planter box").first()).toBeVisible();
    });
  });
});
