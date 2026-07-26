import { test, expect } from "@playwright/test";
import {
  machineCard as stationCard,
  modesOf,
  runUntilOutput,
  openStationSheet,
  runWhileHolding,
  selectMode,
  setParameter,
  takeAllHere,
} from "./machine-panel";
import { pumpTicks } from "./navigation";
import {
  closeJournal,
  goToLumberyard,
  goToStore,
  leaveStore,
  openJournal,
} from "./navigation";

/**
 * Stations, and the aisles you buy them from.
 *
 * Every shape of machine interface in one browser: a bench that picks a plan
 * off its sheet and takes stock from the manifest's transfer buttons, a
 * direct-feed machine that has no plan at all and cuts whatever you set down,
 * the tool racks that add a tool's trades to a station, the settings scales,
 * and the power switch that means a new machine cuts nothing until someone
 * throws it. Plus the two lumber channels and the reputation tiers that decide
 * what's on their racks.
 *
 * What the stations *produce* is checked in src/game/sequences/ — the recipes,
 * the chains, and the whole ladder from a new save to the last commission. The
 * assertions here are about the interface reaching them.
 *
 * One browser, six fixtures. Each half swaps the shop under it, which costs a
 * few milliseconds against the second and a half a fresh page would.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

// ---------------------------------------------------------------------------
// Shared helpers. Six specs merged into this one had their own copies of most
// of these; they were identical, so there is one of each now.
// ---------------------------------------------------------------------------

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

/** E — throw the power switch on the machine you're standing at. */
const switchOn = (page: any) => pressKey(page, "e");

/** F — set the carried stock down on the machine you're standing at. */
const setStockDown = (page: any) => pressKey(page, "f");

/** Z/X — step the machine's linear setting down or up. */
async function stepSetting(page: any, direction: "z" | "x", times = 1) {
  for (let i = 0; i < times; i++) await pressKey(page, direction);
}

/**
 * A panel that merely mentions a machine's name. Looser than machine-panel's
 * `machineCard`, which anchors on the placard heading — the milling and
 * miter-saw halves want the looser one, so it keeps the local name.
 */
function machineCard(page: any, name: string) {
  return page.locator("section", { hasText: name });
}

/** The station sheet's own card, anchored on its heading. */
function workspaceCard(page: any) {
  return stationCard(page, "Makeshift Workbench");
}

/** One machine's live value for a setting. */
async function settingOf(page: any, machineTypeId: string, param: string) {
  return page.evaluate(
    ([id, key]: [string, string]) =>
      (window as any)
        .__GET_GAME_STATE__()
        .machines.find((m: any) => m.machineTypeId === id)
        ?.selectedParameters?.[key],
    [machineTypeId, param],
  );
}

const sawSetting = (page: any, key: string) => settingOf(page, "miterSaw", key);

/** R / Shift+R — swing the miter saw's head to an angle stop. */
async function setAngle(page: any, target: number) {
  for (let i = 0; i < 16; i++) {
    if ((await sawSetting(page, "angle")) === target) return;
    await pressKey(page, target < 0 ? "Shift+r" : "r");
  }
  throw new Error(`could not swing the head to ${target}`);
}

/** Z/X — slide the miter saw's cut line to a mark. */
async function setCutLine(page: any, target: number) {
  for (let i = 0; i < 16; i++) {
    const current = await sawSetting(page, "cutPosition");
    if (current === target) return;
    await pressKey(page, Number(current) > target ? "z" : "x");
  }
  throw new Error(`could not slide the cut line to ${target}`);
}

/** Every board the player is holding, as plain data. */
async function boardsInHand(page: any) {
  return page.evaluate(() =>
    (window as any)
      .__GET_GAME_STATE__()
      .player.inventory.filter((m: any) => m.type === "board")
      .map((b: any) => ({
        thickness: b.thickness,
        width: b.width,
        jointedFaces: b.jointedFaces,
        jointedEdges: b.jointedEdges,
        surface: b.surface,
      })),
  );
}

/** Clear the hands of every walnut board, so F stages the intended one. */
async function dropEverything(page: any) {
  for (let i = 0; i < 12; i++) {
    const drop = page
      .locator("li")
      .filter({ hasText: /Walnut/ })
      .getByRole("button", { name: "Drop" });
    if ((await drop.count()) === 0) return;
    await drop.first().click({ modifiers: ["Shift"] });
    await page.waitForTimeout(30);
  }
}

/**
 * Drop every carried board except the rows matching `keep`. F stages the
 * first thing in hand the machine will take, so a spec that means a
 * particular board has to be holding only that board.
 */
async function dropAllExcept(page: any, keep: RegExp) {
  for (let i = 0; i < 12; i++) {
    const rows = page.locator("li").filter({ hasText: /Walnut/ });
    const count = await rows.count();
    let dropped = false;
    for (let r = 0; r < count; r++) {
      const row = rows.nth(r);
      if (keep.test((await row.textContent()) ?? "")) continue;
      const drop = row.getByRole("button", { name: "Drop" });
      if ((await drop.count()) === 0) continue;
      await drop.first().click({ modifiers: ["Shift"] });
      await page.waitForTimeout(30);
      dropped = true;
      break;
    }
    if (!dropped) return;
  }
}

/** Drive the clock until some board in the world matches. */
async function waitForBoard(
  page: any,
  predicate: string,
  timeout: number = 20000,
) {
  const boardMatches = (pred: string) => {
    const state = (window as any).__GET_GAME_STATE__();
    const boards = [
      ...state.player.inventory,
      ...state.machines.flatMap((m: any) => [
        ...m.inputMaterials,
        ...m.processingMaterials,
        ...m.outputMaterials,
      ]),
    ].filter((m: any) => m.type === "board");
    // eslint-disable-next-line no-new-func
    return boards.some(new Function("b", `return ${pred}`) as any);
  };
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await page.evaluate(boardMatches, predicate)) return;
    await pumpTicks(page);
  }
  throw new Error(`waitForBoard timed out waiting for a board: ${predicate}`);
}

/** Hold the trigger until a board matches, then let go. */
async function runUntilBoard(page: any, predicate: string, timeout = 20000) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.down("Space");
  try {
    await waitForBoard(page, predicate, timeout);
  } finally {
    await page.keyboard.up("Space");
    await page.waitForTimeout(30);
  }
}

/** Wait for any material in the world to match. */
async function waitForMaterial(
  page: any,
  predicate: string,
  timeout: number = 20000,
) {
  await page.waitForFunction(
    (pred: string) => {
      const state = (window as any).__GET_GAME_STATE__();
      const materials = [
        ...state.player.inventory,
        ...state.machines.flatMap((m: any) => [
          ...m.inputMaterials,
          ...m.processingMaterials,
          ...m.outputMaterials,
        ]),
      ];
      // eslint-disable-next-line no-new-func
      return materials.some(new Function("m", `return ${pred}`) as any);
    },
    predicate,
    { timeout },
  );
}

/** The cell the table saw is worked from, in the end-grain shop. */
const SAW_CELL: [number, number] = [6, 5];

/** end-grain.spec called it this. */
const teleportPlayer = movePlayerTo;
/** end-grain.spec called the loose panel matcher this. */
const card = machineCard;

test.describe("Stations", () => {
  test("shops the aisles, fits out the stations, and works each shape", async ({
    page,
  }) => {
    test.setTimeout(300000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    // The manual greets a new game and holds the keyboard until dismissed
    const manual = page.getByRole("dialog", { name: "Shop manual" });
    if (await manual.count()) {
      await page.keyboard.press("Escape");
      await manual.waitFor({ state: "detached" });
    }
    await page.waitForTimeout(500);

    // Where the store trips return the player to, per half.
    let afterStore: [number, number] | undefined;

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
      await expect(page.getByText("Tool Wall")).toBeVisible();
      await expect(page.getByText("Sanding Block")).toBeVisible();
      // Scoped: the supplies aisle sells a $10.00 oil bottle too
      await expect(
        page.locator("section", { hasText: "Tool Wall" }).getByText("$10.00"),
      ).toBeVisible();
      await expect(page.getByText("Random Orbit Sander")).toBeVisible();
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

    await test.step("mount the sander at the workspace", async () => {
      await expect(page.getByText("1/2 slots")).not.toBeVisible();
      // The tool rack lives on the station sheet
      await openStationSheet(page);
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

    await test.step("load the milling-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(() => fixtures["milling-shop"]);
      });
      await page.waitForTimeout(30);
    });

    await test.step("rough stock announces itself in the inventory", async () => {
      await expect(
        page
          .locator("li", { hasText: "Walnut 4/4 — 6\" × 8'" })
          .filter({ hasText: "rough sawn" })
          .first(),
      ).toBeVisible();
    });

    await test.step("Orange Box: only ready-to-use lumber on its racks", async () => {
      const returnTo = await goToStore(page);
      await expect(page.getByText("Construction Lumber")).toBeVisible();
      await expect(page.getByText("S4S Hardwood Rack")).toBeVisible();
      // Anything milled short of S4S moved across town to the lumberyard
      await expect(page.getByText("S2S Rack")).not.toBeVisible();
      await expect(page.getByText("Rough Rack")).not.toBeVisible();
      await leaveStore(page, returnTo);
    });

    await test.step("lumberyard: both channels open at 22 reputation", async () => {
      const returnTo = await goToLumberyard(page);
      await expect(page.getByText("Sawyer & Sons")).toBeVisible();
      await expect(page.getByText("S2S Rack")).toBeVisible();
      await expect(page.getByText("Rough Rack")).toBeVisible();
      // Rough walnut sells at the deepest discount in town. Every
      // species hangs in the rack at once — boards carry no species text,
      // so the Buy button's accessible name is the board's identity.
      const roughRack = page
        .locator("div")
        .filter({ has: page.getByText("Rough Rack", { exact: true }) })
        .filter({ has: page.locator("li") })
        .last();
      // Dims tags hang under each standing board: size, then length
      await expect(roughRack.getByText(/4\/4×6"\s*8'/).first()).toBeVisible();
      const roughWalnut = roughRack.getByRole("button", {
        name: `Buy Walnut 4/4 — 6" × 8' (rough sawn)`,
      });
      await expect(roughWalnut).toBeVisible();
      // 4 board feet of walnut at the rough rack's 0.55 discount
      await expect(roughWalnut).toContainText("$26.40");
      // The milled state moved into the channel-name tooltip — say it once
      await page.getByText("Rough Rack", { exact: true }).hover();
      await expect(
        page.getByText(/rough sawn — Straight off the mill/),
      ).toBeVisible();
      await leaveStore(page, returnTo);
    });

    await test.step("power switch: no cut until the jointer is switched on", async () => {
      // Player starts on the jointer's operation cell, boards in hand.
      // With two rough boards carried the machine would grab the first —
      // park the spare on the floor so the jointer reads one board.
      await page
        .locator("li", { hasText: "Walnut 4/4" })
        .getByRole("button", { name: "Drop" })
        .click();
      await page.waitForTimeout(30);
      // The machine wears its state and its keys — there is no panel
      await expect(page.getByText("Jointer · off")).toBeVisible();
      // Switched off it takes nothing: no "set stock on it" chip offered
      await expect(page.getByText("set stock on it")).toHaveCount(0);
      await switchOn(page);
      await expect(page.getByText("Jointer · on")).toBeVisible();
      await expect(page.getByText("set stock on it")).toBeVisible();
    });

    await test.step("jointer: the stock decides — face pass, then edge pass", async () => {
      // No mode was ever picked: a rough board can only take a face pass.
      // Set it on the beds, then hold the key to push it over the knives.
      await setStockDown(page);
      await runUntilBoard(page, "b.jointedFaces === 1");
      // Finished stock lands at the outfeed side — collect it there
      // (Shift+E takes everything within reach)
      await movePlayerTo(page, [2, 0]);
      await takeAllHere(page);
      // One flat face and the label says so
      await expect(
        page
          .locator("li", { hasText: "Walnut 4/4 — 6\" × 8'" })
          .filter({ hasText: "rough, face jointed" })
          .first(),
      ).toBeVisible();
      // Back around to the infeed; feeding the same board again is now an
      // edge pass — the flat face rides the fence
      await movePlayerTo(page, [2, 4]);
      await setStockDown(page);
      await runUntilBoard(page, "b.jointedFaces === 1 && b.jointedEdges === 1");
      await movePlayerTo(page, [2, 0]);
      await takeAllHere(page);
    });

    await test.step("table saw: an edge-jointed board rips against the fence", async () => {
      await movePlayerTo(page, [3, 11]);
      // E flips the switch on the machine the player is standing at
      await switchOn(page);
      await expect(page.getByText("Jobsite Table Saw · on")).toBeVisible();
      await setStockDown(page);
      // The kept piece has both edges straight; the offcut keeps one
      await runUntilBoard(page, "b.width === 4 && b.jointedEdges === 2");
      await movePlayerTo(page, [3, 7]);
      await takeAllHere(page);
    });

    await test.step("planer: set it down and the rollers take it", async () => {
      await movePlayerTo(page, [6, 4]);
      // No load buttons anywhere: stock goes on a machine with F
      await expect(page.getByRole("button", { name: "→ Planer" })).toHaveCount(
        0,
      );
      // Switched off, nothing goes on it
      await expect(page.getByText("Planer · off")).toBeVisible();
      await switchOn(page);
      await expect(page.getByText("Planer · on")).toBeVisible();

      // Wind the head two detents under the carried 4/4 stock: it won't fit
      // — and the machine says so, with the crank mark to hit
      await stepSetting(page, "z", 2);
      expect(await settingOf(page, "lunchboxPlaner", "targetThickness")).toBe(
        2,
      );
      await expect(
        page.getByText(
          "Won't fit under the cutter head — raise the cut height to 3/4 for the first pass.",
        ),
      ).toBeVisible();
      // Back up to a skim pass at the stock's own thickness; the note clears
      await stepSetting(page, "x", 2);
      expect(await settingOf(page, "lunchboxPlaner", "targetThickness")).toBe(
        4,
      );
      await expect(page.getByText(/cutter head/)).toHaveCount(0);

      // powerFeed: setting the board down *is* starting it — no trigger
      await setStockDown(page);
      await waitForBoard(
        page,
        "b.jointedFaces === 2 && b.jointedEdges === 2 && b.thickness === 4 && b.surface === 'smooth'",
      );
      await movePlayerTo(page, [6, 0]);
      await takeAllHere(page);
      // The inventory names the finished state
      await expect(
        page
          .locator("li", { hasText: "Walnut 4/4 — 4\" × 8'" })
          .filter({ hasText: "smooth, S4S" })
          .first(),
      ).toBeVisible();
    });

    await test.step("planer: a full-depth pass takes exactly one detent off", async () => {
      await movePlayerTo(page, [6, 4]);
      // One detent under the 4/4 stock: a full bite. The first carried
      // piece this setting can take is the 2"-wide rip offcut.
      await stepSetting(page, "z", 1);
      expect(await settingOf(page, "lunchboxPlaner", "targetThickness")).toBe(
        3,
      );
      await setStockDown(page);
      await waitForBoard(
        page,
        "b.width === 2 && b.thickness === 3 && b.surface === 'smooth'",
      );
      await movePlayerTo(page, [6, 0]);
      await takeAllHere(page);
      await expect(
        page
          .locator("li", { hasText: "Walnut 3/4 — 2\" × 8'" })
          .filter({ hasText: "smooth, S3S" })
          .first(),
      ).toBeVisible();
    });

    await test.step("straight-line sled: a rough board rides the sled, not the fence", async () => {
      // Empty the hands so the saw gets the board this step is about
      await dropEverything(page);
      // Fetch the spare rough board parked by the jointer at the start
      await movePlayerTo(page, [2, 4]);
      await page.getByRole("button", { name: "Pick Up" }).click();
      await page.waitForTimeout(30);
      await movePlayerTo(page, [3, 11]);
      // No mode: a rough edge can't ride the fence, so this board runs the
      // mounted straight-line sled
      await setStockDown(page);
      await runUntilBoard(
        page,
        "b.jointedFaces === 0 && b.jointedEdges === 1 && b.width === 6",
      );
    });

    await test.step("load the miter-frame-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["miter-frame-shop"],
        );
      });
      await page.waitForTimeout(30);
    });

    await test.step("mitered stock announces its ends in the inventory", async () => {
      await expect(
        page
          .locator("li", { hasText: "Walnut 1/4 — 1\" × 2'" })
          .filter({ hasText: "45° both ends" })
          .first(),
      ).toBeVisible();
    });

    await test.step("the saw wears its two settings and has no panel", async () => {
      // Both settings hang on the machine, each naming the keys that move
      // it: the cut line slides on Z/X, the head swings on R
      await expect(page.getByText(/cut line:/)).toBeVisible();
      await expect(page.getByText(/angle:/)).toBeVisible();
      // The saw's sheet is nothing but a tool rack now — no scales, no
      // verb button, no mode picker. Everything to run it is a key.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("Tab");
      const sheet = page.getByTestId("station-sheet");
      await sheet.waitFor({ state: "visible" });
      await expect(sheet.getByText(/Tools ·/)).toBeVisible();
      await expect(sheet.getByRole("button", { name: "Cut" })).toHaveCount(0);
      await expect(
        sheet.getByRole("radiogroup", { name: "Angle" }),
      ).toHaveCount(0);
      await expect(
        sheet.getByRole("radiogroup", { name: "Cut Line" }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
    });

    await test.step("first cut: 45° at the 5' mark makes a 5' and a 3' piece", async () => {
      // Board on the table first — the settings move the board that's on
      // the saw, not a ghost of one you're holding
      await setStockDown(page);
      await setAngle(page, 45);
      await setCutLine(page, 5);
      await runWhileHolding(
        page,
        (pred: string) => {
          const state = (window as any).__GET_GAME_STATE__();
          const all = [
            ...state.player.inventory,
            ...state.machines.flatMap((m: any) => [
              ...m.inputMaterials,
              ...m.processingMaterials,
              ...m.outputMaterials,
            ]),
          ];
          return all.some(new Function("m", `return ${pred}`) as any);
        },
        "m.type === 'board' && m.length === 5 && m.ends && m.ends.right.kind === 'mitered' && m.ends.left.kind === 'square'",
      );
      // Cut pieces stay on the saw table until collected
      await takeAllHere(page);
      await expect(
        page
          .locator("li", { hasText: "Walnut 1/4 — 1\" × 5'" })
          .filter({ hasText: "45° one end" })
          .first(),
      ).toBeVisible();
    });

    await test.step("second cut: swing to -45 for the mirrored miter", async () => {
      // The other end of a frame rail leans the other way — that's what
      // the saw's negative stops are for. Same 45° magnitude, mirrored:
      // the piece right of the 3' line carries -45/+45 ends at 2' long.
      // The 5' half-mitered piece is the one this cut is about, so put the
      // rest down first — F takes whatever is first in hand
      await dropAllExcept(page, /1" × 5'/);
      await setStockDown(page);
      await setAngle(page, -45);
      await setCutLine(page, 3);
      await runWhileHolding(
        page,
        (pred: string) => {
          const state = (window as any).__GET_GAME_STATE__();
          const all = [
            ...state.player.inventory,
            ...state.machines.flatMap((m: any) => [
              ...m.inputMaterials,
              ...m.processingMaterials,
              ...m.outputMaterials,
            ]),
          ];
          return all.some(new Function("m", `return ${pred}`) as any);
        },
        "m.type === 'board' && m.length === 2 && m.ends && m.ends.left.kind === 'mitered' && m.ends.right.kind === 'mitered'",
      );
      await takeAllHere(page);
    });

    await test.step("four rails and four nails become a walnut picture frame", async () => {
      // Gather the rails set aside before the second cut, off the floor
      for (let i = 0; i < 6; i++) await takeAllHere(page);
      await movePlayerTo(page, [7, 4]);
      await selectMode(page, "Makeshift Workbench", "Build Picture Frame");
      for (let i = 0; i < 4; i++) {
        await page
          .locator("li", { hasText: "45° both ends" })
          .first()
          .getByRole("button", { name: "→ Makeshift Workbench" })
          .click();
        await page.waitForTimeout(30);
      }
      await runWhileHolding(page, () => {
        const state = (window as any).__GET_GAME_STATE__();
        const all = [
          ...state.player.inventory,
          ...state.machines.flatMap((m: any) => [
            ...m.inputMaterials,
            ...m.processingMaterials,
            ...m.outputMaterials,
          ]),
        ];
        return all.some((m: any) => m.type === "pictureFrame");
      });
      await machineCard(page, "Makeshift Workbench")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("Picture Frame").first()).toBeVisible();
      // The brads came out of the shop stock
      const nails = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().consumables.nails,
      );
      expect(nails).toBe(6);
    });

    await test.step("load the resaw-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(() => fixtures["resaw-shop"]);
      });
      await page.waitForTimeout(30);
    });

    await test.step("the band saw wears its fence setting in quarters", async () => {
      await expect(page.getByText("Band Saw · off")).toBeVisible();
      await switchOn(page);
      await expect(page.getByText("Band Saw · on")).toBeVisible();
      // The fence reads in quarters, not inches — it's a thickness
      await expect(page.getByText("fence:")).toBeVisible();
      await expect(
        page.getByText("4/4", { exact: false }).first(),
      ).toBeVisible();
    });

    await test.step("one 8/4 blank comes off as two 4/4 boards", async () => {
      await setStockDown(page);
      await runUntilOutput(
        page,
        "(m) => m.type === 'board' && m.thickness === 4",
      );
      // Both halves stay on the saw table — you were holding them
      await takeAllHere(page);
      const halves = (await boardsInHand(page)).filter(
        (b: any) => b.thickness === 4,
      );
      expect(halves).toHaveLength(2);
      // Nothing was planed away: the kerf disappears at this granularity
      for (const half of halves) {
        // The sawn face is rough, and neither piece is two-faced any more
        expect(half.surface).toBe("rough");
        expect(half.jointedFaces).toBe(1);
        // Edges and width were never touched
        expect(half.jointedEdges).toBe(2);
        expect(half.width).toBe(6);
      }
    });

    await test.step("mounting the tall fence takes ripping off the table saw", async () => {
      await movePlayerTo(page, [8, 4]);
      await switchOn(page);
      await expect(page.getByText("Jobsite Table Saw · on")).toBeVisible();
      // Bare, the saw's one setting is the rip fence, in inches
      await expect(page.getByText("target width:")).toBeVisible();

      await openStationSheet(page);
      await page
        .locator("li", { hasText: "Tall Resaw Fence (stored)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(30);
      await pressKey(page, "Escape");

      // A board can't lie flat against a 14"-tall fence: the rip is gone,
      // and the setting that's left reads in quarters
      await expect(page.getByText("target width:")).toHaveCount(0);
      await expect(page.getByText("fence:")).toBeVisible();
    });

    await test.step("the table saw pays a kerf the band saw didn't", async () => {
      // The untouched blank has been in the player's pocket all along —
      // it's the first board in hand, so it's the one that goes on the table
      await setStockDown(page);
      await runUntilOutput(
        page,
        "(m) => m.type === 'board' && m.thickness === 3",
      );
      // Feed-through machine: the pieces are waiting at the outfeed
      await movePlayerTo(page, [8, 0]);
      await takeAllHere(page);
      const thicknesses = (await boardsInHand(page))
        .map((b: any) => b.thickness)
        .sort();
      // The two 4/4 halves the band saw made, plus this saw's 4/4 and a
      // 3/4 offcut — the missing quarter inch left as dust
      expect(thicknesses).toEqual([3, 4, 4, 4]);
    });
  });
});
