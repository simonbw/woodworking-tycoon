import { expect, Page, test } from "@playwright/test";
import { BASE_WALK_SPEED } from "../src/game/player-motion";
import { openStationSheet, takeAllHere } from "./machine-panel";
import {
  advanceTicks,
  movePlayerToCab,
  openTruckMenu,
  setPaused,
  startNewGame,
} from "./navigation";

/**
 * Everything the keyboard does.
 *
 * Two halves, and they're the same subject from two angles. The first is
 * routing: which key reaches which scope, what a modal swallows, what the
 * browser's own focus handling keeps. The second is the operate key, which is
 * the only binding whose *state* matters rather than its presses — attended
 * work advances while it's held and stops when it isn't, so letting go is an
 * assertion about the keyboard as much as about the glue.
 *
 * None of this is reachable outside a browser: it lives in listener ordering
 * and document.activeElement. Both of the input bugs this suite has caught
 * were here.
 */

const WORKSPACE_CELL: [number, number] = [1, 4];
const FAR_AWAY: [number, number] = [0, 0];

const getState = (page: Page) =>
  page.evaluate(() => (window as any).__GET_GAME_STATE__());

const playerPosition = async (page: Page): Promise<[number, number]> =>
  (await getState(page)).player.position;

function workspaceCard(page: any) {
  return page.locator("section", { hasText: "Makeshift Workbench" });
}

async function teleportPlayer(page: any, position: [number, number]) {
  await page.evaluate((pos: [number, number]) => {
    (window as any).__UPDATE_GAME_STATE__((state: any) => ({
      ...state,
      player: { ...state.player, position: pos },
    }));
  }, position);
  await page.waitForTimeout(30);
}

async function workspaceProgress(page: any) {
  return page.evaluate(
    () =>
      (window as any)
        .__GET_GAME_STATE__()
        .machines.find((m: any) => m.machineTypeId === "workspace")
        .operationProgress,
  );
}

test.describe("Keyboard", () => {
  test("routes every key, scopes to modals, and holds to work", async ({
    page,
  }) => {
    // Many small steps; the default 30s budget is tight on slow machines
    test.setTimeout(120000);
    page.on("dialog", (d) => d.accept());

    await test.step("start a game with every screen unlocked", async () => {
      await page.goto("/");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForSelector("main");
      await startNewGame(page);
      await page.waitForFunction(() => (window as any).__GET_GAME_STATE__);

      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["layout-with-placed-machines"],
        );
      });
      // No fixture ships with the marketplace unlocked, which gates the phone.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          progression: {
            ...s.progression,
            marketplaceUnlocked: true,
          },
        }));
      });
    });

    // Movement is continuous and rAF-driven: hold a key and the body walks
    // in frame-timed bursts, and GameState's cell updates as the body
    // crosses boundaries. Two things make an exact-cell wait unreliable
    // under headless throttling: the body can cross several 1-ft cells
    // between two polls, and a previous key's `keyup` handler can run late
    // (starved event loop), briefly leaving that key held into the next
    // press — a stale rightward key while pressing down reads as diagonal.
    //
    // So each step: settle to rest first (which proves no key still drives
    // the body — a stale key would keep it moving), hold the key until the
    // cell first changes, release, and assert the move went one net step in
    // the key's own direction with no cross-axis drift. That verifies the
    // binding → direction mapping without pinning a burst-sensitive cell.
    //
    // `settle` serves the steps that assert a key did *nothing* as well.
    // Those compare a cell read before the hold against one read after, so a
    // body still coasting from an earlier step fails them without any key
    // having been delivered — the baseline has to come from rest, taken as
    // late as the step allows.
    const same = (a: [number, number], b: [number, number]) =>
      a[0] === b[0] && a[1] === b[1];
    // Rest has to be measured in wall time rather than in polls. A poll is a
    // round-trip of a millisecond or two, so a handful of agreeing reads can
    // span less time than one cell takes to cross and still call a walking
    // body stopped — which is how a baseline read here ends up naming a cell
    // the body is already leaving. Hold the same cell for a couple of
    // crossings instead.
    const CELL_CROSSING_MS = 1000 / BASE_WALK_SPEED;
    const REST_MS = CELL_CROSSING_MS * 2.5;
    const settle = async (): Promise<[number, number]> => {
      let prev = await playerPosition(page);
      let held = Date.now();
      const deadline = Date.now() + 5000;
      while (Date.now() - held < REST_MS) {
        if (Date.now() > deadline) {
          throw new Error(
            `the body never came to rest (last at ${prev}). A keyup handler ` +
              `was probably dropped, leaving that key held.`,
          );
        }
        await page.waitForTimeout(25);
        const p = await playerPosition(page);
        if (!same(p, prev)) {
          prev = p;
          held = Date.now();
        }
      }
      return prev;
    };
    const walkOneStep = async (key: string, dx: number, dy: number) => {
      const start = await settle();
      let reached = start;
      await page.keyboard.down(key);
      try {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const p = await playerPosition(page);
          if (!same(p, start)) {
            reached = p;
            break;
          }
        }
      } finally {
        await page.keyboard.up(key);
      }
      if (same(reached, start)) {
        throw new Error(
          `${key} never moved the body off ${start} in 10s. If this is not a ` +
            `broken binding, check the render cap in ShopView — walking is ` +
            `frame-driven, and a cap below 10fps slows it down.`,
        );
      }
      const [ax, cross] = dx !== 0 ? [0, 1] : [1, 0];
      const dir = dx !== 0 ? dx : dy;
      expect(reached[cross], `${key} drifted sideways`).toBe(start[cross]);
      expect(
        Math.sign(reached[ax] - start[ax]),
        `${key} should walk the body along axis ${ax}`,
      ).toBe(Math.sign(dir));
    };

    await test.step("WASD and the arrow keys both walk the player", async () => {
      expect(await playerPosition(page)).toEqual([5, 6]);
      await walkOneStep("d", 1, 0);
      await walkOneStep("ArrowDown", 0, 1);
      await walkOneStep("a", -1, 0);
    });

    await test.step("letter keys open the pocket overlays and toggle shut", async () => {
      await page.keyboard.press("j");
      const journal = page.getByRole("dialog", { name: "Journal" });
      await expect(journal).toBeVisible();
      await expect(page.getByText(/Craft Level/)).toBeVisible();
      // J re-binds inside the modal scope, so it toggles rather than only opens
      await page.keyboard.press("j");
      await expect(journal).toHaveCount(0);

      await page.keyboard.press("m");
      const phone = page.getByRole("dialog", { name: "Phone" });
      await expect(phone).toBeVisible();
      await page.keyboard.press("m");
      await expect(phone).toHaveCount(0);
    });

    await test.step("E opens the door card, 1 heads out to the store", async () => {
      const store = page.getByRole("dialog", { name: "Orange Box" });
      // Away from the door the digit is a dead key — no trip starts
      await page.keyboard.press("1");
      await expect(store).toHaveCount(0);

      // At the door, E spreads open the destination card; its rows claim
      // the number keys, and the store (first unlocked destination)
      // answers to 1
      await movePlayerToCab(page);
      await openTruckMenu(page);
      await page.keyboard.press("1");
      await expect(store).toBeVisible();
      // Escape heads home
      await page.keyboard.press("Escape");
      await expect(store).toHaveCount(0);
    });

    await test.step("the open card claims W, S, and E for its row cursor", async () => {
      const store = page.getByRole("dialog", { name: "Orange Box" });
      await movePlayerToCab(page);
      await openTruckMenu(page);
      const panel = page.getByTestId("truck-panel");
      const selected = panel.locator("li[data-selected]");
      // The cursor starts on the first row — the store
      await expect(selected).toContainText("Orange Box");

      // W and S drive the cursor, not the body: the highlight moves down
      // and back while the player stays planted at the cab
      const before = await settle();
      await page.keyboard.press("s");
      await expect(selected).not.toContainText("Orange Box");
      await page.keyboard.press("w");
      await expect(selected).toContainText("Orange Box");
      expect(await playerPosition(page)).toEqual(before);

      // E takes the highlighted row instead of folding the card
      await page.keyboard.press("e");
      await expect(store).toBeVisible();
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
      // Space runs the machine you're standing at, so the dispatcher has to
      // let a focused control keep its own activation key.
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
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
    });

    await test.step("a modal swallows the game's movement keys", async () => {
      // The trip card folds itself the moment the truck pulls out, so
      // coming home leaves nothing to back out of — Escape reaches the
      // pause menu directly.
      const paused = page.getByRole("dialog", { name: "Paused" });
      await page.keyboard.press("Escape");
      await expect(paused).toBeVisible();

      // Nothing focused, so there's no input to guard — this stays put purely
      // because an open modal disables the held-movement listener.
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur(),
      );
      // Baseline from rest, with the menu already up. Read it any earlier
      // and it names a cell the body is still walking out of — the reading
      // after the hold then differs on its own, and the step fails claiming
      // a key got through when none did.
      const before = await settle();
      await page.keyboard.down("d");
      await page.waitForTimeout(500);
      await page.keyboard.up("d");
      expect(await playerPosition(page)).toEqual(before);

      await page.keyboard.press("Escape");
      await expect(paused).toHaveCount(0);
    });

    await test.step("keys work again once the modal is closed", async () => {
      // From rest, so that a body still drifting out of the last step can't
      // stand in for the key having been delivered. Held key is "s": the
      // player stands beside the truck's cab after the store trip, where
      // rightward walking is blocked by the body of the truck but the
      // grass below is open.
      const before = await settle();
      await page.keyboard.down("s");
      try {
        await expect
          .poll(() => playerPosition(page), { intervals: [50] })
          .not.toEqual(before);
      } finally {
        await page.keyboard.up("s");
      }
    });

    await test.step("the browser's own UI stays out of the game", async () => {
      // Tab on the open floor doesn't walk focus through the page's buttons
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(
        () => document.activeElement?.tagName ?? "BODY",
      );
      expect(focused).toBe("BODY");
      // Right-click never opens the native context menu
      const prevented = await page.evaluate(() => {
        const event = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      });
      expect(prevented).toBe(true);
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

      // The step before this one walked the body; wait for it to stop.
      const before = await settle();

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
      // The scavenge trip overlay mounts on the away state. Waiting for it
      // proves React has re-rendered with the new state, which is what the
      // guard reads. (A real player gets here by clicking "Go", which
      // re-renders before they can touch the keyboard; injecting state
      // skips that.)
      await expect(page.getByText("Out scavenging for pallets")).toBeVisible();

      const before = await settle();
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

    await test.step("the top bar's buttons advertise their keys", async () => {
      await page.getByRole("button", { name: /^Skills/ }).hover();
      // Scoped by text so a stale tooltip elsewhere can't shadow this one
      const tip = page.getByRole("tooltip").filter({ hasText: "Your journal" });
      await expect(tip).toBeVisible();
      await expect(tip.locator("kbd")).toHaveText("J");
    });

    await test.step("the hands strip floats up when something's carried", async () => {
      // Empty hands, no strip — an empty strip is just chrome
      await expect(page.getByTestId("hands-strip")).toHaveCount(0);
      // Back indoors: the earlier trip steps left the player on the lot,
      // and setting a piece down is a shop-floor verb.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          player: { ...s.player, position: [6, 10] },
        }));
      });
      await page.waitForTimeout(30);
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          player: {
            ...s.player,
            inventory: [
              {
                id: "hud-board",
                type: "board",
                species: "pallet",
                length: 24,
                width: 4,
                thickness: 1,
              },
            ],
          },
        }));
      });
      const strip = page.getByTestId("hands-strip");
      await expect(strip).toBeVisible();
      await expect(strip.getByText("In hand")).toBeVisible();
      // Clicking a slot sets the piece down where the player stands
      await strip.getByRole("button").first().click();
      await expect(strip).toHaveCount(0);
    });

    await test.step("R rummages the pile and E takes the outlined piece", async () => {
      // Two different boards on one cell. The chip names the piece a plain
      // press grabs — the one dropped last, on top of the pile — and R
      // steps the target through the rest.
      await page.evaluate(() => {
        const board = (id: string, species: string) => ({
          id,
          type: "board",
          species,
          width: 4,
          length: 24,
          thickness: 1,
          surface: "rough",
        });
        (window as any).__UPDATE_GAME_STATE__((s: any) => ({
          ...s,
          player: { ...s.player, position: [6, 10], inventory: [] },
          materialPiles: [
            {
              material: board("pile-oak", "oak"),
              position: [6.5, 10.5],
              rotation: 0,
            },
            {
              material: board("pile-pine", "pine"),
              position: [6.5, 10.5],
              rotation: 0,
            },
          ],
        }));
      });
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );

      // Pine went down last, so it's on top and the chip offers it first
      const chip = page.getByText(/pick up · /);
      await expect(chip).toContainText(/Pine/);
      await expect(chip).toContainText("1 of 2");

      // R re-aims the chip (and the outline it mirrors) at the next piece
      await page.keyboard.press("r");
      await expect(chip).toContainText(/Oak/);
      await expect(chip).toContainText("2 of 2");

      // E takes exactly the piece the chip named
      await page.keyboard.press("e");
      const carried = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().player.inventory,
      );
      expect(carried).toHaveLength(1);
      expect(carried[0].species).toBe("oak");
      // The pile re-stacks under the chip: the remaining piece is on top
      await expect(chip).toContainText(/Pine/);
      // Clear the hands so later steps start from the fixture they load
      await page.keyboard.press("f");
    });

    // ---- the operate key -------------------------------------------------
    // A shop with strips to sand and glue, so the hold-to-work half has
    // something to work on.
    await test.step("switch to a shop with work in it", async () => {
      await page.evaluate(() => {
        const fixtures = (window as any).__TEST_FIXTURES__;
        (window as any).__UPDATE_GAME_STATE__(
          () => fixtures["cutting-board-shop"],
        );
      });
      await page.waitForTimeout(30);
    });

    await test.step("sanding ignores Space — the bench view owns hand work", async () => {
      // The tool rack lives on the station sheet
      await openStationSheet(page);
      // Two tools ride in hand (sander and finishing kit) — name the one
      await page
        .getByRole("button", { name: "Attach the Random Orbit Sander" })
        .click();
      await page.waitForTimeout(30);
      // F stages the first strip
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("f");
      await page.waitForTimeout(30);
      // Tool work no longer appears in the plan picker — the block in
      // hand offers it on the bench top. The driver-path selection is
      // written directly, exactly the way ShopDriver selects work.
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          machines: state.machines.map((m: any) =>
            m.machineTypeId === "workspace"
              ? { ...m, selectedOperationId: "orbitSandBoard" }
              : m,
          ),
        }));
      });

      // Space is not a path into hand work: held at the bench, nothing
      // starts (docs/bench-minigames.md decision 1)
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.down("Space");
      await page.waitForTimeout(600);
      await page.keyboard.up("Space");
      expect((await workspaceProgress(page)).status).toBe("notStarted");

      // Started through the real start commit, held Space still moves
      // nothing: the tick never advances interactive attended work —
      // the strokes do, and their commit is the same action tests use
      await page.evaluate(() => {
        const i = (window as any)
          .__GET_GAME_STATE__()
          .machines.findIndex((m: any) => m.machineTypeId === "workspace");
        (window as any).__START_OPERATION__(i);
      });
      await expect
        .poll(async () => (await workspaceProgress(page)).status)
        .toBe("inProgress");
      const before = await workspaceProgress(page);
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.down("Space");
      await page.waitForTimeout(800);
      await page.keyboard.up("Space");
      expect((await workspaceProgress(page)).ticksRemaining).toBe(
        before.ticksRemaining,
      );

      // The finish commit resolves the pass: a sanded strip in the bay
      await page.evaluate(() => {
        const i = (window as any)
          .__GET_GAME_STATE__()
          .machines.findIndex((m: any) => m.machineTypeId === "workspace");
        (window as any).__FINISH_ATTENDED_WORK__(i);
      });
      await page.waitForFunction(() =>
        (window as any)
          .__GET_GAME_STATE__()
          .machines.some((m: any) =>
            m.outputMaterials.some(
              (mat: any) => mat.type === "board" && mat.surface === "sanded",
            ),
          ),
      );
      await takeAllHere(page);
    });

    await test.step("the bench view pins the feet — no walking away mid-lean", async () => {
      // The full-window bench view is open from the step above. Held
      // movement keys drive nothing while leaning over the bench…
      const positionOf = () =>
        page.evaluate(
          () => (window as any).__GET_GAME_STATE__().player.position,
        );
      await expect(page.getByTestId("bench-work")).toBeVisible();
      const pinned = await positionOf();
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.down("d");
      await page.waitForTimeout(500);
      await page.keyboard.up("d");
      expect(await positionOf()).toEqual(pinned);

      // …and stepping back (Tab) frees them again
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("bench-work")).toHaveCount(0);
      await page.keyboard.down("d");
      await page.waitForTimeout(500);
      await page.keyboard.up("d");
      expect(await positionOf()).not.toEqual(pinned);
      // Walk back for the next step's glue-up
      await page.keyboard.down("a");
      await page.waitForTimeout(500);
      await page.keyboard.up("a");
    });

    await test.step("glue-up: clamping needs you, curing runs without you", async () => {
      // No plan for a glue-up: the run of stock lying on the bench IS
      // the operation (bench-work/glue-up.ts). Shift+F stages the
      // strips — the 4 smooth ones and the sanded one — in one press.
      await teleportPlayer(page, [1, 4]);
      await page.evaluate(() =>
        (document.activeElement as HTMLElement)?.blur?.(),
      );
      await page.keyboard.press("Shift+f");
      await page.waitForTimeout(30);

      // Tightening the last clamp is the single commit: the claim of
      // the very pieces in the clamps (startGlueUpAction) and the
      // handoff into the hands-free cure resolve back to back through
      // the same actions the bench view dispatches
      await page.evaluate(() => {
        const i = (window as any)
          .__GET_GAME_STATE__()
          .machines.findIndex((m: any) => m.machineTypeId === "workspace");
        const bench = (window as any).__GET_GAME_STATE__().machines[i];
        (window as any).__START_GLUE_UP__(
          i,
          bench.inputMaterials
            .filter((mat: any) => mat.type === "board")
            .map((mat: any) => mat.id),
        );
        (window as any).__FINISH_ATTENDED_WORK__(i);
      });
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.find((m: any) => m.machineTypeId === "workspace")
            .operationProgress.phaseIndex === 1,
      );
      // The phase-by-phase status reads off the station sheet
      await openStationSheet(page);
      await expect(
        workspaceCard(page).getByText(/Curing \(hands-free\)/),
      ).toBeVisible();

      // Walk away mid-cure: hands-free work needs no attendance, so the
      // ticks that do pass advance it with the player across the shop.
      // (They come from the clock spending time elsewhere — an idle shop
      // barely ticks now, so the spec feeds them directly.)
      await teleportPlayer(page, FAR_AWAY);
      const cureBefore = await workspaceProgress(page);
      await advanceTicks(page, 5);
      await expect
        .poll(async () => (await workspaceProgress(page)).ticksRemaining)
        .toBeLessThan(cureBefore.ticksRemaining);

      // With a cure running and nobody working, the player's cluster
      // offers the wait key — and holding it spins the clock much
      // faster than the idle creep ever would
      await expect(page.getByText("hold to pass time")).toBeVisible();
      const tickBefore = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().tick,
      );
      await page.keyboard.down("t");
      // The rate ramps up from a gentle start, so give the wind-up room
      await expect
        .poll(
          () => page.evaluate(() => (window as any).__GET_GAME_STATE__().tick),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(tickBefore + 10);
      await page.keyboard.up("t");

      // Fast-forward the rest of the cure; the panel finishes with the
      // player still across the shop
      await advanceTicks(page, 200);
      await page.waitForFunction(
        () =>
          (window as any)
            .__GET_GAME_STATE__()
            .machines.some((m: any) =>
              m.outputMaterials.some((mat: any) => mat.type === "panel"),
            ),
        undefined,
        { timeout: 15000 },
      );
      const playerPosition = await page.evaluate(
        () => (window as any).__GET_GAME_STATE__().player.position,
      );
      expect(playerPosition).toEqual(FAR_AWAY);
    });
  });
});
