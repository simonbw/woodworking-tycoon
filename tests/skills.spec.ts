import { test, expect } from "@playwright/test";
import { modesOf, openStationSheet } from "./machine-panel";
import { closeJournal, openJournal } from "./navigation";

/**
 * The journal: certificates for what you already know, a badge counting the
 * points you haven't spent, requirements shown instead of a Learn button when
 * a node is out of reach, and — the part that matters most — a recipe that
 * simply is not at the bench until the skill is learned.
 *
 * What the skill buys is checked in
 * `src/game/sequences/two-tone-chain.test.ts`: the glue-up, the two sanding
 * passes, the board naming both woods, and the 240 XP that hands the point
 * back.
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

test.describe("Skill Tree", () => {
  test("shows certificates, counts points, and reveals a learned recipe", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    // Dismiss the shop manual's one-time welcome so it can't cover the UI.
    const manual = page.getByRole("dialog", { name: "Shop manual" });
    await manual.waitFor();
    await page.keyboard.press("Escape");
    await manual.waitFor({ state: "detached" });
    await page.waitForTimeout(500);

    await test.step("starter skills come pre-certified", async () => {
      await openJournal(page);
      await expect(
        page.getByRole("heading", { name: /Woodworker/ }),
      ).toBeVisible();
      // 4 starter skills show as certified
      await expect(page.getByText("Certified")).toHaveCount(4);
      // Locked-with-prereqs-met shows a disabled Learn button (0 points)
      const learnButton = page
        .locator("li", { hasText: "Fine Shelving" })
        .getByRole("button", { name: /Learn/ });
      await expect(learnButton).toBeDisabled();
      // Deeper node shows its requirement instead
      await expect(
        page.locator("li", { hasText: "Box Joinery" }).getByText(/Requires/),
      ).toBeVisible();
      await expect(page.getByText("Craft Level 1")).toBeVisible();
      await closeJournal(page);
    });

    await test.step("load fixture with mixed strips and 2 skill points", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["cutting-board-shop"],
        );
      });
      await page.waitForTimeout(30);
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          progression: { ...state.progression, skillPoints: 2 },
          player: {
            ...state.player,
            inventory: ["walnut", "maple", "walnut", "maple", "walnut"].map(
              (species, i) => ({
                id: `mixed-strip-${i}`,
                type: "board",
                species,
                length: 2,
                width: 2,
                thickness: 4,
                surface: "smooth",
                jointedFaces: 2,
                jointedEdges: 2,
              }),
            ),
          },
        }));
      });
      await page.waitForTimeout(30);
      // The journal button's badge shows the unspent points
      await expect(page.getByTestId("journal-badge")).toHaveText("2");
    });

    await test.step("locked recipe is hidden at the workspace", async () => {
      const modes = await workspaceModes(page);
      expect(modes).not.toContain("Finish Two-Tone Board");
    });

    await test.step("learn Two-Tone Boards in the journal", async () => {
      await openJournal(page);
      await page
        .locator("li", { hasText: "Two-Tone Boards" })
        .getByRole("button", { name: /Learn/ })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("Certified")).toHaveCount(5);
      await closeJournal(page);
      await expect(page.getByTestId("journal-badge")).toHaveText("1");
    });

    await test.step("learning it puts the recipe on the bench", async () => {
      // The tool rack lives on the station sheet
      await openStationSheet(page);
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(30);

      const modes = await workspaceModes(page);
      expect(modes).toContain("Finish Two-Tone Board");
    });

  });
});
