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
    // system — two boots, a page reload, real walking, a whole shopping
    // trip, and a real sale run ~70s standalone, and a full-suite run
    // shares the machine with seven other specs' servers, which more
    // than doubles it. The journey splits across the seven canonical
    // specs at cutover; until then it carries their coverage alone.
    test.setTimeout(420_000);

    await page.goto("/engine.html");
    await page.waitForFunction(() => Boolean((window as any).game), null, {
      timeout: 15_000,
    });

    await test.step("the start menu comes first", async () => {
      // A fresh browser has no engine save: no Continue on offer, and
      // New Game is the way into the shop.
      await expect(
        page.getByRole("button", { name: "New Game" }),
      ).toBeVisible();
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
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
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
      // Take the row by key, falling back to its button: the accept
      // binding lives in the per-frame overlay root, and a loaded host
      // can starve the press's window. The click is the same user path
      // with Playwright's own enabled-and-stable waiting behind it.
      const awayKind = () =>
        page.evaluate(
          () =>
            (window as any).game.entities.getById("player").away?.kind ?? null,
        );
      await page.keyboard.press("KeyE");
      await expect
        .poll(
          async () => {
            const kind = await awayKind();
            if (kind !== null) return kind;
            // The row is a real, enabled button; a loaded host can
            // starve both the key's frame window and Playwright's
            // stability waits, so fall back to the DOM's own click.
            await page.evaluate(() => {
              document
                .querySelector<HTMLButtonElement>(
                  'button[aria-label="Go: Orange Box"]',
                )
                ?.click();
            });
            return awayKind();
          },
          { timeout: 15_000 },
        )
        .toBe("shopping");
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
      const standAt = async (point: string) => {
        await page.evaluate((point) => {
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
        // The hook reload cleared the scene root; the director respawns
        // it on the next engine tick — a gap only the hooks can create,
        // and a press inside it would find no store to act on.
        await page.waitForFunction(
          () =>
            Boolean((window as any).game.entities.getById("storeSceneRoot")),
          null,
          // Generous: under a full-suite run the frame loop shares the
          // machine with seven sibling servers, and the respawn rides
          // an engine tick.
          { timeout: 15_000 },
        );
      };
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
          pieces: [
            { id: "spec-shelf", type: "rusticShelf", species: "pallet" },
          ],
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
      // sale settles. (Poll the sale count, not the wallet — the
      // shopping trip above already left money in it.)
      await page.keyboard.down("KeyT");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("progression")
                  .salesCompleted,
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

    await test.step("Tab dives into the bench, and the hammer pries a nail", async () => {
      // Stage a nailed pallet on the workspace with a hammer on its
      // rack, and stand in the operator's apron.
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        const save = (window as any).__GET_GAME_STATE__();
        const ws = save.entities.find(
          (e: any) =>
            e.type === "machine" && e.data.machineTypeId === "workspace",
        );
        ws.data.tools = ["hammer"];
        ws.data.inputMaterials = [
          {
            id: "spec-pallet",
            type: "pallet",
            deckBoards: [true, true, true, true, true, true, true, true],
            stringers: [true, true, true],
            nails: [
              { deck: 3, stringer: 0 },
              { deck: 3, stringer: 1 },
              { deck: 3, stringer: 2 },
              { deck: 4, stringer: 0 },
            ],
          },
        ];
        save.singletons.player.position = [cell[0] + 0.5, cell[1] + 0.5];
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("benchDive").openBenchKey,
            ),
          { timeout: 10_000 },
        )
        .not.toBeNull();
      // The tool rail is the mode selector: take the hammer in hand.
      await expect(page.getByTestId("bench-tool-rail")).toBeVisible();
      await page.getByTestId("bench-tool-hammer").click();
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as any).game.entities.getById("benchDive").heldTool,
          ),
        )
        .toBe("hammer");

      // The stage seam says where the rings are; point at one and it
      // warms, and the press is the commit — the nail leaves the pallet
      // and lands in the tin.
      const nailPoint = await page.evaluate(() => {
        const view = [...(window as any).game.entities.all].find(
          (e: any) => typeof e.nailPoints === "function",
        );
        // The coach's column floats over the stage's left edge, as it
        // does in the old shell — take a ring the canvas can hear.
        return (
          view
            .nailPoints()
            .find(
              (p: any) =>
                document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS",
            ) ?? null
        );
      });
      expect(nailPoint).toBeTruthy();
      const hit = { x: nailPoint.x, y: nailPoint.y };
      await page.mouse.move(hit.x, hit.y);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as any).game.entities.getById("benchDive").hoveredNail,
          ),
        )
        .not.toBeNull();

      const nailCount = () =>
        page.evaluate(() => {
          const bench = (window as any).game.entities
            .getById("benchDive")
            .openBench();
          const pallet = bench.state.inputMaterials.find(
            (m: any) => m.type === "pallet",
          );
          return pallet ? pallet.nails.length : 0;
        });
      const before = await nailCount();
      await page.mouse.click(hit.x, hit.y);
      await expect.poll(nailCount).toBe(before - 1);
      expect(
        await page.evaluate(
          () =>
            (window as any).game.entities.getById("consumables").stock.nails ??
            0,
        ),
      ).toBeGreaterThan(0);

      // Escape empties the hands first — the hammer goes back on the
      // rail — and the second one stands back up.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as any).game.entities.getById("benchDive").openBenchKey,
          ),
        )
        .toBeNull();
    });

    await test.step("the sander strokes a board smooth", async () => {
      // Tool-first work: the tool in hand plus the piece under it is the
      // operation. The powered pad cuts where it rests, so a short
      // press over a small board carries the pass to its commit.
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        const save = (window as any).__GET_GAME_STATE__();
        const ws = save.entities.find(
          (e: any) =>
            e.type === "machine" && e.data.machineTypeId === "workspace",
        );
        ws.data.tools = ["randomOrbitSander"];
        ws.data.inputMaterials = [
          {
            id: "spec-sand-board",
            type: "board",
            species: "pine",
            length: 3,
            width: 2,
            thickness: 4,
            surface: "smooth",
          },
        ];
        save.singletons.player.position = [cell[0] + 0.5, cell[1] + 0.5];
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("benchDive").openBenchKey,
            ),
          { timeout: 10_000 },
        )
        .not.toBeNull();
      await page.getByTestId("bench-tool-randomOrbitSander").click();

      // The stage seam says where the board actually lies.
      const board = await page.evaluate(() => {
        const view = [...(window as any).game.entities.all].find(
          (e: any) => typeof e.piecePoints === "function",
        );
        return view.piecePoints().find((p: any) => p.id === "spec-sand-board");
      });
      expect(board).toBeTruthy();

      await page.mouse.move(board.x, board.y);
      await page.mouse.down();
      const surfaces = () =>
        page.evaluate(() => {
          const bench = (window as any).game.entities
            .getById("benchDive")
            .openBench();
          return bench.state.outputMaterials.map((m: any) => m.surface);
        });
      // The pad keeps working the spot it rests on: the pass fills and
      // commits without the pointer having to travel.
      await expect.poll(surfaces, { timeout: 20_000 }).toContain("sanded");
      await page.mouse.up();
      // One Escape hangs the sander up, the next stands back up.
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    });

    await test.step("the hand saw marks a line and cuts through it", async () => {
      // The saw's two halves: the press marks the cut at the detent
      // under the hand (which claims the board), and push–pull strokes
      // along the line deepen the kerf until the board parts.
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        const save = (window as any).__GET_GAME_STATE__();
        const ws = save.entities.find(
          (e: any) =>
            e.type === "machine" && e.data.machineTypeId === "workspace",
        );
        ws.data.tools = ["handSaw"];
        // The sanded board from the step before is still lying there;
        // clear the bench so the halves are the only finished work on it.
        ws.data.outputMaterials = [];
        // Narrow, thin stock: the kerf budget is the cross-section, so
        // this parts in a handful of strokes.
        ws.data.inputMaterials = [
          {
            id: "spec-saw-board",
            type: "board",
            species: "pine",
            length: 12,
            width: 2,
            thickness: 2,
            surface: "rough",
          },
        ];
        save.singletons.player.position = [cell[0] + 0.5, cell[1] + 0.5];
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("benchDive").openBenchKey,
            ),
          { timeout: 10_000 },
        )
        .not.toBeNull();
      await page.getByTestId("bench-tool-handSaw").click();

      const board = await page.evaluate(() => {
        const view = [...(window as any).game.entities.all].find(
          (e: any) => typeof e.piecePoints === "function",
        );
        return view.piecePoints().find((p: any) => p.id === "spec-saw-board");
      });
      expect(board).toBeTruthy();

      // The line runs across the board's width, so the strokes run
      // along the piece's own heading.
      const radians = (board.angleDeg * Math.PI) / 180;
      const reach = board.pxPerIn * 0.8;
      const along = {
        x: Math.cos(radians) * reach,
        y: Math.sin(radians) * reach,
      };

      await page.mouse.move(board.x, board.y);
      await page.mouse.down();
      await expect
        .poll(() =>
          page.evaluate(() => {
            const bench = (window as any).game.entities
              .getById("benchDive")
              .openBench();
            return bench.state.operationProgress.status;
          }),
        )
        .toBe("inProgress");

      const halves = () =>
        page.evaluate(() => {
          const bench = (window as any).game.entities
            .getById("benchDive")
            .openBench();
          return bench.state.outputMaterials.length;
        });
      for (let stroke = 0; stroke < 40 && (await halves()) === 0; stroke++) {
        await page.mouse.move(board.x - along.x, board.y - along.y);
        await page.mouse.move(board.x + along.x, board.y + along.y);
      }
      await page.mouse.up();
      // Cut through: one board became two, each half the marked length.
      const lengths = await page.evaluate(() => {
        const bench = (window as any).game.entities
          .getById("benchDive")
          .openBench();
        return bench.state.outputMaterials.map((m: any) => m.length);
      });
      expect(lengths).toEqual([6, 6]);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    });

    await test.step("bare hands drag, turn, and take a piece", async () => {
      // Where pieces lie is real state, so each gesture commits to the
      // bench's layout — the shop floor draws the same arrangement.
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        const save = (window as any).__GET_GAME_STATE__();
        const ws = save.entities.find(
          (e: any) =>
            e.type === "machine" && e.data.machineTypeId === "workspace",
        );
        ws.data.tools = [];
        ws.data.outputMaterials = [];
        ws.data.inputMaterials = [
          {
            id: "spec-loose-board",
            type: "board",
            species: "pine",
            length: 24,
            width: 4,
            thickness: 4,
            surface: "rough",
          },
        ];
        save.singletons.player.position = [cell[0] + 0.5, cell[1] + 0.5];
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("benchDive").openBenchKey,
            ),
          { timeout: 10_000 },
        )
        .not.toBeNull();

      const boardPoint = () =>
        page.evaluate(() => {
          const view = [...(window as any).game.entities.all].find(
            (e: any) => typeof e.piecePoints === "function",
          );
          return view
            .piecePoints()
            .find((p: any) => p.id === "spec-loose-board");
        });
      const seat = () =>
        page.evaluate(() => {
          const bench = (window as any).game.entities
            .getById("benchDive")
            .openBench();
          return bench.state.benchLayout?.["spec-loose-board"] ?? null;
        });

      const before = await boardPoint();
      expect(before).toBeTruthy();
      await page.mouse.move(before.x, before.y);
      await page.mouse.down();
      await page.mouse.move(before.x + 60, before.y + 30, { steps: 3 });
      await page.mouse.up();
      // The drag committed: the piece has a seat of its own now, and the
      // stage draws it where the hand left it.
      await expect.poll(seat).not.toBeNull();
      const after = await boardPoint();
      expect(after.x).toBeGreaterThan(before.x + 40);

      // R turns it a quarter turn about its middle.
      await page.mouse.move(after.x, after.y);
      const turnedFrom = (await seat()).angleDeg;
      await page.keyboard.press("KeyR");
      await expect
        .poll(async () => (await seat()).angleDeg)
        .toBe(turnedFrom + 90);

      // E takes the piece under the hand off the bench.
      const turned = await boardPoint();
      await page.mouse.move(turned.x, turned.y);
      await page.keyboard.press("KeyE");
      await expect
        .poll(() =>
          page.evaluate(() => {
            const bench = (window as any).game.entities
              .getById("benchDive")
              .openBench();
            return bench.state.inputMaterials.length;
          }),
        )
        .toBe(0);
      await page.keyboard.press("Escape");
    });

    await test.step("clamps, glue, and a tighten start a glue-up", async () => {
      // Clamps-first: no plan is pulled. Two boards lying edge to edge
      // ARE the glue-up once the bars are set, the seam is beaded, and
      // the last clamp comes tight.
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        const save = (window as any).__GET_GAME_STATE__();
        const ws = save.entities.find(
          (e: any) =>
            e.type === "machine" && e.data.machineTypeId === "workspace",
        );
        ws.data.tools = [];
        ws.data.outputMaterials = [];
        const board = (id: string) => ({
          id,
          type: "board",
          species: "pine",
          length: 12,
          width: 6,
          thickness: 4,
          surface: "smooth",
        });
        ws.data.inputMaterials = [board("spec-glue-a"), board("spec-glue-b")];
        // Laid across the bench, edge to edge — a run with one seam.
        ws.data.benchLayout = {
          "spec-glue-a": { xIn: 20, yIn: 14, angleDeg: 90, flipped: false },
          "spec-glue-b": { xIn: 20, yIn: 20, angleDeg: 90, flipped: false },
        };
        save.singletons.player.position = [cell[0] + 0.5, cell[1] + 0.5];
        save.singletons.consumables.clamps = 6;
        save.singletons.progression.unlockedSkills = [
          ...new Set([
            ...(save.singletons.progression.unlockedSkills ?? []),
            "panelWork",
            "freeformLamination",
          ]),
        ];
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("benchDive").openBenchKey,
            ),
          { timeout: 10_000 },
        )
        .not.toBeNull();

      const glue = () =>
        page.evaluate(() => {
          const view = [...(window as any).game.entities.all].find(
            (e: any) => typeof e.glueProgress === "function",
          );
          return { progress: view.glueProgress(), points: view.gluePoints() };
        });
      // The run reads itself off the bench: one seam, two clamps wanted.
      const start = await glue();
      expect(start.progress).toMatchObject({ seams: 1, needed: 2, clamps: 0 });

      // Lay a bar on each ghost.
      await page.getByTestId("bench-clamp").click();
      for (let bar = 0; bar < 2; bar++) {
        const ghost = (await glue()).points.ghosts[0];
        if (!ghost) break;
        await page.mouse.click(ghost.x, ghost.y);
        const holding = await page.evaluate(
          () => (window as any).game.entities.getById("benchDive").holdingClamp,
        );
        if (!holding) await page.getByTestId("bench-clamp").click();
      }
      await expect.poll(async () => (await glue()).progress.clamps).toBe(2);

      // Run a bead down the seam with the bottle.
      await page.getByTestId("bench-glue-bottle").click();
      const seam = (await glue()).points.seams[0];
      await page.mouse.move(seam.x0, seam.y0);
      await page.mouse.down();
      for (let pass = 0; pass < 8; pass++) {
        const progress = (await glue()).progress;
        if (progress.seamsGlued >= progress.seams) break;
        for (let step = 0; step <= 8; step++) {
          const t = pass % 2 === 0 ? step / 8 : 1 - step / 8;
          await page.mouse.move(
            seam.x0 + (seam.x1 - seam.x0) * t,
            seam.y0 + (seam.y1 - seam.y0) * t,
          );
        }
      }
      await page.mouse.up();
      expect((await glue()).progress.seamsGlued).toBe(1);

      // Bare hands again: each bar winds tight, and the last one is the
      // commit — the boards leave the bench for the operation's cure.
      await page.getByTestId("bench-glue-bottle").click();
      for (let bar = 0; bar < 3; bar++) {
        const state = await glue();
        const point = state.points?.clamps?.[bar];
        if (!point) break;
        await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(150);
      }
      const curing = await page.evaluate(() => {
        const bench = (window as any).game.entities
          .getById("benchDive")
          .openBench();
        return {
          status: bench.state.operationProgress.status,
          processing: bench.state.processingMaterials.map((m: any) => m.id),
        };
      });
      expect(curing.status).toBe("inProgress");
      expect(curing.processing).toEqual(["spec-glue-a", "spec-glue-b"]);
      await page.keyboard.press("Escape");
    });

    await test.step("a drawing off the pile builds a shelf", async () => {
      // The last bench mode: pull a plan, lay each part on its outline,
      // and drive a fastener at every lit crossing — the last one
      // commits the whole build.
      await page.evaluate(() => {
        const game = (window as any).game;
        const workspace = [...game.entities.all].find(
          (e: any) =>
            e.saveType === "machine" && e.state.machineTypeId === "workspace",
        );
        const cell = workspace.view().absoluteOperationPosition;
        const save = (window as any).__GET_GAME_STATE__();
        const ws = save.entities.find(
          (e: any) =>
            e.type === "machine" && e.data.machineTypeId === "workspace",
        );
        ws.data.tools = ["drill"];
        ws.data.outputMaterials = [];
        // The glue-up from the step before is still curing on this
        // bench; a build wants it clear.
        ws.data.processingMaterials = [];
        ws.data.operationProgress = {
          status: "notStarted",
          phaseIndex: 0,
          ticksRemaining: 0,
        };
        const plank = (id: string) => ({
          id,
          type: "board",
          species: "pine",
          length: 48,
          width: 6,
          thickness: 4,
          surface: "sanded",
        });
        ws.data.inputMaterials = [plank("spec-plank"), plank("spec-cleat")];
        ws.data.benchLayout = {
          "spec-plank": { xIn: 12, yIn: 10, angleDeg: 90, flipped: false },
          "spec-cleat": { xIn: 12, yIn: 26, angleDeg: 90, flipped: false },
        };
        save.singletons.player.position = [cell[0] + 0.5, cell[1] + 0.5];
        save.singletons.consumables.stock.screws = 50;
        save.singletons.progression.unlockedSkills = [
          ...new Set([
            ...(save.singletons.progression.unlockedSkills ?? []),
            "fineShelving",
          ]),
        ];
        (window as any).__UPDATE_GAME_STATE__(save);
      });

      await page.keyboard.press("Tab");
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                (window as any).game.entities.getById("benchDive").openBenchKey,
            ),
          { timeout: 10_000 },
        )
        .not.toBeNull();

      // The pile in the corner spreads the drawer; pulling a sheet is
      // selecting the plan, and its outlines land on the bench.
      await page.getByTestId("blueprint-corner").click();
      await page
        .locator("[data-mode-option]", { hasText: "Build Shelf" })
        .first()
        .click();
      await page.getByTestId("pull-plan").click();

      const build = () =>
        page.evaluate(() => {
          const view = [...(window as any).game.entities.all].find(
            (e: any) => typeof e.assemblyProgress === "function",
          );
          const stage = [...(window as any).game.entities.all].find(
            (e: any) => typeof e.piecePoints === "function",
          );
          return {
            progress: view.assemblyProgress(),
            slots: view.slotPoints(),
            fasteners: view.fastenerPoints(),
            pieces: stage.piecePoints(),
          };
        });
      await expect
        .poll(async () => (await build()).progress?.slots ?? 0, {
          timeout: 10_000,
        })
        .toBe(2);

      // Lay the plank flat on its outline, then tip the cleat up on its
      // long edge (F) and lay that on its thin one.
      for (const [id, tipUp] of [
        ["spec-plank", false],
        ["spec-cleat", true],
      ] as const) {
        const state = await build();
        const slot = state.slots[0];
        let piece = state.pieces.find((p: any) => p.id === id);
        expect(piece).toBeTruthy();
        if (tipUp) {
          await page.mouse.move(piece.x, piece.y);
          await page.keyboard.press("KeyF");
          piece = (await build()).pieces.find((p: any) => p.id === id);
        }
        await page.mouse.move(piece.x, piece.y);
        await page.mouse.down();
        await page.mouse.move(slot.x, slot.y, { steps: 4 });
        await page.mouse.up();
      }
      await expect.poll(async () => (await build()).progress.seated).toBe(2);

      // The drill drives every armed crossing; the last one is the build.
      await page.getByTestId("bench-tool-drill").click();
      for (let screw = 0; screw < 8; screw++) {
        const state = await build();
        const point = state.progress ? state.fasteners[0] : null;
        if (!point) break;
        await page.mouse.click(point.x, point.y);
        await page.waitForTimeout(150);
      }
      const built = await page.evaluate(() => {
        const bench = (window as any).game.entities
          .getById("benchDive")
          .openBench();
        return {
          outputs: bench.state.outputMaterials.map((m: any) => m.type),
          inputs: bench.state.inputMaterials.length,
        };
      });
      expect(built.outputs).toEqual(["shelf"]);
      expect(built.inputs).toBe(0);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
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
