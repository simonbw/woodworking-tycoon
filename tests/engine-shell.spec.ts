/**
 * The engine shell (/engine.html) — the entity-based rebuild being stood
 * up beside the app during the migration (see MIGRATION.md). This is a
 * transitional eighth spec file: the shell is a genuinely different
 * interface (its own entry, boot, and hooks) until cutover, when the
 * seven canonical specs rehost onto it and this file is absorbed.
 *
 * Phase 3's automated gate lives here: the shop is walkable — held keys
 * move the continuous body, walls and machines stop it, the camera
 * hands off to the player past the garage door — and the world's clock
 * only creeps while nobody spends time.
 */

import { expect, test } from "@playwright/test";

test.describe("Engine shell", () => {
  // One fat journey in the repo's style; the phase-4/5 steps grew it
  // past the default 30s budget on slower machines.
  test.setTimeout(90_000);

  test("boots a walkable shop with a following camera", async ({ page }) => {
    // One long journey through the shell, growing a step per ported
    // system — two boots, a page reload, real walking, and a real sale
    // put it far past the default 30s budget, and a full-suite run
    // shares the machine with seven other specs' servers, so the
    // standalone time (~40s) roughly doubles under load.
    test.setTimeout(120_000);

    await page.goto("/engine.html");
    await page.waitForFunction(() => Boolean((window as any).game), null, {
      timeout: 15_000,
    });

    await test.step("the start menu comes first", async () => {
      // A fresh browser has no engine save: no Continue on offer, and
      // New Game is the way into the shop.
      await expect(page.getByRole("button", { name: "New Game" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(
        0,
      );
      await page.getByRole("button", { name: "New Game" }).click();
    });

    // The world settles: assets in, entities added, first frames drawn.
    await page.waitForFunction(
      () => (window as any).game.entities.all.size > 10,
      null,
      { timeout: 15_000 },
    );

    const readPlayer = () =>
      page.evaluate(() => {
        const game = (window as any).game;
        const player = game.entities.getById("player");
        return {
          pos: [...player.position] as [number, number],
          cameraY: game.camera.y as number,
          clockTick: game.entities.getById("clock").tick as number,
        };
      });

    await test.step("boots the starter shop", async () => {
      const state = await page.evaluate(() => {
        const game = (window as any).game;
        return {
          // saveType, not constructor.name: the E2E bundle is minified.
          machines: [...game.entities.all].filter(
            (e: any) => e.saveType === "machine",
          ).length,
          hasCanvas: Boolean(document.querySelector("canvas")),
        };
      });
      expect(state.hasCanvas).toBe(true);
      expect(state.machines).toBe(3);
    });

    await test.step("the HUD chip reads the sim", async () => {
      // The DOM layer over the canvas: the top bar's balance follows the
      // wallet through the ShellStore's state-change signal.
      await expect(page.getByTestId("balance")).toHaveText("$0.00");
      await page.evaluate(() => {
        (window as any).game.entities.getById("wallet").money += 45;
      });
      await expect(page.getByTestId("balance")).toHaveText("$45.00");
      await page.evaluate(() => {
        (window as any).game.entities.getById("wallet").money -= 45;
      });
      await expect(page.getByTestId("balance")).toHaveText("$0.00");
    });

    await test.step("? opens the manual and claims the keyboard", async () => {
      const manual = page.getByRole("dialog", { name: "Shop manual" });
      await page.keyboard.press("Shift+Slash");
      await expect(manual).toBeVisible();
      // The binder is open to an article, tabs down the right edge.
      await expect(
        manual.getByRole("heading", { name: "Welcome to the Shop" }),
      ).toBeVisible();
      await expect(
        manual.getByRole("button", { name: "Controls" }),
      ).toBeVisible();
      // The floor keys go quiet while the modal owns the keyboard.
      const before = await readPlayer();
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(300);
      await page.keyboard.up("KeyD");
      const after = await readPlayer();
      expect(after.pos[0]).toBeCloseTo(before.pos[0], 6);
      // The same key closes it, and the floor keys come back below.
      await page.keyboard.press("Shift+Slash");
      await expect(manual).toBeHidden();
    });

    await test.step("the coach's first card is up", async () => {
      // A fresh shop starts the guided opening: one handwritten card,
      // its first goal showing, the first box still open.
      const card = page.getByTestId("tutorial-card-opening");
      await expect(card).toBeVisible();
      await expect(card.getByTestId("tutorial-goal")).toHaveText(
        "Make my first item",
      );
      await expect(card.getByTestId("tutorial-step-scavenge")).toHaveAttribute(
        "data-checked",
        "false",
      );
    });

    await test.step("held keys walk the body", async () => {
      const before = await readPlayer();
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(500);
      await page.keyboard.up("KeyD");
      const after = await readPlayer();
      expect(after.pos[0]).toBeGreaterThan(before.pos[0] + 0.5);
      expect(Math.abs(after.pos[1] - before.pos[1])).toBeLessThan(1e-6);
    });

    await test.step("walls stop the walk", async () => {
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(1500);
      await page.keyboard.up("KeyD");
      const atWall = await readPlayer();
      // The east wall: the shop is 12 cells wide and the body's radius
      // is 0.8, so it rests just inside x = 11.2.
      expect(atWall.pos[0]).toBeLessThanOrEqual(11.2 + 1e-3);
      expect(atWall.pos[0]).toBeGreaterThan(10.5);
    });

    await test.step("the camera follows out the garage door", async () => {
      const indoors = await readPlayer();
      expect(indoors.cameraY).toBeGreaterThan(0);
      const cameraBefore = indoors.cameraY;
      // Walk to the door's span, then south out onto the driveway.
      await page.evaluate(() => {
        const game = (window as any).game;
        const player = game.entities.getById("player");
        player.position = [6.5, 15.0];
      });
      await page.keyboard.down("KeyS");
      await page.waitForTimeout(2000);
      await page.keyboard.up("KeyS");
      const outdoors = await readPlayer();
      expect(outdoors.pos[1]).toBeGreaterThan(16.5);
      expect(outdoors.cameraY).toBeGreaterThan(cameraBefore + 1);
    });

    await test.step("idle time barely creeps", async () => {
      const before = await readPlayer();
      await page.waitForTimeout(1000);
      const after = await readPlayer();
      // The idle creep is 5 game minutes per real minute — one real
      // second may carry the accumulator over at most one whole minute.
      expect(after.clockTick - before.clockTick).toBeLessThanOrEqual(1);
    });

    await test.step("E picks up and F puts down through the dispatcher", async () => {
      // Stage a board on the floor beside the player via the save hooks.
      await page.evaluate(() => {
        const save = (window as any).__GET_GAME_STATE__();
        save.singletons.player.position = [6.5, 12.5];
        save.entities.push({
          type: "materialPile",
          data: {
            material: {
              id: "spec-board",
              type: "board",
              species: "pallet",
              length: 24,
              width: 4,
              thickness: 1,
              surface: "rough",
            },
            position: [6.5, 12.5],
            rotation: 0,
          },
        });
        (window as any).__UPDATE_GAME_STATE__(save);
      });
      const held = async () =>
        page.evaluate(
          () =>
            (window as any).game.entities.getById("player").inventory.length,
        );
      expect(await held()).toBe(0);
      await page.keyboard.press("KeyE");
      expect(await held()).toBe(1);
      await page.keyboard.press("KeyF");
      expect(await held()).toBe(0);
      const piles = await page.evaluate(
        () =>
          [...(window as any).game.entities.all].filter(
            (e: any) => e.saveType === "materialPile",
          ).length,
      );
      expect(piles).toBe(1);
    });

    await test.step("B hoists and sets down the machine underfoot", async () => {
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" &&
            e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        game.entities.getById("player").position = [
          cell[0] + 0.5,
          cell[1] + 0.5,
        ];
      });
      const carrying = async () =>
        page.evaluate(
          () =>
            (window as any).game.entities.getById("player").carriedMachine
              ?.machineTypeId ?? null,
        );
      await page.keyboard.press("KeyB");
      expect(await carrying()).toBe("workspace");
      await page.keyboard.press("KeyB");
      expect(await carrying()).toBe(null);
    });

    await test.step("J opens the journal and claims the keyboard", async () => {
      const journal = page.getByRole("dialog", { name: "Journal" });
      await page.keyboard.press("KeyJ");
      await expect(journal).toBeVisible();
      // The DOM modal makes the engine's input stand down
      // (ModalScopeBridge). The flag crosses two React effect passes, so
      // poll rather than read it the instant the dialog paints.
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as any).game.entities.getById("shellStore").modalOpen,
          ),
        )
        .toBe(true);
      // J again closes it (the modal-scope rebind of the same key).
      await page.keyboard.press("KeyJ");
      await expect(journal).toBeHidden();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as any).game.entities.getById("shellStore").modalOpen,
          ),
        )
        .toBe(false);
    });

    await test.step("Escape pauses, and the pause menu stops the clock", async () => {
      const menu = page.getByRole("dialog", { name: "Paused" });
      await page.keyboard.press("Escape");
      await expect(menu).toBeVisible();
      expect(await page.evaluate(() => (window as any).game.paused)).toBe(true);
      const before = await readPlayer();
      await page.waitForTimeout(600);
      const after = await readPlayer();
      expect(after.clockTick).toBe(before.clockTick);
      // Escape again resumes (unmounting is what unpauses).
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      expect(await page.evaluate(() => (window as any).game.paused)).toBe(
        false,
      );
    });

    await test.step("the hands strip, supplies panel, and nightfall card read the sim", async () => {
      // Stage a held board and stocked nails via the save hooks.
      await page.evaluate(() => {
        const save = (window as any).__GET_GAME_STATE__();
        save.singletons.player.inventory = [
          {
            id: "hud-board",
            type: "board",
            species: "pallet",
            length: 24,
            width: 4,
            thickness: 1,
            surface: "rough",
          },
        ];
        save.singletons.consumables = { stock: { nails: 8 }, clamps: 0 };
        (window as any).__UPDATE_GAME_STATE__(save);
      });
      await expect(page.getByTestId("hands-strip")).toContainText("In hand");
      await expect(page.locator("[data-supplies-toggle]")).toBeVisible();
      // Clicking the slot speaks the F verb: the piece lands at the body
      // and the emptied strip folds away.
      await page.getByTestId("hands-strip").getByRole("button").click();
      await expect(page.getByTestId("hands-strip")).toHaveCount(0);
      const dropped = await page.evaluate(
        () =>
          [...(window as any).game.entities.all].filter(
            (e: any) => e.saveType === "materialPile",
          ).length,
      );
      expect(dropped).toBe(2);

      // Spend the day's minutes and the closed-for-the-night card pins up.
      const dayTicks = await page.evaluate(() => {
        const clock = (window as any).game.entities.getById("clock");
        const spent = clock.tick - clock.dayStartTick;
        clock.tick = clock.dayStartTick + 10_000;
        return spent;
      });
      await expect(page.getByTestId("nightfall-card")).toBeVisible();
      await page.evaluate((spent) => {
        const clock = (window as any).game.entities.getById("clock");
        clock.tick = clock.dayStartTick + spent;
      }, dayTicks);
      await expect(page.getByTestId("nightfall-card")).toHaveCount(0);
    });

    await test.step("the targeted machine wears its hint chips", async () => {
      // Stand beside the garbage can (workable from any side — it has
      // no operator cell): the DOM overlay pins the machine's chip
      // cluster over it, named and offering its keys. The can sits at
      // [0,13] on a 2×2 footprint, so [2.5, 13.5] is in its ring.
      await page.evaluate(() => {
        const game = (window as any).game;
        game.entities.getById("player").position = [2.5, 13.5];
      });
      const chips = page.getByTestId("machine-chips");
      await expect(chips).toBeVisible();
      await expect(chips).toContainText("Garbage Can");
    });

    await test.step("Tab opens and closes the station sheet", async () => {
      await page.keyboard.press("Tab");
      const sheet = page.getByTestId("station-sheet");
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText("Garbage Can");
      // The chips fold away while the sheet is spread out.
      await expect(page.getByTestId("machine-chips")).toHaveCount(0);
      await page.keyboard.press("Tab");
      await expect(sheet).toHaveCount(0);
      await expect(page.getByTestId("machine-chips")).toBeVisible();
    });

    await test.step("a shopping trip: out the cab, cart, shelf, register, home", async () => {
      // The phase-6 gate: the whole trip through the real seams — the
      // cab's trip card, the corral, a shelf, the register's receipt,
      // and the deferred drive home landing the purchase in the bed.
      await page.evaluate(() => {
        const game = (window as any).game;
        game.entities.getById("progression").storeUnlocked = true;
        game.entities.getById("wallet").money += 100;
        const save = (window as any).__GET_GAME_STATE__();
        save.singletons.player.position = [2.5, 28.5];
        (window as any).__UPDATE_GAME_STATE__(save);
      });
      const moneyBefore = await page.evaluate(
        () => (window as any).game.entities.getById("wallet").money,
      );
      // E at the cab opens the trip card; E again takes the selected
      // row — the Orange Box sits first once the store is unlocked.
      await page.keyboard.press("KeyE");
      await expect(page.getByTestId("truck-panel")).toBeVisible();
      const tickBefore = await page.evaluate(
        () => (window as any).game.entities.getById("clock").tick,
      );
      await page.keyboard.press("KeyE");
      await page.waitForFunction(
        () =>
          (window as any).game.entities.getById("player").away?.kind ===
          "shopping",
        null,
        { timeout: 5_000 },
      );
      // The drive out charges its minutes with the trip underway.
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as any).game.entities.getById("clock").tick,
          ),
        )
        .toBeGreaterThanOrEqual(tickBefore + 15);
      // The scene swapped: the store's root is up, the shop's views are
      // torn down.
      expect(
        await page.evaluate(() =>
          Boolean((window as any).game.entities.getById("storeSceneRoot")),
        ),
      ).toBe(true);

      // Walk the floor by teleports (the aisles are long; walking is
      // covered above): the corral's E takes a flatbed…
      const standAt = (point: string) =>
        page.evaluate((point) => {
          const game = (window as any).game;
          const layout = game.entities.getById("storeSceneRoot").layout();
          const rect =
            point === "corral"
              ? layout.corral
              : point === "register"
                ? layout.register
                : layout.fixtures.find((f: any) => f.display === "racking")
                    .rect;
          const save = (window as any).__GET_GAME_STATE__();
          save.singletons.player.away.position = [
            Math.floor((rect.min[0] + rect.max[0]) / 2),
            Math.floor(rect.max[1]) + (point === "bay" ? 1 : 0),
          ];
          (window as any).__UPDATE_GAME_STATE__(save);
        }, point);
      const trip = () =>
        page.evaluate(() => {
          const away = (window as any).game.entities.getById("player").away;
          return { hasCart: away.hasCart, cart: away.cart.length };
        });
      await standAt("corral");
      await page.keyboard.press("KeyE");
      expect((await trip()).hasCart).toBe(true);

      // …a shelf's E puts one in the cart, F puts it back, E re-adds…
      await standAt("bay");
      await page.keyboard.press("KeyE");
      expect((await trip()).cart).toBe(1);
      await page.keyboard.press("KeyF");
      expect((await trip()).cart).toBe(0);
      await page.keyboard.press("KeyE");

      // …and the register's E opens the receipt; Buy pays and drives
      // home, the purchase riding in the bed.
      await standAt("register");
      await page.keyboard.press("KeyE");
      await expect(page.getByTestId("store-checkout-modal")).toBeVisible();
      await page
        .getByTestId("store-checkout-modal")
        .getByRole("button", { name: /buy/i })
        .click();
      await page.waitForFunction(
        () => (window as any).game.entities.getById("player").away === null,
        null,
        { timeout: 10_000 },
      );
      const home = await page.evaluate(() => {
        const game = (window as any).game;
        return {
          money: game.entities.getById("wallet").money,
          bed:
            game.entities.getById("truck").bed.length +
            game.entities.getById("truck").crates.length,
          storeRoot: Boolean(game.entities.getById("storeSceneRoot")),
        };
      });
      expect(home.money).toBeLessThan(moneyBefore);
      expect(home.bed).toBeGreaterThan(0);
      expect(home.storeRoot).toBe(false);
    });

    await test.step("the first sale pays out with a reward flight", async () => {
      // Stock the stand and stage a browsing customer one street pass
      // from deciding; the shop's first sale skips the coin flip, so the
      // buy is certain (StreetSystem's first-sale rule).
      await page.evaluate(() => {
        const save = (window as any).__GET_GAME_STATE__();
        save.singletons.stand = {
          pieces: [{ id: "spec-shelf", type: "rusticShelf", species: "pallet" }],
        };
        save.entities = save.entities.filter((e: any) => e.type !== "customer");
        save.entities.push({
          type: "customer",
          data: {
            id: "spec-buyer",
            x: 8,
            walkDirection: 1,
            state: "browsing",
            browseTicksLeft: 1,
          },
        });
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      // The street pass runs on sim minutes: hold the wait key until the
      // sale settles.
      await page.keyboard.down("KeyT");
      await expect
        .poll(
          () =>
            page.evaluate(
              () => (window as any).game.entities.getById("wallet").money,
            ),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(0);
      await page.keyboard.up("KeyT");

      // The sale settled everywhere at once: the stand emptied, the
      // balances rose, and the first sale unlocked the store.
      const settled = await page.evaluate(() => {
        const game = (window as any).game;
        return {
          standPieces: game.entities.getById("stand").pieces.length,
          reputation: game.entities.getById("reputation").reputation,
          storeUnlocked: game.entities.getById("progression").storeUnlocked,
          salesCompleted: game.entities.getById("progression").salesCompleted,
        };
      });
      expect(settled.standPieces).toBe(0);
      expect(settled.reputation).toBeGreaterThan(0);
      expect(settled.salesCompleted).toBe(1);
      // The milestone layer runs after the street's in the same minute.
      expect(settled.storeUnlocked).toBe(true);

      // The celebration is airborne: coins bursting toward the balance
      // readout, the star toward reputation (chips live ~1.2s).
      await expect(
        page.getByTestId("reward-flights").locator(".reward-chip").first(),
      ).toBeVisible({ timeout: 3_000 });
      // The readouts the chips fly to show the settled numbers.
      await expect(page.getByTestId("balance")).not.toHaveText("$0.00");
    });

    await test.step("the world round-trips through the hooks", async () => {
      const roundTrip = await page.evaluate(() => {
        const first = (window as any).__GET_GAME_STATE__();
        (window as any).__UPDATE_GAME_STATE__(first);
        const second = (window as any).__GET_GAME_STATE__();
        return {
          identical: JSON.stringify(first) === JSON.stringify(second),
          version: first.version,
        };
      });
      expect(roundTrip.identical).toBe(true);
      expect(roundTrip.version).toBeGreaterThanOrEqual(1);
    });

    await test.step("a reload lands on the menu, and Continue restores the shop", async () => {
      // Freeze the world so the stored save can't drift past our snapshot,
      // mark it dirty (the autosave only owes a write after sim minutes,
      // and the idle creep may not have carried one yet), and flush it
      // through the same pagehide listener leaving the page uses.
      const stored = await page.evaluate(() => {
        (window as any).__SET_PAUSED__(true);
        (window as any).game.entities.getById("saveManager").schedule();
        window.dispatchEvent(new Event("pagehide"));
        return localStorage.getItem("woodworking-tycoon-engine-save");
      });
      expect(stored).not.toBeNull();

      await page.reload();
      await page.waitForFunction(() => Boolean((window as any).game), null, {
        timeout: 15_000,
      });
      const continueButton = page.getByRole("button", { name: "Continue" });
      await expect(continueButton).toBeVisible();
      await expect(continueButton).toBeEnabled();
      await continueButton.click();
      await page.waitForFunction(
        () => (window as any).game.entities.all.size > 10,
        null,
        { timeout: 15_000 },
      );

      // The same world comes back: pause before reading so the restored
      // shop can't tick between load and snapshot, then compare bytes.
      const restored = await page.evaluate(() => {
        (window as any).__SET_PAUSED__(true);
        return JSON.stringify((window as any).__GET_GAME_STATE__());
      });
      expect(restored).toBe(stored);
    });
  });
});
