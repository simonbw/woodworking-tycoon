/**
 * Helpers for the diegetic navigation surfaces: the phone and journal
 * overlays (top-bar buttons) and trips out the garage door (the door
 * panel that appears when the player stands at the entrance cell).
 */

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

/** Teleport the player to the garage door so its prompt appears. */
export async function movePlayerToDoor(page: any) {
  await page.evaluate(() => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: state.shopInfo.entrancePosition },
    }));
  });
  await page.waitForTimeout(30);
}

/**
 * Spread open the door's destination card (E at the door). The interact
 * key serves nearer things first — a machine to switch on, stock to
 * take — so this presses through those until the door answers.
 */
export async function openDoorPanel(page: any) {
  const panel = page.getByTestId("door-panel");
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
 * Hand finished work over at the garage door — the only way work leaves
 * the shop. Walks to the door, opens the card, and clicks the "Hand Over"
 * button on the row matching `name` (a commission title or a job client).
 *
 * A commission handoff then shows the client's card, which has to be
 * dismissed before the rewards fly; `dismissClientCard` does that.
 */
export async function handOffAtDoor(page: any, name: string | RegExp) {
  await movePlayerToDoor(page);
  await openDoorPanel(page);
  // force: the world keeps ticking (job tips decay every tick), so the
  // row's text re-renders and the stability check can starve.
  await page
    .getByTestId("door-panel")
    .locator("li", { hasText: name })
    .getByRole("button", { name: "Hand Over" })
    .click({ force: true });
  await page.waitForTimeout(30);
}

/** Dismiss the client's card shown after a commission handoff. */
export async function dismissClientCard(page: any) {
  await page.getByTestId("client-card").waitFor({ state: "visible" });
  await page
    .getByRole("button", { name: "Take the money" })
    .click({ force: true });
  await page.waitForTimeout(30);
}

/**
 * Walk out the door to Orange Box. Returns the player's previous cell so
 * `leaveStore` can put them back where the test needs them — the specs
 * predate the door and assume browsing the store doesn't move the player.
 */
export async function goToStore(page: any): Promise<[number, number]> {
  const previousPosition = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().player.position,
  );
  await movePlayerToDoor(page);
  await openDoorPanel(page);
  // force: the world keeps ticking, so nearby text re-renders can make
  // Playwright's stability check starve on slow machines
  await page
    .getByTestId("door-panel")
    .locator("li", { hasText: "Orange Box" })
    .getByRole("button", { name: "Go" })
    .click({ force: true });
  await page.waitForTimeout(30);
  return previousPosition;
}

/**
 * Walk out the door to Sawyer & Sons, the lumberyard. Same contract as
 * `goToStore`: returns the player's previous cell for `leaveStore`.
 */
export async function goToLumberyard(page: any): Promise<[number, number]> {
  const previousPosition = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().player.position,
  );
  await movePlayerToDoor(page);
  await openDoorPanel(page);
  await page
    .getByTestId("door-panel")
    .locator("li", { hasText: "Sawyer & Sons" })
    .getByRole("button", { name: "Go" })
    .click({ force: true });
  await page.waitForTimeout(30);
  return previousPosition;
}

/**
 * Unload everything loose from the truck's bed into the hands, standing
 * at the tailgate and pressing the real interact key (Shift+E takes the
 * whole bed). No-op when the bed is empty. Crated machines stay in the
 * bed — they're lifted with the carry key, not E.
 */
export async function unloadTruckBed(page: any) {
  const bedCount = await page.evaluate(
    () => (window as any).__GET_GAME_STATE__().truck.bed.length,
  );
  if (bedCount === 0) return;
  await page.evaluate(() => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: {
        ...state.player,
        // The tailgate aisle, one step out the garage door
        position: [state.shopInfo.entrancePosition[0], state.shopInfo.size[1] + 1],
      },
    }));
  });
  await page.waitForTimeout(30);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press("Shift+E");
  await page.waitForTimeout(30);
}

/**
 * Head home from either store, optionally walking back to a remembered
 * cell. Purchases ride home in the truck's bed, so heading home swings
 * past the tailgate and unloads it — every spec that buys stock relies
 * on coming home with it in hand.
 */
export async function leaveStore(page: any, returnTo?: [number, number]) {
  await page
    .getByRole("button", { name: "Head Home" })
    .click({ force: true });
  await page.waitForTimeout(30);
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

/** Take out the phone (SawdustList). */
export async function openPhone(page: any) {
  await page.getByRole("button", { name: "Phone" }).click();
  await page.waitForTimeout(30);
}

/** Put the phone away. */
export async function closePhone(page: any) {
  await page.getByRole("button", { name: "Put phone away" }).click();
  await page.waitForTimeout(30);
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
