/**
 * The first skill you actually spend a point on, and what it buys.
 *
 * Two-Tone Boards is the bottom of the pattern ladder: five mixed strips
 * glued, sanded twice, and finished into a board that names both woods and
 * pays enough XP to hand the point back. That last part is the interesting
 * one — the tree is meant to be self-funding at this rung, and the only way
 * to know is to run the whole thing and look at the ledger.
 *
 * `skills.spec.ts` keeps the journal: the starter certificates, the badge
 * counting unspent points, and the recipe that is absent until it's learned.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import { GameState } from "../GameState";
import { isPanel } from "../panel-helpers";
import { getMaterialName, makeToolItem } from "../material-helpers";
import { getSellValue } from "../material-values";
import { MaterialInstance, Board } from "../Materials";
import { availableOperations } from "../skill-helpers";
import { openShop, ShopDriver } from "./shop-driver";

const WORKBENCH = "workspace";

const isStrip = (m: MaterialInstance) => m.type === "board";
const isMixedPanel = (m: MaterialInstance) => isPanel(m);
const isCuttingBoard = (m: MaterialInstance) => m.type === "simpleCuttingBoard";

/** Walnut-maple-walnut-maple-walnut: strict alternation, five strips wide. */
function mixedStrips(): Board[] {
  return ["walnut", "maple", "walnut", "maple", "walnut"].map(
    (species, i) =>
      ({
        id: `mixed-strip-${i}`,
        type: "board",
        species,
        length: 24,
        width: 2,
        thickness: 4,
        surface: "smooth",
        jointedFaces: 2,
        jointedEdges: 2,
      }) as Board,
  );
}

/**
 * The cutting-board shop restocked with mixed strips instead of maple: the
 * fixture's maple leaves the bench bay, and the mixed set arrives the way
 * the hands allow — two carried, three piled underfoot, in pattern order
 * (the driver's ferry keeps hand-then-floor order when it loads).
 */
function twoToneShop(learned: boolean): ShopDriver {
  const strips = mixedStrips();
  return openShop(cuttingBoardShop)
    .arrange((state: GameState) => ({
      ...state,
      progression: {
        ...state.progression,
        skillPoints: learned ? 1 : 2,
        unlockedSkills: learned
          ? [...state.progression.unlockedSkills, "twoToneBoards"]
          : state.progression.unlockedSkills,
      },
      // The fixture's carried sander rides along with the fresh strips —
      // mount() below takes it out of the hands
      player: {
        ...state.player,
        inventory: [
          ...strips.slice(0, 2),
          makeToolItem("randomOrbitSander"),
          makeToolItem("finishingKit"),
        ],
      },
      materialPiles: [
        ...state.materialPiles,
        ...strips.slice(2).map((material) => ({
          material,
          position: state.player.position,
          rotation: 0,
        })),
      ],
      machines: state.machines.map((machine) =>
        machine.machineTypeId === WORKBENCH
          ? { ...machine, inputMaterials: [] }
          : machine,
      ),
    }))
    .mount(WORKBENCH, "randomOrbitSander")
    .mount(WORKBENCH, "finishingKit");
}

/** Glue, sand twice, finish. */
function buildTheTwoToneBoard(shop: ShopDriver): ShopDriver {
  return shop
    .make(WORKBENCH, "glueUpPanel", isStrip)
    .make(WORKBENCH, "orbitSandPanel", isMixedPanel)
    .make(WORKBENCH, "orbitSandPanel", isMixedPanel)
    .make(WORKBENCH, "finishTwoToneBoard", isMixedPanel);
}

describe("two-tone chain", () => {
  it("the finish recipe does not exist until the skill is learned", () => {
    const locked = twoToneShop(false);
    const offered = availableOperations(
      locked.machine(WORKBENCH),
      locked.shop.progression,
    ).map((op) => op.id);
    assert.ok(!offered.includes("finishTwoToneBoard"));

    twoToneShop(true).select(WORKBENCH, "finishTwoToneBoard");
  });

  it("glues five mixed strips into one 10-inch panel", () => {
    const shop = twoToneShop(true);
    shop.make(WORKBENCH, "glueUpPanel", isStrip);

    const panel = shop.theOne(isMixedPanel);
    assert.ok(isPanel(panel));
    assert.equal(getMaterialName(panel), "Mixed Wood Panel 4/4 — 10\" × 2'");
  });

  it("names the board for both woods, dominant first", () => {
    const shop = buildTheTwoToneBoard(twoToneShop(true));

    const board = shop.theOne(isCuttingBoard) as {
      species: string;
      accentSpecies: string;
    };
    assert.equal(board.species, "walnut");
    assert.equal(board.accentSpecies, "maple");
    assert.equal(
      getMaterialName(board as unknown as MaterialInstance),
      "Walnut & Maple Simple cutting board",
    );
  });

  it("pays back the point it cost", () => {
    const shop = buildTheTwoToneBoard(twoToneShop(true));

    // $48 board -> 48 XP -> level 2 -> +1 point, so the one still unspent
    // plus the one just earned makes two.
    assert.equal(getSellValue(shop.theOne(isCuttingBoard)), 48);
    assert.equal(shop.shop.progression.xp, 48);
    assert.equal(shop.shop.progression.skillPoints, 2);
  });
});
