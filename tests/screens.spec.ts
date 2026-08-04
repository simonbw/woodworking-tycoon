import { expect, Page, test } from "@playwright/test";
import { modesOf, openStationSheet } from "./machine-panel";
import { closeJournal, openJournal, startNewGame } from "./navigation";

/**
 * Every screen the shop floor can reach, and what each one shows.
 *
 * The shop floor is the only real screen; everything else is an object you
 * look at — the manual binder, the journal, the phone's siblings, the pause
 * menu, a tooltip. This walks all of them in one browser: they open, they
 * render what they should, they hide what's still locked, they close.
 *
 * Progressive disclosure is the recurring subject. A locked article or a
 * recipe you haven't learned is *absent*, not greyed out, so most of these
 * assertions are about something not being there yet and then being there.
 *
 * The pause menu goes last on purpose: it reloads the page to prove
 * preferences survive, which throws the game away.
 */

const getState = (page: Page) =>
  page.evaluate(() => (window as any).__GET_GAME_STATE__());

/** Where the audio preferences live in localStorage. */
const AUDIO_KEY = "woodworking-tycoon-audio";

/** The bench's recipe list — the disclosure surface for learned skills. */
async function workspaceModes(page: any): Promise<string[]> {
  return modesOf(page, "Makeshift Workbench");
}

test.describe("Screens", () => {
  test("opens every overlay, shows what's unlocked, hides what isn't", async ({
    page,
  }) => {
    test.setTimeout(180000);
    page.on("dialog", (d) => d.accept());
    const manual = page.getByRole("dialog", { name: "Shop manual" });

    await test.step("auto-opens to Welcome on a brand-new game", async () => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("main");
      await startNewGame(page);
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);

      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Welcome to the Shop" }),
      ).toBeVisible();
    });

    await test.step("locked articles are hidden entirely", async () => {
      await expect(manual.getByRole("button", { name: /Sawdust/ })).toHaveCount(
        0,
      );
      await expect(
        manual.getByRole("button", { name: /Marketplace/ }),
      ).toHaveCount(0);
    });

    await test.step("closing acknowledges Welcome and stays closed", async () => {
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      const state = await getState(page);
      expect(state.progression.readArticles).toContain("welcome");
    });

    await test.step("the ? badge shows while Controls is still unread", async () => {
      await expect(page.getByTestId("manual-badge")).toBeVisible();
    });

    await test.step("? reopens to the first unread article and marks it read", async () => {
      await page.keyboard.press("Shift+/");
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Controls" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      // Lumber is next in the unread stack — the badge holds until it's read
      await expect(page.getByTestId("manual-badge")).toBeVisible();
      await page.keyboard.press("Shift+/");
      await expect(
        manual.getByRole("heading", { name: "Reading Lumber Sizes" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      await expect(page.getByTestId("manual-badge")).toHaveCount(0);
    });

    await test.step("unlocking features reveals their articles", async () => {
      // Dust past the sweeping threshold unlocks Sawdust & Cleaning; the
      // marketplace flag unlocks Marketplace & Jobs. The milestone check
      // picks both up on the next tick.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          dust: { "1,1": { pine: 80 } },
          progression: { ...s.progression, marketplaceUnlocked: true },
        }));
      });
      await expect
        .poll(async () => (await getState(page)).progression.unlockedArticles)
        .toContain("marketplace");
      await expect(page.getByTestId("manual-badge")).toBeVisible();
    });

    await test.step("a freshly unlocked article wears a NEW tab until opened", async () => {
      // Opening jumps to the first unread article (dust), so the
      // marketplace tab is still unread and marked NEW.
      await page.keyboard.press("Shift+/");
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Sawdust & Cleaning" }),
      ).toBeVisible();

      const marketTab = manual.getByRole("button", {
        name: /Marketplace & Jobs/,
      });
      await expect(marketTab).toContainText("New");
      await marketTab.click();
      await expect(
        manual.getByRole("heading", { name: "Marketplace & Jobs" }),
      ).toBeVisible();
      await expect(marketTab).not.toContainText("New");
    });

    await test.step("with everything read, the badge stays gone", async () => {
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      await expect(page.getByTestId("manual-badge")).toHaveCount(0);
    });

    await test.step("the dust card deep-links into its article", async () => {
      // The one-shot sawdust note is still up (never dismissed); its manual
      // link opens the binder straight to Sawdust & Cleaning.
      await page
        .getByRole("button", { name: "Shop Manual → Sawdust & Cleaning" })
        .click();
      await expect(manual).toBeVisible();
      await expect(
        manual.getByRole("heading", { name: "Sawdust & Cleaning" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
    });

    // The journal's Skills button doubles as the tooltip trigger below.
    const quitButton = page.getByRole("button", { name: /^Skills/i });
    // Anchor on the tooltip surface itself, not the text inside it: a
    // tooltip that names a shortcut wraps its content in a chip row.
    const tooltip = page.getByRole("tooltip", {
      name: /Your journal — skills/,
    });

    await test.step("dismiss the manual so it can't cover the rest", async () => {
      if (await manual.count()) {
        await page.keyboard.press("Escape");
        await manual.waitFor({ state: "detached" });
      }
      await page.waitForTimeout(30);
    });

    await test.step("the tracker chip expands into the clipboard", async () => {
      const clipboard = page.getByRole("dialog", { name: "Clipboard" });
      const tracker = page.getByTestId("commission-tracker");
      // The always-on corner: the current order's name and checklist
      await expect(tracker).toBeVisible();
      await expect(tracker).toContainText("First Shelf");
      // C holds the full clipboard up, and C puts it back down
      await page.keyboard.press("c");
      await expect(clipboard).toBeVisible();
      await expect(clipboard.getByTestId("commission-delivery-note")).toContainText("truck");
      await page.keyboard.press("c");
      await expect(clipboard).toHaveCount(0);
      // Clicking the tracker does the same; Escape closes
      await tracker.click();
      await expect(clipboard).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(clipboard).toHaveCount(0);
    });

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
      // The ivory paper class is part of the tooltip surface — a cheap
      // proxy that it rendered through our component, not a native title.
      await expect(tooltip).toHaveClass(/bg-paper-ivory/);
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

    await test.step("starter skills come pre-certified", async () => {
      await openJournal(page);
      await expect(
        page.getByRole("heading", { name: /Woodworker/ }),
      ).toBeVisible();
      // 4 starter skills show as certified
      await expect(page.getByText("Certified")).toHaveCount(4);
      // Locked-with-prereqs-met shows a disabled Learn button (0 points)
      const learnButton = page
        .locator("li", { hasText: "Fine Shelving" })
        .getByRole("button", { name: /Learn/ });
      await expect(learnButton).toBeDisabled();
      // Deeper node shows its requirement instead
      await expect(
        page.locator("li", { hasText: "Box Joinery" }).getByText(/Requires/),
      ).toBeVisible();
      await expect(page.getByText("Craft Level 1")).toBeVisible();
      await closeJournal(page);
    });

    await test.step("load a shop with strips and two points to spend", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["cutting-board-shop"],
        );
      });
      await page.waitForTimeout(30);
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          progression: { ...state.progression, skillPoints: 2 },
          player: {
            ...state.player,
            // Fresh strips, plus the fixture's sander kept in hand — the
            // tool rack mounts from the arms, so dropping it would leave
            // the Attach step nothing to attach
            inventory: [
              ...["walnut", "maple", "walnut", "maple", "walnut"].map(
                (species, i) => ({
                  id: `mixed-strip-${i}`,
                  type: "board",
                  species,
                  length: 24,
                  width: 2,
                  thickness: 4,
                  surface: "smooth",
                  jointedFaces: 2,
                  jointedEdges: 2,
                }),
              ),
              ...state.player.inventory.filter(
                (item: any) => item.type === "tool",
              ),
            ],
          },
        }));
      });
      await page.waitForTimeout(30);
      await expect(page.getByTestId("journal-badge")).toHaveText("2");
    });

    await test.step("the Skills button meters XP toward the next point", async () => {
      // Level 1 costs 30 XP, so 15 lifetime XP is exactly half a point away
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          progression: { ...state.progression, xp: 15 },
        }));
      });
      await page.waitForTimeout(30);
      await expect(page.getByTestId("xp-meter-fill")).toHaveAttribute(
        "style",
        /width:\s*50%/,
      );
      await expect(
        page.getByRole("button", { name: /^Skills/ }),
      ).toBeVisible();
    });

    await test.step("locked recipe is hidden at the workspace", async () => {
      const modes = await workspaceModes(page);
      expect(modes).not.toContain("Finish Two-Tone Board");
    });

    await test.step("learn Two-Tone Boards in the journal", async () => {
      await openJournal(page);
      await page
        .locator("li", { hasText: "Two-Tone Boards" })
        .getByRole("button", { name: /Learn/ })
        .click();
      await page.waitForTimeout(30);
      await expect(page.getByText("Certified")).toHaveCount(5);
      await closeJournal(page);
      await expect(page.getByTestId("journal-badge")).toHaveText("1");
    });

    await test.step("learning it puts the recipe on the bench", async () => {
      // The tool rack lives on the station sheet
      await openStationSheet(page);
      await page.getByRole("button", { name: "Attach" }).click();
      await page.waitForTimeout(30);

      const modes = await workspaceModes(page);
      expect(modes).toContain("Finish Two-Tone Board");
    });

    await test.step("load the pattern-board shop", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["pattern-board-shop"],
        );
      });
      await page.waitForTimeout(30);
    });

    await test.step("sunrise is gated behind both branches", async () => {
      await openJournal(page);
      await expect(
        page
          .locator("li", { hasText: "Sunrise Boards" })
          .getByText("Requires Striped Boards, Freeform Lamination"),
      ).toBeVisible();
      // Freeform glue ops are hidden at the bench until learned
      await closeJournal(page);
      const modes = await workspaceModes(page);
      expect(modes).not.toContain("Glue Up Pair");
      expect(modes).not.toContain("Finish Striped Board");
    });

    await test.step("spend 3 points down to Sunrise Boards", async () => {
      await openJournal(page);
      for (const skill of [
        "Striped Boards",
        "Freeform Lamination",
        "Sunrise Boards",
      ]) {
        await page
          .locator("li", { hasText: skill })
          .getByRole("button", { name: /Learn/ })
          .click();
        await page.waitForTimeout(30);
      }
      await expect(page.getByText("Certified")).toHaveCount(8);
      await closeJournal(page);
      const modes = await workspaceModes(page);
      expect(modes).toContain("Glue Up Pair");
      expect(modes).toContain("Glue On Strip");
      expect(modes).toContain("Finish Striped Board");
      expect(modes).toContain("Finish Sunrise Board");
    });
    await test.step("shut the station sheet so Escape reaches the pause menu", async () => {
      // Reading the recipe list spreads the sheet open, and Escape closes the
      // innermost thing first — so the sheet has to go before the menu opens.
      const sheet = page.getByTestId("station-sheet");
      if (await sheet.isVisible()) {
        await page.keyboard.press("Escape");
        await sheet.waitFor({ state: "hidden" });
      }
      await page.waitForTimeout(30);
    });

    await test.step("Escape opens the pause menu, which holds the settings", async () => {
      await expect(page.getByRole("dialog", { name: "Paused" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
    });

    await test.step("all three volume sliders and the mute toggle render", async () => {
      await expect(page.getByRole("slider", { name: "Master" })).toBeVisible();
      await expect(
        page.getByRole("slider", { name: "Sound Effects" }),
      ).toBeVisible();
      await expect(page.getByRole("slider", { name: "Music" })).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "Mute all" }),
      ).toBeVisible();
    });

    await test.step("dragging the master slider updates the displayed percent", async () => {
      const master = page.getByRole("slider", { name: "Master" });
      await master.fill("30");
      await expect(master).toHaveValue("30");
      // The row shows the live percentage.
      await expect(page.getByText("30%")).toBeVisible();
    });

    await test.step("muting toggles the checkbox on", async () => {
      const mute = page.getByRole("checkbox", { name: "Mute all" });
      await mute.check();
      await expect(mute).toBeChecked();
    });

    await test.step("preferences are written to their own localStorage key", async () => {
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        AUDIO_KEY,
      );
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.master).toBe(0.3);
      expect(parsed.muted).toBe(true);
    });

    await test.step("Escape closes the menu and the world resumes", async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Paused" })).toHaveCount(0);
    });

    await test.step("preferences survive a full page reload", async () => {
      await page.reload();
      await page.waitForSelector("main");
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        AUDIO_KEY,
      );
      const parsed = JSON.parse(raw!);
      expect(parsed.master).toBe(0.3);
      expect(parsed.muted).toBe(true);
    });

    await test.step("the reloaded store rehydrates into the UI", async () => {
      await startNewGame(page);
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
      // A second fresh game greets us with the manual again; dismiss it.
      const manual = page.getByRole("dialog", { name: "Shop manual" });
      await manual.waitFor();
      await page.keyboard.press("Escape");
      await expect(manual).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("slider", { name: "Master" })).toHaveValue(
        "30",
      );
      await expect(
        page.getByRole("checkbox", { name: "Mute all" }),
      ).toBeChecked();
    });
  });
});
