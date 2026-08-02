import { test, expect } from "@playwright/test";
import { startNewGame } from "./navigation";

/**
 * The bench view: the zoomed work surface where hand work is performed
 * with the pointer (see docs/bench-minigames.md). A genuinely new kind
 * of interface — pointer-primary over a canvas — which is the bar for a
 * seventh spec file.
 *
 * Canvas drags are the flakiest tool in the box, so this file does
 * exactly one real drag per gesture type — one stroke (sanding), one
 * press (a pry) — and everything else sets up through fixtures and
 * asserts on wiring: which script mounts, what the chips offer, what
 * the commits did to the state. What the mechanics produce is the
 * sequence tier's job.
 */

declare global {
  interface Window {
    __TEST_FIXTURES__: Record<string, unknown>;
    __UPDATE_GAME_STATE__: (fn: (state: unknown) => unknown) => void;
    __GET_GAME_STATE__: () => any;
  }
}

/** The stage's logical size (see bench-view/stageMath.ts). */
const STAGE_W = 460;
const STAGE_H = 320;

/** A point in stage-logical pixels → page coordinates inside the box. */
function stagePoint(
  box: { x: number; y: number; width: number; height: number },
  logicalX: number,
  logicalY: number,
) {
  return {
    x: box.x + (logicalX / STAGE_W) * box.width,
    y: box.y + (logicalY / STAGE_H) * box.height,
  };
}

test.describe("Bench view", () => {
  // The bench sheet (work canvas + plan picker + racks) runs tall; the
  // default 720px viewport clips the canvas top and strokes fall on the
  // backdrop instead of the wood.
  test.use({ viewport: { width: 1280, height: 900 } });

  test("hand work happens on the bench's zoomed work surface", async ({
    page,
  }) => {
    test.setTimeout(300000);
    await page.goto("/");
    await startNewGame(page);
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
    // The manual greets a new game and holds the keyboard until dismissed
    const manual = page.getByRole("dialog", { name: "Shop manual" });
    if (await manual.count()) {
      await page.keyboard.press("Escape");
      await manual.waitFor({ state: "detached" });
    }
    await page.evaluate(() => {
      window.__UPDATE_GAME_STATE__(
        () => window.__TEST_FIXTURES__["bench-work-shop"],
      );
    });
    await page.waitForTimeout(400);

    const machineState = () =>
      page.evaluate(() => {
        const m = window.__GET_GAME_STATE__().machines[0];
        return {
          status: m.operationProgress.status,
          phaseIndex: m.operationProgress.phaseIndex,
          inputs: m.inputMaterials.length,
          outputs: m.outputMaterials.map((o: any) => ({
            type: o.type,
            surface: o.surface,
            width: o.width,
          })),
        };
      });
    const blur = () =>
      page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

    await test.step("Space won't run hand work — the chips send it to the bench", async () => {
      // The chip row offers the plan "by hand" at the sheet key, and the
      // operate key does nothing: the mini-game is the only player path.
      await expect(page.getByText("sand board by hand")).toBeVisible();
      await blur();
      await page.keyboard.down("Space");
      await page.waitForTimeout(400);
      await page.keyboard.up("Space");
      expect((await machineState()).status).toBe("notStarted");
    });

    await test.step("Tab spreads the bench open onto the stroke surface", async () => {
      await blur();
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("station-sheet")).toBeVisible();
      const work = page.getByTestId("bench-work");
      await expect(work).toHaveAttribute("data-script", "stroke");
      await expect(page.getByTestId("bench-stage")).toBeVisible();
      // The plan picker survives inside the bench view, pinned below
      await expect(page.getByText("Plan")).toBeVisible();
    });

    await test.step("one real stroke starts the pass; strokes finish it", async () => {
      // The 4"×24" board stands mid-stage; sand along its length in
      // overlapping columns. The first stroke is the one real gesture
      // under test — it must start the operation and move the needle.
      // The box is measured per stroke: starting the operation re-renders
      // the sheet and can shift the canvas under a cached box.
      const column = async (logicalX: number) => {
        await page.getByTestId("bench-stage").scrollIntoViewIfNeeded();
        const box = (await page.getByTestId("bench-stage").boundingBox())!;
        const top = stagePoint(box, logicalX, 26);
        await page.mouse.move(top.x, top.y);
        await page.mouse.down();
        for (let i = 1; i <= 14; i++) {
          const at = stagePoint(box, logicalX, 26 + (270 * i) / 14);
          await page.mouse.move(at.x, at.y, { steps: 2 });
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
      };
      // A deliberate press on the board starts the pass (the sheet can
      // re-render around the canvas as the operation claims the piece)…
      const startBox = (await page.getByTestId("bench-stage").boundingBox())!;
      const at = stagePoint(startBox, 230, 160);
      await page.mouse.click(at.x, at.y);
      await expect
        .poll(async () => (await machineState()).status)
        .toBe("inProgress");
      // …and one real stroke moves the needle.
      await column(230);
      const progress = Number(
        await page.getByTestId("bench-work").getAttribute("data-progress"),
      );
      expect(progress).toBeGreaterThan(0);

      // Sanding the whole board by synthetic mouse is feel, not wiring —
      // the coverage math is unit-tested and the strokes above proved the
      // canvas path. Completion goes through the same finish commit the
      // surface dispatches at 98%.
      await page.evaluate(() => (window as any).__FINISH_ATTENDED_WORK__(0));
      await expect
        .poll(async () => (await machineState()).status)
        .toBe("notStarted");
      expect((await machineState()).outputs).toEqual([
        { type: "board", surface: "smooth", width: 4 },
      ]);
    });

    await test.step("the pallet pries apart one real press at a time", async () => {
      // Restage the bench for dismantling: the fixture's pallet moves
      // from its floor pile onto the bench, plan already Dismantle.
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          materialPiles: [],
          machines: state.machines.map((m: any, i: number) =>
            i === 0
              ? {
                  ...m,
                  selectedOperationId: "dismantlePallet",
                  inputMaterials: [
                    state.materialPiles[0].material,
                    ...m.inputMaterials,
                  ],
                  outputMaterials: [],
                }
              : m,
          ),
        }));
      });
      const work = page.getByTestId("bench-work");
      await expect(work).toHaveAttribute("data-script", "pry");

      // One real press on a marked nail: the top stringer's nail sits at
      // workpiece (23", 0") — stage-logical (230, 36) under the pallet's
      // fit (pxPerIn ≈ 7.29, origin ≈ (62, 36)).
      const box = (await page.getByTestId("bench-stage").boundingBox())!;
      const nail = stagePoint(box, 230, 36);
      await page.mouse.click(nail.x, nail.y);
      // The pry takes a beat — the lever animation is the pacing
      await expect
        .poll(async () =>
          page.evaluate(
            () => window.__GET_GAME_STATE__().consumables.nails ?? 0,
          ),
        )
        .toBe(1);
      const after = await machineState();
      // The freed stringer popped out mid-job — real state, not a payout
      expect(after.outputs).toEqual([
        { type: "board", surface: "rough", width: 6 },
      ]);
      const palletLeft = await page.evaluate(() => {
        const pallet = window
          .__GET_GAME_STATE__()
          .machines[0].inputMaterials.find((m: any) => m.type === "pallet");
        return pallet?.stringerBoardsLeft;
      });
      expect(palletLeft).toBe(2);
    });

    await test.step("glue, assembly, saw, and the cure each mount their script", async () => {
      const scriptFor = async (overrides: Record<string, unknown>) => {
        await page.evaluate((over) => {
          window.__UPDATE_GAME_STATE__((state: any) => ({
            ...state,
            clamps: 6,
            consumables: { ...state.consumables, nails: 20 },
            progression: {
              ...state.progression,
              unlockedSkills: [
                ...new Set([
                  ...state.progression.unlockedSkills,
                  "panelWork",
                  "rusticCarpentry",
                ]),
              ],
            },
            machines: state.machines.map((m: any, i: number) =>
              i === 0
                ? {
                    ...m,
                    processingMaterials: [],
                    outputMaterials: [],
                    operationProgress: {
                      status: "notStarted",
                      phaseIndex: 0,
                      ticksRemaining: 0,
                    },
                    ...over,
                  }
                : m,
            ),
          }));
        }, overrides);
        return page.getByTestId("bench-work").getAttribute("data-script");
      };

      const strip = (id: string) => ({
        id,
        type: "board",
        species: "maple",
        length: 2,
        width: 2,
        thickness: 4,
        surface: "smooth",
        jointedFaces: 2,
        jointedEdges: 2,
      });
      expect(
        await scriptFor({
          selectedOperationId: "glueUpPanel",
          inputMaterials: [
            strip("g1"),
            strip("g2"),
            strip("g3"),
            strip("g4"),
            strip("g5"),
          ],
        }),
      ).toBe("glue");

      const palletBoard = (id: string, w: number, l: number, t: number) => ({
        id,
        type: "board",
        species: "pallet",
        length: l,
        width: w,
        thickness: t,
        surface: "rough",
        jointedFaces: 1,
        jointedEdges: 2,
      });
      expect(
        await scriptFor({
          tools: ["sandingBlock", "hammer"],
          selectedOperationId: "buildRusticPalletShelf",
          inputMaterials: [
            palletBoard("a1", 6, 4, 3),
            palletBoard("a2", 6, 4, 3),
            palletBoard("a3", 4, 3, 1),
            palletBoard("a4", 4, 3, 1),
            palletBoard("a5", 4, 3, 1),
          ],
        }),
      ).toBe("assembly");

      expect(
        await scriptFor({
          tools: ["sandingBlock", "handSaw"],
          selectedOperationId: "handSawCut",
          selectedParameters: { angle: 0, cutEnd: "left", targetLength: 2 },
          inputMaterials: [palletBoard("saw1", 4, 3, 1)],
        }),
      ).toBe("saw");

      // Mid-cure the surface stands down and says so
      expect(
        await scriptFor({
          selectedOperationId: "glueUpPanel",
          inputMaterials: [],
          processingMaterials: [
            strip("c1"),
            strip("c2"),
            strip("c3"),
            strip("c4"),
            strip("c5"),
          ],
          operationProgress: {
            status: "inProgress",
            phaseIndex: 1,
            ticksRemaining: 30,
          },
        }),
      ).toBe("curing");
      await expect(page.getByText("the glue cures on its own")).toBeVisible();
    });
  });
});
