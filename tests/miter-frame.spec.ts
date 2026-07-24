import { test, expect } from "@playwright/test";
import {
  machineCard,
  openStationSheet,
  selectMode,
  setParameter,
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
  await page.waitForTimeout(300);
}

/** Wait until some material anywhere in the shop satisfies the predicate. */
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
    await page.waitForTimeout(300);

    await test.step("mitered stock announces its ends in the inventory", async () => {
      await expect(
        page
          .locator("li", { hasText: "Walnut 1/4 — 1\" × 2'" })
          .filter({ hasText: "45° both ends" })
          .first(),
      ).toBeVisible();
    });

    await test.step("the saw exposes the cut line and head angle, nothing more", async () => {
      // The saw's scales live on its station sheet
      await openStationSheet(page);
      const card = machineCard(page, "Miter Saw");
      await expect(card.getByRole("radiogroup", { name: "Angle" })).toBeVisible();
      await expect(
        card.getByRole("radiogroup", { name: "Cut Line" }),
      ).toBeVisible();
      // The old recipe-flavored scales are gone: the board's position under
      // the blade decides both pieces at once
      await expect(
        card.getByRole("radiogroup", { name: "Cut End" }),
      ).toHaveCount(0);
      await expect(
        card.getByRole("radiogroup", { name: "Target Length" }),
      ).toHaveCount(0);
    });

    await test.step("first cut: 45° at the 5' mark makes a 5' and a 3' piece", async () => {
      await setParameter(page, "Miter Saw", "Angle", "45");
      await setParameter(page, "Miter Saw", "Cut Line", "5");
      // The slide widget reads out the pieces this cut would make
      await expect(
        machineCard(page, "Miter Saw").getByText("5′"),
      ).toBeVisible();
      await expect(
        machineCard(page, "Miter Saw").getByText("3′"),
      ).toBeVisible();
      // No load step: the saw cuts the carried board the line lands inside
      // (the finished rails are too short — only the 8' stock reaches)
      await machineCard(page, "Miter Saw")
        .getByRole("button", { name: "Cut" })
        .click();
      await waitForMaterial(
        page,
        "m.type === 'board' && m.length === 5 && m.ends && m.ends.right.kind === 'mitered' && m.ends.left.kind === 'square'",
      );
      await machineCard(page, "Miter Saw")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
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
      await setParameter(page, "Miter Saw", "Angle", "-45");
      await setParameter(page, "Miter Saw", "Cut Line", "3");
      // The 5' half-mitered piece is the only carried board past the line
      await machineCard(page, "Miter Saw")
        .getByRole("button", { name: "Cut" })
        .click();
      await waitForMaterial(
        page,
        "m.type === 'board' && m.length === 2 && m.ends && m.ends.left.kind === 'mitered' && m.ends.right.kind === 'mitered'",
      );
      await machineCard(page, "Miter Saw")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
    });

    await test.step("four rails and four nails become a walnut picture frame", async () => {
      await movePlayerTo(page, [3, 2]);
      await selectMode(page, "Makeshift Workbench", "Build Picture Frame");
      for (let i = 0; i < 4; i++) {
        await page
          .locator("li", { hasText: "45° both ends" })
          .first()
          .getByRole("button", { name: "→ Makeshift Workbench" })
          .click();
        await page.waitForTimeout(200);
      }
      await machineCard(page, "Makeshift Workbench")
        .getByRole("button", { name: "Operate" })
        .click();
      await waitForMaterial(page, "m.type === 'pictureFrame'");
      await machineCard(page, "Makeshift Workbench")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      await expect(page.getByText("Picture Frame").first()).toBeVisible();
      // The brads came out of the shop stock
      const nails = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().consumables.nails,
      );
      expect(nails).toBe(6);
    });
  });
});
