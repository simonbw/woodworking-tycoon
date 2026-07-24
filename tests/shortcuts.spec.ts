import { expect, Page, test } from "@playwright/test";
import { movePlayerToDoor, openDoorPanel } from "./navigation";

const getState = (page: Page) =>
  page.evaluate(() => (window as any).__GET_GAME_STATE__());

const playerPosition = async (page: Page): Promise<[number, number]> =>
  (await getState(page)).player.position;

test.describe("Keyboard shortcuts", () => {
  test("moves, navigates, scopes to modals, and labels its keys", async ({
    page,
  }) => {
    // Many small steps; the default 30s budget is tight on slow machines
    test.setTimeout(120000);
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
      // No fixture ships with the tick controls unlocked (the speed keys are
      // gated on them) or the marketplace (which gates the phone).
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          progression: {
            ...s.progression,
            tickSpeedControlsUnlocked: true,
            marketplaceUnlocked: true,
          },
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
      expect(await playerPosition(page)).toEqual([5, 6]);
      await walkUntil("d", [6, 6]);
      await walkUntil("ArrowDown", [6, 7]);
      await walkUntil("a", [5, 7]);
    });

    await test.step("letter keys open the pocket overlays and toggle shut", async () => {
      await page.keyboard.press("k");
      const journal = page.getByRole("dialog", { name: "Journal" });
      await expect(journal).toBeVisible();
      await expect(page.getByText(/Craft Level/)).toBeVisible();
      // K re-binds inside the modal scope, so it toggles rather than only opens
      await page.keyboard.press("k");
      await expect(journal).toHaveCount(0);

      await page.keyboard.press("m");
      const phone = page.getByRole("dialog", { name: "Phone" });
      await expect(phone).toBeVisible();
      await page.keyboard.press("m");
      await expect(phone).toHaveCount(0);
    });

    await test.step("E opens the door card, 1 heads out to the store", async () => {
      const store = page.getByRole("dialog", { name: "Orange Box" });
      // Away from the door, 1 is the speed preset — no trip starts
      await page.keyboard.press("1");
      await expect(store).toHaveCount(0);

      // At the door, E spreads open the destination card; its rows claim
      // the number keys, and the store (first unlocked destination)
      // answers to 1
      await movePlayerToDoor(page);
      await openDoorPanel(page);
      await page.keyboard.press("1");
      await expect(store).toBeVisible();
      // Escape heads home
      await page.keyboard.press("Escape");
      await expect(store).toHaveCount(0);
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
      const button = page.getByRole("button", { name: "Phone" });
      await button.focus();
      await page.keyboard.press("Space");
      const phone = page.getByRole("dialog", { name: "Phone" });
      await expect(phone).toBeVisible();

      // Close with M rather than Escape: the focused button's tooltip is
      // open (tooltips open on focus) and swallows the first Escape.
      await page.keyboard.press("m");
      await expect(phone).toHaveCount(0);
      // Drop focus so the button's tooltip can't linger into later steps
      await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
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
          player: {
            ...s.player,
            away: {
              kind: "scavenging",
              returnTick: s.tick + 100000,
              loot: [],
            },
          },
        }));
      });
      // The shop manifest hides itself while away. Waiting for that proves
      // React has re-rendered with the new state, which is what the guard
      // reads. (A real player gets here by clicking "Go", which re-renders
      // before they can touch the keyboard; injecting state skips that.)
      await expect(page.getByTestId("shop-manifest")).toHaveCount(0);

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
      // Scoped by text so a stale tooltip elsewhere can't shadow this one
      const tip = page
        .getByRole("tooltip")
        .filter({ hasText: "Pause game" });
      await expect(tip).toBeVisible();
      await expect(tip.locator("kbd")).toHaveText("`");
    });

    await test.step("the shop manifest hangs on the right rail", async () => {
      const manifest = page.getByTestId("shop-manifest");
      await expect(manifest).toBeVisible();
      await expect(manifest.getByText("In Hand")).toBeVisible();
      await expect(manifest.getByText("Underfoot")).toBeVisible();
    });
  });
});
