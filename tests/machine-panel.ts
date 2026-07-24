/**
 * Helpers for driving the machine spec sheet's mode and parameter controls.
 *
 * The mode picker renders three ways depending on how many operations the
 * station offers — a fixed plate (1), a segmented switch (a few), or a
 * collapsible recipe index (many) — and every variant marks its operation
 * names with `data-mode-option`, so these helpers work against all three.
 */

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function machineCard(page: any, machineName: string) {
  // Anchor on the placard/sheet heading — plain hasText also matches other
  // panels that merely mention the machine ("→ Makeshift Workbench"
  // buttons in the hands strip). Only one of the placard and the station
  // sheet is on screen at a time, so this stays unambiguous.
  return page.locator("section", {
    has: page.getByRole("heading", { name: machineName, exact: true }),
  });
}

/**
 * Spread out the targeted station's sheet (Enter), where plan selection
 * and the tool/upgrade/shelf racks live. No-op if a sheet is already
 * open. Blurs first: Enter activates a focused button before the game
 * ever sees it, and specs click buttons constantly.
 */
export async function openStationSheet(page: any) {
  if (await page.getByTestId("station-sheet").isVisible()) {
    return;
  }
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press("Enter");
  await page.getByTestId("station-sheet").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
}

/**
 * Take everything the interact key can reach on this cell (Shift+E —
 * machine outputs first, then a loaded bay, then the floor).
 */
export async function takeAllHere(page: any) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press("Shift+E");
  await page.waitForTimeout(200);
}

/** Open a collapsed recipe index; no-op for the other control shapes. */
async function openRecipeIndex(card: any) {
  const toggle = card.locator("button[aria-expanded]");
  if (
    (await toggle.count()) > 0 &&
    (await toggle.getAttribute("aria-expanded")) === "false"
  ) {
    await toggle.click();
  }
}

/** Select an operation by its exact displayed name. */
export async function selectMode(
  page: any,
  machineName: string,
  label: string,
) {
  await openStationSheet(page);
  const card = machineCard(page, machineName);
  await openRecipeIndex(card);
  await card
    .locator("[data-mode-option]")
    .filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) })
    .click();
  await page.waitForTimeout(200);
}

/** The operation names the station currently offers, in display order. */
export async function modesOf(
  page: any,
  machineName: string,
): Promise<string[]> {
  await openStationSheet(page);
  const card = machineCard(page, machineName);
  await openRecipeIndex(card);
  const modes = await card.locator("[data-mode-option]").allTextContents();
  // Leave the recipe index the way we found it
  const toggle = card.locator("button[aria-expanded]");
  if (
    (await toggle.count()) > 0 &&
    (await toggle.getAttribute("aria-expanded")) === "true"
  ) {
    await toggle.click();
  }
  return modes;
}

/** Set a parameter by clicking its detent on the station sheet's scale. */
export async function setParameter(
  page: any,
  machineName: string,
  paramName: string,
  value: number | string,
) {
  await openStationSheet(page);
  await machineCard(page, machineName)
    .getByRole("radiogroup", { name: paramName })
    // Anchored to the whole label with only a unit suffix allowed, so
    // "45" matches "45°" but never "-45°", and "5" matches "5'" but not
    // "45°". Substring matching broke once scales gained signed values.
    .getByRole("radio", {
      name: new RegExp(`^${escapeRegExp(String(value))}\\D*$`),
    })
    .click();
  await page.waitForTimeout(200);
}
