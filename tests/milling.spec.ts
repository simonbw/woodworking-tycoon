import { test, expect } from "@playwright/test";
import {
  closeStationSurface,
  runUntilOutput,
  openStationSheet,
  runWhileHolding,
  selectMode,
  takeAllHere,
} from "./machine-panel";
import { pumpTicks, startNewGame } from "./navigation";
import { goToLumberyard, goToStore, leaveStore, shelfTag } from "./navigation";

/**
 * The direct-feed machines, and the stock that decides what they do.
 *
 * A jointer, planer, table saw, band saw, and miter saw have no plan to pick
 * and no transfer buttons: you throw the power switch (E), dial the scales
 * (Z/X, R), set one piece of stock down (F), and hold the trigger. Which
 * operation runs is inferred from what's on the table. That makes them a
 * different interface from the benches and containers in stations.spec.ts,
 * which is why they live in their own browser.
 *
 * What the cuts *produce* is checked in src/sim/sequences/ — the milling
 * chains, the mitred frame, the resaw. The assertions here are about the keys,
 * the scales, and the machine refusing to work until it's switched on.
 *
 * One browser, three fixtures. Each half swaps the shop under it.
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
 * `machineCard`, which anchors on the placard heading — a direct-feed machine
 * has no placard, so its name is all there is to go on.
 */
function machineCard(page: any, name: string) {
  return page.locator("section", { hasText: name });
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

/**
 * Z/X — slide the miter saw's cut line to a mark: the marks are an inch
 * apart, so shift (a foot a press) covers the distance and bare presses
 * close the last few inches.
 */
async function setCutLine(page: any, target: number) {
  for (let i = 0; i < 32; i++) {
    const current = Number(await sawSetting(page, "cutPosition"));
    if (current === target) return;
    const key = current > target ? "z" : "x";
    await pressKey(
      page,
      Math.abs(current - target) >= 12 ? `Shift+${key}` : key,
    );
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

/** A carried group's slot on the hands strip, by its label text. */
function handSlot(page: any, text: string | RegExp) {
  return page.getByTestId("hands-strip").getByRole("button").filter({
    hasText: text,
  });
}

/** Clear the hands of every walnut board, so F stages the intended one. */
async function dropEverything(page: any) {
  for (let i = 0; i < 12; i++) {
    const drop = handSlot(page, /Walnut/);
    if ((await drop.count()) === 0) return;
    await drop.first().click({ modifiers: ["Shift"] });
    await page.waitForTimeout(30);
  }
}

/**
 * Set down every carried board except the slots matching `keep`. F stages
 * the first thing in hand the machine will take, so a step that means a
 * particular board has to be holding only that board.
 */
async function dropAllExcept(page: any, keep: RegExp) {
  for (let i = 0; i < 12; i++) {
    const slots = handSlot(page, /Walnut/);
    const count = await slots.count();
    let dropped = false;
    for (let r = 0; r < count; r++) {
      const slot = slots.nth(r);
      if (keep.test((await slot.textContent()) ?? "")) continue;
      await slot.click({ modifiers: ["Shift"] });
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

/** Anything anywhere in the world, as plain data — for the miter saw's ends. */
const anyMaterialMatches = (pred: string) => {
  const state = (window as any).__GET_GAME_STATE__();
  const all = [
    ...state.player.inventory,
    ...state.machines.flatMap((m: any) => [
      ...m.inputMaterials,
      ...m.processingMaterials,
      ...m.outputMaterials,
    ]),
  ];
  // eslint-disable-next-line no-new-func
  return all.some(new Function("m", `return ${pred}`) as any);
};

test.describe("Milling", () => {
  test("switches on, dials in, and lets the stock decide the cut", async ({
    page,
  }) => {
    test.setTimeout(420000);
    await page.goto("/");
    await startNewGame(page);
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await test.step("load the milling-shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(() => fixtures["milling-shop"]);
      });
      await page.waitForTimeout(30);
    });

    await test.step("rough stock announces itself on the hands strip", async () => {
      await expect(
        handSlot(page, "Walnut 4/4 — 6\" × 8'")
          .filter({ hasText: "rough sawn" })
          .first(),
      ).toBeVisible();
    });

    await test.step("Orange Box: only ready-to-use lumber on its racks", async () => {
      const returnTo = await goToStore(page);
      // The channels are floor piles now, not labeled racks — a
      // channel's name finds its front pile, and a channel this store
      // doesn't carry finds nothing.
      await page.waitForFunction(() => (window as any).__FIND_SHELF__);
      const stocks = (name: string) =>
        page.evaluate(
          (channel: string) => (window as any).__FIND_SHELF__(channel) != null,
          name,
        );
      expect(await stocks("Construction Lumber")).toBe(true);
      expect(await stocks("S4S Hardwood Rack")).toBe(true);
      // Anything milled short of S4S moved across town to the lumberyard
      expect(await stocks("S2S Rack")).toBe(false);
      expect(await stocks("Rough Rack")).toBe(false);
      await leaveStore(page, returnTo);
    });

    await test.step("lumberyard: both channels open at 48 reputation", async () => {
      const returnTo = await goToLumberyard(page);
      await expect(
        page.getByRole("img", { name: "Sawyer & Sons" }),
      ).toBeVisible();
      await expect(page.getByText("S2S Rack")).toBeVisible();
      await expect(page.getByText("Rough Rack")).toBeVisible();
      // Rough walnut sells at the deepest discount in town. Every
      // species hangs in the rack at once — boards carry no species text,
      // so the board button's accessible name is its identity.
      const roughRack = page
        .locator("div")
        .filter({ has: page.getByText("Rough Rack", { exact: true }) })
        .filter({ has: page.locator("li") })
        .last();
      // Dims tags hang under each standing board: size, then length
      await expect(roughRack.getByText(/4\/4×6"\s*8'/).first()).toBeVisible();
      const roughWalnut = shelfTag(page, `Walnut 4/4 — 6" × 8' (rough sawn)`, {
        within: roughRack,
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
      // Step up to the jointer's operation cell, boards in hand. With two
      // rough boards carried the machine would grab the first — park the
      // spare on the floor so the jointer reads one board.
      await movePlayerTo(page, [2, 10]);
      await handSlot(page, "Walnut 4/4").first().click();
      await page.waitForTimeout(30);
      // The machine wears its state and its keys — there is no panel
      await expect(page.getByText("Jointer · off")).toBeVisible();
      // A benchtop machine on the shop floor says why its cuts are slow
      await expect(
        page.getByText(/On the floor: work here takes twice as long/),
      ).toBeVisible();
      // Switched off it takes nothing: no chip offering to place the board
      await expect(page.getByTestId("machine-chips")).not.toContainText(
        "place",
      );
      await switchOn(page);
      await expect(page.getByText("Jointer · on")).toBeVisible();
      // On, it offers to take the board out of our hands — the hands
      // strip has already named it, so the chip is just the verb
      await expect(page.getByTestId("machine-chips")).toContainText("place");
    });

    await test.step("jointer: the stock decides — face pass, then edge pass", async () => {
      // No mode was ever picked: a rough board can only take a face pass.
      // Set it on the beds, then hold the key to push it over the knives.
      await setStockDown(page);
      await runUntilBoard(page, "b.jointedFaces === 1");
      // Finished stock lands at the outfeed side — collect it there
      // (Shift+E takes everything within reach)
      await movePlayerTo(page, [2, 6]);
      await takeAllHere(page);
      // One flat face and the label says so
      await expect(
        handSlot(page, "Walnut 4/4 — 6\" × 8'")
          .filter({ hasText: "rough, face jointed" })
          .first(),
      ).toBeVisible();
      // Back around to the infeed; feeding the same board again is now an
      // edge pass — the flat face rides the fence
      await movePlayerTo(page, [2, 10]);
      await setStockDown(page);
      await runUntilBoard(page, "b.jointedFaces === 1 && b.jointedEdges === 1");
      await movePlayerTo(page, [2, 6]);
      await takeAllHere(page);
    });

    await test.step("table saw: an edge-jointed board rips against the fence", async () => {
      await movePlayerTo(page, [8, 10]);
      // E flips the switch on the machine the player is standing at
      await switchOn(page);
      await expect(page.getByText("Jobsite Table Saw · on")).toBeVisible();
      await setStockDown(page);
      // The kept piece has both edges straight; the offcut keeps one
      await runUntilBoard(page, "b.width === 4 && b.jointedEdges === 2");
      await movePlayerTo(page, [8, 6]);
      await takeAllHere(page);
    });

    await test.step("planer: set it down and the rollers take it", async () => {
      await movePlayerTo(page, [4, 10]);
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
      await movePlayerTo(page, [4, 6]);
      await takeAllHere(page);
      // The hands strip names the finished state
      await expect(
        handSlot(page, "Walnut 4/4 — 4\" × 8'")
          .filter({ hasText: "smooth, S4S" })
          .first(),
      ).toBeVisible();
    });

    await test.step("planer: a full-depth pass takes exactly one detent off", async () => {
      await movePlayerTo(page, [4, 10]);
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
      await movePlayerTo(page, [4, 6]);
      await takeAllHere(page);
      await expect(
        handSlot(page, "Walnut 3/4 — 2\" × 8'")
          .filter({ hasText: "smooth, S3S" })
          .first(),
      ).toBeVisible();
    });

    await test.step("straight-line sled: a rough board rides the sled, not the fence", async () => {
      // Empty the hands so the saw gets the board this step is about
      await dropEverything(page);
      // Fetch the spare rough board parked by the jointer at the start
      await movePlayerTo(page, [2, 10]);
      await pressKey(page, "e");
      await movePlayerTo(page, [8, 10]);
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

    await test.step("mitered stock announces its ends on the hands strip", async () => {
      await expect(
        handSlot(page, "Walnut 1/4 — 1\" × 2'")
          .filter({ hasText: "45° both ends" })
          .first(),
      ).toBeVisible();
    });

    await test.step("the saw wears its two settings and has no panel", async () => {
      // Both settings hang on the machine, each naming the keys that move
      // it: the cut line slides on Z/X, the head swings on R
      await expect(page.getByText(/cut line:/)).toBeVisible();
      await expect(page.getByText(/angle:/)).toBeVisible();
      // The saw's sheet is nothing but an accessory rack now — no scales, no
      // verb button, no mode picker. Everything to run it is a key.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("Tab");
      const sheet = page.getByTestId("station-sheet");
      await sheet.waitFor({ state: "visible" });
      await expect(sheet.getByText(/Accessories ·/)).toBeVisible();
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

    await test.step("the cut line steps an inch, or a foot with shift", async () => {
      // Board on the table first: the keys slide what's on the saw, and
      // the marks they stop at are the ones that board can reach.
      await setStockDown(page);
      await setCutLine(page, 24);
      await pressKey(page, "x");
      expect(Number(await sawSetting(page, "cutPosition"))).toBe(25);
      await pressKey(page, "z");
      expect(Number(await sawSetting(page, "cutPosition"))).toBe(24);
      await pressKey(page, "Shift+x");
      expect(Number(await sawSetting(page, "cutPosition"))).toBe(36);
      await pressKey(page, "Shift+z");
      expect(Number(await sawSetting(page, "cutPosition"))).toBe(24);
    });

    await test.step("first cut: 45° at the 5' mark makes a 5' and a 3' piece", async () => {
      // The board is already on the table from the step above — the
      // settings move what's on the saw, not a ghost of what's in hand
      await setAngle(page, 45);
      await setCutLine(page, 60);
      await runWhileHolding(
        page,
        anyMaterialMatches,
        "m.type === 'board' && m.length === 60 && m.ends && m.ends.right.kind === 'mitered' && m.ends.left.kind === 'square'",
      );
      // Cut pieces stay on the saw table until collected. Park the
      // carried rail first so the armful is exactly the two cut pieces.
      await dropEverything(page);
      await takeAllHere(page);
      await expect(
        handSlot(page, "Walnut 1/4 — 1\" × 5'")
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
      await setCutLine(page, 36);
      await runWhileHolding(
        page,
        anyMaterialMatches,
        "m.type === 'board' && m.length === 24 && m.ends && m.ends.left.kind === 'mitered' && m.ends.right.kind === 'mitered'",
      );
      await takeAllHere(page);
    });

    await test.step("four rails and four nails become a walnut picture frame", async () => {
      // The bench is the other half of a milling job: the saw makes the
      // rails, a plan on the workbench assembles them. Four rails and two
      // hands means ferrying: stage what's carried, then fetch the rest
      // an armful at a time — the rail parked at the saw, then the pair
      // piled mid-floor.
      await dropAllExcept(page, /1" × 2'/);
      await movePlayerTo(page, [7, 4]);
      await selectMode(page, "Makeshift Workbench", "Build Picture Frame");
      // Pulling the drawing leaned the player over the bench; staging is
      // a floor verb, so stand back up for it
      await closeStationSurface(page);
      // F is plan-aware: with Build Picture Frame selected the bench only
      // takes the mitered rails out of what's carried.
      await setStockDown(page);
      await movePlayerTo(page, [2, 4]);
      // The rail parked before the first cut lies under the two offcuts
      // dropped since (E takes the top of the pile), so take the whole
      // armful — the plan-aware bench keeps only the rail.
      await takeAllHere(page);
      await movePlayerTo(page, [7, 4]);
      await setStockDown(page);
      await movePlayerTo(page, [5, 4]);
      await takeAllHere(page); // the fixture's floor pair, one armful
      await movePlayerTo(page, [7, 4]);
      await setStockDown(page);
      await setStockDown(page);
      // Assembly is bench-view hand work now; commit through the same
      // actions the mini-game dispatches (snap the rails, drive the
      // brads) — this spec's business is the milling chain, not the feel.
      await page.evaluate(() => {
        const i = (window as any)
          .__GET_GAME_STATE__()
          .machines.findIndex((m: any) => m.machineTypeId === "workspace");
        (window as any).__START_OPERATION__(i);
        (window as any).__FINISH_ATTENDED_WORK__(i);
      });
      await page.waitForFunction(() => {
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
      // The bench has no Take All button — finished work lies on the
      // bench top, and the interact key sweeps it into the arms.
      await takeAllHere(page);
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
      // Resting on edge, the fence reads in quarters — it's a thickness
      await expect(page.getByText("stock:")).toBeVisible();
      await expect(page.getByText("on edge", { exact: false })).toBeVisible();
      await expect(page.getByText("fence:")).toBeVisible();
      await expect(
        page.getByText("4/4", { exact: false }).first(),
      ).toBeVisible();
    });

    await test.step("R lays the stock flat and the fence reads in inches", async () => {
      await pressKey(page, "r");
      await expect(page.getByText("flat", { exact: false })).toBeVisible();
      // The rip's fence, in inches — the resaw's quarters chip is gone
      await expect(page.getByText("4/4", { exact: false })).toHaveCount(0);
      await expect(
        page.getByText('4"', { exact: false }).first(),
      ).toBeVisible();
      // Turn it back up for the resaw that follows
      await pressKey(page, "r");
      await expect(page.getByText("on edge", { exact: false })).toBeVisible();
    });

    await test.step("one 8/4 blank comes off as two 4/4 boards", async () => {
      await setStockDown(page);
      await runUntilOutput(
        page,
        "(m) => m.type === 'board' && m.thickness === 4",
      );
      // Both halves stay on the saw table — park the spare blank so the
      // armful is exactly the pair
      await dropEverything(page);
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

    await test.step("R stands the table saw's work on edge, no jig in the rack", async () => {
      await movePlayerTo(page, [8, 9]);
      await switchOn(page);
      await expect(page.getByText("Jobsite Table Saw · on")).toBeVisible();
      // The saw rests flat: its live setting is the rip fence, in inches
      await expect(page.getByText("target width:")).toBeVisible();
      // Nothing is bolted to it — resawing comes off the saw itself
      const mounted = await page.evaluate(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.find((m: any) => m.machineTypeId === "jobsiteTableSaw")
            .tools,
      );
      expect(mounted).toEqual([]);

      // Turn the stock up: the rip's setting steps aside and the fence
      // that's live reads in quarters
      await pressKey(page, "r");
      await expect(page.getByText("target width:")).toHaveCount(0);
      await expect(page.getByText("fence:")).toBeVisible();
      await expect(page.getByText("on edge", { exact: false })).toBeVisible();
    });

    await test.step("the table saw pays a kerf the band saw didn't", async () => {
      // Park the band saw's halves and fetch the untouched blank left by
      // the band saw — capped hands mean the swap takes a walk
      await dropEverything(page);
      await movePlayerTo(page, [2, 9]);
      await pressKey(page, "e");
      await movePlayerTo(page, [8, 9]);
      await setStockDown(page);
      await runUntilOutput(
        page,
        "(m) => m.type === 'board' && m.thickness === 3",
      );
      // Feed-through machine: the pieces are waiting at the outfeed
      await movePlayerTo(page, [8, 5]);
      await takeAllHere(page);
      const thicknesses = (await boardsInHand(page))
        .map((b: any) => b.thickness)
        .sort();
      // Where the band saw split its blank clean in two, this saw kept a
      // 4/4 and left only a 3/4 offcut — the missing quarter inch is the
      // kerf, gone as dust
      expect(thicknesses).toEqual([3, 4]);
    });

    await test.step("a sheet on the table reads the fence in inches", async () => {
      await dropEverything(page);
      // Hand the shop a 2×2 panel — the cut chain itself is covered in
      // sheet-breakdown-chain.test.ts; what's browser-shaped is that the
      // saw swaps scales for what's on it.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: {
            ...state.player,
            inventory: [
              {
                id: "spec-sheet",
                type: "plywood",
                kind: "plywoodB",
                length: 24,
                width: 24,
                thickness: 2,
              },
            ],
          },
          // The fence dialed in at 20" — stepping a sheet-scale setting
          // there one detent at a time is the settings scale's own test
          machines: state.machines.map((m: any) =>
            m.machineTypeId === "jobsiteTableSaw"
              ? {
                  ...m,
                  selectedParameters: {
                    ...(m.selectedParameters ?? {}),
                    sheetRipWidth: 20,
                  },
                }
              : m,
          ),
        }));
      });
      await movePlayerTo(page, [8, 9]);
      // The resaw left the saw standing its work on edge; a sheet lies
      // flat, so R turns the table back over first
      await pressKey(page, "r");
      await setStockDown(page);
      // The fence scale is the sheet's now — inches, not quarters
      await expect(page.getByText("fence:")).toBeVisible();
      await runUntilOutput(
        page,
        "(m) => m.type === 'plywood' && m.width !== 24",
      );
      await movePlayerTo(page, [8, 5]);
      await takeAllHere(page);
      const pieces = await page.evaluate(() =>
        (window as any)
          .__GET_GAME_STATE__()
          .player.inventory.filter((m: any) => m.type === "plywood")
          .map((m: any) => [m.length, m.width]),
      );
      // One cut, two pieces: the sheet keeps its offcut
      expect(pieces.length).toBe(2);
    });
  });
});
