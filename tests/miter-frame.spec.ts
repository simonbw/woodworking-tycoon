import { test, expect } from "@playwright/test";
import {
  machineCard,
  runWhileHolding,
  selectMode,
  takeAllHere,
} from "./machine-panel";

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

/** Wait until some material anywhere in the shop satisfies the predicate. */
async function pressKey(page: any, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press(key);
  await page.waitForTimeout(30);
}

/** F — set the carried board on the saw table. */
const setStockDown = (page: any) => pressKey(page, "f");

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

async function sawSetting(page: any, key: string) {
  return page.evaluate(
    (param: string) =>
      (window as any)
        .__GET_GAME_STATE__()
        .machines.find((m: any) => m.machineTypeId === "miterSaw")
        ?.selectedParameters?.[param],
    key,
  );
}

/** R swings the head; Shift+R swings it back. Steps to the wanted stop. */
async function setAngle(page: any, target: number) {
  for (let i = 0; i < 16; i++) {
    if ((await sawSetting(page, "angle")) === target) return;
    await pressKey(page, target < 0 ? "Shift+r" : "r");
  }
  throw new Error(`could not swing the head to ${target}`);
}

/** Z/X slide the board along the cut line. Steps to the wanted mark. */
async function setCutLine(page: any, target: number) {
  for (let i = 0; i < 16; i++) {
    const current = await sawSetting(page, "cutPosition");
    if (current === target) return;
    await pressKey(page, Number(current) > target ? "z" : "x");
  }
  throw new Error(`could not slide the cut line to ${target}`);
}

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

test.describe("Miter cuts and the picture frame", () => {
  test("sets the angle stops, miters a rail, and builds the frame", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(() => fixtures["miter-frame-shop"]);
    });
    await page.waitForTimeout(30);

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
  });
});
