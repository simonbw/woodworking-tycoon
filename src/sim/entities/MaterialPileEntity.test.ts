import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../../game/board-helpers";
import { freshMachineState } from "../../game/game-actions/machine-actions";
import { MaterialInstance } from "../../game/Materials";
import { HAND_CAPACITY } from "../../game/Person";
import { Vector } from "../../game/Vectors";
import { dropMaterial, pickUpMaterial } from "../commands/pile-commands";
import {
  loadTruckBed,
  takeCrateFromTruck,
  takeFromTruckBed,
} from "../commands/truck-commands";
import { ShopDriver } from "../driver/ShopDriver";
import { projectGameState } from "../projection";
import { MaterialPileEntity } from "./MaterialPileEntity";

/**
 * The pile & truck-cargo contract: geometric reach, the hand cap, the
 * no-piles-outdoors rule, the at-the-bed rules, and byte-identical
 * serialization.
 */

/** Standing in the tailgate aisle, one step out the door. */
const AT_BED: Vector = [6, 17];

function addPile(
  driver: ShopDriver,
  material: MaterialInstance,
  position: Vector,
  rotation = 0,
): MaterialPileEntity {
  return driver.game.addEntity(
    new MaterialPileEntity(material, position, rotation),
  );
}

function carry(driver: ShopDriver, count: number): void {
  for (let i = 0; i < count; i++) {
    driver.player.inventory.push(board("pine", 24, 4, 1));
  }
}

describe("pickUpMaterial", () => {
  it("picks up from the cell the pile rests in", () => {
    const driver = new ShopDriver();
    const pile = addPile(driver, board("pine", 96, 4, 1), [1.5, 3.5]);
    driver.standAt([1, 3]);
    assert.strictEqual(pickUpMaterial(driver.game, [pile]), true);
    assert.strictEqual(driver.piles.length, 0);
    assert.strictEqual(driver.inventory.length, 1);
  });

  it("picks up a long board from anywhere along its length", () => {
    const driver = new ShopDriver();
    const pile = addPile(driver, board("pine", 96, 4, 1), [1.5, 3.5]);
    driver.standAt([1, 2]);
    assert.strictEqual(pickUpMaterial(driver.game, [pile]), true);
    assert.strictEqual(driver.inventory.length, 1);
  });

  it("refuses cells the board does not reach", () => {
    // An 8' board centered at [1.5, 3.5] ends at y 7.5; [1, 8] is past it
    const driver = new ShopDriver();
    const pile = addPile(driver, board("pine", 96, 4, 1), [1.5, 3.5]);
    driver.standAt([1, 8]);
    assert.strictEqual(pickUpMaterial(driver.game, [pile]), false);
    assert.strictEqual(driver.piles.length, 1);
    assert.strictEqual(driver.inventory.length, 0);
  });

  it("refuses a load bigger than the arm room left", () => {
    // One free hand left; a two-pile grab doesn't fit and refuses whole
    const driver = new ShopDriver();
    const piles = [
      addPile(driver, board("pine", 24, 4, 1), [1, 3]),
      addPile(driver, board("pine", 24, 4, 1), [1, 3]),
    ];
    carry(driver, HAND_CAPACITY - 1);
    driver.standAt([1, 3]);
    assert.strictEqual(pickUpMaterial(driver.game, piles), false);
    assert.strictEqual(driver.piles.length, 2);
    assert.strictEqual(driver.inventory.length, HAND_CAPACITY - 1);
  });

  it("still takes a single piece into the last free hand", () => {
    const driver = new ShopDriver();
    const pile = addPile(driver, board("pine", 24, 4, 1), [1, 3]);
    carry(driver, HAND_CAPACITY - 1);
    driver.standAt([1, 3]);
    assert.strictEqual(pickUpMaterial(driver.game, [pile]), true);
    assert.strictEqual(driver.piles.length, 0);
    assert.strictEqual(driver.inventory.length, HAND_CAPACITY);
  });

  it("refuses any pickup once the hands are full", () => {
    const driver = new ShopDriver();
    const pile = addPile(driver, board("pine", 24, 4, 1), [1, 3]);
    carry(driver, HAND_CAPACITY);
    driver.standAt([1, 3]);
    assert.strictEqual(pickUpMaterial(driver.game, [pile]), false);
    assert.strictEqual(driver.piles.length, 1);
    assert.strictEqual(driver.inventory.length, HAND_CAPACITY);
  });
});

describe("dropMaterial", () => {
  it("drops carried stock as a pile underfoot", () => {
    // Without an explicit landing point the piece rests at the center of
    // the cell the player occupies (the keyboard layer passes the body's
    // actual position instead).
    const driver = new ShopDriver();
    const material = board("pine", 48, 4, 1);
    driver.player.inventory.push(material);
    driver.standAt([5, 5]);
    assert.strictEqual(dropMaterial(driver.game, [material]), true);
    assert.strictEqual(driver.inventory.length, 0);
    const pile = driver.piles.at(-1)!;
    assert.deepStrictEqual([...pile.position], [5.5, 5.5]);
    assert.strictEqual(pile.rotation, 0);
  });

  it("drops at the landing point and rotation it is given", () => {
    const driver = new ShopDriver();
    const material = board("pine", 48, 4, 1);
    driver.player.inventory.push(material);
    driver.standAt([5, 5]);
    dropMaterial(driver.game, [material], [5.2, 5.8], Math.PI / 3);
    const pile = driver.piles.at(-1)!;
    assert.deepStrictEqual([...pile.position], [5.2, 5.8]);
    assert.strictEqual(pile.rotation, Math.PI / 3);
  });

  it("keeps stock in hand on the lot — no piles outdoors", () => {
    const driver = new ShopDriver();
    const material = board("pine", 48, 4, 1);
    driver.player.inventory.push(material);
    driver.standAt([6, 17]);
    assert.strictEqual(dropMaterial(driver.game, [material]), false);
    assert.strictEqual(driver.inventory.length, 1);
    assert.strictEqual(driver.piles.length, 0);
  });

  it("refuses materials not in the inventory", () => {
    const driver = new ShopDriver();
    driver.standAt([5, 5]);
    assert.strictEqual(
      dropMaterial(driver.game, [board("pine", 48, 4, 1)]),
      false,
    );
    assert.strictEqual(driver.piles.length, 0);
  });
});

describe("the truck's bed", () => {
  it("moves carried stock over the rail into the bed", () => {
    const driver = new ShopDriver();
    const stock = board("pine", 48, 4, 1);
    driver.player.inventory.push(stock);
    driver.standAt(AT_BED);
    assert.strictEqual(loadTruckBed(driver.game, [stock]), true);
    assert.deepStrictEqual(driver.truck.bed, [stock]);
    assert.strictEqual(driver.inventory.length, 0);
  });

  it("does nothing away from the bed", () => {
    const driver = new ShopDriver();
    const stock = board("pine", 48, 4, 1);
    driver.player.inventory.push(stock);
    driver.standAt([6, 12]);
    assert.strictEqual(loadTruckBed(driver.game, [stock]), false);
    assert.strictEqual(driver.truck.bed.length, 0);
    assert.strictEqual(driver.inventory.length, 1);
  });

  it("lifts stock out of the bed into the arms", () => {
    const driver = new ShopDriver();
    const stock = board("pine", 48, 4, 1);
    driver.truck.bed.push(stock);
    driver.standAt(AT_BED);
    assert.strictEqual(takeFromTruckBed(driver.game, [stock]), true);
    assert.deepStrictEqual([...driver.inventory], [stock]);
    assert.strictEqual(driver.truck.bed.length, 0);
  });

  it("does nothing from indoors, even at the door", () => {
    const driver = new ShopDriver();
    const stock = board("pine", 48, 4, 1);
    driver.truck.bed.push(stock);
    driver.standAt([6, 15]);
    assert.strictEqual(takeFromTruckBed(driver.game, [stock]), false);
    assert.strictEqual(driver.truck.bed.length, 1);
  });

  it("refuses an armful bigger than the room left in the hands", () => {
    // One free hand left; a two-board armful doesn't fit and refuses whole
    const driver = new ShopDriver();
    const inBed = [board("pine", 48, 4, 1), board("pine", 48, 4, 1)];
    driver.truck.bed.push(...inBed);
    carry(driver, HAND_CAPACITY - 1);
    driver.standAt(AT_BED);
    assert.strictEqual(takeFromTruckBed(driver.game, inBed), false);
    assert.strictEqual(driver.truck.bed.length, 2);
    assert.strictEqual(driver.inventory.length, HAND_CAPACITY - 1);
  });

  it("hoists a crated machine onto the shoulders", () => {
    const driver = new ShopDriver();
    const crate = freshMachineState(
      "miterSaw",
      projectGameState(driver.game).progression,
    );
    driver.truck.crates.push(crate);
    driver.standAt(AT_BED);
    assert.strictEqual(takeCrateFromTruck(driver.game, "miterSaw"), true);
    assert.strictEqual(driver.player.carriedMachine, crate);
    assert.strictEqual(driver.truck.crates.length, 0);
  });

  it("a crate needs genuinely empty hands", () => {
    const driver = new ShopDriver();
    const crate = freshMachineState(
      "miterSaw",
      projectGameState(driver.game).progression,
    );
    driver.truck.crates.push(crate);
    carry(driver, 1);
    driver.standAt(AT_BED);
    assert.strictEqual(takeCrateFromTruck(driver.game), false);
    assert.strictEqual(driver.truck.crates.length, 1);
    assert.strictEqual(driver.player.carriedMachine, null);
  });
});

describe("the driver's floor and bed verbs", () => {
  it("round-trips stock floor → bed → floor through the tailgate", () => {
    const driver = new ShopDriver();
    driver.standAt([5, 5]);
    const boards = [board("pine", 48, 4, 1), board("pine", 48, 4, 1)];
    driver.player.inventory.push(...boards);
    driver.putEverythingDown();
    assert.strictEqual(driver.inventory.length, 0);
    assert.strictEqual(driver.piles.length, 2);

    driver.loadBed(boards);
    assert.strictEqual(driver.truck.bed.length, 2);
    assert.strictEqual(driver.piles.length, 0);
    assert.strictEqual(driver.inventory.length, 0);

    driver.unloadBed();
    assert.strictEqual(driver.truck.bed.length, 0);
    assert.strictEqual(driver.inventory.length, 0);
    // The haul ends staged on the dropoff spot, where takeFromFloor finds it
    assert.strictEqual(driver.piles.length, 2);
    driver.takeFromFloor((m) => m.type === "board", 2);
    assert.strictEqual(driver.inventory.length, 2);
  });

  it("putEverythingDown walks in from the lot before dropping", () => {
    const driver = new ShopDriver();
    driver.player.inventory.push(board("pine", 48, 4, 1));
    driver.standAtCab();
    driver.putEverythingDown();
    assert.strictEqual(driver.inventory.length, 0);
    assert.strictEqual(driver.piles.length, 1);
    assert.deepStrictEqual(
      driver.player.cell,
      driver.shopInfo.info.materialDropoffPosition,
    );
  });
});

describe("serialization", () => {
  it("round-trips piles and the truck's cargo byte-identically", () => {
    const driver = new ShopDriver();
    driver.standAt([5, 5]);
    const dropped = board("walnut", 48, 5, 4);
    driver.player.inventory.push(dropped);
    dropMaterial(driver.game, [dropped], [5.2, 5.8], Math.PI / 3);
    const hauled = board("pine", 96, 4, 1);
    driver.player.inventory.push(hauled);
    driver.standAt(AT_BED);
    loadTruckBed(driver.game, [hauled]);
    driver.truck.crates.push(
      freshMachineState("miterSaw", projectGameState(driver.game).progression),
    );

    const save = driver.save();
    const reloaded = new ShopDriver({ save });
    assert.strictEqual(
      JSON.stringify(new ShopDriver({ save }).save()),
      JSON.stringify(save),
    );

    const pile = reloaded.piles[0];
    assert.strictEqual(pile.material.id, dropped.id);
    assert.deepStrictEqual([...pile.position], [5.2, 5.8]);
    assert.strictEqual(pile.rotation, Math.PI / 3);
    assert.strictEqual(reloaded.truck.bed[0].id, hauled.id);
    assert.strictEqual(reloaded.truck.crates.length, 1);
  });
});
