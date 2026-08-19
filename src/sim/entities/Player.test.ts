import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "../../game/board-helpers";
import { WALL_THICKNESS_CELLS } from "../../game/lot";
import { PLAYER_RADIUS } from "../../game/player-motion";
import { putDownHere } from "../commands/interact-commands";
import { setMoveInput, setWaiting } from "../commands/player-commands";
import { ShopDriver } from "../driver/ShopDriver";

/**
 * Exemplar #1's contract: the player entity owns the continuous body
 * (integrated on raw dt against the lot's geometry), the hands, and the
 * busy-minute burn (on gameDt), and it registers itself with TimeFlow.
 */

describe("Player movement", () => {
  it("walks the body along the input on engine time", () => {
    const driver = new ShopDriver();
    const [startX, startY] = driver.player.position;
    setMoveInput(driver.game, [1, 0]);
    driver.stepEngine(60); // one real second
    const [x, y] = driver.player.position;
    assert.ok(x > startX + 3, `moved right (${startX} → ${x})`);
    assert.ok(Math.abs(y - startY) < 1e-9, "held the line");
    assert.strictEqual(driver.player.direction, 0);
  });

  it("stands still without input", () => {
    const driver = new ShopDriver();
    const before = [...driver.player.position];
    driver.stepEngine(60);
    assert.deepStrictEqual([...driver.player.position], before);
  });

  it("stops at the shop's wall instead of walking through it", () => {
    const driver = new ShopDriver();
    setMoveInput(driver.game, [-1, 0]);
    driver.stepEngine(60 * 5);
    const [x] = driver.player.position;
    // The west wall sits just outside the shop's floor; the body rests
    // against it, never inside it.
    assert.ok(
      x >= -WALL_THICKNESS_CELLS + PLAYER_RADIUS - 1e-3,
      `resting against the wall, not inside (x=${x})`,
    );
    assert.ok(x < 2, "made it to the wall");
  });

  it("does not move while away from the shop", () => {
    const driver = new ShopDriver();
    driver.player.away = { kind: "home" };
    const before = [...driver.player.position];
    setMoveInput(driver.game, [1, 0]);
    driver.stepEngine(60);
    assert.deepStrictEqual([...driver.player.position], before);
  });

  it("derives the cell underfoot from the body", () => {
    const driver = new ShopDriver();
    assert.deepStrictEqual(driver.player.cell, [6, 12]);
  });

  it("keeps a continuous heading on a diagonal walk, not one of the four facings", () => {
    const driver = new ShopDriver();
    setMoveInput(driver.game, [1, 1]);
    driver.stepEngine(10);
    // Diagonal input is 45° off every quantized `Direction` heading
    // (0, ±π/2, π).
    assert.strictEqual(driver.player.heading, Math.PI / 4);
    assert.ok(
      ![0, -Math.PI / 2, Math.PI, Math.PI / 2].includes(driver.player.heading),
      "heading isn't snapped to a 4-way facing",
    );
  });
});

describe("Player time wiring", () => {
  it("puts the clock at working pace while the body is busy", () => {
    const driver = new ShopDriver();
    driver.player.busyTicks = 3;
    assert.strictEqual(driver.timeFlow.resolveSpeed(), "working");
  });

  it("burns busy minutes on game time, at working pace", () => {
    const driver = new ShopDriver();
    driver.player.busyTicks = 3;
    // Working pace is 5 game minutes per real second: 3 minutes of busy
    // work takes 0.6 real seconds = 36 engine frames.
    driver.stepEngine(40);
    assert.strictEqual(driver.player.busyTicks, 0);
    assert.strictEqual(driver.timeFlow.resolveSpeed(), "idle");
  });

  it("holds busy time still while away", () => {
    const driver = new ShopDriver();
    driver.player.busyTicks = 3;
    driver.player.away = { kind: "home" };
    driver.tick(60);
    driver.stepEngine(60);
    assert.strictEqual(driver.player.busyTicks, 3);
  });

  it("waits under the held wait key", () => {
    const driver = new ShopDriver();
    setWaiting(driver.game, true);
    assert.strictEqual(driver.timeFlow.resolveSpeed(), "waiting");
    setWaiting(driver.game, false);
    assert.strictEqual(driver.timeFlow.resolveSpeed(), "idle");
  });

  it("stops the clock while home in bed", () => {
    const driver = new ShopDriver();
    driver.player.away = { kind: "home" };
    assert.strictEqual(driver.timeFlow.resolveSpeed(), "stopped");
  });
});

describe("Player set-down orientation", () => {
  it("lands a piece carried diagonally at the diagonal angle, not snapped to a facing", () => {
    const driver = new ShopDriver();
    driver.player.inventory.push(board("pine", 24, 4, 1));
    setMoveInput(driver.game, [1, 1]);
    driver.stepEngine(10);
    setMoveInput(driver.game, [0, 0]);

    putDownHere(driver.game, null, false);

    const pile = driver.piles.at(-1)!;
    assert.strictEqual(pile.rotation, Math.PI / 4 + Math.PI / 2);
  });
});

describe("Player hands", () => {
  it("reports the arm room left under the cap", () => {
    const driver = new ShopDriver();
    assert.strictEqual(driver.player.handSpaceLeft, 4);
    driver.player.inventory.push(
      { id: "b1", type: "board" } as never,
      { id: "b2", type: "board" } as never,
    );
    assert.strictEqual(driver.player.handSpaceLeft, 2);
  });
});

describe("Player serialization", () => {
  it("round-trips through the save file, transient keys dropped", () => {
    const driver = new ShopDriver();
    driver.player.busyTicks = 2.5;
    driver.player.operating = true;
    driver.player.waiting = true;
    setMoveInput(driver.game, [1, 0]);
    driver.stepEngine(30);

    const save = driver.save();
    const reloaded = new ShopDriver({ save });
    assert.deepStrictEqual(
      [...reloaded.player.position],
      [...driver.player.position],
    );
    assert.strictEqual(reloaded.player.busyTicks, driver.player.busyTicks);
    // The physical key state never survives a load.
    assert.strictEqual(reloaded.player.operating, false);
    assert.strictEqual(reloaded.player.waiting, false);
    assert.deepStrictEqual(reloaded.player.moveInput, [0, 0]);

    assert.strictEqual(
      JSON.stringify(new ShopDriver({ save }).save()),
      JSON.stringify(save),
    );
  });
});
