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
      const m = req.url().match(/\/sounds\/([^/?]+\.mp3)/);
      if (m) requested.push(m[1]);
    });

    await test.step("start a new game", async () => {
      await startNewGame(page);
    });

    await test.step("an operation cue fetches that operation's clip", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "ripBoard",
      });
      await expect
        .poll(() => requested)
        .toContain("table-saw-rip.mp3");
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

    await test.step("a tool operation sounds like the tool, not the bench", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "orbitSandPanel",
      });
      await expect.poll(() => requested).toContain("orbital-sander.mp3");
    });

    await test.step("an unmapped operation falls back to the generic clip", async () => {
      await queueCue(page, {
        kind: "operation-complete",
        operationId: "someFutureOperation",
      });
      await expect.poll(() => requested).toContain("assembly-mallet.mp3");
    });

    await test.step("the commission reward stinger plays", async () => {
      await queueCue(page, { kind: "commission-complete" });
      await expect.poll(() => requested).toContain("commission-complete.mp3");
    });

    await test.step("material handling cues play", async () => {
      await queueCue(page, { kind: "material-pickup" });
      await expect.poll(() => requested).toContain("material-pickup.mp3");
    });

    await test.step("no console errors from audio", async () => {
      expect(consoleErrors).toEqual([]);
    });
  });
});
