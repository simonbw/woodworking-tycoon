import { expect, test, Page } from "@playwright/test";

/**
 * Verifies the game-event → sound bridge in a real browser: a queued cue gets
 * mapped to the right clip, actually fetched, and the queue drained.
 *
 * Cues are injected through the exposed __UPDATE_GAME_STATE__ hook rather than
 * played through gameplay — the per-action emission is covered by unit tests,
 * so this focuses on the mapping + drain + playback path.
 */

async function startNewGame(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("main");
  // A real click also unlocks the AudioContext, which playback depends on.
  await page.getByRole("button", { name: "New Game" }).click();
  await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);
  // Dismiss the shop manual's one-time welcome so it can't cover the UI.
  const manual = page.getByRole("dialog", { name: "Shop manual" });
  await manual.waitFor();
  await page.keyboard.press("Escape");
  await manual.waitFor({ state: "detached" });
}

async function queueCue(page: Page, cue: Record<string, string>) {
  await page.evaluate((c) => {
    (window as any).__UPDATE_GAME_STATE__((s: any) => ({
      ...s,
      pendingSounds: [c],
    }));
  }, cue);
}

test.describe("Game sound bridge", () => {
  test("maps cues to clips, fetches them, and drains the queue", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const requested: string[] = [];
    page.on("request", (req) => {
      const m = req.url().match(/\/sounds\/([^/?]+\.ogg)/);
      if (m) requested.push(m[1]);
    });

    await test.step("start a new game", async () => {
      await startNewGame(page);
    });

    await test.step("an operation cue fetches that operation's clip", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "dismantlePallet",
      });
      await expect.poll(() => requested).toContain("pallet-dismantle.ogg");
    });

    await test.step("the queue is drained after playing", async () => {
      await expect
        .poll(async () =>
          page.evaluate(
            () => (window as any).__GET_GAME_STATE__().pendingSounds.length,
          ),
        )
        .toBe(0);
    });

    await test.step("machines with a continuous voice complete silently", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "ripBoard",
      });
      // Drained means it was mapped (to silence) — then prove a later cue
      // still plays, so the silent one had its chance to fetch and didn't.
      await expect
        .poll(async () =>
          page.evaluate(
            () => (window as any).__GET_GAME_STATE__().pendingSounds.length,
          ),
        )
        .toBe(0);
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "glueUpPanel",
      });
      await expect.poll(() => requested).toContain("glue-clamp.ogg");
      expect(requested).not.toContain("table-saw-rip.ogg");
    });

    await test.step("a tool operation sounds like the tool, not the bench", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "orbitSandPanel",
      });
      await expect.poll(() => requested).toContain("orbital-sander.ogg");
    });

    await test.step("an unmapped operation falls back to the generic clip", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "someFutureOperation",
      });
      await expect.poll(() => requested).toContain("assembly-mallet.ogg");
    });

    await test.step("the commission reward stinger plays", async () => {
      await queueCue(page, { kind: "commission-complete" });
      await expect.poll(() => requested).toContain("commission-complete.ogg");
    });

    await test.step("material handling cues play", async () => {
      await queueCue(page, { kind: "material-pickup" });
      await expect.poll(() => requested).toContain("material-pickup.ogg");
    });

    await test.step("no console errors from audio", async () => {
      expect(consoleErrors).toEqual([]);
    });
  });
});
