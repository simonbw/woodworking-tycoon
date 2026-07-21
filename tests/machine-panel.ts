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
  // Anchor on the spec sheet's heading — plain hasText also matches other
  // panels that merely mention the machine ("Operate Jointer" in the
  // controls legend, "→ Makeshift Workbench" buttons in the inventory).
  return page.locator("section", {
    has: page.getByRole("heading", { name: machineName, exact: true }),
  });
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

/** Set a parameter by clicking its detent on the scale. */
export async function setParameter(
  page: any,
  machineName: string,
  paramName: string,
  value: number | string,
) {
  await machineCard(page, machineName)
    .getByRole("radiogroup", { name: paramName })
    .getByRole("radio", { name: String(value) })
    .click();
  await page.waitForTimeout(200);
}
