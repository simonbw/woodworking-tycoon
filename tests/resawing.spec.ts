import { expect, test } from "@playwright/test";
import { openStationSheet, runUntilOutput, takeAllHere } from "./machine-panel";

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

async function pressKey(page: any, key: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press(key);
  await page.waitForTimeout(30);
}

/** E — at a switched-off machine the interact key flips the switch. */
const switchOn = (page: any) => pressKey(page, "e");

/** F — set the carried stock down on the machine you're standing at. */
const setStockDown = (page: any) => pressKey(page, "f");

/** Every board the player is holding, as plain data. */
async function boardsInHand(page: any) {
  return page.evaluate(() =>
    (window as any)
      .__GET_GAME_STATE__()
      .player.inventory.filter((m: any) => m.type === "board")
      .map((b: any) => ({
        thickness: b.thickness,
        width: b.width,
        jointedFaces: b.jointedFaces,
        jointedEdges: b.jointedEdges,
        surface: b.surface,
      })),
  );
}

test.describe("Resawing (band saw and the tall fence)", () => {
  test("splits blanks on the band saw, and again on the table saw", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    // The manual greets a new game and holds the keyboard until dismissed
    const manual = page.getByRole("dialog", { name: "Shop manual" });
    await manual.waitFor();
    await page.keyboard.press("Escape");
    await manual.waitFor({ state: "detached" });

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(() => fixtures["resaw-shop"]);
    });
    await page.waitForTimeout(30);

    await test.step("the band saw wears its fence setting in quarters", async () => {
      await expect(page.getByText("Band Saw · off")).toBeVisible();
      await switchOn(page);
      await expect(page.getByText("Band Saw · on")).toBeVisible();
      // The fence reads in quarters, not inches — it's a thickness
      await expect(page.getByText("fence:")).toBeVisible();
      await expect(page.getByText("4/4", { exact: false }).first()).toBeVisible();
    });

    await test.step("one 8/4 blank comes off as two 4/4 boards", async () => {
      await setStockDown(page);
      await runUntilOutput(
        page,
        "(m) => m.type === 'board' && m.thickness === 4",
      );
      // Both halves stay on the saw table — you were holding them
      await takeAllHere(page);
      const halves = (await boardsInHand(page)).filter(
        (b: any) => b.thickness === 4,
      );
      expect(halves).toHaveLength(2);
      // Nothing was planed away: the kerf disappears at this granularity
      for (const half of halves) {
        // The sawn face is rough, and neither piece is two-faced any more
        expect(half.surface).toBe("rough");
        expect(half.jointedFaces).toBe(1);
        // Edges and width were never touched
        expect(half.jointedEdges).toBe(2);
        expect(half.width).toBe(6);
      }
    });

    await test.step("mounting the tall fence takes ripping off the table saw", async () => {
      await movePlayerTo(page, [8, 4]);
      await switchOn(page);
      await expect(page.getByText("Jobsite Table Saw · on")).toBeVisible();
      // Bare, the saw's one setting is the rip fence, in inches
      await expect(page.getByText("target width:")).toBeVisible();

      await openStationSheet(page);
      await page
        .locator("li", { hasText: "Tall Resaw Fence (stored)" })
        .getByRole("button", { name: "Attach" })
        .click();
      await page.waitForTimeout(30);
      await pressKey(page, "Escape");

      // A board can't lie flat against a 14"-tall fence: the rip is gone,
      // and the setting that's left reads in quarters
      await expect(page.getByText("target width:")).toHaveCount(0);
      await expect(page.getByText("fence:")).toBeVisible();
    });

    await test.step("the table saw pays a kerf the band saw didn't", async () => {
      // The untouched blank has been in the player's pocket all along —
      // it's the first board in hand, so it's the one that goes on the table
      await setStockDown(page);
      await runUntilOutput(
        page,
        "(m) => m.type === 'board' && m.thickness === 3",
      );
      // Feed-through machine: the pieces are waiting at the outfeed
      await movePlayerTo(page, [8, 0]);
      await takeAllHere(page);
      const thicknesses = (await boardsInHand(page))
        .map((b: any) => b.thickness)
        .sort();
      // The two 4/4 halves the band saw made, plus this saw's 4/4 and a
      // 3/4 offcut — the missing quarter inch left as dust
      expect(thicknesses).toEqual([3, 4, 4, 4]);
    });
  });
});
