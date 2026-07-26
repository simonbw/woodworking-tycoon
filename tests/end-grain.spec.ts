import { test, expect } from "@playwright/test";
import {
  openStationSheet,
  runWhileHolding,
  selectMode,
  takeAllHere,
} from "./machine-panel";
import { closeJournal, goToStore, leaveStore, openJournal } from "./navigation";

/**
 * The UI end of the end-grain chain: the aisle the plywood comes off, the
 * journal rows that unlock it, the tool rack the sled bolts into, and the two
 * shapes of station the chain is worked through.
 *
 * What the chain *produces* — four slices per panel, the glue-up, the two
 * sanding passes, the board's species and price, the XP that pays the skill
 * points back — is checked in `src/game/sequences/end-grain-chain.test.ts`,
 * where the whole run costs milliseconds instead of seconds. Re-deriving it
 * here bought nothing but wall time.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

const SAW_CELL: [number, number] = [6, 5];

function card(page: any, name: string) {
  return page.locator("section", { hasText: name });
}

async function teleportPlayer(page: any, position: [number, number]) {
  await page.evaluate((pos: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: pos },
    }));
  }, position);
  await page.waitForTimeout(30);
}

test.describe("End-Grain Boards", () => {
  test("shops the aisle, learns the skills, mounts the sled, and cuts", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(() => fixtures["end-grain-shop"]);
    });
    await page.waitForTimeout(30);

    let afterStore: [number, number] | undefined;
    await test.step("buy jig plywood from the Sheet Goods aisle", async () => {
      afterStore = await goToStore(page);
      await expect(page.getByText("Sheet Goods")).toBeVisible();
      // The sled itself is NOT for sale on the tool wall
      await expect(page.getByText("Crosscut Sled")).toHaveCount(0);
      // The whole rack is out: cheap chip boards through cabinet ply
      // (reputation 20 clears the rep-12 shelf)
      await expect(page.getByText("OSB")).toBeVisible();
      await expect(page.getByText("Cabinet Plywood")).toBeVisible();
      await page
        .locator("li", { hasText: "Shop Plywood" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(30);
      const money = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      expect(money).toBe(76); // $24 of shop-grade plywood
    });

    await test.step("learn Jigs & Fixtures and End-Grain Boards", async () => {
      await leaveStore(page, afterStore);
      await openJournal(page);
      for (const skill of ["Jigs & Fixtures", "End-Grain Boards"]) {
        await page
          .locator("li", { hasText: skill })
          .getByRole("button", { name: /Learn/ })
          .click();
        await page.waitForTimeout(30);
      }
      await expect(page.getByText("Certified")).toHaveCount(6);
    });

    // A bench: pick a plan off the sheet, send stock over with the manifest's
    // transfer buttons, hold the key until it's done.
    await test.step("build the crosscut sled at the workspace", async () => {
      await closeJournal(page);
      await selectMode(page, "Makeshift Workbench", "Build Crosscut Sled");
      await page
        .locator("li", { hasText: "Plywood" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click();
      await page.waitForTimeout(30);
      await page
        .locator("li", { hasText: "Pallet Wood" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click({ modifiers: ["Shift"] });
      await page.waitForTimeout(30);
      await runWhileHolding(
        page,
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .storage.tools.includes("crosscutSled"),
        undefined,
        { timeout: 15000 },
      );
    });

    await test.step("mount the sled on the table saw", async () => {
      await teleportPlayer(page, SAW_CELL);
      // A direct-feed machine's sheet is nothing but its tool rack now
      await openStationSheet(page);
      const sawCard = card(page, "Jobsite Table Saw");
      await expect(sawCard.getByText(/Tools ·/)).toBeVisible();
      await sawCard.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(30);
      // Jig on the table: the panel this spec carries can be crosscut now
      await expect(sawCard.getByText("Crosscut Sled")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(30);
    });

    // A direct-feed machine: no plan to pick, no transfer buttons. Set the
    // stock down (F), hold the trigger, collect at the outfeed cell.
    await test.step("crosscut the sanded panel on the sled", async () => {
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("f");
      await page.waitForTimeout(30);
      await runWhileHolding(
        page,
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some(
                (mat: any) => mat.type === "endGrainSlice",
              ),
            ),
        undefined,
        { timeout: 30000 },
      );
      await teleportPlayer(page, [6, 1]); // the saw's outfeed cell
      await takeAllHere(page);
      await expect(
        page.getByText("Maple End-Grain Slice").first(),
      ).toBeVisible();
    });
  });
});
