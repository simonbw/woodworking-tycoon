import { test, expect } from "@playwright/test";
import { modesOf, selectMode } from "./machine-panel";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Makeshift Workbench" });
}

async function workspaceModes(page: any): Promise<string[]> {
  return modesOf(page, "Makeshift Workbench");
}

test.describe("Skill Tree", () => {
  test("should show certificates, gate recipes, and unlock two-tone boards", async ({
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
      await page.getByText("Skills", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Workshop Certifications")).toBeVisible();
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
    });

    await test.step("load fixture with mixed strips and 2 skill points", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["cutting-board-shop"],
        );
      });
      await page.waitForTimeout(300);
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
      await page.waitForTimeout(300);
      // Tab badge shows the unspent points
      await expect(page.getByText("Skills (2)")).toBeVisible();
    });

    await test.step("locked recipe is hidden at the workspace", async () => {
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
      const modes = await workspaceModes(page);
      expect(modes).not.toContain("Finish Two-Tone Board");
    });

    await test.step("learn Two-Tone Boards on the skills page", async () => {
      await page.getByText("Skills (2)", { exact: true }).click();
      await page.waitForTimeout(300);
      await page
        .locator("li", { hasText: "Two-Tone Boards" })
        .getByRole("button", { name: /Learn/ })
        .click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Certified")).toHaveCount(5);
      await expect(page.getByText("Skills (1)")).toBeVisible();
    });

    await test.step("build a two-tone board: mount sander, glue, sand, finish", async () => {
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(200);

      const modes = await workspaceModes(page);
      expect(modes).toContain("Finish Two-Tone Board");

      // Glue the five mixed strips
      await selectMode(page, "Makeshift Workbench", "Glue Up Panel");
      for (const rowName of ["Walnut 4/4", "Maple 4/4"]) {
        await page
          .locator("li", { hasText: rowName })
          .getByRole("button", { name: "→ Makeshift Workbench" })
          .click({ modifiers: ["Shift"] });
        await page.waitForTimeout(200);
      }
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
      await expect(
        page.getByText("Mixed Wood Panel 4/4 — 10\" × 2'").first(),
      ).toBeVisible();

      // Two sanding passes
      await selectMode(page, "Makeshift Workbench", "Sand Panel");
      for (const surface of ["smooth", "sanded"]) {
        await page
          .locator("li", { hasText: "Mixed Wood Panel" })
          .getByRole("button", { name: "→ Makeshift Workbench" })
          .click();
        await page.waitForTimeout(200);
        await workspaceCard(page)
          .getByRole("button", { name: "Operate" })
          .click();
        await page.waitForFunction(
          (expected: string) =>
            (window as any)
              .__GET_GAME_STATE__()
              .machines.some((m: any) =>
                m.outputMaterials.some(
                  (mat: any) =>
                    mat.type === "panel" && mat.surface === expected,
                ),
              ),
          surface,
          { timeout: 15000 },
        );
        await workspaceCard(page)
          .getByRole("button", { name: /Take All/ })
          .click();
        await page.waitForTimeout(200);
      }

      // Finish it
      await selectMode(page, "Makeshift Workbench", "Finish Two-Tone Board");
      await page
        .locator("li", { hasText: "Mixed Wood Panel" })
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
      expect(cuttingBoard.species).toBe("walnut");
      expect(cuttingBoard.accentSpecies).toBe("maple");
      await expect(
        page.getByText("Walnut & Maple Simple Cutting Board").first(),
      ).toBeVisible();
    });

    await test.step("finishing it earned XP and a level", async () => {
      // Two-tone board: $240 sell value -> 240 XP -> level 2 -> +1 point
      const progression = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().progression,
      );
      expect(progression.xp).toBe(240);
      expect(progression.skillPoints).toBe(2);
    });

    await test.step("sell it at the two-tone premium", async () => {
      const moneyBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: { ...state.player, position: [3, 3] },
        }));
      });
      await page.waitForTimeout(300);
      await page.getByText("Marketplace", { exact: true }).click();
      await page.waitForTimeout(300);
      await page
        .locator("li", { hasText: "Walnut & Maple" })
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
      await page.waitForFunction(
        (before: number) =>
          (window as any).__GET_GAME_STATE__().money === before + 240,
        moneyBefore,
        { timeout: 10000 },
      );
    });
  });
});
