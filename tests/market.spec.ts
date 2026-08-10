import { expect, Page, test } from "@playwright/test";
import { modesOf, selectMode } from "./machine-panel";
import {
  advanceTicks,
  answerPhoneCall,
  checkOutAndLeaveStore,
  closePhone,
  goToStore,
  deliverFromTruck,
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
    // Music streams through an <audio> element that never enters the DOM
    // (see `musicTrack.ts`), so catch them as they're constructed.
    (window as any).__MUSIC_ELEMENTS__ = [];
    const RealAudio = window.Audio;
    (window as any).Audio = function (src?: string) {
      const el = new RealAudio(src);
      (window as any).__MUSIC_ELEMENTS__.push(el);
      return el;
    };
    (window as any).Audio.prototype = RealAudio.prototype;
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
      const m = req.url().match(/\/sounds\/([^/?]+\.(?:ogg|flac))/);
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

    await test.step("list both shelves at fair value as one offer", async () => {
      await openPhone(page);
      await expect(
        page.getByText("SawdustList", { exact: true }),
      ).toBeVisible();

      // Two identical shelves share one row in "List an item", pre-priced
      // at fair value ($12 each), and go up together
      const shelfRow = page.locator("li", { hasText: /Rustic/i });
      await expect(shelfRow).toHaveCount(1);
      // The pallet board riding along in the same inventory gets no row at
      // all — the marketplace only takes finished work
      await expect(
        page.locator("li", { hasText: /Pallet Wood/i }),
      ).toHaveCount(0);
      await shelfRow.getByRole("button", { name: "List ×2" }).click();
      // A fairly priced listing can legitimately sell within a tick or two,
      // so accept either "listed" or "already sold" here
      await page.waitForFunction(
        () => {
          const s = (window as any).__GET_GAME_STATE__();
          return s.listings.length === 1 || s.money === 124;
        },
        undefined,
        { timeout: 5000 },
      );
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      if (state.listings.length === 1) {
        expect(state.listings[0].askingPrice).toBe(12);
        // One stacked offer, not a row per shelf
        expect(state.listings[0].materials.length).toBe(2);
        // Listing boxes the items up: they leave the inventory unpaid
        expect(state.money).toBe(100);
      }
      expect(
        state.player.inventory.some((m: any) => m.type === "rusticShelf"),
      ).toBe(false);
    });

    await test.step("a fairly priced listing sells within the pity window", async () => {
      // Fast-forward past the pity window (two calendar days) rather
      // than waiting out the roll, then feed the tick that fires it —
      // an idle shop barely ticks on its own now.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) =>
          state.listings.length === 0
            ? state
            : {
                ...state,
                tick: state.listings[0].listedAtTick + 2 * 1440,
                // The jump would strand the shop deep in "night";
                // restamp the morning so the day's budget is fresh
                dayStartTick: state.listings[0].listedAtTick + 2 * 1440,
              },
        );
      });
      await advanceTicks(page, 1);
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().money === 124,
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

    await test.step("the phone rings when reputation reaches the next gate", async () => {
      // The next commission arrives at its reputation threshold — push the
      // shop over it and let the next tick's milestone pass ring the phone
      const gate = await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          reputation: 30,
        }));
        return 30;
      });
      expect(gate).toBe(30);
      await advanceTicks(page, 1);

      // The call is a takeover: the client's messages, and no way out but
      // through — Escape doesn't dismiss it
      const call = page.getByTestId("commission-call");
      await expect(call).toBeVisible();
      await expect(call).toContainText("Anton Reyes");
      await expect(call).toContainText("hardwood cutting boards");
      await page.keyboard.press("Escape");
      await expect(call).toBeVisible();
    });

    await test.step("accepting the call puts the order on the clipboard", async () => {
      await answerPhoneCall(page);
      await expect(page.getByTestId("commission-call")).toHaveCount(0);
      // The clipboard holds itself up with the new work order
      const clipboard = page.getByRole("dialog", { name: "Clipboard" });
      await expect(clipboard).toBeVisible();
      await expect(clipboard).toContainText("A Proper Cutting Board");
      await page.keyboard.press("Escape");
      await expect(clipboard).toHaveCount(0);
      // The tracker chip carries it from here, and the call stays answered
      await expect(page.getByTestId("commission-tracker")).toContainText(
        "A Proper Cutting Board",
      );
      const seen = await page.evaluate(
        () =>
          (window as any).__GET_GAME_STATE__().progression
            .commissionArrivalSeen,
      );
      expect(seen).toBe(true);
    });

    await test.step("scavenging trip starts at the truck's cab", async () => {
      await movePlayerToCab(page);
      await openTruckMenu(page);
      // The whole row is the control — no "Go" button beside it — so the
      // mouse takes the trip by clicking the row itself
      await page
        .getByTestId("truck-panel")
        .getByRole("button", { name: "Go: Scavenge for pallets" })
        .click();
      // Freeze the clock: a dev build's search legs are seconds long,
      // and each phase change below should happen on the spec's cue
      await page.evaluate(() => (window as any).__SET_PAUSED__(true));

      // The trip covers the screen with the truck (bed empty so far),
      // the day's clock, and the first stop's search already underway —
      // the drawing marked as driving while it runs
      await expect(page.getByTestId("scavenge-trip")).toBeVisible();
      await expect(page.getByText(/Out scavenging/)).toBeVisible();
      await expect(page.getByTestId("scavenge-stop-line")).toContainText(
        /Digging through/,
      );
      await expect(page.getByTestId("scavenge-truck")).toHaveAttribute(
        "data-driving",
        "true",
      );
      await expect(
        page.getByTestId("scavenge-trip").getByTestId("day-dial"),
      ).toBeVisible();
      await expect(page.getByTestId("scavenge-bed-count")).toContainText(
        /Nothing in the bed yet/,
      );

      const bedBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().truck.bed.length,
      );

      // Every trip's roll holds at least one find; move a found stop to
      // the front so the first search scores deterministically, then
      // jump the clock to the end of that search and let it run.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => {
          const trip = state.player.away;
          const found = trip.stops.filter((s: any) => s.pallet !== null);
          const empty = trip.stops.filter((s: any) => s.pallet === null);
          return {
            ...state,
            tick: trip.phase.doneTick,
            player: {
              ...state.player,
              away: { ...trip, stops: [...found, ...empty] },
            },
          };
        });
        (window as any).__SET_PAUSED__(false);
      });

      // The next tick reveals the stop: the find on the line, a pallet
      // in the bed, the truck parked, and a decision to make
      await expect(page.getByTestId("scavenge-stop-line")).toContainText(
        /score!/,
      );
      await expect(page.getByTestId("scavenge-truck")).toHaveAttribute(
        "data-driving",
        "false",
      );
      await expect(page.getByTestId("scavenge-bed-count")).toContainText(
        /1 pallet in the bed/,
      );
      await expect(page.getByTestId("scavenge-decision")).toBeVisible();
      const keepSearching = page.getByTestId("scavenge-keep-searching");
      await expect(keepSearching).toBeEnabled();

      // With too little daylight left for another stop, the option goes
      // dead with the reason written under it
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          dayStartTick: state.tick - 599,
        }));
      });
      await expect(keepSearching).toBeDisabled();
      await expect(page.getByText(/Not enough daylight/)).toBeVisible();

      // Fresh morning restored, another search goes ahead
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          dayStartTick: state.tick,
        }));
      });
      await expect(keepSearching).toBeEnabled();
      // Frozen again so the second search ends on cue, not on the clock
      await page.evaluate(() => (window as any).__SET_PAUSED__(true));
      await keepSearching.click();
      await expect(page.getByTestId("scavenge-stop-line")).toContainText(
        /Digging through/,
      );
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          tick: state.player.away.phase.doneTick,
        }));
        (window as any).__SET_PAUSED__(false);
      });
      // The panel is always on screen; its buttons coming alive is what
      // says the search finished and the truck is parked at a decision.
      const backToShop = page.getByTestId("scavenge-head-home");
      await expect(backToShop).toBeEnabled();

      // Good enough: back at the shop that instant, no time spent
      const tickBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().tick,
      );
      await page.evaluate(() => (window as any).__SET_PAUSED__(true));
      await backToShop.click();
      await page.waitForFunction(
        () => (window as any).__GET_GAME_STATE__().player.away === null,
        undefined,
        { timeout: 5000 },
      );
      expect(
        await page.evaluate(() => (window as any).__GET_GAME_STATE__().tick),
      ).toBe(tickBefore);
      await page.evaluate(() => (window as any).__SET_PAUSED__(false));
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
      // The shortfall reads right on the pulled drawing's title block —
      // there is no separate supplies row or run hint any more
      await expect(page.getByText("6 nails (have 0)")).toBeVisible();
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
      await expect(page.getByText("6 nails (have 8)")).toBeVisible();
    });

    await test.step("the store's supplies aisle sells packs", async () => {
      const returnTo = await goToStore(page);
      await expect(page.getByText("Supplies", { exact: true })).toBeVisible();
      await expect(page.getByText("Box of Nails")).toBeVisible();
      await expect(page.getByText("Mineral Oil Bottle")).toBeVisible();

      await page
        .locator("li", { hasText: "Mineral Oil Bottle" })
        .getByRole("button", { name: "Add Mineral Oil Bottle to cart" })
        .click();
      await page.waitForTimeout(30);
      // On the cart, not in the cabinet — the shelf tag still reads empty
      await expect(page.getByText("16 oz in shop")).toHaveCount(0);

      await checkOutAndLeaveStore(page, returnTo);
      const money = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().money,
      );
      expect(money).toBe(10);
    });

    await test.step("the oil wipe is the finishing kit's work, not a plan", async () => {
      // Its 4 oz bill is spent at the claim (covered in the sequence
      // tier); the plan pile only holds builds
      const modes = await modesOf(page, "Makeshift Workbench");
      expect(modes).not.toContain("Oil Cutting Board");
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

    await test.step("the phone-ring cue plays the notification clip", async () => {
      await queueCue(page, { kind: "phone-ring" });
      await expect.poll(() => requested).toContain("ui-notification.flac");
    });

    await test.step("material handling cues play", async () => {
      await queueCue(page, { kind: "material-pickup" });
      await expect.poll(() => requested).toContain("material-pickup.ogg");
    });

    await test.step("a scavenged find thuds into the truck's bed", async () => {
      await queueCue(page, { kind: "pallet-load" });
      await expect.poll(() => requested).toContain("pallet-load.ogg");
    });

    // Hold music is the only sound that isn't a decoded clip: a streamed
    // <audio> element on the music bus, driven by the wait verb rather than
    // by a cue. What the browser tier is for here is the real key hold and
    // the media element actually playing — the fade shape is `MusicTrack`'s
    // business.
    const holdMusic = () =>
      page.evaluate(() => {
        const el = ((window as any).__MUSIC_ELEMENTS__ as HTMLAudioElement[])
          .filter((e) => e.src.includes("hold-music"))
          .at(0);
        return el ? { paused: el.paused, at: el.currentTime } : null;
      });

    await test.step("a tap of the wait key doesn't start the music", async () => {
      await page.keyboard.press("t");
      await page.waitForTimeout(600);
      expect(await holdMusic()).toBeNull();
    });

    await test.step("holding the wait key plays hold music", async () => {
      await page.keyboard.down("t");
      await expect.poll(() => requested).toContain("hold-music.ogg");
      await expect.poll(holdMusic).toMatchObject({ paused: false });
      // Playing, not merely started: the position has to move.
      const { at } = (await holdMusic())!;
      await expect.poll(async () => (await holdMusic())!.at).toBeGreaterThan(at);
    });

    await test.step("letting go stops it where it stands", async () => {
      await page.keyboard.up("t");
      await expect.poll(async () => (await holdMusic())!.paused).toBe(true);
      // Paused, not rewound — the next wait picks the track back up.
      expect((await holdMusic())!.at).toBeGreaterThan(0);
    });

    await test.step("no console errors from audio", async () => {
      expect(consoleErrors).toEqual([]);
    });
  });
});
