import { test, expect } from "@playwright/test";
import { openStationSheet, selectMode, takeAllHere } from "./machine-panel";
import {
  closeJournal,
  goToStore,
  leaveStore,
  openJournal,
  openPhone,
} from "./navigation";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

const WORKSPACE_CELL: [number, number] = [1, 4];
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
  await page.waitForTimeout(200);
}

/**
 * Operate the machine (via its station sheet) and collect the results.
 * Feed-through machines deliver to their outfeed cell — pass `takeAt`
 * to walk there and take with Shift+E (single-point stations collect
 * right off the sheet).
 */
async function operateAndWait(
  page: any,
  machineName: string,
  isDoneSource: string,
  takeAt?: [number, number],
  verb: string = "Operate",
) {
  await openStationSheet(page);
  await card(page, machineName).getByRole("button", { name: verb }).click();
  await page.waitForFunction(
    (src: string) => {
      const matches = new Function("mat", `return (${src})(mat)`) as any;
      return (window as any)
        .__GET_GAME_STATE__()
        .machines.some((m: any) => m.outputMaterials.some(matches));
    },
    isDoneSource,
    { timeout: 30000 },
  );
  if (takeAt) {
    await teleportPlayer(page, takeAt);
    await takeAllHere(page);
  } else {
    await card(page, machineName)
      .getByRole("button", { name: /Take All/ })
      .click();
  }
  await page.waitForTimeout(200);
}

test.describe("End-Grain Boards", () => {
  test("should buy plywood, build a sled, and make an end-grain board", async ({
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
    await page.waitForTimeout(300);

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
      await page.waitForTimeout(200);
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
        await page.waitForTimeout(200);
      }
      await expect(page.getByText("Certified")).toHaveCount(6);
    });

    await test.step("build the crosscut sled at the workspace", async () => {
      await closeJournal(page);
      await page.keyboard.press("3"); // the cures are long by design
      await selectMode(page, "Makeshift Workbench", "Build Crosscut Sled");
      await page
        .locator("li", { hasText: "Plywood" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click();
      await page.waitForTimeout(200);
      await page
        .locator("li", { hasText: "Pallet Wood" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click({ modifiers: ["Shift"] });
      await page.waitForTimeout(200);
      await card(page, "Makeshift Workbench")
        .getByRole("button", { name: "Operate" })
        .click();
      await page.waitForFunction(
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
      // The saw's buttons and tool rack live on its station sheet
      await openStationSheet(page);
      const sawCard = card(page, "Jobsite Table Saw");
      // Bare saw: nothing in hand it can cut — the carried panel can't
      // ride the fence, so Feed stays dead until the sled is on the table
      await expect(
        sawCard.getByRole("button", { name: "Feed" }),
      ).toBeDisabled();
      await sawCard.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(200);
      // Jig on the table: feeding the panel now means crosscutting it
      await expect(sawCard.getByRole("button", { name: "Feed" })).toBeEnabled();
    });

    await test.step("crosscut the sanded panel into slices", async () => {
      await operateAndWait(
        page,
        "Jobsite Table Saw",
        `(mat) => mat.type === "endGrainSlice"`,
        [6, 1], // the saw's outfeed cell
        "Feed",
      );
      const sliceCount = await page.evaluate(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .player.inventory.filter((mat: any) => mat.type === "endGrainSlice")
            .length,
      );
      expect(sliceCount).toBe(4);
    });

    await test.step("glue the slices grain-up and sand the blank", async () => {
      await teleportPlayer(page, WORKSPACE_CELL);
      await selectMode(page, "Makeshift Workbench", "Glue Up End-Grain Panel");
      await page
        .locator("li", { hasText: "Maple End-Grain Slice" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click({ modifiers: ["Shift"] });
      await page.waitForTimeout(200);
      await operateAndWait(
        page,
        "Makeshift Workbench",
        `(mat) => mat.type === "panel" && mat.grain === "end"`,
      );
      await expect(
        page.getByText(`Maple End-Grain Panel 8/4 — 10" × 1'`).first(),
      ).toBeVisible();

      await selectMode(page, "Makeshift Workbench", "Sand Panel");
      for (const surface of ["smooth", "sanded"]) {
        await page
          .locator("li", { hasText: "Maple End-Grain Panel" })
          .getByRole("button", { name: "→ Makeshift Workbench" })
          .click();
        await page.waitForTimeout(200);
        await operateAndWait(
          page,
          "Makeshift Workbench",
          `(mat) => mat.type === "panel" && mat.surface === "${surface}"`,
        );
      }
    });

    await test.step("finish the end-grain board", async () => {
      await selectMode(page, "Makeshift Workbench", "Finish End-Grain Board");
      await page
        .locator("li", { hasText: "Maple End-Grain Panel" })
        .getByRole("button", { name: "→ Makeshift Workbench" })
        .click();
      await page.waitForTimeout(200);
      await operateAndWait(
        page,
        "Makeshift Workbench",
        `(mat) => mat.type === "endGrainCuttingBoard"`,
      );
      const board = await page.evaluate(() =>
        (window as any)
          .__GET_GAME_STATE__()
          .player.inventory.find(
            (mat: any) => mat.type === "endGrainCuttingBoard",
          ),
      );
      expect(board.species).toBe("maple");
    });

    await test.step("XP and the sale", async () => {
      // $450 board -> 450 XP -> level 3 -> the 2 spent points earned back
      const progression = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().progression,
      );
      expect(progression.xp).toBe(450);
      expect(progression.skillPoints).toBe(2);

      const moneyBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      await openPhone(page);
      await page
        .locator("li", { hasText: "End Grain Cutting Board" })
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
          (window as any).__GET_GAME_STATE__().money === before + 450,
        moneyBefore,
        { timeout: 10000 },
      );
    });
  });
});
