import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Workspace" });
}

async function workspaceModes(page: any): Promise<string[]> {
  return workspaceCard(page)
    .locator("select")
    .first()
    .locator("option")
    .allTextContents();
}

async function selectMode(page: any, label: string) {
  await workspaceCard(page).locator("select").first().selectOption({ label });
  await page.waitForTimeout(200);
}

async function moveToWorkspace(page: any, rowText: string) {
  await page
    .locator("li", { hasText: rowText })
    .first()
    .getByRole("button", { name: "→ Workspace" })
    .click();
  await page.waitForTimeout(200);
}

/** Operate the workspace, wait for an output matching the predicate source, take it. */
async function operateAndTake(page: any, isDoneSource: string, timeout: number) {
  await workspaceCard(page).getByRole("button", { name: "Operate" }).click();
  await page.waitForFunction(
    (src: string) => {
      const matches = new Function("mat", `return (${src})(mat)`) as any;
      return (window as any)
        .__GET_GAME_STATE__()
        .machines.some((m: any) => m.outputMaterials.some(matches));
    },
    isDoneSource,
    { timeout },
  );
  await workspaceCard(page)
    .getByRole("button", { name: /Take All/ })
    .click();
  await page.waitForTimeout(200);
}

test.describe("Pattern Boards", () => {
  test("should unlock striped and sunrise tiers and build both boards", async ({
    page,
  }) => {
    test.setTimeout(180000);
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
    await page.waitForTimeout(300);

    await test.step("sunrise is gated behind both branches", async () => {
      await page.getByText("Skills (3)", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(
        page
          .locator("li", { hasText: "Sunrise Boards" })
          .getByText("Requires Striped Boards, Freeform Lamination"),
      ).toBeVisible();
      // Freeform glue ops are hidden at the bench until learned
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
      const modes = await workspaceModes(page);
      expect(modes).not.toContain("Glue Up Pair");
      expect(modes).not.toContain("Finish Striped Board");
    });

    await test.step("spend 3 points down to Sunrise Boards", async () => {
      await page.getByText("Skills (3)", { exact: true }).click();
      await page.waitForTimeout(300);
      for (const skill of [
        "Striped Boards",
        "Freeform Lamination",
        "Sunrise Boards",
      ]) {
        await page
          .locator("li", { hasText: skill })
          .getByRole("button", { name: /Learn/ })
          .click();
        await page.waitForTimeout(200);
      }
      await expect(page.getByText("Certified")).toHaveCount(8);
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
      const modes = await workspaceModes(page);
      expect(modes).toContain("Glue Up Pair");
      expect(modes).toContain("Glue On Strip");
      expect(modes).toContain("Finish Striped Board");
      expect(modes).toContain("Finish Sunrise Board");
    });

    await test.step("finish the striped blank", async () => {
      await selectMode(page, "Finish Striped Board");
      await moveToWorkspace(page, "Mixed Wood Panel");
      await operateAndTake(
        page,
        `(mat) => mat.type === "stripedCuttingBoard"`,
        30000,
      );
      await expect(
        page.getByText("Walnut & Maple Striped Cutting Board").first(),
      ).toBeVisible();
    });

    await test.step("glue the sunrise fade strip by strip", async () => {
      // Seed pair: 3" walnut then 1" maple
      await selectMode(page, "Glue Up Pair");
      await moveToWorkspace(page, `Walnut Board (2'x3"`);
      await moveToWorkspace(page, `Maple Board (2'x1"`);
      await operateAndTake(
        page,
        `(mat) => mat.type === "panel"`,
        30000,
      );

      // Extend with the remaining fade: 2" walnut, 2" maple, 1" walnut, 3" maple
      const fade = [
        `Walnut Board (2'x2"`,
        `Maple Board (2'x2"`,
        `Walnut Board (2'x1"`,
        `Maple Board (2'x3"`,
      ];
      await selectMode(page, "Glue On Strip");
      for (const [i, row] of fade.entries()) {
        await moveToWorkspace(page, "Mixed Wood Panel");
        await moveToWorkspace(page, row);
        const expectedStrips = 3 + i;
        await operateAndTake(
        page,
        `(mat) => mat.type === "panel" && mat.strips.length === ${expectedStrips}`,
          30000,
        );
      }
      // 3+1+2+2+1+3 = a 12" wide blank
      await expect(
        page.getByText(`Mixed Wood Panel (2'x12"x4/4, rough)`).first(),
      ).toBeVisible();
    });

    await test.step("sand twice and finish the sunrise board", async () => {
      await selectMode(page, "Sand Panel");
      for (const surface of ["smooth", "sanded"]) {
        await moveToWorkspace(page, "Mixed Wood Panel");
        await operateAndTake(
        page,
        `(mat) => mat.type === "panel" && mat.surface === "${surface}"`,
          30000,
        );
      }
      await selectMode(page, "Finish Sunrise Board");
      await moveToWorkspace(page, "Mixed Wood Panel");
      await operateAndTake(
        page,
        `(mat) => mat.type === "sunriseCuttingBoard"`,
        30000,
      );
      const board = await page.evaluate(() =>
        (window as any)
          .__GET_GAME_STATE__()
          .player.inventory.find(
            (mat: any) => mat.type === "sunriseCuttingBoard",
          ),
      );
      expect(board.species).toBe("walnut");
      expect(board.accentSpecies).toBe("maple");
      await expect(
        page.getByText("Walnut & Maple Sunrise Cutting Board").first(),
      ).toBeVisible();
    });

    await test.step("both boards earned XP and levels", async () => {
      // Striped $360 + sunrise $600 = 960 XP -> level 4 -> 3 points earned
      const progression = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().progression,
      );
      expect(progression.xp).toBe(960);
      expect(progression.skillPoints).toBe(3);
    });

    await test.step("sell the sunrise board at its premium", async () => {
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
      await page
        .locator("li", { hasText: "Sunrise Cutting Board" })
        .getByRole("button", { name: "→ Sales Table" })
        .click();
      await page.waitForFunction(
        (before: number) =>
          (window as any).__GET_GAME_STATE__().money === before + 600,
        moneyBefore,
        { timeout: 10000 },
      );
    });
  });
});
