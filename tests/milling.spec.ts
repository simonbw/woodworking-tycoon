import { test, expect } from "@playwright/test";
import { selectMode, setParameter } from "./machine-panel";

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
  await page.waitForTimeout(300);
}

function machineCard(page: any, name: string) {
  return page.locator("section", { hasText: name });
}

/** Wait until some board in the game state satisfies the predicate. */
async function waitForBoard(
  page: any,
  predicate: string,
  timeout: number = 20000,
) {
  await page.waitForFunction(
    (pred: string) => {
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
    },
    predicate,
    { timeout },
  );
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
    await page.waitForTimeout(300);

    await test.step("rough stock announces itself in the inventory", async () => {
      await expect(
        page.getByText("Walnut Board (8'x6\"x4/4, rough sawn)").first(),
      ).toBeVisible();
    });

    await test.step("store: all four channels open at 22 reputation", async () => {
      await page.getByText("Store", { exact: true }).click();
      await page.waitForTimeout(300);
      await expect(page.getByText("Construction Lumber")).toBeVisible();
      await expect(page.getByText("S4S Hardwood Rack")).toBeVisible();
      await expect(page.getByText("Lumberyard — S2S")).toBeVisible();
      await expect(page.getByText("Rough Rack")).toBeVisible();
      // Rough walnut sells at the deepest discount of the aisle. The rough
      // rack's species select is the last one in the lumber aisle.
      const lumberAisle = page
        .locator("section")
        .filter({ has: page.getByText("Rough Rack", { exact: true }) })
        .last();
      await lumberAisle.locator("select").last().selectOption("walnut");
      await page.waitForTimeout(200);
      await expect(
        page.getByText("Walnut Board (8'x6\"x4/4, rough sawn)").first(),
      ).toBeVisible();
      await expect(page.getByText("$158.40")).toBeVisible();
      await page.getByText("Home", { exact: true }).click();
      await page.waitForTimeout(300);
    });

    await test.step("power switch: no cut until the jointer is switched on", async () => {
      // Player starts on the jointer's operation cell
      await page
        .locator("li", { hasText: "Walnut Board" })
        .getByRole("button", { name: "→ Jointer" })
        .click();
      await page.waitForTimeout(200);
      const jointerCard = machineCard(page, "Jointer");
      // Loaded and ready, but the switch hasn't been flipped
      await expect(jointerCard.getByText("Switched off")).toBeVisible();
      await expect(
        jointerCard.getByRole("button", { name: "Operate" }),
      ).toBeDisabled();
      await jointerCard.getByRole("button", { name: "Switch On" }).click();
      await expect(jointerCard.getByText("Idling")).toBeVisible();
      await expect(
        jointerCard.getByRole("button", { name: "Operate" }),
      ).toBeEnabled();
    });

    await test.step("jointer: flatten a face, then straighten an edge", async () => {
      await machineCard(page, "Jointer")
        .getByRole("button", { name: "Operate" })
        .click();
      await waitForBoard(page, "b.jointedFaces === 1");
      // Finished stock lands at the outfeed side — collect it there
      await movePlayerTo(page, [1, 0]);
      await machineCard(page, "Jointer")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      // One flat face and the label says so
      await expect(
        page
          .getByText("Walnut Board (8'x6\"x4/4, rough, face jointed)")
          .first(),
      ).toBeVisible();
      // Back around to the infeed to set up the next pass
      await movePlayerTo(page, [1, 2]);
      await selectMode(page, "Jointer", "Joint Edge");
      await page
        .locator("li", { hasText: "face jointed" })
        .getByRole("button", { name: "→ Jointer" })
        .click();
      await page.waitForTimeout(200);
      await machineCard(page, "Jointer")
        .getByRole("button", { name: "Operate" })
        .click();
      await waitForBoard(page, "b.jointedFaces === 1 && b.jointedEdges === 1");
      await movePlayerTo(page, [1, 0]);
      await machineCard(page, "Jointer")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
    });

    await test.step("table saw: rip to width before planing — order doesn't matter", async () => {
      await movePlayerTo(page, [1, 5]);
      await page
        .locator("li", {
          hasText: "Walnut Board (8'x6\"x4/4, rough, face jointed)",
        })
        .getByRole("button", { name: "→ Jobsite Table Saw" })
        .click();
      await page.waitForTimeout(200);
      // P flips the switch on the machine the player is standing at
      await page.keyboard.press("p");
      await expect(
        machineCard(page, "Jobsite Table Saw").getByText("Idling"),
      ).toBeVisible();
      await machineCard(page, "Jobsite Table Saw")
        .getByRole("button", { name: "Operate" })
        .click();
      // The kept piece has both edges straight; the offcut keeps one
      await waitForBoard(page, "b.width === 4 && b.jointedEdges === 2");
      await movePlayerTo(page, [1, 3]);
      await machineCard(page, "Jobsite Table Saw")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
    });

    await test.step("planer: no load step — stock feeds straight from the hands", async () => {
      await movePlayerTo(page, [3, 2]);
      const planerCard = machineCard(page, "Planer");
      // No input bay: the inventory offers no load button for the planer
      await expect(
        page.getByRole("button", { name: "→ Planer" }),
      ).toHaveCount(0);
      // Switched off, nothing feeds
      await expect(
        planerCard.getByRole("button", { name: "Feed" }),
      ).toBeDisabled();
      await planerCard.getByRole("button", { name: "Switch On" }).click();
      await expect(planerCard.getByText("Idling")).toBeVisible();
      // Two detents under the carried 4/4 stock: it won't fit under the head
      await setParameter(page, "Planer", "Cut Height", "2/4");
      await expect(
        planerCard.getByRole("button", { name: "Feed" }),
      ).toBeDisabled();
      // Back to a skim pass at the stock's own thickness
      await setParameter(page, "Planer", "Cut Height", "4/4");
      await planerCard.getByRole("button", { name: "Feed" }).click();
      await waitForBoard(
        page,
        "b.jointedFaces === 2 && b.jointedEdges === 2 && b.thickness === 4 && b.surface === 'smooth'",
      );
      await movePlayerTo(page, [3, 0]);
      await machineCard(page, "Planer")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      // The inventory names the finished state
      await expect(
        page.getByText("Walnut Board (8'x4\"x4/4, smooth, S4S)").first(),
      ).toBeVisible();
    });

    await test.step("planer: a full-depth pass takes exactly one detent off", async () => {
      await movePlayerTo(page, [3, 2]);
      // One detent under the 4/4 stock: a full bite. The first carried
      // piece this setting can take is the 2"-wide rip offcut.
      await setParameter(page, "Planer", "Cut Height", "3/4");
      await machineCard(page, "Planer")
        .getByRole("button", { name: "Feed" })
        .click();
      await waitForBoard(
        page,
        "b.width === 2 && b.thickness === 3 && b.surface === 'smooth'",
      );
      await movePlayerTo(page, [3, 0]);
      await machineCard(page, "Planer")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      await expect(
        page.getByText("Walnut Board (8'x2\"x3/4, smooth, S3S)").first(),
      ).toBeVisible();
    });

    await test.step("straight-line sled: no prerequisites, edges from nothing", async () => {
      await movePlayerTo(page, [1, 5]);
      // The sled's operation joined the table saw's mode list
      await selectMode(page, "Jobsite Table Saw", "Straight-Line Rip");
      await page
        .locator("li", { hasText: "Walnut Board (8'x6\"x4/4, rough sawn)" })
        .getByRole("button", { name: "→ Jobsite Table Saw" })
        .click();
      await page.waitForTimeout(200);
      await machineCard(page, "Jobsite Table Saw")
        .getByRole("button", { name: "Operate" })
        .click();
      await waitForBoard(
        page,
        "b.jointedFaces === 0 && b.jointedEdges === 1 && b.width === 6",
      );
    });
  });
});
