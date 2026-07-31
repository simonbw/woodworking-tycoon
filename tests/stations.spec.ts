import { test, expect } from "@playwright/test";
import {
  machineCard as stationCard,
  modesOf,
  openRecipeIndex,
  openStationSheet,
  runWhileHolding,
  selectMode,
  takeAllHere,
} from "./machine-panel";
import {
  closeJournal,
  goToLumberyard,
  goToStore,
  leaveStore,
  openJournal,
  startNewGame,
} from "./navigation";

/**
 * Stations you fit out, and the aisles you fit them out from.
 *
 * A bench picks a plan off its station sheet and takes stock from the
 * manifest's transfer buttons; a tool rack adds a mounted tool's trades to
 * whatever station holds it — including a jig that unlocks a cut on a
 * direct-feed machine that had no plan to pick. Plus the two lumber channels
 * and the reputation tiers that decide what's on their racks.
 *
 * The direct-feed machines themselves — power switches, settings scales, and
 * the stock deciding the cut — are milling.spec.ts. What the stations
 * *produce* is checked in src/game/sequences/: the recipes, the chains, and
 * the whole ladder from a new save to the last commission. The assertions here
 * are about the interface reaching them.
 *
 * One browser, three fixtures. Each half swaps the shop under it, which costs
 * a few milliseconds against the second and a half a fresh page would.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** Put the player on a cell without walking them there. */
async function movePlayerTo(page: any, position: [number, number]) {
  await page.evaluate((pos: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: pos },
    }));
  }, position);
  await page.waitForTimeout(30);
}

/** Blur first: with focus on a control the game's keys activate it instead. */
async function pressKey(page: any, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press(key);
  await page.waitForTimeout(30);
}

/** How many pieces the player is carrying. */
function handsCount(page: any): Promise<number> {
  return page.evaluate(
    () => (window as any).__GET_GAME_STATE__().player.inventory.length,
  );
}

/** How many pieces are sitting in the garbage can. */
function canContents(page: any): Promise<number> {
  return page.evaluate(
    () =>
      (window as any)
        .__GET_GAME_STATE__()
        .machines.find((m: any) => m.machineTypeId === "garbageCan")
        .inputMaterials.length,
  );
}

/**
 * A panel that merely mentions a machine's name. Looser than machine-panel's
 * `machineCard`, which anchors on the placard heading — the table saw has no
 * placard, so its name is all there is to go on.
 */
function machineCard(page: any, name: string) {
  return page.locator("section", { hasText: name });
}

/** The station sheet's own card, anchored on its heading. */
function workspaceCard(page: any) {
  return stationCard(page, "Makeshift Workbench");
}

/** The cell the table saw is worked from, in the end-grain shop. */
const SAW_CELL: [number, number] = [6, 5];

test.describe("Stations", () => {
  test("shops the aisles, fits out the stations, and works a plan", async ({
    page,
  }) => {
    test.setTimeout(300000);
    await page.goto("/");
    await startNewGame(page);
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    // The manual greets a new game and holds the keyboard until dismissed
    const manual = page.getByRole("dialog", { name: "Shop manual" });
    if (await manual.count()) {
      await page.keyboard.press("Escape");
      await manual.waitFor({ state: "detached" });
    }
    await page.waitForTimeout(500);

    // Where the store trip returns the player to.
    let afterStore: [number, number] | undefined;

    // The starter shop is the only one with a garbage can, so this rides
    // the new game before the fixtures take over.
    await test.step("the garbage can holds what you toss in", async () => {
      // A brand-new floor is empty (the first pallet is scavenged), so
      // set something down to have a thing to toss in the can.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          materialPiles: [
            ...state.materialPiles,
            {
              material: {
                id: "e2e-garbage-pallet",
                type: "pallet",
                deckBoards: [
                  true,
                  true,
                  true,
                  true,
                  true,
                  true,
                  true,
                  true,
                  true,
                  true,
                  true,
                ],
                stringerBoardsLeft: 3,
              },
              position: [2.5, 5.5],
              rotation: 0,
            },
          ],
        }));
      });
      await page.waitForTimeout(30);
      await movePlayerTo(page, [2, 5]);
      await pressKey(page, "e");
      expect(await handsCount(page)).toBe(1);

      // Walk up on the can's side — it has no front, so any of the cells
      // touching it works
      await movePlayerTo(page, [2, 13]);
      await pressKey(page, "f");
      expect(await handsCount(page)).toBe(0);
      expect(await canContents(page)).toBe(1);

      // The can is opened, not reached into: E leaves it alone
      await pressKey(page, "e");
      expect(await handsCount(page)).toBe(0);
      expect(await canContents(page)).toBe(1);

      // Its sheet is an inventory, not a plan picker
      await openStationSheet(page);
      const sheet = stationCard(page, "Garbage Can");
      await expect(sheet.getByText("Contents · 1/8")).toBeVisible();
      await expect(sheet.getByText("Mode")).not.toBeVisible();
    });

    await test.step("walking away puts the sheet away for good", async () => {
      // Regression: the open sheet was remembered by station, so walking
      // off only hid it — stepping back up to the can spread it open
      // again with nobody touching Tab.
      await movePlayerTo(page, [2, 5]);
      await page.getByTestId("station-sheet").waitFor({ state: "detached" });
      await movePlayerTo(page, [2, 13]);
      await page.waitForTimeout(100);
      await expect(page.getByTestId("station-sheet")).toHaveCount(0);
      // Tab still spreads it back out
      await openStationSheet(page);
      await expect(
        stationCard(page, "Garbage Can").getByText("Contents · 1/8"),
      ).toBeVisible();
    });

    await test.step("...and gives it back through the sheet until you empty it", async () => {
      await stationCard(page, "Garbage Can")
        .getByRole("button", { name: "Take" })
        .click();
      await page.waitForTimeout(30);
      expect(await handsCount(page)).toBe(1);
      expect(await canContents(page)).toBe(0);

      // Back in, and this time haul it out — the only thing in the shop
      // that destroys stock, and it's a held key, not a button
      await pressKey(page, "f");
      expect(await canContents(page)).toBe(1);
      await runWhileHolding(
        page,
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.find((m: any) => m.machineTypeId === "garbageCan")
            .inputMaterials.length === 0,
      );
      expect(await canContents(page)).toBe(0);
      expect(await handsCount(page)).toBe(0);
      // Destroyed, not dropped at the player's feet
      expect(
        await page.evaluate(
          () => (window as any).__GET_GAME_STATE__().materialPiles.length,
        ),
      ).toBe(0);

      await page.keyboard.press("Escape");
      await page.getByTestId("station-sheet").waitFor({ state: "detached" });
    });

    await test.step("load the cutting-board-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["cutting-board-shop"],
        );
      });
      await page.waitForTimeout(30);
    });

    await test.step("commission 6 is active", async () => {
      await expect(page.getByText("A Proper Cutting Board")).toBeVisible();
    });

    await test.step("store: tool wall and reputation-gated lumber channels", async () => {
      const returnTo = await goToStore(page);
      await expect(page.getByText("Tools", { exact: true })).toBeVisible();
      await expect(page.getByText("Sanding Block")).toBeVisible();
      // Scoped: the supplies aisle sells a $10.00 oil bottle too
      await expect(
        page.locator("section", { hasText: "Tools" }).getByText("$10.00"),
      ).toBeVisible();
      await expect(page.getByText("Random Orbit Sander")).toBeVisible();
      // A shelf tile carries the picture, the name and the price; what
      // the thing actually does is behind the ⓘ in its corner, which is
      // what keeps the store as short as it is. Crossing the tile does
      // nothing — you have to point at the badge.
      //
      // Retried rather than hovered once: the tool shelf sits below this
      // viewport's fold, so the pointer has to be placed on a badge the
      // page just scrolled to, and a late web font or a tick that reflows
      // the aisle slides it out from under it. Re-hovering costs nothing
      // and the tooltip only opens on a pointer that landed.
      const sandingBlock = page.locator("li", { hasText: "Sanding Block" });
      const aboutSandingBlock = sandingBlock.getByRole("button", {
        name: "About Sanding Block",
      });
      await expect(async () => {
        await aboutSandingBlock.scrollIntoViewIfNeeded();
        await aboutSandingBlock.hover();
        await expect(page.getByRole("tooltip")).toContainText(
          "Sands a surface smooth by hand",
          { timeout: 2000 },
        );
      }).toPass({ timeout: 15000 });
      // Pointing away puts it back; clicking pins it, so copy you asked
      // for stays up while you read it and takes a press elsewhere to
      // dismiss (Escape can't do it — in here Escape is Head Home)
      await page.mouse.move(0, 0);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await aboutSandingBlock.click();
      await expect(page.getByRole("tooltip")).toContainText(
        "Sands a surface smooth by hand",
      );
      await page.mouse.move(0, 0);
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.locator("h2", { hasText: "Machines" }).click();
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      // Cheap channels: framing pine and marked-up big-box S4S hardwood.
      // Boards carry dimensions only — species lives on the bundle's tag.
      await expect(page.getByText("Construction Lumber")).toBeVisible();
      await expect(page.getByText(/1x4\s*8'/)).toBeVisible();
      await expect(page.getByText("$2.01")).toBeVisible();
      await expect(page.getByText("S4S Hardwood Rack")).toBeVisible();
      // The less-than-S4S channels live at the lumberyard, not here
      await expect(page.getByText("S2S Rack")).not.toBeVisible();
      await expect(page.getByText("Rough Rack")).not.toBeVisible();
      await leaveStore(page, returnTo);
    });

    await test.step("lumberyard: open at 17 reputation, rough rack still hidden", async () => {
      const returnTo = await goToLumberyard(page);
      await expect(page.getByText("Sawyer & Sons")).toBeVisible();
      // At 17 reputation the S2S rack (12) has appeared...
      await expect(page.getByText("S2S Rack")).toBeVisible();
      // ...but the rough rack (22) doesn't exist yet — not even greyed out
      await expect(page.getByText("Rough Rack")).not.toBeVisible();
      await leaveStore(page, returnTo);
    });

    await test.step("mount the carried sander at the workspace", async () => {
      await expect(page.getByText("1/2 slots")).not.toBeVisible();
      // The tool rack lives on the station sheet; the fixture's sander is
      // in the player's hands, which is where the rack mounts from
      await openStationSheet(page);
      await expect(
        page.getByText("Random Orbit Sander (in hand)"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(30);
      await expect(page.getByText("1/2 slots")).toBeVisible();
      // The sander's operations joined the workspace's Mode list
      const modeOptions = await modesOf(page, "Makeshift Workbench");
      expect(modeOptions).toContain("Sand Panel");
    });

    await test.step("load the end-grain-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(() => fixtures["end-grain-shop"]);
      });
      await page.waitForTimeout(30);
    });

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

    // A bench: pick a plan off the sheet, stage the stock with Shift+F
    // (plan-aware: it takes the plywood and the pallet boards together),
    // hold the key until it's done.
    await test.step("build the crosscut sled at the workspace", async () => {
      await closeJournal(page);
      await selectMode(page, "Makeshift Workbench", "Build Crosscut Sled");
      await pressKey(page, "Shift+f");
      // The built sled is a physical thing: it lands in the bench's
      // output bay like any other product
      await runWhileHolding(
        page,
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some(
                (mat: any) =>
                  mat.type === "tool" && mat.toolId === "crosscutSled",
              ),
            ),
        undefined,
        { timeout: 15000 },
      );
    });

    await test.step("carry the sled to the table saw and mount it", async () => {
      // Pick the sled up off the bench's output bay...
      await takeAllHere(page);
      // ...and carry it across the floor to the saw
      await movePlayerTo(page, SAW_CELL);
      // A direct-feed machine's sheet is nothing but its tool rack now
      await openStationSheet(page);
      const sawCard = machineCard(page, "Jobsite Table Saw");
      await expect(sawCard.getByText(/Tools ·/)).toBeVisible();
      await sawCard.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(30);
      // Jig on the table: the panel this spec carries can be crosscut now
      await expect(sawCard.getByText("Crosscut Sled")).toBeVisible();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(30);
    });

    // What a mounted jig buys: the saw had no plan to pick and no operation
    // for this panel until the sled went on the table. Set the stock down
    // (F), hold the trigger, collect at the outfeed cell.
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
      await movePlayerTo(page, [6, 1]); // the saw's outfeed cell
      await takeAllHere(page);
      await expect(
        page.getByText("Maple End-Grain Slice").first(),
      ).toBeVisible();
    });

    await test.step("load the hand-tools-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["hand-tools-shop"],
        );
      });
      await page.waitForTimeout(30);
    });

    await test.step("the tool wall sells the hand saw and drill, supplies sell screws", async () => {
      const returnTo = await goToStore(page);
      const toolWall = page.locator("section", { hasText: "Tools" });
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
      await expect(page.getByText("50 screws in shop")).toBeVisible();

      await leaveStore(page, returnTo);
    });

    await test.step("both tools mount at the workbench and add their trades", async () => {
      // The tool rack lives on the station sheet
      await openStationSheet(page);
      await page
        .locator("li", { hasText: "Hand Saw (in hand)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(30);
      await page
        .locator("li", { hasText: "Drill (in hand)" })
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

    await test.step("plans quote shop time, never ticks", async () => {
      await openStationSheet(page);
      const card = stationCard(page, "Makeshift Workbench");
      await openRecipeIndex(card);
      // Every plan carries a duration, and each one reads as minutes or
      // hours — the simulation's tick never reaches the player.
      const row = card.locator("li", { hasText: "Build Rustic Planter Box" });
      await expect(
        row.getByText(/^(\d+ min|\d+h( \d{2}m)?)$/),
      ).toBeVisible();
      await expect(card.getByText(/\bticks?\b/)).toHaveCount(0);
    });
  });
});
