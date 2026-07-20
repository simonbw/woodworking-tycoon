import { test, expect } from "@playwright/test";
import { selectMode } from "./machine-panel";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

const WORKSPACE_CELL: [number, number] = [1, 3];
const FAR_AWAY: [number, number] = [0, 0];

function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Workspace" });
}

async function teleportPlayer(page: any, position: [number, number]) {
  await page.evaluate((pos: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: pos },
    }));
  }, position);
  await page.waitForTimeout(200);
}

async function workspaceProgress(page: any) {
  return page.evaluate(
    () =>
      (window as any)
        .__GET_GAME_STATE__()
        .machines.find((m: any) => m.machineTypeId === "workspace")
        .operationProgress,
  );
}

test.describe("Attended Operations", () => {
  test("should pause attended work without the player and cure glue hands-free", async ({
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
        () => fixtures["cutting-board-shop"],
      );
    });
    await page.waitForTimeout(300);

    await test.step("sanding pauses when you walk away, resumes when you return", async () => {
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(200);
      await selectMode(page, "Workspace", "Sand Board");
      await page
        .locator("li", { hasText: "Maple Board" })
        .getByRole("button", { name: "→ Workspace" })
        .click();
      await page.waitForTimeout(200);

      // Freeze the clock so starting the op and stepping away is deterministic
      await page.keyboard.press("`");
      await workspaceCard(page)
        .getByRole("button", { name: "Operate" })
        .click();
      await page.waitForTimeout(200);
      await teleportPlayer(page, FAR_AWAY);
      await page.keyboard.press("1");

      // Ticks flow again, but nobody is at the bench: progress is frozen
      const before = await workspaceProgress(page);
      await page.waitForTimeout(800);
      const after = await workspaceProgress(page);
      expect(before.status).toBe("inProgress");
      expect(after.ticksRemaining).toBe(before.ticksRemaining);

      // Come back and it finishes
      await teleportPlayer(page, WORKSPACE_CELL);
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some(
                (mat: any) => mat.type === "board" && mat.surface === "sanded",
              ),
            ),
        undefined,
        { timeout: 15000 },
      );
      await workspaceCard(page)
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
    });

    await test.step("glue-up: clamping needs you, curing runs without you", async () => {
      await selectMode(page, "Workspace", "Glue Up Panel");
      // 4 smooth strips (shift = move all of the row) + the sanded one
      await page
        .locator("li", { hasText: "Maple Board (2'x2\"x4/4, smooth, S4S)" })
        .getByRole("button", { name: "→ Workspace" })
        .click({ modifiers: ["Shift"] });
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Maple Board (2'x2\"x4/4, sanded, S4S)" })
        .getByRole("button", { name: "→ Workspace" })
        .click();
      await page.waitForTimeout(200);

      await page.keyboard.press("`");
      await workspaceCard(page)
        .getByRole("button", { name: "Operate" })
        .click();
      await page.waitForTimeout(200);
      await teleportPlayer(page, FAR_AWAY);
      await page.keyboard.press("1");

      // Clamping is attended: frozen at full duration while away
      await page.waitForTimeout(800);
      const paused = await workspaceProgress(page);
      expect(paused.phaseIndex).toBe(0);
      expect(paused.ticksRemaining).toBe(8);

      // Return: the clamp phase runs, then curing begins
      await teleportPlayer(page, WORKSPACE_CELL);
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.find((m: any) => m.machineTypeId === "workspace")
            .operationProgress.phaseIndex === 1,
        undefined,
        { timeout: 15000 },
      );
      await expect(
        workspaceCard(page).getByText(/Curing \(hands-free\)/),
      ).toBeVisible();

      // Walk away mid-cure: it keeps going without you
      await teleportPlayer(page, FAR_AWAY);
      const cureBefore = await workspaceProgress(page);
      await page.waitForTimeout(800);
      const cureAfter = await workspaceProgress(page);
      expect(cureAfter.ticksRemaining).toBeLessThan(cureBefore.ticksRemaining);

      // Fast-forward the rest of the cure; the panel finishes with the
      // player still across the shop
      await page.keyboard.press("3");
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some((mat: any) => mat.type === "panel"),
            ),
        undefined,
        { timeout: 15000 },
      );
      const playerPosition = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().player.position,
      );
      expect(playerPosition).toEqual(FAR_AWAY);
    });
  });
});
