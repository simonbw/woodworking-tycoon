/**
 * Moving machines around the shop by hand, and where a crate lands.
 *
 * There is no layout editor: a machine is lifted off the floor, carried,
 * and set down, and the lift refuses whenever the machine or the player
 * isn't free for it. Machines that arrive crated (bought, or built at the
 * bench) are dropped on the nearest open floor, one crate to a cell.
 *
 * Driven through `ShopDriver` and the real commands.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { millingShop } from "../../../tests/fixtures/milling-shop";
import { board } from "../../game/board-helpers";
import { MaterialInstance } from "../../game/Materials";
import { freshMachineState, pickUpMachine } from "../commands/machine-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { MachineCrateEntity } from "../entities/MachineCrateEntity";
import { deliverMachineCrate } from "../systems/grants";

const WORKBENCH = "workspace";
const JOINTER = "jointer";

const isBoard = (material: MaterialInstance) => material.type === "board";

describe("lifting a machine off the floor", () => {
  it("moves an idle, empty machine into the player's arms", () => {
    const shop = new ShopDriver();
    const bench = shop.machine(WORKBENCH);
    assert.strictEqual(pickUpMachine(shop.game, bench), true);
    assert.strictEqual(
      shop.player.carriedMachine?.machineTypeId,
      WORKBENCH,
      "the bench is over the shoulders",
    );
    assert.throws(() => shop.machine(WORKBENCH), /found 0/);
  });

  it("refuses while the machine holds materials", () => {
    const shop = new ShopDriver();
    shop.player.inventory = [board("pallet", 24, 4, 2)];
    shop.standAtOperatorCell(WORKBENCH).load(WORKBENCH, isBoard);
    assert.strictEqual(
      pickUpMachine(shop.game, shop.machine(WORKBENCH)),
      false,
    );
    assert.strictEqual(shop.player.carriedMachine, null);
  });

  it("refuses mid-operation", () => {
    const shop = new ShopDriver({ state: millingShop });
    shop.player.inventory = [
      board("walnut", 48, 5, 4, "rough", { faces: 0, edges: 0 }),
    ];
    shop
      .standAtOperatorCell(JOINTER)
      .load(JOINTER, isBoard)
      .switchOn(JOINTER)
      .operate(JOINTER);
    assert.strictEqual(
      shop.machine(JOINTER).state.operationProgress.status,
      "inProgress",
    );
    assert.strictEqual(pickUpMachine(shop.game, shop.machine(JOINTER)), false);
    assert.strictEqual(shop.player.carriedMachine, null);
  });

  it("refuses while the player's hands are full", () => {
    const shop = new ShopDriver();
    shop.player.inventory = [board("pallet", 24, 4, 2)];
    assert.strictEqual(
      pickUpMachine(shop.game, shop.machine(WORKBENCH)),
      false,
    );
    assert.strictEqual(shop.player.carriedMachine, null);
  });

  it("refuses while already carrying a machine", () => {
    const shop = new ShopDriver();
    assert.strictEqual(
      pickUpMachine(shop.game, shop.machine("garbageCan")),
      true,
    );
    assert.strictEqual(
      pickUpMachine(shop.game, shop.machine(WORKBENCH)),
      false,
    );
    assert.strictEqual(
      shop.player.carriedMachine?.machineTypeId,
      "garbageCan",
      "still the first thing picked up",
    );
  });
});

describe("delivering a crated machine", () => {
  const crates = (shop: ShopDriver) => [
    ...shop.game.entities.byConstructor(MachineCrateEntity),
  ];

  it("lands the crate on the open floor nearest the entrance", () => {
    const shop = new ShopDriver();
    const crate = deliverMachineCrate(
      shop.game,
      freshMachineState("miterSaw", shop.shop.progression),
    );
    assert.deepStrictEqual(crate.position, shop.shopInfo.info.entrancePosition);
  });

  it("skips cells that already hold a crate", () => {
    const shop = new ShopDriver();
    const machine = () => freshMachineState("miterSaw", shop.shop.progression);
    const first = deliverMachineCrate(shop.game, machine());
    const second = deliverMachineCrate(shop.game, machine());
    assert.strictEqual(crates(shop).length, 2);
    assert.notDeepStrictEqual(second.position, first.position);
  });
});
