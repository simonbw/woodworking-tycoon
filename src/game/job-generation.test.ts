import assert from "node:assert";
import { describe, it } from "node:test";
import { GameState } from "./GameState";
import { initialGameState } from "./initialGameState";
import { availableJobTemplateIds, generateJobBoard } from "./job-generation";
import { createMockMaterial } from "./material-helpers";
import { getSellValue } from "./material-values";
import { SkillId } from "./Skill";

/** rng that always rolls 0 — every pick takes the first option. */
const zeroRng = () => 0;

function stateWith(
  overrides: Partial<GameState> & {
    skills?: ReadonlyArray<SkillId>;
  } = {},
): GameState {
  const { skills, ...rest } = overrides;
  return {
    ...initialGameState,
    progression: {
      ...initialGameState.progression,
      marketplaceUnlocked: true,
      unlockedSkills: [
        ...initialGameState.progression.unlockedSkills,
        ...(skills ?? []),
      ],
    },
    ...rest,
  };
}

/** True when some offer on the board asks for the given material type. */
function boardAsksFor(
  board: ReturnType<typeof generateJobBoard>,
  type: string,
): boolean {
  return board.some((offer) =>
    offer.requiredMaterials.some((req) => req.type?.includes(type as never)),
  );
}

describe("generateJobBoard", () => {
  it("always includes a zero-material-cost offer", () => {
    const board = generateJobBoard(stateWith());
    assert.ok(board.some((offer) => offer.materialCostFree));
  });

  it("bursts offers for a template the board has never had before", () => {
    // Everything currently available has been seen — except nothing yet:
    // mark all seen, then check no burst; then forget one and check it
    // lands a guaranteed offer.
    const allSeen = stateWith({});
    const seen = availableJobTemplateIds(allSeen);
    assert.ok(seen.includes("crates"), "starter hammer offers crate work");

    const forgotten = stateWith({
      seenJobTemplateIds: seen.filter((id) => id !== "crates"),
    });
    // Deterministic: unseen templates are guaranteed a slot
    const board = generateJobBoard(forgotten, zeroRng);
    assert.ok(boardAsksFor(board, "crate"));
  });

  it("guarantees an offer from the player's top tier", () => {
    const master = stateWith({
      skills: ["checkerboards"],
      seenJobTemplateIds: [], // irrelevant: mark seen below
    });
    const board = generateJobBoard(
      { ...master, seenJobTemplateIds: availableJobTemplateIds(master) },
      zeroRng,
    );
    // checkerboard-boards is the lone top-tier template here
    assert.ok(boardAsksFor(board, "checkerboardCuttingBoard"));
  });

  it("scales low-tier batches with reputation", () => {
    const seenAll = (state: GameState) => ({
      ...state,
      seenJobTemplateIds: availableJobTemplateIds(state),
    });
    const humble = generateJobBoard(seenAll(stateWith()), zeroRng);
    const famous = generateJobBoard(
      seenAll(stateWith({ reputation: 60 })),
      zeroRng,
    );
    // With a zero rng both boards lead with the pallet-boards income floor
    assert.strictEqual(humble[0].requiredMaterials[0].quantity, 3);
    assert.strictEqual(famous[0].requiredMaterials[0].quantity, 3 + 5);
  });

  it("pays more for an oiled ask than a raw one", () => {
    const raw = getSellValue(
      createMockMaterial({
        type: ["simpleCuttingBoard"],
        species: ["walnut"],
        quantity: 1,
      }),
    );
    const oiled = getSellValue(
      createMockMaterial({
        type: ["simpleCuttingBoard"],
        species: ["walnut"],
        finish: ["mineralOil"],
        quantity: 1,
      }),
    );
    assert.ok(oiled > raw);
  });

  it("keeps every generated requirement declarative (serializable)", () => {
    // Job offers live in GameState and round-trip through JSON — a matches
    // predicate would silently vanish. Sample many boards across a spread
    // of capability envelopes.
    const states = [
      stateWith(),
      stateWith({ reputation: 30, skills: ["miteredFrames", "fineShelving"] }),
      stateWith({
        reputation: 60,
        skills: [
          "miteredFrames",
          "fineShelving",
          "boxJoinery",
          "twoToneBoards",
          "stripedBoards",
          "freeformLamination",
          "sunriseBoards",
          "jigsAndFixtures",
          "endGrainBoards",
          "polygonJoinery",
          "trayWork",
          "furnitureBasics",
          "checkerboards",
        ],
      }),
    ];
    for (const state of states) {
      for (let i = 0; i < 20; i++) {
        for (const offer of generateJobBoard(state)) {
          for (const req of offer.requiredMaterials) {
            assert.strictEqual(
              req.matches,
              undefined,
              `offer "${offer.description}" uses a matches predicate`,
            );
            assert.strictEqual(
              JSON.parse(JSON.stringify(req)).quantity,
              req.quantity,
            );
          }
        }
      }
    }
  });

  it("asks only for what the capability envelope can produce", () => {
    // A fresh shop can't be asked for hardwood products
    const board = generateJobBoard(stateWith());
    assert.ok(!boardAsksFor(board, "simpleCuttingBoard"));
    assert.ok(!boardAsksFor(board, "sideTable"));
  });
});

describe("availableJobTemplateIds", () => {
  it("grows as skills unlock", () => {
    const before = availableJobTemplateIds(stateWith());
    const after = availableJobTemplateIds(
      stateWith({ skills: ["polygonJoinery"] }),
    );
    assert.ok(!before.includes("hex-frames"));
    assert.ok(after.includes("hex-frames"));
  });
});

describe("minPanelWidth matching", () => {
  it("accepts only panels at least that wide", async () => {
    const { materialMeetsInput } = await import("./material-helpers");
    const { panel } = await import("./panel-helpers");
    const requirement = {
      type: ["panel" as const],
      minPanelWidth: 12,
      quantity: 1,
    };
    const strips = (count: number) =>
      Array.from({ length: count }, () => ({
        species: "maple" as const,
        width: 2 as const,
      }));
    assert.ok(
      materialMeetsInput(panel(strips(6), 2, 4, "sanded"), requirement),
    );
    assert.ok(
      !materialMeetsInput(panel(strips(5), 2, 4, "sanded"), requirement),
    );
  });

  it("survives a JSON round-trip, unlike matches", async () => {
    const { materialMeetsInput } = await import("./material-helpers");
    const { panel } = await import("./panel-helpers");
    const requirement = JSON.parse(
      JSON.stringify({ type: ["panel"], minPanelWidth: 12, quantity: 1 }),
    );
    const narrow = panel(
      Array.from({ length: 5 }, () => ({
        species: "maple" as const,
        width: 2 as const,
      })),
      2,
      4,
      "sanded",
    );
    assert.ok(!materialMeetsInput(narrow, requirement));
  });
});
