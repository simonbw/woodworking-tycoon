import assert from "node:assert";
import { describe, it } from "node:test";
import { Machine, MACHINE_TYPES, MachineState } from "../../game/Machine";
import { doorCenterX, DOOR_WIDTH, ShopInfo } from "../../game/ShopInfo";
import {
  cordAnchor,
  cordSlack,
  nearestOutlet,
  outletPositions,
} from "./power-cords";

const shop: ShopInfo = {
  name: "Test Garage",
  electricity: 120,
  size: [12, 16],
  materialDropoffPosition: [0, 0],
  entrancePosition: [6, 15],
};

function placedMachine(overrides: Partial<MachineState>): Machine {
  return new Machine({
    machineTypeId: "bandSaw",
    position: [4, 4],
    rotation: 0,
    selectedOperationId: "resaw",
    operationProgress: {
      status: "notStarted",
      phaseIndex: 0,
      ticksRemaining: 0,
    },
    inputMaterials: [],
    processingMaterials: [],
    outputMaterials: [],
    tools: [],
    ...overrides,
  });
}

describe("outletPositions", () => {
  it("puts every outlet on a wall face", () => {
    for (const { position, side } of outletPositions(shop)) {
      const [x, y] = position;
      if (side === "top") assert.strictEqual(y, 0);
      if (side === "bottom") assert.strictEqual(y, shop.size[1]);
      if (side === "left") assert.strictEqual(x, 0);
      if (side === "right") assert.strictEqual(x, shop.size[0]);
      assert.ok(x >= 0 && x <= shop.size[0]);
      assert.ok(y >= 0 && y <= shop.size[1]);
    }
  });

  it("covers all four walls", () => {
    const sides = new Set(outletPositions(shop).map((o) => o.side));
    assert.deepStrictEqual([...sides].sort(), [
      "bottom",
      "left",
      "right",
      "top",
    ]);
  });

  it("keeps the garage door strip clear", () => {
    const doorCenter = doorCenterX(shop);
    for (const outlet of outletPositions(shop)) {
      if (outlet.side !== "bottom") continue;
      // The opening spans doorCenter ± (DOOR_WIDTH / 2 + a half-cell jamb)
      assert.ok(
        Math.abs(outlet.position[0] - doorCenter) > DOOR_WIDTH / 2 + 0.5,
        `outlet at x=${outlet.position[0]} is inside the door opening`,
      );
    }
  });
});

describe("nearestOutlet", () => {
  it("picks the closest outlet by straight-line distance", () => {
    const outlets = outletPositions(shop);
    const point: [number, number] = [1, 3];
    const picked = nearestOutlet(point, shop);
    const dist = ([x, y]: readonly number[]) =>
      Math.hypot(x - point[0], y - point[1]);
    for (const outlet of outlets) {
      assert.ok(dist(picked.position) <= dist(outlet.position));
    }
  });
});

describe("cordAnchor", () => {
  it("lands inside the machine's footprint", () => {
    // The 2×2 band saw at [4, 4]: footprint spans cells [4..5, 4..5], so
    // its center is the corner where the four cells meet.
    const [x, y] = cordAnchor(placedMachine({}));
    assert.strictEqual(x, 5);
    assert.strictEqual(y, 5);
  });

  it("tracks rotation", () => {
    // Rotated a quarter turn, the footprint pivots around the origin cell
    // but the anchor stays at the center of the cells it now claims.
    const machine = placedMachine({ rotation: 1 });
    const cells = machine.occupiedCells;
    const [x, y] = cordAnchor(machine);
    assert.ok(cells.some(([cx]) => Math.abs(cx + 0.5 - x) <= 0.5));
    assert.ok(cells.some(([, cy]) => Math.abs(cy + 0.5 - y) <= 0.5));
  });
});

describe("cordSlack", () => {
  it("is deterministic and bounded", () => {
    for (const key of ["bandSaw@4,4", "jointer@1,9", "miterSaw@8,2"]) {
      const slack = cordSlack(key);
      assert.strictEqual(slack, cordSlack(key));
      assert.ok(slack >= -1 && slack <= 1);
    }
  });
});

describe("corded machine types", () => {
  it("marks exactly the electric machines", () => {
    const corded = Object.values(MACHINE_TYPES)
      .filter((type) => type.corded)
      .map((type) => type.id)
      .sort();
    assert.deepStrictEqual(corded, [
      "bandSaw",
      "jobsiteTableSaw",
      "jointer",
      "lunchboxPlaner",
      "miterSaw",
    ]);
  });
});
