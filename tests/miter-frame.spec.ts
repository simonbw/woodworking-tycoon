import { test, expect } from "@playwright/test";
import { machineCard, selectMode, setParameter } from "./machine-panel";

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
          .getByText("Walnut Board (2'x1\"x1/4, sanded, S4S, 45° both ends)")
          .first(),
      ).toBeVisible();
    });

    await test.step("the saw exposes angle, cut end, and length like a real setup", async () => {
      const card = machineCard(page, "Miter Saw");
      await expect(card.getByRole("radiogroup", { name: "Angle" })).toBeVisible();
      await expect(
        card.getByRole("radiogroup", { name: "Cut End" }),
      ).toBeVisible();
      await expect(
        card.getByRole("radiogroup", { name: "Target Length" }),
      ).toBeVisible();
    });

    await test.step("first cut: 45° at the left end miters the kept piece", async () => {
      await setParameter(page, "Miter Saw", "Angle", "45");
      await setParameter(page, "Miter Saw", "Target Length", "5");
      // No load step: the saw cuts the carried board that fits the setup
      // (the finished rails are already at length — only the 8' stock is)
      await machineCard(page, "Miter Saw")
        .getByRole("button", { name: "Cut" })
        .click();
      await waitForMaterial(
        page,
        "m.type === 'board' && m.length === 5 && m.ends && m.ends.left.kind === 'mitered' && m.ends.right.kind === 'square'",
      );
      await machineCard(page, "Miter Saw")
        .getByRole("button", { name: /Take All/ })
        .click();
      await page.waitForTimeout(200);
      await expect(
        page
          .getByText("Walnut Board (5'x1\"x1/4, sanded, S4S, 45° one end)")
          .first(),
      ).toBeVisible();
    });

    await test.step("second cut: flip to the right end to finish the rail", async () => {
      await setParameter(page, "Miter Saw", "Cut End", "right");
      await setParameter(page, "Miter Saw", "Target Length", "2");
      // The 5' half-mitered rail is the only carried board longer than 2'
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
