import { test, expect } from "@playwright/test";

test.describe("Tooltip", () => {
  test("shows on hover/focus, hides on leave, and is portaled + styled", async ({
    page,
  }) => {
    await test.step("start a new game", async () => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.getByRole("button", { name: "New Game" }).click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
    });

    const quitButton = page.getByRole("button", { name: /Save & Quit/i });
    const tooltip = page.getByText("Save and return to main menu");

    await test.step("tooltip is absent until the trigger is hovered", async () => {
      await expect(quitButton).toBeVisible();
      await expect(tooltip).toHaveCount(0);
    });

    await test.step("hovering the trigger reveals the tooltip", async () => {
      await quitButton.hover();
      await expect(tooltip).toBeVisible();
    });

    await test.step("tooltip is portaled to <body>, not nested in the trigger", async () => {
      const nestedInButton = quitButton.getByText(
        "Save and return to main menu",
      );
      await expect(nestedInButton).toHaveCount(0);
    });

    await test.step("tooltip uses the paperwork surface styling", async () => {
      // The typewriter font class is part of the tooltip surface — a cheap
      // proxy that it rendered through our component, not a native title.
      await expect(tooltip).toHaveClass(/font-typewriter/);
    });

    await test.step("moving the pointer away hides the tooltip", async () => {
      // Move the pointer to the top-left corner, away from the trigger.
      await page.mouse.move(0, 0);
      await expect(tooltip).toHaveCount(0);
    });

    await test.step("keyboard focus also opens the tooltip", async () => {
      await quitButton.focus();
      await expect(tooltip).toBeVisible();
      await quitButton.blur();
      await expect(tooltip).toHaveCount(0);
    });
  });
});
