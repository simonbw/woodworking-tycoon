/**
 * Helpers for the diegetic navigation surfaces: the phone and journal
 * overlays (top-bar buttons) and trips out the garage door (the door
 * panel that appears when the player stands at the entrance cell).
 */

/** Teleport the player to the garage door so its panel appears. */
export async function movePlayerToDoor(page: any) {
  await page.evaluate(() => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: state.shopInfo.entrancePosition },
    }));
  });
  await page.waitForTimeout(300);
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
  // force: the world keeps ticking, so nearby text re-renders can make
  // Playwright's stability check starve on slow machines
  await page
    .getByTestId("door-panel")
    .locator("li", { hasText: "Orange Box" })
    .getByRole("button", { name: "Go" })
    .click({ force: true });
  await page.waitForTimeout(300);
  return previousPosition;
}

/** Head home from the store, optionally walking back to a remembered cell. */
export async function leaveStore(page: any, returnTo?: [number, number]) {
  await page
    .getByRole("button", { name: "Head Home" })
    .click({ force: true });
  await page.waitForTimeout(300);
  if (returnTo) {
    await page.evaluate((position: [number, number]) => {
      (window as any).__UPDATE_GAME_STATE__((state: any) => ({
        ...state,
        player: { ...state.player, position },
      }));
    }, returnTo);
    await page.waitForTimeout(300);
  }
}

/** Take out the phone (SawdustList). */
export async function openPhone(page: any) {
  await page.getByRole("button", { name: "Phone" }).click();
  await page.waitForTimeout(300);
}

/** Put the phone away. */
export async function closePhone(page: any) {
  await page.getByRole("button", { name: "Put phone away" }).click();
  await page.waitForTimeout(300);
}

/** Open the journal (skills). */
export async function openJournal(page: any) {
  await page.getByRole("button", { name: /^Journal/ }).click();
  await page.waitForTimeout(300);
}

/** Close the journal. */
export async function closeJournal(page: any) {
  await page.getByRole("button", { name: "Close journal" }).click();
  await page.waitForTimeout(300);
}
