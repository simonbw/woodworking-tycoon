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
  test("boots a walkable shop with a following camera", async ({ page }) => {
    // One long test, growing a step per ported system: the default 30s
    // budget was already nearly spent before the phase-5 steps arrived.
    test.setTimeout(60_000);
    await page.goto("/engine.html");
    await page.waitForFunction(() => Boolean((window as any).game), null, {
      timeout: 15_000,
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
  });
});
