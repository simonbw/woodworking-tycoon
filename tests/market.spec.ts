import { expect, Page, test } from "@playwright/test";
import {
  closeRecipeIndex,
  machineCard,
  modesOf,
  openRecipeIndex,
  selectMode,
} from "./machine-panel";
import {
  advanceTicks,
  checkOutAndLeaveStore,
  goToStore,
  movePlayerToCab,
  movePlayerToStand,
  openTruckMenu,
  pickUpFromShelf,
  startNewGame,
} from "./navigation";

/**
 * Selling, supplying, and sounding.
 *
 * Three things the shop does that aren't making something: setting work
 * out on the for-sale stand and watching it sell, keeping the supply
 * cabinet stocked off the store's aisle, and the audio bridge that turns
 * a game event into a fetched clip. They share a browser because none of
 * them needs a shop full of machines — a shelf on the table, a tin of
 * nails, and a queued cue are enough.
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
}

async function queueCue(page: Page, cue: Record<string, string>) {
  await page.evaluate((c) => {
    (window as any).__UPDATE_GAME_STATE__((s: any) => ({
      ...s,
      pendingSounds: [c],
    }));
  }, cue);
}

test.describe("Selling, supplies, and sound", () => {
  test("sells off the stand, stocks the cabinet, and plays its cues", async ({
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

    await test.step("hand the player a shelf and a raw board", async () => {
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: {
            ...state.player,
            inventory: [
              { id: "e2e-shelf", type: "rusticShelf", species: "pallet" },
              {
                id: "e2e-board",
                type: "board",
                species: "pallet",
                length: 36,
                width: 4,
                thickness: 3,
                surface: "rough",
                jointedFaces: 0,
                jointedEdges: 0,
              },
            ],
          },
        }));
      });
      await page.waitForTimeout(30);
    });

    await test.step("the stand offers to take the shelf, and F sets it out", async () => {
      await movePlayerToStand(page);
      const chips = page.getByTestId("stand-chips");
      await expect(chips).toBeVisible();
      await expect(chips).toContainText("set out for sale");
      await page.keyboard.press("f");
      await page.waitForTimeout(30);
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.stand.length).toBe(1);
      expect(state.stand[0].type).toBe("rusticShelf");
      // The raw board stays in hand: nobody pays for unworked wood, and
      // with only it left the chip stops offering to set anything out
      expect(state.player.inventory.length).toBe(1);
      await expect(chips).not.toContainText("set out for sale");
    });

    await test.step("E takes the piece back, and F puts it out again", async () => {
      const chips = page.getByTestId("stand-chips");
      await expect(chips).toContainText(/take back/i);
      await page.keyboard.press("e");
      await page.waitForTimeout(30);
      let state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.stand.length).toBe(0);
      expect(
        state.player.inventory.some((m: any) => m.type === "rusticShelf"),
      ).toBe(true);
      await page.keyboard.press("f");
      await page.waitForTimeout(30);
      state = await page.evaluate(() => (window as any).__GET_GAME_STATE__());
      expect(state.stand.length).toBe(1);
    });

    await test.step("a passerby buys it, wherever the player is standing", async () => {
      // Walk back inside so the payoff proves itself away from the stand.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: { ...state.player, position: [6, 12] },
        }));
      });
      const before = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      // Sales roll real dice, so feed the street ticks until one lands —
      // a stocked stand draws a buyer well inside a morning. Small
      // batches, restamping the morning so night never stops the foot
      // traffic, and stopping the moment the money moves so the reward
      // flight is still in the air below.
      for (let i = 0; i < 40; i++) {
        const sold = await page.evaluate(() => {
          const s = (window as any).__GET_GAME_STATE__();
          return s.progression.salesCompleted > 0;
        });
        if (sold) break;
        await page.evaluate(() => {
          (window as any).__UPDATE_GAME_STATE__((state: any) => ({
            ...state,
            dayStartTick: state.tick,
          }));
        });
        await advanceTicks(page, 25);
      }
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.progression.salesCompleted).toBe(1);
      expect(state.stand.length).toBe(0);
      // Sold at fair value ($12), with word of the work spreading
      expect(state.money).toBe(before.money + 12);
      expect(state.reputation).toBeGreaterThan(before.reputation);
      // The first sale is the first payday: the store unlocks off it
      expect(state.progression.storeUnlocked).toBe(true);
    });

    await test.step("the sale flies its rewards to the readouts", async () => {
      // The flight is decoration over settled money: chips burst from
      // mid-screen and land on the balance and reputation readouts.
      const flights = page.getByTestId("reward-flights");
      await expect(flights.locator(".reward-chip").first()).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("[data-reward-target='money']")).toBeVisible();
      await expect(
        page.locator("[data-reward-target='reputation']"),
      ).toBeVisible();
      // The queue drains once staged, and the chips land and clear
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              ((window as any).__GET_GAME_STATE__().pendingPayouts ?? [])
                .length,
          ),
        )
        .toBe(0);
      await expect(flights.locator(".reward-chip")).toHaveCount(0, {
        timeout: 10000,
      });
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
      // Damaged: 5-8 of the eight deck boards
      for (const pallet of pallets) {
        const deckCount = pallet.deckBoards.filter(Boolean).length;
        expect(deckCount).toBeGreaterThanOrEqual(5);
        expect(deckCount).toBeLessThanOrEqual(8);
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
      // The shortfall reads right on the pulled drawing's title block,
      // set out in the plan drawer (which opens back onto the pulled
      // drawing) — there is no separate supplies row or run hint
      const card = machineCard(page, "Makeshift Workbench");
      await openRecipeIndex(card);
      await expect(page.getByText("8 nails (have 0)")).toBeVisible();
      await closeRecipeIndex(page, card);
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
      // The panel appears folded to its header; open it to read the rows
      await suppliesCard.getByRole("button", { name: "Supplies" }).click();
      await expect(suppliesCard.getByText("Nails")).toBeVisible();
      await expect(suppliesCard.getByText("8", { exact: true })).toBeVisible();
      // And the shortfall line on the pulled drawing clears — reopen the
      // plan drawer to read it
      const card = machineCard(page, "Makeshift Workbench");
      await openRecipeIndex(card);
      await expect(page.getByText("8 nails (have 8)")).toBeVisible();
      await closeRecipeIndex(page, card);
    });

    await test.step("the store's supplies aisle sells packs", async () => {
      const returnTo = await goToStore(page);
      // The aisle sign shows from anywhere; a bay's tag appears at it
      await expect(page.getByText("Supplies", { exact: true })).toBeVisible();
      await pickUpFromShelf(page, "Mineral Oil Bottle");
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
