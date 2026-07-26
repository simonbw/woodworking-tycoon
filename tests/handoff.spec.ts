import { test, expect } from "@playwright/test";
import {
  dismissClientCard,
  handOffAtDoor,
  movePlayerToDoor,
  openDoorPanel,
} from "./navigation";

/**
 * Finished work leaves the shop one way: carried to the garage door and
 * handed over in person. This walks the whole payoff — the door listing
 * what you're holding, the client's card, and the rewards flying to the
 * readouts that track them.
 */
test.describe("Handing work over", () => {
  test("delivers the first commission at the door and pays off", async ({
    page,
  }) => {
    await page.goto("http://localhost:3002");
    await page.getByRole("button", { name: "New Game" }).click();
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    // The manual greets a new game and holds the keyboard until dismissed
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Shop manual" }),
    ).toHaveCount(0);
    await page.waitForTimeout(30);

    await test.step("the work order points at the door, not a button", async () => {
      await expect(
        page.getByTestId("commission-delivery-note"),
      ).toContainText("garage door");
      // The old "Mark Complete" button is gone for good
      await expect(
        page.getByRole("button", { name: "Mark Complete" }),
      ).toHaveCount(0);
    });

    await test.step("an empty-handed trip to the door offers nothing", async () => {
      await movePlayerToDoor(page);
      // Fresh game: no destinations unlocked and nothing in hand
      await expect(page.getByTestId("door-panel")).not.toBeVisible();
    });

    await test.step("the door lists the commission once it's in hand", async () => {
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          player: {
            ...state.player,
            inventory: [
              ...state.player.inventory,
              { id: "e2e-first-shelf", type: "rusticShelf", species: "pallet" },
            ],
          },
        }));
      });
      await page.waitForTimeout(30);
      await movePlayerToDoor(page);
      await openDoorPanel(page);

      const panel = page.getByTestId("door-panel");
      // Nowhere to go yet, so the card is nothing but the handoff
      await expect(panel).toContainText("Someone's waiting");
      await expect(panel).toContainText("Your First Shelf");
      // The client is named on the row — you know who you're meeting
      await expect(panel).toContainText("Marguerite");
      await expect(
        panel.getByRole("button", { name: "Hand Over" }),
      ).toBeVisible();
    });

    const before = await page.evaluate(() =>
      (window as any).__GET_GAME_STATE__(),
    );

    await test.step("handing it over shows the client's card", async () => {
      await handOffAtDoor(page, "Your First Shelf");

      const card = page.getByTestId("client-card");
      await expect(card).toBeVisible();
      await expect(card).toContainText("Your First Shelf");
      await expect(card).toContainText("Marguerite");
      // The payout is itemized on the card: money, reputation, craft XP
      await expect(card).toContainText("$200.00");
    });

    await test.step("the payout has already landed behind the card", async () => {
      const state = await page.evaluate(() =>
        (window as any).__GET_GAME_STATE__(),
      );
      expect(state.money).toBe(before.money + 200);
      expect(state.reputation).toBe(before.reputation + 2);
      expect(state.progression.commissionsCompleted).toBe(1);
      expect(
        state.player.inventory.some((m: any) => m.id === "e2e-first-shelf"),
      ).toBe(false);
      // Completing the first commission is what unlocks the store
      expect(state.progression.storeUnlocked).toBe(true);
    });

    await test.step("dismissing the card flies the rewards to their readouts", async () => {
      await dismissClientCard(page);
      // Chips are in the air, aimed at the balance / reputation / journal
      const chips = page.getByTestId("reward-flights").locator(".reward-chip");
      await expect(chips.first()).toBeVisible();

      // Every reward has somewhere on screen to land
      await expect(page.locator("[data-reward-target='money']")).toBeVisible();
      await expect(
        page.locator("[data-reward-target='reputation']"),
      ).toBeVisible();
      await expect(page.locator("[data-reward-target='xp']")).toBeVisible();

      // The flight clears itself up once the last chip lands
      await expect(chips).toHaveCount(0, { timeout: 8000 });
    });

    await test.step("the readouts show the new totals", async () => {
      await expect(page.getByTestId("balance")).toHaveText("$200.00");
      await expect(page.getByTestId("reputation")).toHaveText("★ 2.0");
    });

    await test.step("the next work order takes the corkboard", async () => {
      await expect(page.getByText("Cut to Order")).toBeVisible();
      // ...and the door is no longer offering the one just delivered
      await movePlayerToDoor(page);
      await openDoorPanel(page);
      const panel = page.getByTestId("door-panel");
      await expect(panel).toContainText("Places to go");
      await expect(panel.getByRole("button", { name: "Hand Over" })).toHaveCount(
        0,
      );
      // The store trip it unlocked is there instead
      await expect(panel).toContainText("Orange Box");
    });
  });
});
