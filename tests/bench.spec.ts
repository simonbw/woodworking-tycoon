import { test, expect } from "@playwright/test";
import { startNewGame } from "./navigation";

/**
 * The bench view: the zoomed work surface where hand work is performed
 * with the pointer (see docs/bench-work.md). A genuinely new kind
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

/**
 * A point in workpiece inches → page coordinates. The stage publishes
 * its current fit (px-per-inch and the workpiece origin) as data
 * attributes, and the canvas renders at CSS size, so the mapping is a
 * straight offset — no logical-to-physical scaling involved.
 */
async function inchPoint(
  page: import("@playwright/test").Page,
  xIn: number,
  yIn: number,
) {
  const stage = page.getByTestId("bench-stage");
  await stage.scrollIntoViewIfNeeded();
  const box = (await stage.boundingBox())!;
  const pxPerIn = Number(await stage.getAttribute("data-px-per-in"));
  const originX = Number(await stage.getAttribute("data-origin-x"));
  const originY = Number(await stage.getAttribute("data-origin-y"));
  return {
    x: box.x + originX + xIn * pxPerIn,
    y: box.y + originY + yIn * pxPerIn,
  };
}

/** A point in pallet inches → page coordinates: the stage also publishes
 * the staged pallet's top-left corner in bench inches. */
async function palletPoint(
  page: import("@playwright/test").Page,
  xIn: number,
  yIn: number,
) {
  const stage = page.getByTestId("bench-stage");
  const palletX = Number(await stage.getAttribute("data-pallet-x"));
  const palletY = Number(await stage.getAttribute("data-pallet-y"));
  return inchPoint(page, palletX + xIn, palletY + yIn);
}

test.describe("Bench view", () => {
  // The bench view fills the window; a roomy viewport keeps the zoom
  // comfortable for the synthetic strokes.
  test.use({ viewport: { width: 1280, height: 900 } });

  test("hand work happens on the bench's zoomed work surface", async ({
    page,
  }) => {
    test.setTimeout(300000);
    await page.goto("/");
    await startNewGame(page);
    await page.waitForFunction(() => (window as any).__UPDATE_GAME_STATE__);
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
          inputs: m.inputMaterials.map((o: any) => ({
            type: o.type,
            surface: o.surface,
            width: o.width,
          })),
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
      // The chip row offers exactly one door — "[Tab] use" at the sheet
      // key — and the operate key does nothing: the bench view is the
      // only player path to hand work.
      await expect(page.getByTestId("machine-chips")).toContainText("use");
      await blur();
      await page.keyboard.down("Space");
      await page.waitForTimeout(400);
      await page.keyboard.up("Space");
      expect((await machineState()).status).toBe("notStarted");
    });

    await test.step("out on the floor the bench has no controls to wear", async () => {
      // Mount a hand saw and leave its last cut named in
      // selectedOperationId with its dials set — the state any tool work
      // leaves behind. None of it is the floor's business: a bench out
      // here is a table, so the chips name only what moves stock on and
      // off it, and the operation keys stand down.
      const bench = () =>
        page.evaluate(() => {
          const m = window
            .__GET_GAME_STATE__()
            .machines.find((m: any) => m.machineTypeId === "workspace");
          return {
            selectedOperationId: m.selectedOperationId,
            targetLength: m.selectedParameters?.targetLength,
          };
        });
      const before = await page.evaluate(() =>
        JSON.stringify(
          window
            .__GET_GAME_STATE__()
            .machines.find((m: any) => m.machineTypeId === "workspace"),
        ),
      );
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          machines: state.machines.map((m: any) =>
            m.machineTypeId === "workspace"
              ? {
                  ...m,
                  tools: ["sandingBlock", "handSaw"],
                  selectedOperationId: "handSawCut",
                  selectedParameters: {
                    angle: 0,
                    cutEnd: "right",
                    targetLength: 24,
                  },
                }
              : m,
          ),
        }));
      });

      const chips = page.getByTestId("machine-chips");
      await expect(chips).toContainText("use");
      for (const control of ["angle", "cut end", "target length"]) {
        await expect(chips).not.toContainText(control);
      }

      // And the keys those chips would have named are unbound out here:
      // Z leaves the saw's mark alone, Q leaves the pile unthumbed.
      await blur();
      await page.keyboard.press("z");
      await page.keyboard.press("q");
      await page.waitForTimeout(50);
      expect(await bench()).toEqual({
        selectedOperationId: "handSawCut",
        targetLength: 24,
      });

      await page.evaluate((snapshot) => {
        const restored = JSON.parse(snapshot);
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          machines: state.machines.map((m: any) =>
            m.machineTypeId === "workspace" ? restored : m,
          ),
        }));
      }, before);
    });

    await test.step("Tab spreads the bench open onto the scene — no plan for tool work", async () => {
      await blur();
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("station-sheet")).toBeVisible();
      // Tool work isn't a plan: the stale Sand Board selection in the
      // fixture is inert, the bench opens idle with the board lying on
      // it, and the plan pile holds only builds — no sanding sheet
      const work = page.getByTestId("bench-work");
      await expect(work).toHaveAttribute("data-script", "idle");
      // The camera lean-in (benchZoom) must have landed before any hand
      // work: input is gated on it. The suite runs with reduced motion
      // emulated, so the zoom resolves immediately — every gesture in
      // this spec would stall against a mid-flight stage otherwise.
      await expect(work).toHaveAttribute("data-zoom", "open");
      await expect(page.getByTestId("bench-stage")).toBeVisible();
      const corner = page.getByTestId("blueprint-corner");
      await expect(corner).toBeVisible();
      await expect(corner).not.toContainText("Sand Board");
      await corner.click();
      await expect(page.getByTestId("blueprint-stack")).toBeVisible();
      await expect(
        page.getByTestId("blueprint-stack").getByText("Sand Board"),
      ).toHaveCount(0);
      await corner.click();
      // The sanding block hangs on the rail, waiting for a hand
      await expect(page.getByTestId("bench-tool-sandingBlock")).toBeVisible();

      // Leaned in, Q is the pile's key: it thumbs to the next drawing
      // with that drawing right there to see. (Out on the floor the same
      // press does nothing — the step above.)
      const planId = () =>
        page.evaluate(
          () =>
            window
              .__GET_GAME_STATE__()
              .machines.find((m: any) => m.machineTypeId === "workspace")
              .selectedOperationId,
        );
      const stale = await planId();
      await blur();
      await page.keyboard.press("q");
      await expect.poll(planId).not.toBe(stale);
      await expect(corner).toContainText("Build");
      await page.evaluate((id) => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          machines: state.machines.map((m: any) =>
            m.machineTypeId === "workspace"
              ? { ...m, selectedOperationId: id }
              : m,
          ),
        }));
      }, stale);
    });

    await test.step("the coach's card stays up over the bench view", async () => {
      // The guided opening's bench steps are read mid-dive, so the
      // card rides above the bench view instead of fading with the
      // rest of the corner chips. The fixture retired the tutorial;
      // wake it back up.
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          progression: { ...state.progression, tutorialDismissed: false },
        }));
      });
      const card = page.getByTestId("tutorial-card");
      await expect(card).toBeVisible();
      // A real click, not a visibility check: it fails if the card is
      // ghosted behind the bench view's pointer surface or inert. It
      // also puts the fixture's dismissed tutorial back.
      await card.getByTestId("tutorial-skip").click();
      await expect(card).toBeHidden();
    });

    await test.step("right-click hangs the held tool back up", async () => {
      // At a bench the pointer is the hand, so letting go of a tool
      // shouldn't mean reaching for the keyboard. The binding is
      // registered (put-back-tool), so the rail teaches it too.
      const block = page.getByTestId("bench-tool-sandingBlock");
      await block.click();
      await expect(block).toHaveAttribute(
        "aria-label",
        "Hang up the Sanding Block",
      );
      await expect(page.getByTestId("bench-put-back-hint")).toBeVisible();

      const stage = page.getByTestId("bench-stage");
      const box = await stage.boundingBox();
      await page.mouse.click(
        box!.x + box!.width / 2,
        box!.y + box!.height / 2,
        {
          button: "right",
        },
      );

      await expect(block).toHaveAttribute(
        "aria-label",
        "Pick up the Sanding Block",
      );
      await expect(page.getByTestId("bench-put-back-hint")).toBeHidden();
    });

    await test.step("the sanding block strokes the board where it lies", async () => {
      // The fixture pins the 4"×24" board flat at bench (12,12) — it
      // spans x 10..14, y 0..24. Take the block off the rail; over the
      // board it reports the work it would start (tool-first selection).
      await page.getByTestId("bench-tool-sandingBlock").click();
      const work = page.getByTestId("bench-work");
      const stage = page.getByTestId("bench-stage");
      const over = await inchPoint(page, 12, 12);
      // Hover is pointer state computed on mousemove — wiggle until the
      // stage reports the offer, the same pattern the pry step uses
      let wiggleSand = 0;
      await expect
        .poll(async () => {
          await page.mouse.move(over.x + (wiggleSand++ % 2), over.y);
          return stage.getAttribute("data-work-hover");
        })
        .toBe("blockSandBoard");

      // Points are measured per stroke: starting the operation re-renders
      // the sheet and can shift the canvas under a cached box.
      const column = async (xIn: number) => {
        const top = await inchPoint(page, xIn, 1.5);
        await page.mouse.move(top.x, top.y);
        await page.mouse.down();
        for (let i = 1; i <= 14; i++) {
          const at = await inchPoint(page, xIn, 1.5 + (21 * i) / 14);
          await page.mouse.move(at.x, at.y, { steps: 2 });
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
      };
      // The press claims the very board under the block and starts the
      // pass (the sheet can re-render around the canvas as it does)…
      await page.mouse.click(over.x, over.y);
      await expect
        .poll(async () => (await machineState()).status)
        .toBe("inProgress");
      await expect(work).toHaveAttribute("data-script", "stroke");
      // …and one real stroke moves the needle, in place on the bench.
      await column(12);
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
      // The smooth board lies exactly where the rough one lay — the
      // finish commit hands the workpiece's spot to its output
      const seat = await page.evaluate(() => {
        const m = window.__GET_GAME_STATE__().machines[0];
        return m.benchLayout[m.outputMaterials[0].id];
      });
      expect(seat).toEqual({ xIn: 12, yIn: 12, angleDeg: 0, flipped: false });
      // Hang the block back up before the next act
      await page.keyboard.press("Escape");
    });

    await test.step("the pallet pries apart under the hammer, one press at a time", async () => {
      // Restage the bench for dismantling: the fixture's pallet moves
      // from its floor pile onto the bench — no plan gets selected; the
      // pallet itself is the offer — and a hammer joins the tool rail.
      await page.evaluate(() => {
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          materialPiles: [],
          machines: state.machines.map((m: any, i: number) =>
            i === 0
              ? {
                  ...m,
                  tools: ["sandingBlock", "hammer"],
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

      // The hammer comes off the rail and becomes the pointer
      await page.getByTestId("bench-tool-hammer").click();

      // Real presses walk one deck board's three nails — a nail sits on
      // every deck-board × stringer crossing, and the board only drops
      // with its last one. The center top-deck board's crossings are
      // pallet inches (17, 1), (17, 17), (17, 33), published through the
      // stage's fit attrs (the center column stays clear of the bench
      // view's floating corner chrome).
      const palletState = () =>
        page.evaluate(
          () =>
            window
              .__GET_GAME_STATE__()
              .machines[0].inputMaterials.find(
                (m: any) => m.type === "pallet",
              ) ?? null,
        );
      const first = await palletPoint(page, 17, 1);
      await page.mouse.click(first.x, first.y);
      // The pry takes a beat — the hammer's lever is the pacing
      await expect
        .poll(async () =>
          page.evaluate(
            () => window.__GET_GAME_STATE__().consumables.nails ?? 0,
          ),
        )
        .toBe(1);
      // One nail banked, but two still hold the board: nothing freed
      expect((await palletState()).nails).toHaveLength(23);
      expect((await machineState()).inputs).not.toContainEqual(
        expect.objectContaining({ type: "board" }),
      );
      for (const yIn of [17, 33]) {
        // One pull per lever: presses inside PRY_MS are deliberately
        // ignored, so give each one its beat before the next
        await page.waitForTimeout(400);
        const at = await palletPoint(page, 17, yIn);
        await page.mouse.click(at.x, at.y);
      }
      await expect
        .poll(async () =>
          page.evaluate(
            () => window.__GET_GAME_STATE__().consumables.nails ?? 0,
          ),
        )
        .toBe(3);
      const after = await machineState();
      // The last nail freed exactly that board — lying on the bench in
      // the input bay, ready for the next plan, nothing in an output tray
      expect(after.inputs).toContainEqual({
        type: "board",
        surface: "rough",
        width: 4,
      });
      expect(after.outputs).toEqual([]);
      // The exact deck board whose nails were pressed came off
      expect((await palletState()).deckBoards[5]).toBe(false);
      expect((await palletState()).stringers).toEqual([true, true, true]);

      // E takes the piece under the pointer — the freed board, which the
      // pry tossed onto the pile in the bench's back-left corner instead
      // of leaving it lying over nails still to pull. On the 40×30
      // makeshift top a 36" deck board rides 18" in and 2" down. Hover is
      // pointer state computed on mousemove, so under load the first move
      // can land before the freed board reaches the scene — wiggle until
      // the stage reports the board under the hand, then take it.
      await page.keyboard.press("Escape"); // hang the hammer up
      const pile = await inchPoint(page, 18, 2);
      let wiggle = 0;
      await expect
        .poll(async () => {
          await page.mouse.move(pile.x + (wiggle++ % 2), pile.y);
          return page.getByTestId("bench-stage").getAttribute("data-hovered");
        })
        .toBe("fx-bench-pallet:deck-5");
      await page.keyboard.press("e");
      await expect
        .poll(async () =>
          page.evaluate(() =>
            window.__GET_GAME_STATE__().player.inventory.map((m: any) => m.id),
          ),
        )
        .toContain("fx-bench-pallet:deck-5");

      // F over the pallet turns it over — the bottom face's own nails
      // come on offer (they're driven from that side). Hover is pointer
      // state: nudge the mouse so the pallet is what's under the hand —
      // its middle, well clear of the pile up in the corner.
      const palletMiddle = await palletPoint(page, 23, 17);
      await page.mouse.move(palletMiddle.x + 6, palletMiddle.y + 6);
      await page.waitForTimeout(150);
      await page.keyboard.press("f");
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              window.__GET_GAME_STATE__().machines[0].benchLayout?.[
                "fx-bench-pallet"
              ]?.flipped ?? false,
          ),
        )
        .toBe(true);
      await page.getByTestId("bench-tool-hammer").click();
      // Bottom board 0's crossing at local (6.33, 1) mirrors to (27.67, 1)
      await page.waitForTimeout(400);
      const bottomNail = await palletPoint(page, 34 - 6.33, 1);
      await page.mouse.click(bottomNail.x, bottomNail.y);
      await expect
        .poll(async () =>
          page.evaluate(
            () => window.__GET_GAME_STATE__().consumables.nails ?? 0,
          ),
        )
        .toBe(4);
      const nailsLeft = await palletState();
      expect(
        nailsLeft.nails.some((n: any) => n.deck === 0 && n.stringer === 0),
      ).toBe(false);
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
        length: 24,
        width: 2,
        thickness: 4,
        surface: "smooth",
        jointedFaces: 2,
        jointedEdges: 2,
      });
      // Glue is plan-free: the script mounts when a butted run LIES on
      // the bench, whatever plan is (or isn't) selected
      expect(
        await scriptFor({
          selectedOperationId: "dismantlePallet",
          inputMaterials: [
            strip("g1"),
            strip("g2"),
            strip("g3"),
            strip("g4"),
            strip("g5"),
          ],
          benchLayout: Object.fromEntries(
            ["g1", "g2", "g3", "g4", "g5"].map((id, i) => [
              id,
              { xIn: 14 + i * 2, yIn: 12, angleDeg: 0, flipped: false },
            ]),
          ),
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
            palletBoard("a1", 6, 48, 6),
            palletBoard("a2", 6, 48, 6),
            palletBoard("a3", 4, 36, 2),
            palletBoard("a4", 4, 36, 2),
            palletBoard("a5", 4, 36, 2),
          ],
        }),
      ).toBe("assembly");

      // A saw cut mid-kerf (refresh mid-stroke lands here): the marked
      // cut resumes in place. An idle bench never mounts "saw" from a
      // selection — the held saw over a board is the only way in.
      expect(
        await scriptFor({
          tools: ["sandingBlock", "handSaw"],
          selectedOperationId: "handSawCut",
          selectedParameters: { angle: 0, cutEnd: "right", targetLength: 24 },
          inputMaterials: [],
          processingMaterials: [palletBoard("saw1", 4, 36, 2)],
          operationProgress: {
            status: "inProgress",
            phaseIndex: 0,
            ticksRemaining: 40,
          },
        }),
      ).toBe("saw");
      expect(
        await scriptFor({
          tools: ["sandingBlock", "handSaw"],
          selectedOperationId: "handSawCut",
          selectedParameters: { angle: 0, cutEnd: "right", targetLength: 24 },
          inputMaterials: [palletBoard("saw2", 4, 36, 2)],
        }),
      ).toBe("idle");

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

    await test.step("clamps-first glue-up: set the bars, spread the bead, tighten into the cure", async () => {
      // Three butted strips mid-bench, a full rack, and no plan — the
      // run itself is the operation (bench-work/glue-up.ts)
      await page.evaluate(() => {
        const strip = (id: string) => ({
          id,
          type: "board",
          species: "maple",
          length: 24,
          width: 2,
          thickness: 4,
          surface: "smooth",
          jointedFaces: 2,
          jointedEdges: 2,
        });
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          clamps: 6,
          machines: state.machines.map((m: any, i: number) =>
            i === 0
              ? {
                  ...m,
                  selectedOperationId: "dismantlePallet",
                  inputMaterials: [strip("r1"), strip("r2"), strip("r3")],
                  processingMaterials: [],
                  outputMaterials: [],
                  operationProgress: {
                    status: "notStarted",
                    phaseIndex: 0,
                    ticksRemaining: 0,
                  },
                  benchLayout: {
                    r1: { xIn: 16, yIn: 12, angleDeg: 0, flipped: false },
                    r2: { xIn: 18, yIn: 12, angleDeg: 0, flipped: false },
                    r3: { xIn: 20, yIn: 12, angleDeg: 0, flipped: false },
                  },
                }
              : m,
          ),
        }));
      });
      const stage = page.getByTestId("bench-stage");
      await expect(stage).toHaveAttribute("data-glue-run", "3");
      await expect(stage).toHaveAttribute("data-glue-op", "glueUpPanel");
      await expect(stage).toHaveAttribute("data-glue-clamps", "0/2");

      // Clamps out first: two bars, snapped onto the run's ghosts
      await page.getByTestId("bench-clamp-supply").click();
      for (const yIn of [6.5, 17.5]) {
        const at = await inchPoint(page, 18, yIn);
        await page.mouse.click(at.x, at.y);
      }
      await expect(stage).toHaveAttribute("data-glue-clamps", "2/2");
      await page.keyboard.press("Escape");

      // Then the bottle: one real bead stroke per seam, repeated until
      // the seam reads glued — the coverage engine paces like sanding
      await page.getByTestId("bench-glue-bottle").click();
      for (const [index, xSeam] of [17, 19].entries()) {
        for (let pass = 0; pass < 40; pass++) {
          // Over-run the seam ends: coverage needs the full 24 inches
          const top = await inchPoint(page, xSeam, -1);
          const bottom = await inchPoint(page, xSeam, 25);
          await page.mouse.move(top.x, top.y);
          await page.mouse.down();
          await page.mouse.move(bottom.x, bottom.y, { steps: 30 });
          await page.mouse.move(top.x, top.y, { steps: 30 });
          await page.mouse.up();
          const seams = await stage.getAttribute("data-glue-seams");
          if (seams === `${index + 1}/2`) break;
        }
        await expect(stage).toHaveAttribute(
          "data-glue-seams",
          `${index + 1}/2`,
        );
      }
      await page.keyboard.press("Escape");

      // Tighten each bar at its jaw (overhanging bare bench) — the
      // last one commits straight into the hands-free cure
      for (const yIn of [6.5, 17.5]) {
        const jaw = await inchPoint(page, 12, yIn);
        await page.mouse.click(jaw.x, jaw.y);
      }
      await expect(page.getByTestId("bench-work")).toHaveAttribute(
        "data-script",
        "curing",
      );
      const cure = await page.evaluate(() => {
        const m = (window as any)
          .__GET_GAME_STATE__()
          .machines.find((x: any) => x.machineTypeId === "workspace");
        return {
          op: m.selectedOperationId,
          phase: m.operationProgress.phaseIndex,
          pieces: m.processingMaterials.length,
        };
      });
      expect(cure).toEqual({ op: "glueUpPanel", phase: 1, pieces: 3 });

      // Stand the bench down for the next step
      await page.evaluate(() => {
        (window as any).__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          machines: state.machines.map((m: any, i: number) =>
            i === 0
              ? {
                  ...m,
                  processingMaterials: [],
                  operationProgress: {
                    status: "notStarted",
                    phaseIndex: 0,
                    ticksRemaining: 0,
                  },
                }
              : m,
          ),
        }));
      });
    });

    await test.step("blueprint assembly: tip the board on edge, one drag seats it, the hammer nails the crossings", async () => {
      // Stage the shelf build: plan pinned, hammer mounted, five parts
      // already on their outlines (the sides and shelves stood on edge,
      // the way their slots demand), one shelf board parked askew and
      // still flat. Every part is the same pallet board. The workspace
      // bench top is 40×30, so the 36×36 ghost frame centers at (20,15)
      // and every slot lands at its product position + (2,−3).
      await page.evaluate(() => {
        const board = (id: string) => ({
          id,
          type: "board",
          species: "pallet",
          length: 36,
          width: 4,
          thickness: 4,
          surface: "rough",
          jointedFaces: 1,
          jointedEdges: 2,
        });
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          consumables: { ...state.consumables, nails: 10 },
          machines: state.machines.map((m: any, i: number) =>
            i === 0
              ? {
                  ...m,
                  tools: ["sandingBlock", "hammer"],
                  selectedOperationId: "buildRusticPalletShelf",
                  inputMaterials: [
                    board("bp-sup1"),
                    board("bp-sup2"),
                    board("bp-side1"),
                    board("bp-side2"),
                    board("bp-shelf1"),
                    board("bp-shelf2"),
                  ],
                  processingMaterials: [],
                  outputMaterials: [],
                  operationProgress: {
                    status: "notStarted",
                    phaseIndex: 0,
                    ticksRemaining: 0,
                  },
                  benchLayout: {
                    "bp-sup1": {
                      xIn: 20,
                      yIn: 11.5,
                      angleDeg: 90,
                      flipped: false,
                    },
                    "bp-sup2": {
                      xIn: 20,
                      yIn: 29.5,
                      angleDeg: 90,
                      flipped: false,
                    },
                    "bp-side1": {
                      xIn: 2.5,
                      yIn: 15,
                      angleDeg: 0,
                      flipped: false,
                      onEdge: true,
                    },
                    "bp-side2": {
                      xIn: 37.5,
                      yIn: 15,
                      angleDeg: 0,
                      flipped: false,
                      onEdge: true,
                    },
                    "bp-shelf1": {
                      xIn: 20,
                      yIn: 9,
                      angleDeg: 90,
                      flipped: false,
                      onEdge: true,
                    },
                    // Parked flat and 6° off, lying across the far side
                    "bp-shelf2": {
                      xIn: 26,
                      yIn: 22,
                      angleDeg: 96,
                      flipped: false,
                    },
                  },
                }
              : m,
          ),
        }));
      });
      const work = page.getByTestId("bench-work");
      await expect(work).toHaveAttribute("data-script", "assembly");
      const stage = page.getByTestId("bench-stage");
      await expect(stage).toHaveAttribute("data-seated", "5");

      // A bare hand over the empty shelf outline reads its requirement —
      // bench (30, 27) sits on shelf-1's thin strip, clear of every piece
      const overGhost = await inchPoint(page, 30, 27);
      await page.mouse.move(overGhost.x, overGhost.y);
      await expect(page.getByTestId("slot-tip")).toBeVisible();
      await expect(page.getByTestId("slot-tip")).toContainText("shelf");
      await expect(page.getByTestId("slot-tip")).toContainText("stood on edge");

      // The parked shelf board lies flat: F flips it up on its long edge
      // (the one flip verb — boards tip on edge, the pallet turns over).
      // The park spot crosses a seated side on purpose — a free piece
      // lies on top and the hover must prefer it.
      const from = await inchPoint(page, 26, 22);
      await page.mouse.move(from.x, from.y);
      await expect(page.getByTestId("slot-tip")).toBeHidden();
      // Wait for the hover to land before the keypress — the key handler
      // reads the hovered piece, and a busy renderer commits it a beat
      // after the pointer arrives
      await expect(stage).toHaveAttribute("data-hovered", "bp-shelf2");
      // The chip names the stop F reaches next, so the three-stop cycle
      // is readable before it's pressed rather than after
      const hints = page.getByTestId("bench-key-hints");
      await expect(hints).toContainText("stand on edge");
      await page.keyboard.press("KeyF");
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              window.__GET_GAME_STATE__().machines[0].benchLayout["bp-shelf2"]
                .onEdge ?? false,
          ),
        )
        .toBe(true);
      await expect(hints).toContainText("stand on end");

      // Round the cycle: on end, then back to lying flat where it started
      await page.keyboard.press("KeyF");
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              window.__GET_GAME_STATE__().machines[0].benchLayout["bp-shelf2"]
                .onEnd ?? false,
          ),
        )
        .toBe(true);
      await expect(hints).toContainText("lay flat");
      await page.keyboard.press("KeyF");
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const at =
              window.__GET_GAME_STATE__().machines[0].benchLayout["bp-shelf2"];
            return [at.onEdge ?? false, at.onEnd ?? false];
          }),
        )
        .toEqual([false, false]);

      // Back on edge for the snap-drag below
      await page.keyboard.press("KeyF");
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              window.__GET_GAME_STATE__().machines[0].benchLayout["bp-shelf2"]
                .onEdge ?? false,
          ),
        )
        .toBe(true);

      // The one real snap-drag: the tipped board onto shelf-1's outline
      // (product (18,30) → bench (20,27)).
      const seat = await inchPoint(page, 20, 27);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(seat.x + 4, seat.y - 3, { steps: 12 });
      await page.mouse.up();
      await expect(stage).toHaveAttribute("data-seated", "6");

      // The hammer drives one nail per lit crossing; the eighth commits
      // the whole build — nails spent, the shelf lying where it was built.
      // Every nail is driven from outside a side, into the end of a shelf
      // board or the support tucked under it.
      await page.getByTestId("bench-tool-hammer").click();
      const productX = Number(await stage.getAttribute("data-product-x"));
      const productY = Number(await stage.getAttribute("data-product-y"));
      const crossings = [
        [0.5, 12],
        [35.5, 12],
        [0.5, 14.5],
        [35.5, 14.5],
        [0.5, 30],
        [35.5, 30],
        [0.5, 32.5],
        [35.5, 32.5],
      ];
      for (const [fx, fy] of crossings) {
        const p = await inchPoint(page, productX + fx, productY + fy);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(400);
      }
      const built = await page.evaluate(() => {
        const state = window.__GET_GAME_STATE__();
        const m = state.machines[0];
        return {
          nails: state.consumables.nails,
          inputs: m.inputMaterials.length,
          output: m.outputMaterials[0]?.type,
          parts: m.outputMaterials[0]?.parts?.length,
        };
      });
      expect(built.output).toBe("rusticShelf");
      // The bill of materials rides the product: all six parts
      expect(built.parts).toBe(6);
      expect(built.inputs).toBe(0);
      expect(built.nails).toBe(2);
    });

    await test.step("screwed assembly: the drill drives the planter box's screws", async () => {
      // The planter's five 2' slats staged on their outlines (walls on
      // edge), drill on the rail, screws in the cabinet. The 24×24 ghost
      // frame centers on the 40×30 bench at (20,15) — product top-left
      // lands at (8, 3).
      await page.evaluate(() => {
        const board = (id: string, l: number) => ({
          id,
          type: "board",
          species: "pallet",
          length: l,
          width: 4,
          thickness: 4,
          surface: "rough",
          jointedFaces: 1,
          jointedEdges: 2,
        });
        window.__UPDATE_GAME_STATE__((state: any) => ({
          ...state,
          consumables: { ...state.consumables, screws: 10 },
          machines: state.machines.map((m: any, i: number) =>
            i === 0
              ? {
                  ...m,
                  tools: ["drill"],
                  selectedOperationId: "buildPlanterBox",
                  inputMaterials: [
                    board("pb-slat", 24),
                    board("pb-n", 24),
                    board("pb-s", 24),
                    board("pb-w", 24),
                    board("pb-e", 24),
                  ],
                  processingMaterials: [],
                  outputMaterials: [],
                  operationProgress: {
                    status: "notStarted",
                    phaseIndex: 0,
                    ticksRemaining: 0,
                  },
                  benchLayout: {
                    "pb-slat": {
                      xIn: 20,
                      yIn: 15,
                      angleDeg: 0,
                      flipped: false,
                    },
                    "pb-n": {
                      xIn: 20,
                      yIn: 5,
                      angleDeg: 90,
                      flipped: false,
                      onEdge: true,
                    },
                    "pb-s": {
                      xIn: 20,
                      yIn: 25,
                      angleDeg: 90,
                      flipped: false,
                      onEdge: true,
                    },
                    "pb-w": {
                      xIn: 10,
                      yIn: 15,
                      angleDeg: 0,
                      flipped: false,
                      onEdge: true,
                    },
                    "pb-e": {
                      xIn: 30,
                      yIn: 15,
                      angleDeg: 0,
                      flipped: false,
                      onEdge: true,
                    },
                  },
                }
              : m,
          ),
        }));
      });
      const work = page.getByTestId("bench-work");
      await expect(work).toHaveAttribute("data-script", "assembly");
      const stage = page.getByTestId("bench-stage");
      await expect(stage).toHaveAttribute("data-seated", "5");
      // The screw plan names its own driver
      await expect(
        page.getByText("All laid out. Take the drill down off the rail."),
      ).toBeVisible();

      await page.getByTestId("bench-tool-drill").click();
      await expect(
        page.getByText("Drive a screw at each lit crossing."),
      ).toBeVisible();
      const productX = Number(await stage.getAttribute("data-product-x"));
      const productY = Number(await stage.getAttribute("data-product-y"));
      // Six screws: the slat's two wall crossings and the four lapped
      // corners — the sixth commits the build
      for (const [fx, fy] of [
        [12, 2],
        [12, 22],
        [2, 2],
        [22, 2],
        [2, 22],
        [22, 22],
      ]) {
        const p = await inchPoint(page, productX + fx, productY + fy);
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(400);
      }
      const built = await page.evaluate(() => {
        const state = window.__GET_GAME_STATE__();
        const m = state.machines[0];
        return {
          screws: state.consumables.screws,
          output: m.outputMaterials[0]?.type,
          parts: m.outputMaterials[0]?.parts?.length,
        };
      });
      expect(built.output).toBe("planterBox");
      expect(built.parts).toBe(5);
      expect(built.screws).toBe(4);
    });
  });
});
