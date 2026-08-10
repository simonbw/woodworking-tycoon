import { test, expect } from "@playwright/test";
import { machineCard, takeAllHere } from "./machine-panel";
import {
  checkOutAndLeaveStore,
  dismissClientCard,
  goToStore,
  deliverFromTruck,
  loadTruckBed,
  movePlayerToCab,
  openTruckMenu,
  pressTruckRow,
  startNewGame,
} from "./navigation";

/**
 * The shop floor itself.
 *
 * Everything here is a thing you do *in* the garage (or on its lot) rather
 * than in an overlay: the app comes up and the canvas mounts, a bought crate
 * is lifted out of the truck's bed, carried, rotated, set down and picked up
 * again, and finished work leaves loaded in the truck with a client card and
 * the rewards flying to their readouts.
 *
 * Carrying and handing over are floor verbs with no button anywhere — the
 * handoff half asserts that outright — so this is the one place they can be
 * checked at all.
 */

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
  await page.waitForTimeout(30);
}

const carried = async (page: any) =>
  (await page.evaluate(() => (window as any).__GET_GAME_STATE__().player))
    .carriedMachine ?? null;

/**
 * Where a world marker actually is once the world has stopped moving.
 *
 * The camera eases toward the player rather than cutting, so the box read
 * straight after a teleport names a point the shop is still sliding out
 * from under: aim at it and the cursor lands on whatever drifts into that
 * spot instead. Read the box until two reads agree — that's the camera
 * settled — and aim at the answer.
 */
async function settledBox(locator: any) {
  let previous: { x: number; y: number; width: number; height: number } | null =
    null;
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const still =
        box !== null &&
        previous !== null &&
        Math.abs(box.x - previous.x) < 0.5 &&
        Math.abs(box.y - previous.y) < 0.5;
      previous = box;
      return still;
    })
    .toBe(true);
  return previous!;
}

/**
 * Right-click a world marker until the thing it should open is open. The
 * press itself is a hit test against the canvas, so a click thrown while
 * the camera still moves finds nothing at all and there is no press to
 * retry — hence aiming afresh each time.
 */
async function rightClickUntilVisible(page: any, locator: any, target: any) {
  await expect
    .poll(async () => {
      const box = await settledBox(locator);
      await page.mouse.click(box.x, box.y, { button: "right" });
      return target.isVisible();
    })
    .toBe(true);
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

test.describe("Shop floor", () => {
  test("boots, carries machines, and delivers work with the truck", async ({
    page,
  }) => {
    test.setTimeout(300000);
    const startTime = Date.now();

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await test.step("navigate to app and wait for start menu", async () => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("main");
    });

    await test.step("type is in hand before the first frame", async () => {
      // Boot waits on loadFonts(), so nothing renders in a fallback face and
      // then reflows. Every family is served from our own origin, so all of
      // them can be checked here without dragging a font CDN into CI — and
      // a face that quietly stopped being served would fail right here.
      const loaded = await page.evaluate(() =>
        [
          "Lumberjack",
          "Barlow Condensed",
          "Andada Pro",
          "Shantell Notes",
          "Stardos Stencil",
        ].filter((family) => !document.fonts.check(`1rem "${family}"`)),
      );
      expect(loaded).toEqual([]);
    });

    await test.step("an incompatible save disables Continue and says why", async () => {
      await page.evaluate(() => {
        localStorage.setItem(
          "woodworking-tycoon-save",
          JSON.stringify({ version: 0, gameState: {} }),
        );
      });
      await page.reload();
      const continueButton = page.getByRole("button", { name: "Continue" });
      await expect(continueButton).toBeVisible();
      await expect(continueButton).toBeDisabled();
      await expect(page.getByTestId("incompatible-save-note")).toBeVisible();
    });

    await test.step("start menu shows and we can start a new game", async () => {
      await expect(
        page.getByRole("heading", { name: "Woodworking Tycoon" }),
      ).toBeVisible();
      // The incompatible save from the previous step skips the "Clear the
      // shop?" card — there is nothing loadable to keep.
      await startNewGame(page);
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
    });

    await test.step("the shop manual greets a new game and closes for good", async () => {
      const manual = page.getByRole("dialog", { name: "Shop manual" });
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Welcome to the Shop" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
    });

    await test.step("the guided opening puts up its first instruction", async () => {
      // The step itself is proven in the sequence tier (sequences/
      // tutorial.test.ts walks all eleven); what the browser is for is that
      // the card is mounted, reads off game state, and can be retired.
      const card = page.getByTestId("tutorial-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Take the truck out for a pallet");
      await card.getByTestId("tutorial-skip").click();
      await expect(card).toHaveCount(0);
    });

    await test.step("page loads under 30 seconds", async () => {
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(30000);
    });

    await test.step("no console errors during load", async () => {
      expect(consoleErrors).toEqual([]);
    });

    await test.step("page title is correct", async () => {
      await expect(page).toHaveTitle(/Woodworking Tycoon/);
    });

    await test.step("main layout is visible", async () => {
      const main = page.locator("main");
      await expect(main).toBeVisible();
    });

    await test.step("PIXI canvas (shop view) is visible", async () => {
      const canvas = page.locator("canvas");
      await expect(canvas).toBeVisible();
    });

    await test.step("money section displays with correct format", async () => {
      // The balance is the gold number in the top bar (its "BALANCE" label
      // was removed as redundant).
      const money = page.getByTestId("balance");
      await expect(money).toBeVisible();
      await expect(money).toHaveText(/^\$\d+\.\d{2}$/);
    });

    await test.step("the top bar tells the day by its light, not a clock", async () => {
      // Deliberately no wall clock — the dial shows where the sun stands,
      // and a fresh save opens in the morning of day one.
      const dial = page.getByTestId("day-dial");
      await expect(dial).toHaveAttribute("data-day-phase", "morning");
      await expect(page.getByTestId("day-date")).toHaveText(/JUN\s*9/);
      // Sunrise: the daylight arc has nothing filled in yet.
      await expect(page.getByTestId("day-dial-arc")).toHaveAttribute(
        "stroke-dashoffset",
        "100",
      );
      // No hour anywhere in the chip.
      await expect(page.locator("nav")).not.toContainText(/\d\d?:\d\d/);
    });

    await test.step("day job button is not present", async () => {
      const dayJobButton = page.getByRole("button", { name: /day job/i });
      await expect(dayJobButton).not.toBeVisible();
      await expect(page.locator("text=Work Day Job")).not.toBeVisible();
    });

    await test.step("load the crate shop for the carrying half", async () => {
      await loadFixture(page, "miter-saw-crate-shop");
    });

    await test.step("no layout tab — no tabs at all, just the readout chip", async () => {
      await expect(page.getByTestId("day-dial")).toBeVisible();
      await expect(page.getByText("Shop Layout")).toHaveCount(0);
    });

    await test.step("unpack the delivered crate underfoot", async () => {
      await teleportPlayer(page, [6, 8]);
      await expect(page.getByText("Unpack Miter Saw")).toBeVisible();
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.machineCrates).toHaveLength(0);
      expect(state.player.carriedMachine.machineTypeId).toBe("miterSaw");
      await expect(page.getByTestId("player-hints")).toContainText("put down");
      await expect(page.getByTestId("player-hints")).toContainText("rotate");
    });

    await test.step("rotate the carried machine", async () => {
      await page.keyboard.press("r");
      await page.waitForTimeout(30);
      expect((await carried(page)).rotation).toBe(1);
      // Three more quarter turns come back around
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("r");
      }
      await page.waitForTimeout(30);
      expect((await carried(page)).rotation).toBe(0);
    });

    await test.step("set it down standing at its operator cell", async () => {
      await teleportPlayer(page, [6, 8]);
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.player.carriedMachine).toBeNull();
      const saw = state.machines.find(
        (m: any) => m.machineTypeId === "miterSaw",
      );
      // Anchored two cells in front: the player's cell is the operator cell
      expect(saw.position).toEqual([6, 6]);
    });

    await test.step("lift the placed machine back up from the same spot", async () => {
      // The chip is headed by the machine's name, so the key row is
      // just the verb
      await expect(page.getByTestId("machine-chips")).toContainText("carry");
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect((await carried(page)).machineTypeId).toBe("miterSaw");
      // And set it back down for the next steps
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect(await carried(page)).toBeNull();
    });

    await test.step("a loaded machine refuses to be lifted", async () => {
      await loadFixture(page, "layout-with-placed-machines");
      // The fixture's miter saw at [6,3] holds a board; stand at its
      // operator cell and try
      await teleportPlayer(page, [6, 5]);
      await expect(page.getByTestId("machine-chips")).not.toContainText("carry");
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect(await carried(page)).toBeNull();
    });

    await test.step("carry a worktable to a new spot", async () => {
      // The fixture's small worktable at [9,2] operates from [9,4]
      await teleportPlayer(page, [9, 4]);
      const machineHint = page.getByTestId("machine-chips");
      await expect(machineHint.first()).toContainText(/use/i);
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect((await carried(page)).machineTypeId).toBe("worktable1x1");
      // Hands full: the machine's hint chips are suppressed
      await expect(machineHint).toHaveCount(0);

      await teleportPlayer(page, [5, 10]);
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.player.carriedMachine).toBeNull();
      const table = state.machines.find(
        (m: any) => m.machineTypeId === "worktable1x1",
      );
      expect(table.position).toEqual([5, 8]);
      // Standing at the freshly placed table's operator cell brings it back
      await expect(page.getByTestId("machine-chips").first()).toContainText(
        /use/i,
      );
    });

    await test.step("buying a machine crates it into the truck's bed", async () => {
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          money: 500,
          progression: { ...state.progression, storeUnlocked: true },
        }));
      });
      await goToStore(page);
      // force: the store keeps ticking now (a trip costs time), so the
      // stability check can starve on slow machines
      await page
        .locator("li", { hasText: "Jobsite Table Saw" })
        .getByRole("button", { name: "Add Jobsite Table Saw to cart" })
        .click({ force: true });
      await page.waitForTimeout(30);
      // A shelf tag is not a receipt: the saw is in the cart and the bed
      // is still empty until the register
      const shopping = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(shopping.truck.crates).toHaveLength(0);
      expect(shopping.money).toBe(500);
      await expect(page.getByTestId("store-cart-total")).toContainText("1 item");

      // One press pays for the cart and drives home
      await checkOutAndLeaveStore(page);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.truck.crates).toHaveLength(1);
      expect(state.truck.crates[0].machineTypeId).toBe("jobsiteTableSaw");
      expect(state.money).toBeLessThan(500);
      // Nothing lands on the shop floor until it's carried in
      expect(state.machineCrates).toHaveLength(0);
    });

    await test.step("the crate lifts out of the bed at the tailgate", async () => {
      // Stand in the tailgate aisle, one step out the garage door
      await teleportPlayer(page, [6, 17]);
      // The cargo box names itself, and its verbs name the thing they move
      await expect(page.getByText("Truck Bed")).toBeVisible();
      await expect(page.getByText("Unpack Jobsite Table Saw")).toBeVisible();
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect((await carried(page)).machineTypeId).toBe("jobsiteTableSaw");
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.truck.crates).toHaveLength(0);
      // The lot is walkable, not usable: no setting a machine down out here
      await expect(page.getByText("no room here")).toBeVisible();
      // Carry it in and stand it on open floor
      await teleportPlayer(page, [2, 10]);
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect(await carried(page)).toBeNull();
    });

    await test.step("a dusty floor triggers the sweeping note", async () => {
      // Dust past the tutorial threshold flips sweepingUnlocked — the
      // one-time "sweep it up" note — on the next milestone tick.
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          dust: { "5,5": { walnut: 14 }, "5,6": { walnut: 14 }, "6,5": { walnut: 14 }, "6,6": { walnut: 14 }, "5,7": { walnut: 14 } },
        }));
      });
      await expect
        .poll(async () =>
          (await page.evaluate(() => window.__GET_GAME_STATE__())).progression
            .sweepingUnlocked,
        )
        .toBe(true);
    });

    await test.step("the pickup chip sits on the pile it would grab", async () => {
      // An 8' board resting at [10.5,9.5] lies across y 5.5..13.5 — the
      // player can stand at either end and E grabs the same piece. The
      // [E] pick up chip anchors to the pile itself, not the player, so
      // it must not move between the two stances. Column 10 keeps clear
      // of the fixture's machines (miter saw at [6,3] with stock waiting,
      // the worktable carried to [5,8]) whose take/unload verbs outrank a
      // floor pickup.
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          materialPiles: [
            ...state.materialPiles,
            {
              material: {
                id: "e2e-long-board",
                type: "board",
                species: "pine",
                length: 96,
                width: 4,
                thickness: 1,
                surface: "rough",
                jointedFaces: 1,
                jointedEdges: 2,
              },
              position: [10.5, 9.5],
              rotation: 0,
            },
          ],
        }));
      });
      await teleportPlayer(page, [10, 6]);
      // The chip names the piece it would grab
      const chip = page.getByTestId("pickup-chip").first();
      await expect(chip).toContainText(/Pine/i);
      // The camera may still be easing back indoors from the tailgate a
      // few steps ago — the overlay rides it, so wait for the chip to
      // hold still before treating its position as meaningful.
      await expect(async () => {
        const first = await chip.boundingBox();
        await page.waitForTimeout(150);
        const second = await chip.boundingBox();
        expect(second!.y).toBeCloseTo(first!.y, 1);
      }).toPass({ timeout: 5000 });
      const northStance = await chip.boundingBox();
      await teleportPlayer(page, [10, 12]);
      await expect(chip).toBeVisible();
      const southStance = await chip.boundingBox();
      expect(southStance!.x).toBeCloseTo(northStance!.x, 0);
      expect(southStance!.y).toBeCloseTo(northStance!.y, 0);
      // Clear the floor so the board doesn't shadow the broom steps below
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          materialPiles: state.materialPiles.filter(
            (pile: any) => pile.material.id !== "e2e-long-board",
          ),
        }));
      });
      await page.waitForTimeout(30);
    });

    await test.step("E takes the broom into the hands strip", async () => {
      await teleportPlayer(page, [1, 1]);
      await expect(
        page.getByText(/pick up broom/i).first(),
      ).toBeVisible();
      await page.keyboard.press("e");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.broomPosition).toBeNull();
      await expect(
        page.getByTestId("hands-strip").getByText("Broom"),
      ).toBeVisible();
    });

    await test.step("holding Space sweeps the dust into the dustpan", async () => {
      // Stand on the dust facing +y (direction 3) so the swath covers it
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: { ...state.player, position: [5, 5], direction: 3 },
        }));
      });
      await page.waitForTimeout(30);
      const dustTotal = async () => {
        const state = await page.evaluate(() => window.__GET_GAME_STATE__());
        return Object.values(state.dust as Record<string, any>).reduce(
          (sum: number, amounts: any) =>
            sum +
            (Object.values(amounts) as number[]).reduce((a, b) => a + b, 0),
          0,
        );
      };
      const before = await dustTotal();
      await page.keyboard.down("Space");
      await expect.poll(dustTotal).toBeLessThan(before * 0.5);
      await page.keyboard.up("Space");
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      const inThePan = (Object.values(state.dustpan) as number[]).reduce(
        (a, b) => a + b,
        0,
      );
      expect(inThePan).toBeGreaterThan(0);
      // The pan fill shows in the hands strip alongside the broom
      await expect(
        page.getByTestId("hands-strip").getByText(/\d+%/),
      ).toBeVisible();
    });

    await test.step("F leans the broom right here", async () => {
      await page.keyboard.press("f");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.broomPosition).toEqual([5, 5]);
      await expect(
        page.getByTestId("hands-strip").getByText("Broom"),
      ).toHaveCount(0);
    });

    await test.step("start a fresh game for the handoff half", async () => {
      // The door lists the *active* commission, so this half wants a shop that
      // hasn't completed any — a fixture would have to undo that.
      await page.goto("/");
      await startNewGame(page);
      await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
      // A fresh game re-opens the manual, and a modal swallows the door key.
      const manual = page.getByRole("dialog", { name: "Shop manual" });
      if (await manual.count()) {
        await page.keyboard.press("Escape");
        await manual.waitFor({ state: "detached" });
      }
      await page.waitForTimeout(500);
    });

    await test.step("the work order points at the truck, not a button", async () => {
      // The full order lives on the clipboard; C holds it up
      await page.keyboard.press("c");
      await expect(page.getByTestId("commission-delivery-note")).toContainText(
        "truck",
      );
      // The old "Mark Complete" button is gone for good
      await expect(
        page.getByRole("button", { name: "Mark Complete" }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Clipboard" }),
      ).toHaveCount(0);
    });

    await test.step("an empty-bed walk to the cab offers nothing", async () => {
      await movePlayerToCab(page);
      // Fresh game: no destinations unlocked and nothing in the bed
      await expect(page.getByTestId("truck-panel")).not.toBeVisible();
    });

    await test.step("the cab lists the commission once it's in the bed", async () => {
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: {
            ...state.player,
            inventory: [
              ...state.player.inventory,
              { id: "e2e-first-shelf", type: "rusticShelf", species: "pallet" },
            ],
          },
        }));
      });
      await page.waitForTimeout(30);
      // Load it over the rail with the real key, then walk to the cab
      await loadTruckBed(page);
      const loaded = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(
        loaded.truck.bed.some((m: any) => m.id === "e2e-first-shelf"),
      ).toBe(true);
      // Standing at the rail, the chip names the piece E would lift back
      // out rather than the furniture it's lying in
      await expect(page.getByText("take Rustic Shelf")).toBeVisible();
      await movePlayerToCab(page);
      await openTruckMenu(page);

      const panel = page.getByTestId("truck-panel");
      // Nowhere to go yet, so the card is nothing but the delivery
      await expect(panel).toContainText("Someone's waiting");
      await expect(panel).toContainText("Your First Shelf");
      // The client is named on the row — you know who you're meeting
      await expect(panel).toContainText("Marguerite");
      // Delivering is a drive, and the row says what the drive costs
      await expect(panel).toContainText("30 min there and back");
      // The row itself is the button — no separate "Deliver" control
      await expect(
        panel.getByRole("button", { name: /^Deliver:/ }),
      ).toBeVisible();
    });

    const before = await page.evaluate(() =>
      (window as any).__GET_GAME_STATE__(),
    );

    await test.step("delivering it shows the client's card", async () => {
      await deliverFromTruck(page, "Your First Shelf");

      const card = page.getByTestId("client-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Your First Shelf");
      await expect(card).toContainText("Marguerite");
      // The payout is itemized on the card: money, reputation, craft XP
      await expect(card).toContainText("$20.00");
      // One handoff deals one card, not a stack of them
      await expect(card).toHaveCount(1);
    });

    await test.step("the card holds the screen until the money is taken", async () => {
      // A click aimed at the floor behind it is not a dismissal — the card
      // waits for "Take the money" (or Escape)
      await page.mouse.click(40, 760);
      await page.waitForTimeout(100);
      await expect(page.getByTestId("client-card")).toBeVisible();
    });

    await test.step("the payout has already landed behind the card", async () => {
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.money).toBe(before.money + 20);
      expect(state.reputation).toBe(before.reputation + 2);
      expect(state.progression.commissionsCompleted).toBe(1);
      // The truck went somewhere: both legs charged their minutes, and
      // the player is back beside the cab rather than never having left
      expect(state.tick).toBeGreaterThanOrEqual(before.tick + 30);
      expect(state.player.away).toBe(null);
      expect(
        state.truck.bed.some((m: any) => m.id === "e2e-first-shelf"),
      ).toBe(false);
      // Completing the first commission unlocks the store and the phone —
      // the job board is how the next commission's gear gets funded
      expect(state.progression.storeUnlocked).toBe(true);
      expect(state.progression.marketplaceUnlocked).toBe(true);
    });

    await test.step("dismissing the card flies the rewards to their readouts", async () => {
      await dismissClientCard(page);
      // Chips are in the air, aimed at the balance / reputation / journal
      const chips = page.getByTestId("reward-flights").locator(".reward-chip");
      await expect(chips.first()).toBeVisible();

      // Every reward has somewhere on screen to land
      await expect(page.locator("[data-reward-target='money']")).toBeVisible();
      await expect(
        page.locator("[data-reward-target='reputation']"),
      ).toBeVisible();
      await expect(page.locator("[data-reward-target='xp']")).toBeVisible();

      // The flight clears itself up once the last chip lands
      await expect(chips).toHaveCount(0, { timeout: 8000 });
    });

    await test.step("the readouts show the new totals", async () => {
      await expect(page.getByTestId("balance")).toHaveText("$20.00");
      await expect(page.getByTestId("reputation")).toHaveText("2.0");
    });

    await test.step("between commissions the shop goes quiet, not busy", async () => {
      // The next commission is reputation-gated (the phone will ring for
      // it later) — so no clipboard holds itself up, no tracker chip, and
      // no call yet at 2 reputation against a gate of 6.
      await expect(
        page.getByRole("dialog", { name: "Clipboard" }),
      ).toHaveCount(0);
      await expect(page.getByTestId("commission-tracker")).toHaveCount(0);
      await expect(page.getByTestId("commission-call")).toHaveCount(0);
      // The clipboard still opens by hand, empty of orders
      await page.keyboard.press("c");
      const clipboard = page.getByRole("dialog", { name: "Clipboard" });
      await expect(clipboard).toContainText("No open work orders");
      await page.keyboard.press("Escape");
      await expect(clipboard).toHaveCount(0);
      // The phone the delivery unlocked is in the top bar now
      await expect(page.getByRole("button", { name: "Phone" })).toBeVisible();
      // ...and the cab is no longer offering the one just delivered
      await movePlayerToCab(page);
      await openTruckMenu(page);
      const panel = page.getByTestId("truck-panel");
      await expect(panel).toContainText("Places to go");
      await expect(
        panel.getByRole("button", { name: /^Deliver:/ }),
      ).toHaveCount(0);
      // The store trip it unlocked is there instead
      await expect(panel).toContainText("Orange Box");
    });

    await test.step("walking away from the cab folds the card for good", async () => {
      const panel = page.getByTestId("truck-panel");
      const cell = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().player.position,
      );
      // Walk down the lot past the truck's nose: the card belongs to the
      // cab, and out of reach of it there is no card
      await page.evaluate((position: number[]) => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: { ...state.player, position },
        }));
      }, [cell[0], cell[1] + 4]);
      await expect(panel).toHaveCount(0);
      // ...and coming back leaves it closed rather than spreading it
      // open again under the player
      await movePlayerToCab(page);
      await expect(panel).toHaveCount(0);
      await openTruckMenu(page);
      await expect(panel).toBeVisible();
    });

    await test.step("night closes the card down to Home, and sleeping brings the morning", async () => {
      // Spend the whole day in one jump: the shop is closed for the night
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          tick: state.dayStartTick + 600,
        }));
      });
      await expect(page.getByTestId("day-dial")).toHaveAttribute(
        "data-day-phase",
        "night",
      );

      // Nowhere left to go but home — the errands step off the card
      const panel = page.getByTestId("truck-panel");
      await expect(panel).toContainText("Home");
      await expect(panel).not.toContainText("Orange Box");
      await expect(panel).not.toContainText("Scavenge");

      const dayBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().day,
      );
      const dateBefore = await page.getByTestId("day-date").textContent();
      await pressTruckRow(page, "Home");
      // The overnight runs as one batch; morning is a new day with a
      // fresh budget, the player back beside the cab
      await page.waitForFunction(
        (before: number) =>
          (window as any).__GET_GAME_STATE__().day === before + 1 &&
          (window as any).__GET_GAME_STATE__().player.away === null,
        dayBefore,
      );
      await expect(page.getByTestId("day-dial")).toHaveAttribute(
        "data-day-phase",
        "morning",
      );
      // Sleeping is what turns the calendar over, so the dial's date moved.
      await expect(page.getByTestId("day-date")).not.toHaveText(dateBefore!);
    });

    await test.step("a refresh keeps the shop, without anyone saving it", async () => {
      // Nothing above ever quit to the menu or pressed save — the shop has
      // been autosaving as it ran. A reload is the real test of that.
      await page.reload();
      await page.waitForSelector("main");

      const continueButton = page.getByRole("button", { name: "Continue" });
      await expect(continueButton).toBeVisible();
      await continueButton.click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);

      // The handoff's earnings are still there, so is the phone it
      // unlocked — this is the same shop, not a fresh one.
      await expect(page.getByTestId("balance")).toHaveText("$20.00");
      await expect(page.getByTestId("reputation")).toHaveText("2.0");
      await expect(page.getByRole("button", { name: "Phone" })).toBeVisible();
    });

    await test.step("the cursor picks which piece the keys act on", async () => {
      // Two boards lying within reach on either side of the player.
      // Which one E takes is the rummage cursor's business (R steps it);
      // this checks the mouse can set it by pointing instead, and that
      // right-clicking spreads everything in reach out on a card.
      //
      // They lie apart rather than stacked on one spot: the cursor picks
      // the topmost sprite under it, so two pieces at the same point are
      // one target as far as pointing goes — that's what R is still for.
      await page.evaluate(() => {
        const pile = (id: string, species: string, y: number) => ({
          material: {
            id,
            type: "board",
            species,
            length: 12,
            width: 6,
            thickness: 1,
            surface: "rough",
            jointedFaces: 1,
            jointedEdges: 2,
          },
          position: [5.5, y],
          rotation: 0,
        });
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: { ...state.player, position: [5, 5], inventory: [] },
          materialPiles: [
            pile("test-oak", "oak", 4.7),
            pile("test-pine", "pine", 6.3),
          ],
        }));
      });
      await page.waitForTimeout(50);

      // Newest-dropped is the top of the stack, so E starts on the pine
      const chip = page.getByTestId("pickup-chip");
      await expect(chip).toContainText("Pine");

      // Point at the oak underneath it — the keys follow the cursor
      const oakAnchor = page.locator('[data-material-id="test-oak"]');
      // Hover is pointer state computed on mousemove, so wiggle until the
      // chip reports the piece — the same pattern the bench specs use.
      let wiggle = 0;
      await expect
        .poll(async () => {
          const box = await settledBox(oakAnchor);
          await page.mouse.move(box.x + (wiggle++ % 2), box.y);
          return chip.textContent();
        })
        .toContain("Oak");

      // Right-click it: every piece within reach, on one card
      const sheet = page.getByTestId("floor-sheet");
      await rightClickUntilVisible(page, oakAnchor, sheet);
      await expect(sheet).toBeVisible();
      await expect(sheet.getByTestId("floor-sheet-row")).toHaveCount(2);

      // ...and any of them can be taken straight from it
      await sheet
        .getByTestId("floor-sheet-row")
        .filter({ hasText: "Oak" })
        .getByRole("button", { name: "Take" })
        .click();
      const held = await page.evaluate(() =>
        (window as any)
          .__GET_GAME_STATE__()
          .player.inventory.map((m: any) => m.id),
      );
      expect(held).toContain("test-oak");

      // The card folds up once nothing is left in reach
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      // A machine answers the same gesture, and goes straight to its sheet
      await teleportPlayer(page, [1, 4]);
      const bench = page.locator('[data-machine-type="workspace"]');
      const stationSheet = page.getByTestId("station-sheet");
      await rightClickUntilVisible(page, bench, stationSheet);
      await expect(stationSheet).toBeVisible();
      await page.keyboard.press("Escape");

    });

    await test.step("starting over asks first, then clears the shop", async () => {
      await page.reload();
      await page.waitForSelector("main");
      await page.getByRole("button", { name: "New Game" }).click();

      // A browser confirm() would be invisible to the design system and
      // auto-dismissed by Playwright; this is a card on the workbench.
      const confirmPanel = page.getByTestId("new-game-confirm");
      await expect(confirmPanel).toBeVisible();

      await confirmPanel.getByRole("button", { name: "Keep It" }).click();
      await expect(confirmPanel).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Continue" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "New Game" }).click();
      await page.getByTestId("confirm-new-game").click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
      await expect(page.getByTestId("balance")).toHaveText("$0.00");
    });
  });
});
