import { expect, Page, test } from "@playwright/test";

const getState = (page: Page) =>
  page.evaluate(() => (window as any).__GET_GAME_STATE__());

const playerPosition = async (page: Page): Promise<[number, number]> =>
  (await getState(page)).player.position;

test.describe("Keyboard shortcuts", () => {
  test("moves, navigates, scopes to modals, and labels its keys", async ({
    page,
  }) => {
    page.on("dialog", (d) => d.accept());

    await test.step("start a game with every screen unlocked", async () => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("main");
      await page.getByRole("button", { name: "New Game" }).click();
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);

      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["layout-with-placed-machines"],
        );
      });
      // No fixture ships with the tick controls unlocked, and the speed keys
      // are gated on them.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          progression: { ...s.progression, tickSpeedControlsUnlocked: true },
        }));
      });
    });

    // Movement is continuous: hold a key and the body walks, and GameState's
    // cell updates as the body crosses boundaries. Each assertion holds the
    // key until the cell changes, polling fast enough not to overshoot.
    const walkUntil = async (key: string, expected: [number, number]) => {
      await page.keyboard.down(key);
      try {
        await expect
          .poll(() => playerPosition(page), { intervals: [50], timeout: 10000 })
          .toEqual(expected);
      } finally {
        await page.keyboard.up(key);
      }
    };

    await test.step("WASD and the arrow keys both walk the player", async () => {
      expect(await playerPosition(page)).toEqual([0, 0]);
      await walkUntil("d", [1, 0]);
      await walkUntil("ArrowDown", [1, 1]);
      await walkUntil("a", [0, 1]);
    });

    await test.step("letter keys switch tabs", async () => {
      await page.keyboard.press("b");
      await expect(
        page.getByRole("heading", { name: "Machines" }),
      ).toBeVisible();

      await page.keyboard.press("k");
      await expect(page.getByText(/Craft Level/)).toBeVisible();

      await page.keyboard.press("h");
      await expect(
        page.getByRole("heading", { name: "Inventory" }),
      ).toBeVisible();
    });

    await test.step("? opens the shop manual and Escape closes it", async () => {
      const manual = page.getByRole("dialog", { name: "Shop manual" });
      await expect(manual).toHaveCount(0);

      await page.keyboard.press("Shift+/");
      await expect(manual).toBeVisible();

      // The keyboard reference lives in the Controls article, rendered
      // straight from the registry — every group should be there.
      await manual.getByRole("button", { name: "Controls" }).click();
      await expect(
        manual.getByRole("heading", { name: "Movement" }),
      ).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Machines" }),
      ).toBeVisible();

      // `?` toggles: the manual claims the modal scope, so this only works
      // because it re-binds the key inside that scope.
      await page.keyboard.press("Shift+/");
      await expect(manual).toHaveCount(0);

      await page.keyboard.press("Shift+/");
      await expect(manual).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
    });

    await test.step("Space still activates a focused button", async () => {
      // Space is bound to pause/resume globally, so the dispatcher has to let
      // a focused control keep its own activation key.
      const tab = page.getByRole("button", { name: "Store" });
      await tab.focus();
      await page.keyboard.press("Space");
      await expect(
        page.getByRole("heading", { name: "Machines" }),
      ).toBeVisible();

      await page.keyboard.press("h");
      await expect(
        page.getByRole("heading", { name: "Inventory" }),
      ).toBeVisible();
    });

    await test.step("a modal swallows the game's movement keys", async () => {
      const before = await playerPosition(page);

      await page.keyboard.press(",");
      const settings = page.getByRole("dialog", { name: "Settings" });
      await expect(settings).toBeVisible();

      // Nothing focused, so there's no input to guard — this stays put purely
      // because an open modal disables the held-movement listener.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      await page.keyboard.down("d");
      await page.waitForTimeout(500);
      await page.keyboard.up("d");
      expect(await playerPosition(page)).toEqual(before);

      await page.keyboard.press("Escape");
      await expect(settings).toHaveCount(0);
    });

    await test.step("keys work again once the modal is closed", async () => {
      const before = await playerPosition(page);
      await page.keyboard.down("d");
      try {
        await expect
          .poll(() => playerPosition(page), { intervals: [50] })
          .not.toEqual(before);
      } finally {
        await page.keyboard.up("d");
      }
    });

    await test.step("a focused form control keeps its own keys", async () => {
      // The machine panel no longer uses native selects, so plant a text
      // input to exercise the focus guard (typing must not drive the player).
      // No modal here, so this hits the guard rather than the modal scope.
      await page.evaluate(() => {
        const input = document.createElement("input");
        input.id = "focus-guard-probe";
        document.body.appendChild(input);
        input.focus();
      });

      const before = await playerPosition(page);

      await page.keyboard.down("d");
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(400);
      await page.keyboard.up("d");
      await page.keyboard.up("ArrowDown");

      expect(await playerPosition(page)).toEqual(before);

      await page.evaluate(() => {
        document.getElementById("focus-guard-probe")?.remove();
      });
    });

    await test.step("the keys go quiet while the player is out of the shop", async () => {
      const before = await playerPosition(page);

      // Regression: the machine panels hide themselves while away, but the
      // keys used to keep reaching into the shop regardless.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          player: { ...s.player, away: { returnTick: s.tick + 100000 } },
        }));
      });
      // The legend hides itself while away. Waiting for that proves React has
      // re-rendered with the new state, which is what the guard reads. (A real
      // player gets here by clicking "Go", which re-renders before they can
      // touch the keyboard; injecting state skips that.)
      await expect(page.getByText("Controls")).toHaveCount(0);

      await page.keyboard.down("d");
      await page.waitForTimeout(400);
      await page.keyboard.up("d");

      expect(await playerPosition(page)).toEqual(before);

      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          player: { ...s.player, away: null },
        }));
      });
    });

    await test.step("the speed buttons advertise their keys", async () => {
      await page.getByRole("button", { name: "⏸" }).hover();
      const tip = page.getByRole("tooltip");
      await expect(tip).toContainText("Pause game");
      await expect(tip.locator("kbd")).toHaveText("`");
    });

    await test.step("the shop floor shows a controls legend", async () => {
      const legend = page.locator("section", { hasText: "Controls" }).last();
      await expect(legend.getByText("Move")).toBeVisible();
      await expect(legend.getByText(/Pick up/i)).toBeVisible();
    });
  });
});
