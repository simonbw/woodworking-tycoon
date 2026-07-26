import { test, expect } from "@playwright/test";
import {
  machineCard,
  modesOf,
  openStationSheet,
  selectMode,
} from "./machine-panel";
import { goToStore, leaveStore } from "./navigation";

/**
 * The UI end of the hand tools: buying them off the tool wall, filling both
 * of the bench's two slots, and the setup scales a hand cut is dialled in on
 * — an angle, which end faces the blade, and the length you're keeping.
 *
 * What the tools do — the cut that keeps 2' and leaves a 1' offcut, the box
 * that spends eight screws, the refusal when the tin is short — is in
 * `src/game/sequences/hand-tools-chain.test.ts`.
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
  return machineCard(page, "Makeshift Workbench");
}

test.describe("Hand tools", () => {
  test("buys both tools, fills the rack, and shows the cut's scales", async ({
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
    await page.waitForTimeout(30);

    await test.step("the tool wall sells the hand saw and drill, supplies sell screws", async () => {
      const returnTo = await goToStore(page);
      const toolWall = page.locator("section", { hasText: "Tool Wall" });
      await expect(toolWall.getByText("Hand Saw")).toBeVisible();
      await expect(toolWall.getByText("Drill")).toBeVisible();

      await page
        .locator("li", { hasText: "Hand Saw" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(30);
      await page
        .locator("li", { hasText: "Drill" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(30);

      await expect(page.getByText("Box of Screws")).toBeVisible();
      await page
        .locator("li", { hasText: "Box of Screws" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("In your shop: 50 screws")).toBeVisible();

      await leaveStore(page, returnTo);
    });

    await test.step("both tools mount at the workbench and add their trades", async () => {
      // The tool rack lives on the station sheet
      await openStationSheet(page);
      await page
        .locator("li", { hasText: "Hand Saw (stored)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(30);
      await page
        .locator("li", { hasText: "Drill (stored)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("2/2 slots")).toBeVisible();

      const modes = await modesOf(page, "Makeshift Workbench");
      expect(modes).toContain("Cut Board by Hand");
      expect(modes).toContain("Build Rustic Planter Box");
    });

    await test.step("the hand cut is dialled in on three scales", async () => {
      await selectMode(page, "Makeshift Workbench", "Cut Board by Hand");
      const card = workspaceCard(page);
      await expect(
        card.getByRole("radiogroup", { name: "Angle" }),
      ).toBeVisible();
      await expect(
        card.getByRole("radiogroup", { name: "Cut End" }),
      ).toBeVisible();
      await expect(
        card.getByRole("radiogroup", { name: "Target Length" }),
      ).toBeVisible();
    });

    await test.step("the planter box reads its screw cost against the tin", async () => {
      await selectMode(page, "Makeshift Workbench", "Build Rustic Planter Box");
      await expect(page.getByText("8 screws (have 50)")).toBeVisible();
    });

  });
});
