import { test, expect } from "@playwright/test";
import { takeAllHere } from "./machine-panel";
import {
  goToLumberyard,
  goToStore,
  leaveStore,
  pumpTicks,
} from "./navigation";

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** Teleport the player so we don't depend on movement UI for machine hops. */
async function movePlayerTo(page: any, position: [number, number]) {
  await page.evaluate((pos: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: pos },
    }));
  }, position);
  await page.waitForTimeout(30);
}

function machineCard(page: any, name: string) {
  return page.locator("section", { hasText: name });
}

async function pressKey(page: any, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press(key);
  await page.waitForTimeout(30);
}

/** E — at a switched-off machine the interact key flips the switch. */
const switchOn = (page: any) => pressKey(page, "e");

/** F — set the carried stock down on the machine you're standing at. */
const setStockDown = (page: any) => pressKey(page, "f");

/** Z/X — step the machine's linear setting down or up. */
async function stepSetting(page: any, direction: "z" | "x", times = 1) {
  for (let i = 0; i < times; i++) await pressKey(page, direction);
}

/**
 * Put every carried board on the floor. F stages the first thing in hand
 * the machine will take, so a spec that means a particular board has to be
 * holding only that board.
 */
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

/** Hold the operate key until some board satisfies the predicate. */
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

/** The machine's current setting, read off game state. */
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

/**
 * Wait until some board in the game state satisfies the predicate, driving
 * the clock forward between checks rather than watching it run (pumpTicks).
 */
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

test.describe("Milling chain (rough lumber to S4S)", () => {
  test("shops the channels, joints, rips, planes, and straight-lines", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(() => fixtures["milling-shop"]);
    });
    await page.waitForTimeout(30);

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
      expect(await settingOf(page, "lunchboxPlaner", "targetThickness")).toBe(2);
      await expect(
        page.getByText(
          "Won't fit under the cutter head — raise the cut height to 3/4 for the first pass.",
        ),
      ).toBeVisible();
      // Back up to a skim pass at the stock's own thickness; the note clears
      await stepSetting(page, "x", 2);
      expect(await settingOf(page, "lunchboxPlaner", "targetThickness")).toBe(4);
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
      expect(await settingOf(page, "lunchboxPlaner", "targetThickness")).toBe(3);
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
  });
});
