import { test, expect } from "@playwright/test";
import { modesOf, openStationSheet } from "./machine-panel";
import { goToLumberyard, goToStore, leaveStore } from "./navigation";

/**
 * The shopping and tool-mounting end of the cutting board chain: what the two
 * lumber channels show at 17 reputation, and the station sheet's tool rack
 * taking the sander that the chain needs.
 *
 * The chain itself — glue, sand twice, finish at full thickness, and the $120
 * maple price — is in `src/game/sequences/cutting-board-chain.test.ts`,
 * including the premise this fixture exists to prove: that no planer is
 * required.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

test.describe("Cutting Board Chain (no planer required)", () => {
  test("shops both channels at 17 reputation and mounts the sander", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const fixtures = (window as any).__TEST_FIXTURES__;
      (window as any).__UPDATE_GAME_STATE__(
        () => fixtures["cutting-board-shop"],
      );
    });
    await page.waitForTimeout(30);

    await test.step("commission 6 is active", async () => {
      await expect(page.getByText("A Proper Cutting Board")).toBeVisible();
    });

    await test.step("store: tool wall and reputation-gated lumber channels", async () => {
      const returnTo = await goToStore(page);
      await expect(page.getByText("Tool Wall")).toBeVisible();
      await expect(page.getByText("Sanding Block")).toBeVisible();
      // Scoped: the supplies aisle sells a $10.00 oil bottle too
      await expect(
        page.locator("section", { hasText: "Tool Wall" }).getByText("$10.00"),
      ).toBeVisible();
      await expect(page.getByText("Random Orbit Sander")).toBeVisible();
      // Cheap channels: framing pine and marked-up big-box S4S hardwood.
      // Boards carry dimensions only — species lives on the bundle's tag.
      await expect(page.getByText("Construction Lumber")).toBeVisible();
      await expect(page.getByText(/1x4\s*8'/)).toBeVisible();
      await expect(page.getByText("$2.01")).toBeVisible();
      await expect(page.getByText("S4S Hardwood Rack")).toBeVisible();
      // The less-than-S4S channels live at the lumberyard, not here
      await expect(page.getByText("S2S Rack")).not.toBeVisible();
      await expect(page.getByText("Rough Rack")).not.toBeVisible();
      await leaveStore(page, returnTo);
    });

    await test.step("lumberyard: open at 17 reputation, rough rack still hidden", async () => {
      const returnTo = await goToLumberyard(page);
      await expect(page.getByText("Sawyer & Sons")).toBeVisible();
      // At 17 reputation the S2S rack (12) has appeared...
      await expect(page.getByText("S2S Rack")).toBeVisible();
      // ...but the rough rack (22) doesn't exist yet — not even greyed out
      await expect(page.getByText("Rough Rack")).not.toBeVisible();
      await leaveStore(page, returnTo);
    });

    await test.step("mount the sander at the workspace", async () => {
      await expect(page.getByText("1/2 slots")).not.toBeVisible();
      // The tool rack lives on the station sheet
      await openStationSheet(page);
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(30);
      await expect(page.getByText("1/2 slots")).toBeVisible();
      // The sander's operations joined the workspace's Mode list
      const modeOptions = await modesOf(page, "Makeshift Workbench");
      expect(modeOptions).toContain("Sand Panel");
    });
  });
});
