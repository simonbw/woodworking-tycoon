/**
 * Tables pushed together work as one bench. This drives the game-layer
 * half of that — what the bench view leans on — through the real
 * commands: the run is found from the floor layout, stock on either
 * table is on the one surface, and a glue-up whose strips straddle the
 * seam commits after the pieces are slid onto one table
 * (gatherBenchPieces), which is what the view does when the last clamp
 * goes tight.
 *
 * Rehosted from `src/game/sequences/bench-group.test.ts` onto the
 * entity-world ShopDriver — the parity spec for the sim.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import { cuttingBoardShop } from "../../../tests/fixtures/cutting-board-shop";
import {
  benchGroupAt,
  groupPieces,
  memberFor,
  placementInFrame,
  seatInGroup,
} from "../../game/bench-work/bench-group";
import { GameState } from "../../game/GameState";
import { getMachines, MachineState } from "../../game/Machine";
import { isPanel } from "../../game/panel-helpers";
import { panelWidth } from "../../game/Materials";
import { gatherBenchPieces } from "../commands/bench-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { MachineEntity } from "../entities/MachineEntity";

const WORKBENCH = "workspace";

/** Open a shop from a fixture and start working it. */
function openShop(state: GameState): ShopDriver {
  return new ShopDriver({ state });
}

/** A shop-built table, dropped straight onto the floor. */
function table(
  machineTypeId: MachineState["machineTypeId"],
  position: [number, number],
  rotation: 0 | 1 | 2 | 3 = 0,
): MachineState {
  return {
    machineTypeId,
    position,
    rotation,
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    selectedOperationId: "",
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    tools: [],
  };
}

/**
 * The cutting-board shop with its three staged strips moved off the
 * makeshift bench and onto a pair of worktables pushed shoulder to
 * shoulder — two strips on the left table, one on the right.
 */
function shopWithJoinedTables(): ShopDriver {
  const shop = openShop(cuttingBoardShop);
  const strips = shop.machine(WORKBENCH).state.inputMaterials;
  assert.strictEqual(strips.length, 3, "fixture stages three strips");
  return shop.arrange((game) => {
    const workbench = shop.machine(WORKBENCH);
    workbench.state = {
      ...workbench.state,
      inputMaterials: [],
      benchLayout: {},
    };
    game.addEntity(
      new MachineEntity({
        ...table("worktable1x2", [5, 6]),
        inputMaterials: [strips[0], strips[1]],
      }),
    );
    game.addEntity(
      new MachineEntity({
        ...table("worktable1x2", [9, 6]),
        inputMaterials: [strips[2]],
      }),
    );
  });
}

describe("tables pushed together are one bench", () => {
  it("finds the run from the floor, and both tables' stock is on it", () => {
    const shop = shopWithJoinedTables();
    const machines = getMachines(shop.shop.machines);
    const left = machines.find(
      (m) => m.type.id === "worktable1x2" && m.position[0] === 5,
    )!;
    const right = machines.find(
      (m) => m.type.id === "worktable1x2" && m.position[0] === 9,
    )!;

    const group = benchGroupAt(machines, left);
    assert.strictEqual(group.members.length, 2);
    // 8 ft of bench, and every strip is reachable from either end
    assert.strictEqual(group.widthIn, 96);
    assert.strictEqual(groupPieces(group).length, 3);
    assert.strictEqual(groupPieces(benchGroupAt(machines, right)).length, 3);

    // The makeshift bench is still its own bench, and still empty
    const makeshift = machines.find((m) => m.type.id === WORKBENCH)!;
    assert.strictEqual(benchGroupAt(machines, makeshift).members.length, 1);
  });

  it("lets a piece lie past one table's edge onto the next", () => {
    const shop = shopWithJoinedTables();
    const machines = getMachines(shop.shop.machines);
    const left = machines.find(
      (m) => m.type.id === "worktable1x2" && m.position[0] === 5,
    )!;
    const group = benchGroupAt(machines, left);

    // 60" along the run is 12" onto the right-hand table — a spot the
    // left table alone would have clamped back to its own 48" edge
    const seated = seatInGroup(group, {
      xIn: 60,
      yIn: 12,
      angleDeg: 0,
      flipped: false,
    });
    assert.strictEqual(seated.placement.xIn, 60);
    assert.strictEqual(seated.member.rect.xIn, 48);
    // Past the far end of the whole run it still catches
    assert.strictEqual(
      seatInGroup(group, { xIn: 150, yIn: 12, angleDeg: 0, flipped: false })
        .placement.xIn,
      96,
    );
  });

  it("glues a run whose strips started on two different tables", () => {
    const shop = shopWithJoinedTables();
    const machines = getMachines(shop.shop.machines);
    const left = machines.find(
      (m) => m.type.id === "worktable1x2" && m.position[0] === 5,
    )!;
    const group = benchGroupAt(machines, left);
    const ontoLeft = memberFor(group, left)!;

    // Where the lone right-hand strip physically lies, before the gather
    const before = groupPieces(group)
      .filter((piece) => piece.member.key !== ontoLeft.key)
      .map((piece) => ({ id: piece.material.id, at: piece.placement }));
    assert.strictEqual(before.length, 1);

    // The view's move when the last clamp goes tight: slide them together
    gatherBenchPieces(
      shop.game,
      shop.machineAt("worktable1x2", [5, 6]),
      groupPieces(group).map((piece) => piece.material.id),
    );

    // Nothing moved an inch — same spot, bookkept by the left table now
    const after = benchGroupAt(getMachines(shop.shop.machines), left);
    const afterMember = memberFor(after, left)!;
    console.log(
      "RAW",
      JSON.stringify(
        shop.shop.machines
          .filter((m) => m.machineTypeId === "worktable1x2")
          .map((m) => [m.position, m.inputMaterials.map((x) => x.id)]),
      ),
      "MEMBERS",
      after.members.map((m) => m.key),
    );
    for (const piece of before) {
      const now = groupPieces(after).find((p) => p.material.id === piece.id)!;
      assert.strictEqual(now.member.key, afterMember.key, "moved house");
      assert.ok(Math.abs(now.placement.xIn - piece.at.xIn) < 1e-9);
      assert.ok(Math.abs(now.placement.yIn - piece.at.yIn) < 1e-9);
    }

    // And now the glue-up runs, because all three are in one bay
    shop.glueUpAt(shop.machineAt("worktable1x2", [5, 6]));
    const panel = shop.theOne(isPanel);
    assert.ok(isPanel(panel));
    assert.strictEqual(panel.strips.length, 3);
    assert.strictEqual(panelWidth(panel), 6);
  });

  it("keeps a lone table's own measure when nothing is pushed against it", () => {
    const shop = openShop(cuttingBoardShop).arrange((game) => {
      game.addEntity(new MachineEntity(table("worktable1x2", [5, 6])));
    });
    const machines = getMachines(shop.shop.machines);
    const lone = machines.find((m) => m.type.id === "worktable1x2")!;
    const group = benchGroupAt(machines, lone);
    const member = memberFor(group, lone)!;
    const placement = { xIn: 30, yIn: 9, angleDeg: 15, flipped: false };
    // A run of one is the identity: the frame is the top, unconverted
    assert.strictEqual(group.widthIn, 48);
    assert.deepStrictEqual(
      placementInFrame(group, member, placement),
      placement,
    );
  });
});
