import { test, expect } from "@playwright/test";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

async function loadFixture(page: any, name: string) {
  await page.evaluate((fixtureName: string) => {
    const fixtures = (window as any).__TEST_FIXTURES__;
    (window as any).__UPDATE_GAME_STATE__(() => fixtures[fixtureName]);
  }, name);
  await page.waitForTimeout(300);
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

const carried = async (page: any) =>
  (await page.evaluate(() => window.__GET_GAME_STATE__().player))
    .carriedMachine ?? null;

test.describe("Carrying machines", () => {
  test("crate deliveries, carry, rotate, place, and re-lift on the home screen", async ({
    page,
  }) => {
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);
    await loadFixture(page, "miter-saw-crate-shop");

    await test.step("the layout tab is gone", async () => {
      await expect(page.getByText("Home")).toBeVisible();
      await expect(page.getByText("Shop Layout")).toHaveCount(0);
    });

    await test.step("the carry verb hides until unlocked", async () => {
      await teleportPlayer(page, [2, 5]);
      // A miter saw anywhere re-unlocks the flag on the next tick, so gate
      // the check on a jointer crate — jointers don't trip the unlock
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          machineCrates: state.machineCrates.map((crate: any) => ({
            ...crate,
            machine: { ...crate.machine, machineTypeId: "jointer" },
          })),
          progression: { ...state.progression, shopLayoutUnlocked: false },
        }));
      });
      await expect(page.getByText(/Unpack/)).toHaveCount(0);
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      expect(await carried(page)).toBeNull();
      // Back to the real fixture for the rest of the walkthrough
      await loadFixture(page, "miter-saw-crate-shop");
      await teleportPlayer(page, [2, 5]);
    });

    await test.step("unpack the delivered crate underfoot", async () => {
      await expect(page.getByText("Unpack Miter Saw")).toBeVisible();
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.machineCrates).toHaveLength(0);
      expect(state.player.carriedMachine.machineTypeId).toBe("miterSaw");
      await expect(page.getByText("Put down Miter Saw")).toBeVisible();
      await expect(page.getByText("Rotate")).toBeVisible();
    });

    await test.step("rotate the carried machine", async () => {
      await page.keyboard.press("r");
      await page.waitForTimeout(200);
      expect((await carried(page)).rotation).toBe(1);
      // Three more quarter turns come back around
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("r");
      }
      await page.waitForTimeout(200);
      expect((await carried(page)).rotation).toBe(0);
    });

    await test.step("set it down standing at its operator cell", async () => {
      await teleportPlayer(page, [2, 2]);
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.player.carriedMachine).toBeNull();
      const saw = state.machines.find(
        (m: any) => m.machineTypeId === "miterSaw",
      );
      // Anchored one cell in front: the player's cell is the operator cell
      expect(saw.position).toEqual([2, 1]);
    });

    await test.step("lift the placed machine back up from the same spot", async () => {
      await expect(page.getByText("Pick up Miter Saw")).toBeVisible();
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      expect((await carried(page)).machineTypeId).toBe("miterSaw");
      // And set it back down for the next steps
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      expect(await carried(page)).toBeNull();
    });

    await test.step("a loaded machine refuses to be lifted", async () => {
      await loadFixture(page, "layout-with-placed-machines");
      // The fixture's miter saw at [2,4] holds a board; stand at its
      // operator cell and try
      await teleportPlayer(page, [2, 5]);
      await expect(page.getByText("Pick up Miter Saw")).toHaveCount(0);
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      expect(await carried(page)).toBeNull();
    });

    await test.step("carry a worktable to a new spot", async () => {
      // The fixture's small worktable at [0,4] operates from [0,5]
      await teleportPlayer(page, [0, 5]);
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      expect((await carried(page)).machineTypeId).toBe("worktable1x1");

      await teleportPlayer(page, [1, 5]);
      await page.keyboard.press("l");
      await page.waitForTimeout(200);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.player.carriedMachine).toBeNull();
      const table = state.machines.find(
        (m: any) => m.machineTypeId === "worktable1x1",
      );
      expect(table.position).toEqual([1, 4]);
    });

    await test.step("buying a machine delivers a crate at the entrance", async () => {
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          money: 500,
          progression: { ...state.progression, storeUnlocked: true },
        }));
      });
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await page
        .locator("li", { hasText: "Jobsite Table Saw" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.machineCrates).toHaveLength(1);
      expect(state.machineCrates[0].machine.machineTypeId).toBe(
        "jobsiteTableSaw",
      );
      // Nearest open floor to the entrance [2,5]
      expect(state.machineCrates[0].position).toEqual([2, 5]);
    });
  });
});
