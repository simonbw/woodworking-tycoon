/**
 * Helpers for the diegetic navigation surfaces: the journal overlay
 * (top-bar button) and trips out via the truck (the trip card that
 * appears when the player stands at the cab).
 */

import { truckCabSideCell } from "../src/game/lot";
import { standRect } from "../src/game/stand";

/**
 * Start a fresh shop from the title screen.
 *
 * The shop autosaves as it runs, so any spec that starts a second game in
 * the same context — the fat specs swap fixtures by rebooting halfway —
 * finds a save already sitting there and gets the "Clear the shop?" card.
 * Always going through here means a spec never has to care which half it's
 * in.
 */
export async function startNewGame(page: any) {
  await page.getByRole("button", { name: "New Game" }).click();
  const confirmPanel = page.getByTestId("new-game-confirm");
  if (await confirmPanel.isVisible().catch(() => false)) {
    await page.getByTestId("confirm-new-game").click();
  }
  await confirmPanel.waitFor({ state: "hidden" }).catch(() => {});
}

/** Teleport the player beside the for-sale stand so its chips appear. */
export async function movePlayerToStand(page: any) {
  const shopInfo = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().shopInfo,
  );
  const rect = standRect(shopInfo);
  const cell = [
    Math.floor((rect.min[0] + rect.max[0]) / 2),
    Math.floor(rect.min[1]) - 1,
  ];
  await page.evaluate((position: number[]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position },
    }));
  }, cell);
  await page.waitForTimeout(30);
}

/** Teleport the player beside the truck's cab so its prompt appears. */
export async function movePlayerToCab(page: any) {
  // Where the driver's door is comes from the same geometry the game
  // uses, so moving the trigger zone never leaves the specs standing in
  // the wrong patch of grass.
  const shopInfo = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().shopInfo,
  );
  const cell = truckCabSideCell(shopInfo);
  await page.evaluate((position: number[]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position },
    }));
  }, cell);
  await page.waitForTimeout(30);
}

/**
 * Spread open the truck's trip card (E at the cab). The interact key
 * serves nearer things first, so this presses through until the cab
 * answers.
 */
export async function openTruckMenu(page: any) {
  const panel = page.getByTestId("truck-panel");
  for (let tries = 0; tries < 4; tries++) {
    if (await panel.isVisible()) break;
    await page.evaluate(() =>
      (document.activeElement as HTMLElement)?.blur?.(),
    );
    await page.keyboard.press("e");
    await page.waitForTimeout(250);
  }
  await panel.waitFor({ state: "visible" });
  await page.waitForTimeout(30);
}

/**
 * Take a row on the open truck card by pressing its number key. The card
 * is anchored to the truck in the world and glides while the camera
 * settles after a teleport, so pointer clicks on its buttons race the
 * motion (force-clicks dispatch at a point the button has already left).
 * The digits answer to the rows wherever the card happens to be.
 */
export async function pressTruckRow(page: any, rowText: string | RegExp) {
  const row = page
    .getByTestId("truck-panel")
    .locator("li", { hasText: rowText });
  await row.waitFor({ state: "visible" });
  const label = (await row.textContent()) ?? "";
  const digit = label.match(/\d+/)?.[0];
  if (!digit) {
    throw new Error(`No row number found in truck row "${label}"`);
  }
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press(digit);
  await page.waitForTimeout(30);
}

/**
 * Load everything in hand into the truck's bed through the real keys:
 * stand in the tailgate aisle and press Shift+F.
 */
export async function loadTruckBed(page: any) {
  await page.evaluate(() => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: {
        ...state.player,
        position: [
          state.shopInfo.entrancePosition[0],
          state.shopInfo.size[1] + 1,
        ],
      },
    }));
  });
  await page.waitForTimeout(30);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press("Shift+F");
  await page.waitForTimeout(30);
}

/**
 * Drive out to Orange Box. Returns the player's previous cell so
 * `leaveStore` can put them back where the test needs them — the specs
 * predate the truck and assume browsing the store doesn't move the player.
 */
export async function goToStore(page: any): Promise<[number, number]> {
  const previousPosition = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().player.position,
  );
  await movePlayerToCab(page);
  await openTruckMenu(page);
  await pressTruckRow(page, "Orange Box");
  return previousPosition;
}

/**
 * Drive out to Sawyer & Sons, the lumberyard. Same contract as
 * `goToStore`: returns the player's previous cell for `leaveStore`.
 */
export async function goToLumberyard(page: any): Promise<[number, number]> {
  const previousPosition = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().player.position,
  );
  await movePlayerToCab(page);
  await openTruckMenu(page);
  await pressTruckRow(page, "Sawyer & Sons");
  return previousPosition;
}

/**
 * Unload everything loose from the truck's bed into the hands, standing
 * at the tailgate and pressing the real interact key (Shift+E takes the
 * whole bed). No-op when the bed is empty. Crated machines stay in the
 * bed — they're lifted with the carry key, not E.
 */
export async function unloadTruckBed(page: any) {
  const bedCount = () =>
    page.evaluate(() => (window as any).__GET_GAME_STATE__().truck.bed.length);
  if ((await bedCount()) === 0) return;
  // The arrival performance holds input until the truck is parked, so
  // pressing once and hoping is a race under CPU contention — keep
  // stepping to the tailgate and pressing until the bed actually empties.
  const deadline = Date.now() + 15000;
  while ((await bedCount()) > 0) {
    if (Date.now() > deadline) {
      throw new Error("unloadTruckBed: the bed never emptied");
    }
    await page.evaluate(() => {
      (window as any).__UPDATE_GAME_STATE__((state: any) => ({
        ...state,
        player: {
          ...state.player,
          // The tailgate aisle, one step out the garage door
          position: [
            state.shopInfo.entrancePosition[0],
            state.shopInfo.size[1] + 1,
          ],
        },
      }));
    });
    await page.evaluate(() =>
      (document.activeElement as HTMLElement)?.blur?.(),
    );
    await page.keyboard.press("Shift+E");
    await page.waitForTimeout(120);
  }
}

/** Where a product hangs, when its name alone doesn't say. */
export interface ShelfOptions {
  /**
   * The line on the tag that tells two of the same product apart — the
   * panel size on a sheet-goods rack, where every tag reads the same
   * grade.
   */
  variant?: string;
  /** One rack, when the same product hangs at more than one. */
  within?: any;
  /**
   * Skip the actionability wait. A store trip spends time, so the click
   * stability check can starve on a loaded machine.
   */
  force?: boolean;
}

/** Which store the current trip is at, or null when not shopping. */
async function shoppingAt(page: any): Promise<string | null> {
  return page.evaluate(() => {
    const away = (window as any).__GET_GAME_STATE__().player.away;
    return away?.kind === "shopping" ? away.store : null;
  });
}

/**
 * Walk (well, teleport) the shopper to a cell of the store's floor. The
 * store view snaps the body to any trip position it didn't write itself,
 * the same reconciliation the shop's floor does for `movePlayerTo`.
 */
export async function moveShopperTo(page: any, cell: [number, number]) {
  await page.evaluate((position: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: {
        ...state.player,
        away: { ...state.player.away, position },
      },
    }));
  }, cell);
  // Long enough for the capped E2E renderer (10fps) to run the frame
  // that snaps the body and the camera to the new cell.
  await page.waitForTimeout(220);
}

/** Stand the shopper at the register (the walkable store only). */
export async function standAtStoreRegister(page: any) {
  const points = await storePoints(page);
  await moveShopperTo(page, points.register);
}

/** Stand the shopper beside the truck's cab in the store's lot. */
export async function standAtStoreCab(page: any) {
  const points = await storePoints(page);
  await moveShopperTo(page, points.cab);
}

async function storePoints(page: any) {
  // Interval polling with a generous timeout: under a fully parallel
  // suite the store's first mount (and its merchandise bake) can starve
  // rAF long enough that raf-polled waits give up on a store that's
  // merely slow.
  await page.waitForFunction(() => (window as any).__STORE_POINTS__, undefined, {
    timeout: 30000,
    polling: 250,
  });
  return page.evaluate(() => (window as any).__STORE_POINTS__);
}

/**
 * Grab a flatbed from the corral by the entrance if the trip doesn't
 * have one yet — the shelves only load a cart you're pushing, so this
 * is the first stop of every shopping run.
 */
export async function grabCartIfNeeded(page: any) {
  const hasCart = await page.evaluate(() => {
    const away = (window as any).__GET_GAME_STATE__().player.away;
    return away?.kind === "shopping" ? away.hasCart : true;
  });
  if (hasCart) return;
  const points = await storePoints(page);
  await moveShopperTo(page, points.corral);
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  await page.keyboard.press("e");
  await page.waitForTimeout(60);
}

/**
 * Stand at the shelf a product hangs on. Every product is its own bay —
 * lumber and sheet goods included, piled on the floor per SKU — so after
 * this the product's Add-to-cart tag is on screen and live. Category
 * names work too ("Construction Lumber", "Sheet Goods"): they stand the
 * shopper at the category's front pile. Swings past the corral for a
 * cart first, because the tag's button is dead without one.
 */
export async function walkToShelf(page: any, product: string) {
  // Same generous, interval-polled wait as storePoints — see there.
  await page.waitForFunction(() => (window as any).__FIND_SHELF__, undefined, {
    timeout: 30000,
    polling: 250,
  });
  await grabCartIfNeeded(page);
  const spot = await page.evaluate(
    (name: string) => (window as any).__FIND_SHELF__(name),
    product,
  );
  if (!spot) {
    throw new Error(`No shelf in this store sells "${product}"`);
  }
  await moveShopperTo(page, spot.cell);
  return spot;
}

/**
 * A product's shelf tag: the control that puts one in the cart, found
 * the way a shopper finds it — by the name printed on the tag. In the
 * walkable store the control only answers while the shopper stands at
 * the shelf — use `walkToShelf` (or `pickUpFromShelf`) to get there.
 *
 * Returned as a locator rather than clicked so a spec can read the tag
 * before taking one (a price, whether the shelf hands it over while the
 * wallet is empty). Use `pickUpFromShelf` to just take one.
 */
export function shelfTag(
  page: any,
  product: string,
  options: ShelfOptions = {},
) {
  const scope = options.within ?? page;
  const tag = options.variant
    ? scope
        .locator("li", { hasText: product })
        .filter({ hasText: options.variant })
    : scope;
  return tag.getByRole("button", { name: `Add ${product} to cart` });
}

/**
 * Take one off the shelf. Every spec that shops goes through here rather
 * than reaching for the control itself, so what a shelf *is* can change
 * without the specs having to (see issue #97): at the walkable store
 * this walks to the shelf first; at the lumberyard's menu it clicks the
 * rack directly.
 */
export async function pickUpFromShelf(
  page: any,
  product: string,
  options: ShelfOptions = {},
) {
  if ((await shoppingAt(page)) === "orangeBox") {
    await walkToShelf(page, product);
  }
  await shelfTag(page, product, options).click(
    options.force ? { force: true } : undefined,
  );
  await page.waitForTimeout(30);
}

/**
 * Head home from either store, optionally walking back to a remembered
 * cell. Purchases ride home in the truck's bed, so heading home swings
 * past the tailgate and unloads it — every spec that buys stock relies
 * on coming home with it in hand.
 *
 * At the walkable store this is a walk out to the cab and E — pressed
 * again if a non-empty cart armed the "leave the cart behind?" ask. At
 * the lumberyard's menu it's still the Head Home button.
 */
export async function leaveStore(page: any, returnTo?: [number, number]) {
  if ((await shoppingAt(page)) === "orangeBox") {
    await standAtStoreCab(page);
    const away = () =>
      page.evaluate(
        () => (window as any).__GET_GAME_STATE__().player.away !== null,
      );
    for (let tries = 0; tries < 3 && (await away()); tries++) {
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("e");
      await page.waitForTimeout(150);
    }
  } else {
    // exact: the register's button also ends in "Head Home", and a
    // substring match would find both once there's a cart
    await page
      .getByRole("button", { name: "Head Home", exact: true })
      .click({ force: true });
  }
  await driveHome(page, returnTo);
}

/**
 * Pay for the cart and drive home. Nothing in a store is bought until
 * the register rings the cart up (see cart.ts), so any spec that shops
 * has to end its trip this way rather than with `leaveStore`, which
 * walks out on the cart. At the walkable store the register opens its
 * receipt card first — Buy is what pays and starts the drive home.
 */
export async function checkOutAndLeaveStore(
  page: any,
  returnTo?: [number, number],
) {
  if ((await shoppingAt(page)) === "orangeBox") {
    await standAtStoreRegister(page);
    await page.getByTestId("store-check-out").click({ force: true });
    await page.getByTestId("store-checkout-modal").waitFor({ state: "visible" });
    await page.getByTestId("store-buy").click({ force: true });
    await driveHome(page, returnTo);
    return;
  }
  await page.getByTestId("store-check-out").click({ force: true });
  await driveHome(page, returnTo);
}

async function driveHome(page: any, returnTo?: [number, number]) {
  // The click starts the arrival performance; returnFromStoreAction (which
  // also PARKS THE PLAYER AT THE CAB) only lands when it finishes. Wait it
  // out, or that late position write clobbers the returnTo teleport below.
  await page.waitForFunction(
    () => (window as any).__GET_GAME_STATE__().player.away === null,
    undefined,
    { timeout: 20000 },
  );
  await page.waitForTimeout(50);
  await unloadTruckBed(page);
  if (returnTo) {
    await page.evaluate((position: [number, number]) => {
      (window as any).__UPDATE_GAME_STATE__((state: any) => ({
        ...state,
        player: { ...state.player, position },
      }));
    }, returnTo);
    await page.waitForTimeout(30);
  }
}

/** Open the journal (the top bar's Skills button). */
export async function openJournal(page: any) {
  await page.getByRole("button", { name: /^Skills/ }).click();
  await page.waitForTimeout(30);
}

/** Close the journal. */
export async function closeJournal(page: any) {
  await page.getByRole("button", { name: "Close journal" }).click();
  await page.waitForTimeout(30);
}

/**
 * Freeze or resume the world from a spec. The player has no speed keys —
 * pausing is the pause menu, which would cover the UI a test is driving —
 * so specs reach the clock through this test-only hook instead.
 */
export async function setPaused(page: any, paused: boolean) {
  await page.evaluate((value: boolean) => {
    (window as any).__SET_PAUSED__(value);
  }, paused);
}

/**
 * Run the simulation forward by `count` ticks immediately. Replaces the old
 * "press 3 to speed up and hope" pattern: long cures and multi-phase
 * operations finish deterministically, and fast.
 */
export async function advanceTicks(page: any, count: number) {
  await page.evaluate((n: number) => {
    (window as any).__ADVANCE_TICKS__(n);
  }, count);
}

/**
 * Run the clock fast (ticks/second) for specs whose subject is a long
 * multi-phase operation. `null` restores the game's own rate. Test-only —
 * the player has no speed control.
 *
 * Prefer `pumpTicks` for waiting out an operation: the Ticker's interval
 * can't be pushed past about 47 ticks/second, so this only ever buys a
 * single-digit multiple.
 */
export async function setTickRate(page: any, rate: number | null) {
  await page.evaluate((value: number | null) => {
    (window as any).__SET_TICK_RATE__(value);
  }, rate);
}

/** How many ticks one `pumpTicks` chunk runs. */
export const TICKS_PER_PUMP = 20;

/**
 * Run the simulation forward a chunk, then let React paint the result.
 *
 * Waiting on the wall clock is what used to make the operation specs slow.
 * Every tick costs a React re-render and a PIXI redraw — about 21ms — so
 * the Ticker saturates near 47 ticks/second no matter what `setTickRate`
 * asks for, and a long glue cure burned real seconds. `__ADVANCE_TICKS__`
 * queues the whole chunk as one React batch instead, so the renders
 * collapse into a single one: a thousand ticks of simulation land in about
 * 16ms. The rAF wait is what makes the result readable — `__GET_GAME_STATE__`
 * is refreshed from an effect, so a predicate checked before the next frame
 * would still see the pre-advance state.
 *
 * The chunk is small on purpose. Callers check their predicate between
 * chunks, so this bounds how far past a finished operation the world runs.
 */
export async function pumpTicks(page: any, count: number = TICKS_PER_PUMP) {
  await page.evaluate(async (n: number) => {
    (window as any).__ADVANCE_TICKS__(n);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }, count);
}
