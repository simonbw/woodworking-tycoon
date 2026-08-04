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
      // The chip row offers exactly one door — "use workbench" at the
      // sheet key — and the operate key does nothing: the bench view is
      // the only player path to hand work.
      await expect(page.getByText("use workbench")).toBeVisible();
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
      // The plan picker is the blueprint pile in the corner: folded it
      // still names the drawing that's set out, and unfolding it offers
      // the rest of the stack
      const corner = page.getByTestId("blueprint-corner");
      await expect(corner).toBeVisible();
      await expect(corner).toContainText("Sand Board");
      await corner.click();
      await expect(
        page.getByTestId("blueprint-stack").getByText("Sand Board"),
      ).toBeVisible();
      await corner.click();
    });

    await test.step("one real stroke starts the pass; strokes finish it", async () => {
      // The 4"×24" board stands mid-stage; sand along its length in
      // overlapping columns. The first stroke is the one real gesture
      // under test — it must start the operation and move the needle.
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
      // A deliberate press on the board starts the pass (the sheet can
      // re-render around the canvas as the operation claims the piece)…
      const at = await inchPoint(page, 2, 12);
      await page.mouse.click(at.x, at.y);
      await expect
        .poll(async () => (await machineState()).status)
        .toBe("inProgress");
      // …and one real stroke moves the needle.
      await column(2);
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
      // pallet inches (23, 2), (23, 17), (23, 32), published through the
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
      const first = await palletPoint(page, 23, 2);
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
      expect((await palletState()).nails).toHaveLength(32);
      expect((await machineState()).inputs).not.toContainEqual(
        expect.objectContaining({ type: "board" }),
      );
      for (const yIn of [17, 32]) {
        // One pull per lever: presses inside PRY_MS are deliberately
        // ignored, so give each one its beat before the next
        await page.waitForTimeout(400);
        const at = await palletPoint(page, 23, yIn);
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
      expect((await palletState()).deckBoards[7]).toBe(false);
      expect((await palletState()).stringers).toEqual([true, true, true]);

      // E takes the piece under the pointer — the freed board lying on
      // its berth, not whatever sits first in the bay
      await page.keyboard.press("Escape"); // hang the hammer up
      const berth = await palletPoint(page, 23, 17);
      await page.mouse.move(berth.x, berth.y);
      await page.waitForTimeout(150);
      await page.keyboard.press("e");
      await expect
        .poll(async () =>
          page.evaluate(() =>
            window.__GET_GAME_STATE__().player.inventory.map((m: any) => m.id),
          ),
        )
        .toContain("fx-bench-pallet:deck-7");

      // F over the pallet turns it over — the bottom face's own nails
      // come on offer (they're driven from that side). Hover is pointer
      // state: nudge the mouse so the pallet is what's under the hand.
      await page.mouse.move(berth.x + 6, berth.y + 6);
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
      // Bottom board 0's crossing at local (6.5, 2) mirrors to (39.5, 2)
      await page.waitForTimeout(400);
      const bottomNail = await palletPoint(page, 46 - 6.5, 2);
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
            palletBoard("a1", 6, 48, 3),
            palletBoard("a2", 6, 48, 3),
            palletBoard("a3", 4, 36, 1),
            palletBoard("a4", 4, 36, 1),
            palletBoard("a5", 4, 36, 1),
          ],
        }),
      ).toBe("assembly");

      expect(
        await scriptFor({
          tools: ["sandingBlock", "handSaw"],
          selectedOperationId: "handSawCut",
          selectedParameters: { angle: 0, cutEnd: "left", targetLength: 24 },
          inputMaterials: [palletBoard("saw1", 4, 36, 1)],
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

    await test.step("blueprint assembly: tip the rail on edge, one drag seats it, the hammer nails the crossings", async () => {
      // Stage the shelf build: plan pinned, hammer mounted, four parts
      // already on their outlines (the seated rail stood on edge, the
      // way its slot demands), one rail parked askew and still flat. The
      // workspace bench is 36×24, so the 48×36 ghost frame centers at
      // (18,12) and every slot lands at its product position − (6,6).
      await page.evaluate(() => {
        const board = (id: string, w: number, l: number, t: number) => ({
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
                    board("bp-r1", 6, 48, 3),
                    board("bp-r2", 6, 48, 3),
                    board("bp-s1", 4, 36, 1),
                    board("bp-s2", 4, 36, 1),
                    board("bp-s3", 4, 36, 1),
                  ],
                  processingMaterials: [],
                  outputMaterials: [],
                  operationProgress: {
                    status: "notStarted",
                    phaseIndex: 0,
                    ticksRemaining: 0,
                  },
                  benchLayout: {
                    "bp-r1": { xIn: 33, yIn: 4, angleDeg: 96, flipped: false },
                    "bp-r2": {
                      xIn: 18,
                      yIn: 24,
                      angleDeg: 90,
                      flipped: false,
                      onEdge: true,
                    },
                    "bp-s1": { xIn: 2, yIn: 12, angleDeg: 0, flipped: false },
                    "bp-s2": { xIn: 18, yIn: 12, angleDeg: 0, flipped: false },
                    "bp-s3": { xIn: 34, yIn: 12, angleDeg: 0, flipped: false },
                  },
                }
              : m,
          ),
        }));
      });
      const work = page.getByTestId("bench-work");
      await expect(work).toHaveAttribute("data-script", "assembly");
      const stage = page.getByTestId("bench-stage");
      await expect(stage).toHaveAttribute("data-seated", "4");

      // A bare hand over the empty rail outline reads its requirement —
      // bench (-4, 0) sits on rail-0's thin strip out on the overhang,
      // clear of every piece (the parked rail crosses the strip's middle)
      const overGhost = await inchPoint(page, -4, 0);
      await page.mouse.move(overGhost.x, overGhost.y);
      await expect(page.getByTestId("slot-tip")).toBeVisible();
      await expect(page.getByTestId("slot-tip")).toContainText("rail");
      await expect(page.getByTestId("slot-tip")).toContainText(
        "stood on edge",
      );

      // The parked rail lies flat: F flips it up on its long edge (the
      // one flip verb — boards tip on edge, the pallet turns over). The
      // park spot overlaps a seated shelf on purpose — a free piece lies
      // on top and the hover must prefer it.
      const from = await inchPoint(page, 33, 4);
      await page.mouse.move(from.x, from.y);
      await expect(page.getByTestId("slot-tip")).toBeHidden();
      // Wait for the hover to land before the keypress — the key handler
      // reads the hovered piece, and a busy renderer commits it a beat
      // after the pointer arrives
      await expect(stage).toHaveAttribute("data-hovered", "bp-r1");
      await page.keyboard.press("KeyF");
      await expect
        .poll(async () =>
          page.evaluate(
            () =>
              window.__GET_GAME_STATE__().machines[0].benchLayout["bp-r1"]
                .onEdge ?? false,
          ),
        )
        .toBe(true);

      // The one real snap-drag: the tipped rail onto rail-0's outline
      // (product (24,6) → bench (18,0)).
      const seat = await inchPoint(page, 18, 0);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(seat.x + 4, seat.y - 3, { steps: 12 });
      await page.mouse.up();
      await expect(stage).toHaveAttribute("data-seated", "5");

      // The hammer drives one nail per lit crossing; the sixth commits
      // the whole build — nails spent, the shelf lying where it was built
      await page.getByTestId("bench-tool-hammer").click();
      const productX = Number(await stage.getAttribute("data-product-x"));
      const productY = Number(await stage.getAttribute("data-product-y"));
      const crossings = [
        [8, 6],
        [24, 6],
        [40, 6],
        [8, 30],
        [24, 30],
        [40, 30],
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
      // The bill of materials rides the product: all five parts
      expect(built.parts).toBe(5);
      expect(built.inputs).toBe(0);
      expect(built.nails).toBe(4);
    });

    await test.step("screwed assembly: the drill drives the planter box's screws", async () => {
      // The planter's five 2' slats staged on their outlines (walls on
      // edge), drill on the rail, screws in the cabinet. The 24×24 ghost
      // frame centers on the 36×24 bench at (18,12) — product top-left
      // lands at (6, 0).
      await page.evaluate(() => {
        const board = (id: string, l: number) => ({
          id,
          type: "board",
          species: "pallet",
          length: l,
          width: 4,
          thickness: 1,
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
                    "pb-slat": { xIn: 18, yIn: 12, angleDeg: 0, flipped: false },
                    "pb-n": {
                      xIn: 18,
                      yIn: 2,
                      angleDeg: 90,
                      flipped: false,
                      onEdge: true,
                    },
                    "pb-s": {
                      xIn: 18,
                      yIn: 22,
                      angleDeg: 90,
                      flipped: false,
                      onEdge: true,
                    },
                    "pb-w": {
                      xIn: 8,
                      yIn: 12,
                      angleDeg: 0,
                      flipped: false,
                      onEdge: true,
                    },
                    "pb-e": {
                      xIn: 28,
                      yIn: 12,
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
