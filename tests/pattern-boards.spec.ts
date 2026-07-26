import { test, expect } from "@playwright/test";
import { modesOf } from "./machine-panel";
import { closeJournal, openJournal } from "./navigation";

/**
 * The UI end of the pattern-board tiers: the journal row that names both
 * prerequisites, spending the three points, and the bench's recipe list
 * growing as they're spent. Progressive disclosure is the whole subject —
 * a locked recipe is *absent*, not greyed out, so the before/after list is
 * the assertion.
 *
 * The boards themselves — the fade glued strip by strip, the 12" blank, the
 * two sanding passes, the dominant-species naming, the 960 XP — are checked
 * in `src/game/sequences/pattern-boards-chain.test.ts`. That run used to
 * happen here and made this the slowest test in the suite.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

async function workspaceModes(page: any): Promise<string[]> {
  return modesOf(page, "Makeshift Workbench");
}

test.describe("Pattern Boards", () => {
  test("gates sunrise behind both branches and grows the recipe list", async ({
    page,
  }) => {
    test.setTimeout(240000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(
        () => fixtures["pattern-board-shop"],
      );
    });
    await page.waitForTimeout(30);

    await test.step("sunrise is gated behind both branches", async () => {
      await openJournal(page);
      await expect(
        page
          .locator("li", { hasText: "Sunrise Boards" })
          .getByText("Requires Striped Boards, Freeform Lamination"),
      ).toBeVisible();
      // Freeform glue ops are hidden at the bench until learned
      await closeJournal(page);
      const modes = await workspaceModes(page);
      expect(modes).not.toContain("Glue Up Pair");
      expect(modes).not.toContain("Finish Striped Board");
    });

    await test.step("spend 3 points down to Sunrise Boards", async () => {
      await openJournal(page);
      for (const skill of [
        "Striped Boards",
        "Freeform Lamination",
        "Sunrise Boards",
      ]) {
        await page
          .locator("li", { hasText: skill })
          .getByRole("button", { name: /Learn/ })
          .click();
        await page.waitForTimeout(30);
      }
      await expect(page.getByText("Certified")).toHaveCount(8);
      await closeJournal(page);
      const modes = await workspaceModes(page);
      expect(modes).toContain("Glue Up Pair");
      expect(modes).toContain("Glue On Strip");
      expect(modes).toContain("Finish Striped Board");
      expect(modes).toContain("Finish Sunrise Board");
    });
  });
});
