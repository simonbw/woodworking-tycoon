import { expect, Page, test } from "@playwright/test";
import { selectMode } from "./machine-panel";
import {
  closePhone,
  goToStore,
  deliverFromTruck,
  leaveStore,
  movePlayerToCab,
  openTruckMenu,
  openPhone,
  startNewGame,
} from "./navigation";

/**
 * Selling, supplying, and sounding.
 *
 * Three things the shop does that aren't making something: putting work on the
 * phone and watching it sell, keeping the supply cabinet stocked off the
 * store's aisle, and the audio bridge that turns a game event into a fetched
 * clip. They share a browser because none of them needs a shop full of
 * machines — a listing, a tin of nails, and a queued cue are enough.
 *
 * The sound half goes last: it drives cues straight into `pendingSounds`, and
 * it wants a game with no work in flight emitting cues of its own.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** The workspace's spec-sheet card. */
function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Makeshift Workbench" });
}

async function bootShopCountingAudio(page: Page) {
  // Count every clip the page actually starts playing. Footsteps are
  // preloaded, so their fetch proves nothing about playback — but a fresh
  // shop with no machines running plays nothing at all until the player
  // does something, which makes the count a clean signal.
  await page.addInitScript(() => {
    (window as any).__SOURCES_STARTED__ = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (
      this: AudioBufferSourceNode,
      ...args: unknown[]
    ) {
      (window as any).__SOURCES_STARTED__++;
      return (start as any).apply(this, args);
    };
  });
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("main");
  // A real click also unlocks the AudioContext, which playback depends on.
  await startNewGame(page);
  await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
  // Dismiss the shop manual's one-time welcome so it can't cover the UI.
  const manual = page.getByRole("dialog", { name: "Shop manual" });
  await manual.waitFor();
  await page.keyboard.press("Escape");
  await manual.waitFor({ state: "detached" });
}

async function queueCue(page: Page, cue: Record<string, string>) {
  await page.evaluate((c) => {
    (window as any).__UPDATE_GAME_STATE__((s: any) => ({
      ...s,
      pendingSounds: [c],
    }));
  }, cue);
}

test.describe("Market, supplies, and sound", () => {
  test("lists and sells, stocks the cabinet, and plays its cues", async ({
    page,
  }) => {
    test.setTimeout(300000);

    // Anything the page logs as an error — the sound half asserts silence.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    // Every clip the page fetches, for the sound half at the end.
    const requested: string[] = [];
    page.on("request", (req) => {
      const m = req.url().match(/\/sounds\/([^/?]+\.ogg)/);
      if (m) requested.push(m[1]);
    });

    await page.goto("/");
    await startNewGame(page);
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    const manual = page.getByRole("dialog", { name: "Shop manual" });
    if (await manual.count()) {
      await page.keyboard.press("Escape");
      await manual.waitFor({ state: "detached" });
    }
    await page.waitForTimeout(500);

    await test.step("locked before the marketplace unlocks", async () => {
      await expect(
        page.getByRole("button", { name: "Phone" }),
      ).not.toBeVisible();
      // Nothing to walk out for yet either: no door panel in a fresh game
      await movePlayerToCab(page);
      await expect(page.getByTestId("truck-panel")).not.toBeVisible();
    });

    await test.step("load marketplace fixture", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["marketplace-shop"],
        );
      });
      await page.waitForTimeout(30);
      await expect(page.getByRole("button", { name: "Phone" })).toBeVisible();
    });

    await test.step("list a shelf at fair value", async () => {
      await openPhone(page);
      await expect(
        page.getByText("SawdustList", { exact: true }),
      ).toBeVisible();

      // The shelf row in "List an item" is pre-priced at fair value ($60)
      await page
        .locator("li", { hasText: /Rustic/i })
        .getByRole("button", { name: "List" })
        .click();
      // A fairly priced listing can legitimately sell within a tick or two,
      // so accept either "listed" or "already sold" here
      await page.waitForFunction(
        () => {
          const s = (window as any).__GET_GAME_STATE__();
          return s.listings.length === 1 || s.money === 160;
        },
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      if (state.listings.length === 1) {
        expect(state.listings[0].askingPrice).toBe(60);
        // Listing boxes the item up: it leaves the inventory unpaid
        expect(state.money).toBe(100);
      }
      expect(
        state.player.inventory.some((m: any) => m.type === "rusticShelf"),
      ).toBe(false);
    });

    await test.step("a fairly priced listing sells within the pity window", async () => {
      // Fast-forward past the pity window rather than waiting out the roll
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) =>
          state.listings.length === 0
            ? state
            : {
                ...state,
                tick: state.listings[0].listedAtTick + 2 * 600,
              },
        );
      });
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().money === 160,
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.listings.length).toBe(0);
      // The buyer left a review
      expect(state.reputation).toBeGreaterThan(5);
    });

    await test.step("job board fills with producible offers", async () => {
      await page.getByRole("button", { name: "Job Board" }).click();
      // The tick pass fills an empty board once the marketplace is unlocked
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().jobBoard.length >= 3,
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      // The income floor: always at least one zero-material-cost job
      expect(state.jobBoard.some((offer: any) => offer.materialCostFree)).toBe(
        true,
      );
      await expect(
        page.getByRole("button", { name: "Accept" }).first(),
      ).toBeVisible();
    });

    await test.step("accept and deliver a job", async () => {
      // Deterministic setup: swap the board for a known shelf job and put
      // the deliverable in the player's hands
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          jobBoard: [
            {
              id: "job-e2e",
              name: "E2E Tester",
              description: "Wants a rustic shelf.",
              requiredMaterials: [
                { type: ["rusticShelf"], species: ["pallet"], quantity: 1 },
              ],
              basePay: 100,
              baseReputation: 1,
              postedAtTick: state.tick,
              materialCostFree: true,
            },
          ],
          player: {
            ...state.player,
            inventory: [
              ...state.player.inventory,
              { id: "e2e-shelf", type: "rusticShelf", species: "pallet" },
            ],
          },
        }));
      });
      await page.waitForTimeout(30);

      await page
        .locator("li", { hasText: "E2E Tester" })
        .getByRole("button", { name: "Accept" })
        .click();
      await page.waitForTimeout(30);
      const accepted = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().acceptedJobs.length,
      );
      expect(accepted).toBe(1);

      // The phone takes the order but can't complete it — delivery is a
      // drive, with the goods loaded in the truck's bed
      await expect(page.locator("li", { hasText: "E2E Tester" })).toContainText(
        "truck",
      );
      await expect(
        page.locator("li", { hasText: "E2E Tester" }).getByRole("button", {
          name: "Deliver",
        }),
      ).toHaveCount(0);

      const moneyBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      await closePhone(page);
      await deliverFromTruck(page, "E2E Tester");

      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.acceptedJobs.length).toBe(0);
      // Base pay plus a fresh tip: $100 base + up to 40% tip
      expect(state.money).toBeGreaterThan(moneyBefore + 100);
      expect(
        state.player.inventory.some((m: any) => m.id === "e2e-shelf"),
      ).toBe(false);
      // A job is routine work: money flies, but no client card to dismiss
      await expect(page.getByTestId("client-card")).not.toBeVisible();
    });

    await test.step("scavenging trip starts at the truck's cab", async () => {
      await movePlayerToCab(page);
      await openTruckMenu(page);
      await page
        .getByTestId("truck-panel")
        .locator("li", { hasText: "Scavenge for pallets" })
        .getByRole("button", { name: "Go" })
        .click({ force: true });
      await page.waitForTimeout(30);

      // The trip covers the screen with a travel log: a route map and
      // field notes that fill in as the trip progresses
      await expect(page.getByTestId("scavenge-trip")).toBeVisible();
      await expect(page.getByText(/Out scavenging/)).toBeVisible();
      await expect(page.getByTestId("scavenge-log")).toContainText(
        /Headed out/,
      );

      const bedBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().truck.bed.length,
      );

      // Fast-forward most of the trip: every stop has been visited, so the
      // log now records the haul (always at least one pallet)
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          tick: state.player.away.returnTick - 25,
        }));
      });
      await expect(page.getByTestId("scavenge-log")).toContainText(/score!/);
      await expect(page.getByTestId("scavenge-log")).toContainText(
        /heading home/,
      );

      // Fast-forward to the return tick instead of waiting 30s
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          tick: state.player.away.returnTick,
        }));
      });

      // Next real tick resolves the trip
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().player.away === null,
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      // The haul comes home in the truck's bed, not onto the shop floor
      expect(state.truck.bed.length).toBeGreaterThan(bedBefore);
      const pallets = state.truck.bed.filter(
        (material: any) => material.type === "pallet",
      );
      expect(pallets.length).toBeGreaterThanOrEqual(1);
      expect(pallets.length).toBeLessThanOrEqual(2);
      // Damaged: 6-11 deck boards
      for (const pallet of pallets) {
        const deckCount = pallet.deckBoards.filter(Boolean).length;
        expect(deckCount).toBeGreaterThanOrEqual(6);
        expect(deckCount).toBeLessThanOrEqual(11);
      }
      // Back home beside the cab, the errand is on offer again
      await openTruckMenu(page);
      await expect(
        page.getByTestId("truck-panel").getByText("Scavenge for pallets"),
      ).toBeVisible();
    });

    await test.step("load the consumables shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["consumables-shop"],
        );
      });
      await page.waitForTimeout(30);
    });

    await test.step("shelf recipe shows its nail shortfall", async () => {
      await selectMode(
        page,
        "Makeshift Workbench",
        "Build Rustic Pallet Shelf",
      );
      await expect(page.getByText("8 nails (have 0)")).toBeVisible();
      // Nothing to run without the nails — the sheet says so where the
      // run button used to be
      await expect(
        workspaceCard(page).getByText("Load the bay to run it"),
      ).toBeVisible();
      // The sidebar supply cabinet stays hidden while everything is at zero
      await expect(page.getByText("Supplies", { exact: true })).toBeHidden();
    });

    await test.step("the cabinet appears once there's stock, and the count reads", async () => {
      // Salvaging the nails is the sequence test's job; what's on trial here
      // is the cabinet appearing and the readout following the count.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          consumables: { ...state.consumables, nails: 8 },
        }));
      });
      await page.waitForTimeout(30);
      const suppliesCard = page
        .locator("section", { hasText: /^Supplies/ })
        .first();
      await expect(suppliesCard.getByText("Nails")).toBeVisible();
      await expect(suppliesCard.getByText("8", { exact: true })).toBeVisible();
      // And the recipe's shortfall line clears
      await expect(page.getByText("8 nails (have 8)")).toBeVisible();
    });

    await test.step("the store's supplies aisle sells packs", async () => {
      const returnTo = await goToStore(page);
      await expect(page.getByText("Supplies", { exact: true })).toBeVisible();
      await expect(page.getByText("Box of Nails")).toBeVisible();
      await expect(page.getByText("Mineral Oil Bottle")).toBeVisible();

      await page
        .locator("li", { hasText: "Mineral Oil Bottle" })
        .getByRole("button", { name: "Buy" })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("16 oz in shop")).toBeVisible();
      const money = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      expect(money).toBe(10);
      await leaveStore(page, returnTo);
    });

    await test.step("the oil recipe reads its cost against the bottle", async () => {
      await selectMode(page, "Makeshift Workbench", "Oil Cutting Board");
      await expect(page.getByText("4 oz Mineral Oil (have 16)")).toBeVisible();
    });

    await test.step("start a clean game for the sound half", async () => {
      await bootShopCountingAudio(page);
    });

    await test.step("the footstep clip is served", async () => {
      // The layer warms it on mount, so a clip that was renamed or never
      // committed shows up here rather than as a silent walk.
      await expect
        .poll(() => [...new Set(requested.filter((f) => /^footstep/.test(f)))])
        .toEqual(["footstep.ogg"]);
    });

    await test.step("walking the floor plays footsteps", async () => {
      // Whatever the clicks that started the game already played.
      const before = await page.evaluate(
        () => (window as any).__SOURCES_STARTED__,
      );
      await page.keyboard.down("w");
      // Several strides' worth of walking, so this can't pass on one step.
      await expect
        .poll(
          async () =>
            await page.evaluate(() => (window as any).__SOURCES_STARTED__),
        )
        .toBeGreaterThan(before + 2);
      await page.keyboard.up("w");
    });

    await test.step("standing still is silent", async () => {
      const settled = await page.evaluate(
        () => (window as any).__SOURCES_STARTED__,
      );
      await page.waitForTimeout(500);
      expect(
        await page.evaluate(() => (window as any).__SOURCES_STARTED__),
      ).toBe(settled);
    });

    await test.step("an operation cue fetches that operation's clip", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "dismantlePallet",
      });
      await expect.poll(() => requested).toContain("pallet-dismantle.ogg");
    });

    await test.step("the queue is drained after playing", async () => {
      await expect
        .poll(async () =>
          page.evaluate(
            () => (window as any).__GET_GAME_STATE__().pendingSounds.length,
          ),
        )
        .toBe(0);
    });

    await test.step("machines with a continuous voice complete silently", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "ripBoard",
      });
      // Drained means it was mapped (to silence) — then prove a later cue
      // still plays, so the silent one had its chance to fetch and didn't.
      await expect
        .poll(async () =>
          page.evaluate(
            () => (window as any).__GET_GAME_STATE__().pendingSounds.length,
          ),
        )
        .toBe(0);
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "glueUpPanel",
      });
      await expect.poll(() => requested).toContain("glue-clamp.ogg");
      expect(requested).not.toContain("table-saw-rip.ogg");
    });

    await test.step("a tool operation sounds like the tool, not the bench", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "orbitSandPanel",
      });
      await expect.poll(() => requested).toContain("orbital-sander.ogg");
    });

    await test.step("an unmapped operation falls back to the generic clip", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "someFutureOperation",
      });
      await expect.poll(() => requested).toContain("assembly-mallet.ogg");
    });

    await test.step("the commission reward stinger plays", async () => {
      await queueCue(page, { kind: "commission-complete" });
      await expect.poll(() => requested).toContain("commission-complete.ogg");
    });

    await test.step("material handling cues play", async () => {
      await queueCue(page, { kind: "material-pickup" });
      await expect.poll(() => requested).toContain("material-pickup.ogg");
    });

    await test.step("no console errors from audio", async () => {
      expect(consoleErrors).toEqual([]);
    });
  });
});
