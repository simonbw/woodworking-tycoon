/**
 * Helpers for driving the machine spec sheet's plan and parameter controls.
 *
 * The bench's plan picker is the plan drawer (PlanBrowser), opened from
 * the pile chip in the bench view's corner (BlueprintCorner): the chip
 * carries `aria-expanded`, and every drawing marks its operation name
 * with `data-mode-option`, exactly once. Selecting a plan is opening the
 * drawer, clicking the drawing by name to set it out, and pulling it
 * (`data-testid="pull-plan"`); the drawer closes itself on the pull.
 */

import { pumpTicks } from "./navigation";

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
 * Spread out the targeted station's sheet (Tab), where plan selection and
 * the tool/upgrade/shelf racks live. No-op if a sheet is already open.
 * Blurs first: with focus on a control Tab moves the focus ring instead,
 * and specs click buttons constantly.
 */
export async function openStationSheet(page: any) {
  if (await page.getByTestId("station-sheet").isVisible()) {
    return;
  }
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press("Tab");
  await page.getByTestId("station-sheet").waitFor({ state: "visible" });
  await page.waitForTimeout(30);
}

/**
 * Run the machine the player is standing at: hold the operate key until
 * `isDone` reports the work finished, then let go.
 *
 * There is no Operate button any more — working a machine is a floor verb,
 * and attended phases only advance while the key is down. Blurs first so
 * Space activates the game rather than a focused control.
 *
 * The wait drives the clock itself (see pumpTicks) rather than watching it
 * run. Holding the key is still what makes attended work legal: the flag
 * lives in GameState, so a batched advance reads it the same way a
 * real-time tick would.
 */
export async function holdOperate(
  page: any,
  isDone: () => Promise<boolean>,
  timeoutMs = 20000,
) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.down("Space");
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await isDone()) return;
      await pumpTicks(page);
    }
    throw new Error("holdOperate timed out waiting for the work to finish");
  } finally {
    await page.keyboard.up("Space");
    await page.waitForTimeout(30);
  }
}

/** Hold the operate key until the machine puts out a material that matches. */
export async function runUntilOutput(
  page: any,
  matcherSource: string,
  timeoutMs = 20000,
) {
  await holdOperate(
    page,
    () =>
      page.evaluate((src: string) => {
        const matches = new Function("mat", `return (${src})(mat)`) as any;
        return (window as any)
          .__GET_GAME_STATE__()
          .machines.some((m: any) => m.outputMaterials.some(matches));
      }, matcherSource),
    timeoutMs,
  );
}

/**
 * Take everything the interact key can reach on this cell (Shift+E —
 * machine outputs first, then a loaded bay, then the floor).
 */
export async function takeAllHere(page: any) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.press("Shift+E");
  await page.waitForTimeout(30);
}

/** Open a collapsed plan drawer (the bench view's blueprint corner, or
 * any older aria-expanded recipe index); no-op for other control shapes. */
export async function openRecipeIndex(card: any) {
  const toggle = card.locator("button[aria-expanded]");
  if (
    (await toggle.count()) > 0 &&
    (await toggle.first().getAttribute("aria-expanded")) === "false"
  ) {
    await toggle.first().click();
  }
}

/** Close the plan drawer / fold the pile back up. The drawer's overlay
 * covers the corner chip, so it closes by Escape rather than the toggle
 * (Escape is handled inside the overlay and never reaches close-sheet). */
export async function closeRecipeIndex(page: any, card: any) {
  const browser = page.getByTestId("plan-browser");
  if (await browser.isVisible()) {
    await page.keyboard.press("Escape");
    await browser.waitFor({ state: "hidden" });
    return;
  }
  const toggle = card.locator("button[aria-expanded]");
  if (
    (await toggle.count()) > 0 &&
    (await toggle.first().getAttribute("aria-expanded")) === "true"
  ) {
    await toggle.first().click();
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
  await page.waitForTimeout(30);
  // In the plan drawer, clicking a drawing only sets it out for reading;
  // the pull button commits and closes the drawer. A drawing that is
  // already pulled offers "put back" instead — the selection is already
  // in place, so just close the drawer.
  const browser = page.getByTestId("plan-browser");
  if (await browser.isVisible()) {
    const pull = page.getByTestId("pull-plan");
    if (await pull.isVisible()) {
      await pull.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await browser.waitFor({ state: "hidden" });
  }
  await page.waitForTimeout(30);
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
  // Leave the drawer closed the way we found it
  await closeRecipeIndex(page, card);
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
  await page.waitForTimeout(30);
}

/**
 * Hold the operate key while waiting for a condition — the replacement for
 * "click Operate, then wait". Takes the same arguments `waitForFunction`
 * does, so a spec's existing completion predicate carries over unchanged.
 *
 * Attended work only advances while the key is down, so the wait has to
 * happen inside the hold rather than after it. The predicate is polled
 * between tick chunks rather than by `waitForFunction`, because the chunks
 * are what move the clock — see pumpTicks.
 */
export async function runWhileHolding(
  page: any,
  pageFunction: any,
  arg?: any,
  options?: { timeout?: number },
) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());
  await page.keyboard.down("Space");
  try {
    const deadline = Date.now() + (options?.timeout ?? 20000);
    while (Date.now() < deadline) {
      if (await page.evaluate(pageFunction, arg)) return;
      await pumpTicks(page);
    }
    throw new Error("runWhileHolding timed out waiting for the work to finish");
  } finally {
    await page.keyboard.up("Space");
    await page.waitForTimeout(30);
  }
}
