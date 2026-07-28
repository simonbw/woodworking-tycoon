import { test, expect } from "@playwright/test";
import { machineCard, takeAllHere } from "./machine-panel";
import {
  dismissClientCard,
  goToStore,
  handOffAtDoor,
  leaveStore,
  movePlayerToDoor,
  openDoorPanel,
  startNewGame,
} from "./navigation";

/**
 * The shop floor itself.
 *
 * Everything here is a thing you do *in* the garage rather than in an overlay:
 * the app comes up and the canvas mounts, a delivered crate is unpacked and
 * carried and rotated and set down and picked up again, and finished work
 * leaves through the garage door with a client card and the rewards flying to
 * their readouts.
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
  test("boots, carries machines, and hands work over at the door", async ({
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
          "Caveat",
          "Stardos Stencil",
        ].filter((family) => !document.fonts.check(`1rem "${family}"`)),
      );
      expect(loaded).toEqual([]);
    });

    await test.step("start menu shows and we can start a new game", async () => {
      await expect(
        page.getByRole("heading", { name: "Woodworking Tycoon" }),
      ).toBeVisible();
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

    await test.step("the top bar keeps a wall clock beside the day", async () => {
      // The anchor for every duration the shop quotes: plans and station
      // status speak in minutes and hours, so the player needs the time.
      await expect(page.getByTestId("shop-clock")).toHaveText(
        /^\d{1,2}:\d{2} (AM|PM)$/,
      );
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
      await expect(page.getByTestId("shop-clock")).toBeVisible();
      await expect(page.getByText("Shop Layout")).toHaveCount(0);
    });

    await test.step("the carry verb hides until unlocked", async () => {
      await teleportPlayer(page, [6, 8]);
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
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect(await carried(page)).toBeNull();
      // Back to the real fixture for the rest of the walkthrough
      await loadFixture(page, "miter-saw-crate-shop");
      await teleportPlayer(page, [6, 8]);
    });

    await test.step("unpack the delivered crate underfoot", async () => {
      await expect(page.getByText("Unpack Miter Saw")).toBeVisible();
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.machineCrates).toHaveLength(0);
      expect(state.player.carriedMachine.machineTypeId).toBe("miterSaw");
      await expect(page.getByText("Put down Miter Saw")).toBeVisible();
      await expect(page.getByText("Rotate")).toBeVisible();
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
      await expect(page.getByText("Pick up Miter Saw")).toBeVisible();
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
      await expect(page.getByText("Pick up Miter Saw")).toHaveCount(0);
      await page.keyboard.press("b");
      await page.waitForTimeout(30);
      expect(await carried(page)).toBeNull();
    });

    await test.step("carry a worktable to a new spot", async () => {
      // The fixture's small worktable at [9,2] operates from [9,4]
      await teleportPlayer(page, [9, 4]);
      const machineHint = page.getByText(/plans & tools/i);
      await expect(machineHint.first()).toBeVisible();
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
      await expect(page.getByText(/plans & tools/i).first()).toBeVisible();
    });

    await test.step("buying a machine delivers a crate at the entrance", async () => {
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
        .getByRole("button", { name: "Buy" })
        .click({ force: true });
      await page.waitForTimeout(30);
      const state = await page.evaluate(() => window.__GET_GAME_STATE__());
      expect(state.machineCrates).toHaveLength(1);
      expect(state.machineCrates[0].machine.machineTypeId).toBe(
        "jobsiteTableSaw",
      );
      // Nearest open floor to the entrance [6,15]
      expect(state.machineCrates[0].position).toEqual([6, 15]);
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

    await test.step("the work order points at the door, not a button", async () => {
      // The full order lives on the clipboard; C holds it up
      await page.keyboard.press("c");
      await expect(page.getByTestId("commission-delivery-note")).toContainText(
        "garage door",
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

    await test.step("an empty-handed trip to the door offers nothing", async () => {
      await movePlayerToDoor(page);
      // Fresh game: no destinations unlocked and nothing in hand
      await expect(page.getByTestId("door-panel")).not.toBeVisible();
    });

    await test.step("the door lists the commission once it's in hand", async () => {
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
      await movePlayerToDoor(page);
      await openDoorPanel(page);

      const panel = page.getByTestId("door-panel");
      // Nowhere to go yet, so the card is nothing but the handoff
      await expect(panel).toContainText("Someone's waiting");
      await expect(panel).toContainText("Your First Shelf");
      // The client is named on the row — you know who you're meeting
      await expect(panel).toContainText("Marguerite");
      await expect(
        panel.getByRole("button", { name: "Hand Over" }),
      ).toBeVisible();
    });

    const before = await page.evaluate(() =>
      (window as any).__GET_GAME_STATE__(),
    );

    await test.step("handing it over shows the client's card", async () => {
      await handOffAtDoor(page, "Your First Shelf");

      const card = page.getByTestId("client-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Your First Shelf");
      await expect(card).toContainText("Marguerite");
      // The payout is itemized on the card: money, reputation, craft XP
      await expect(card).toContainText("$200.00");
    });

    await test.step("the payout has already landed behind the card", async () => {
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.money).toBe(before.money + 200);
      expect(state.reputation).toBe(before.reputation + 2);
      expect(state.progression.commissionsCompleted).toBe(1);
      expect(
        state.player.inventory.some((m: any) => m.id === "e2e-first-shelf"),
      ).toBe(false);
      // Completing the first commission is what unlocks the store
      expect(state.progression.storeUnlocked).toBe(true);
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
      await expect(page.getByTestId("balance")).toHaveText("$200.00");
      await expect(page.getByTestId("reputation")).toHaveText("2.0");
    });

    await test.step("the next work order holds the clipboard up by itself", async () => {
      // Once the payout landed, the clipboard opened to the new order
      const clipboard = page.getByRole("dialog", { name: "Clipboard" });
      await expect(clipboard).toBeVisible();
      await expect(clipboard).toContainText("Cut to Order");
      await page.keyboard.press("Escape");
      await expect(clipboard).toHaveCount(0);
      // The tracker chip carries it from here
      await expect(page.getByTestId("commission-tracker")).toContainText(
        "Cut to Order",
      );
      // ...and the door is no longer offering the one just delivered
      await movePlayerToDoor(page);
      await openDoorPanel(page);
      const panel = page.getByTestId("door-panel");
      await expect(panel).toContainText("Places to go");
      await expect(
        panel.getByRole("button", { name: "Hand Over" }),
      ).toHaveCount(0);
      // The store trip it unlocked is there instead
      await expect(panel).toContainText("Orange Box");
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

      // The handoff's earnings are still there, so is the commission it
      // unlocked — this is the same shop, not a fresh one.
      await expect(page.getByTestId("balance")).toHaveText("$200.00");
      await expect(page.getByTestId("reputation")).toHaveText("2.0");
      await expect(page.getByText("Cut to Order")).toBeVisible();
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
