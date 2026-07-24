import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { LUMBER_CHANNELS } from "./lumberStock";
import { makeMaterial, makePallet } from "./material-helpers";
import { FinishedProduct, REAL_WOOD_SPECIES, SheetGood } from "./Materials";
import {
  getBoardBuyPrice,
  getSellValue,
  getSheetBuyPrice,
  SPECIES_VALUE_MULTIPLIER,
} from "./material-values";
import { panel, uniformPanel } from "./panel-helpers";

describe("getSellValue", () => {
  it("prices boards by board-foot volume", () => {
    // 4' x 6" x 3/4 stringer: 1.5 bf at pallet wood's $4.80/bf craft rate
    assert.strictEqual(getSellValue(board("pallet", 4, 6, 3)), 7.2);
    // 3' x 4" x 1/4 deck board: 0.25 bf
    assert.strictEqual(getSellValue(board("pallet", 3, 4, 1)), 1.2);
    // A 2x4 stud is 8' x 4" x 8/4 = 5.33 bf of pine at $0.25/bf
    assert.strictEqual(getSellValue(board("pine", 8, 4, 8)), 1.33);
  });

  it("prices a whole pallet below its dismantled boards", () => {
    const pallet = makePallet();
    const dismantledValue =
      3 * getSellValue(board("pallet", 4, 6, 3)) +
      11 * getSellValue(board("pallet", 3, 4, 1));
    assert.ok(getSellValue(pallet) < dismantledValue);
  });

  it("prices finished products well above their input wood", () => {
    const shelf = makeMaterial<FinishedProduct>({
      type: "rusticShelf",
      species: "pallet",
    });
    const inputWood =
      2 * getSellValue(board("pallet", 4, 6, 3)) +
      3 * getSellValue(board("pallet", 3, 4, 1));
    assert.strictEqual(getSellValue(shelf), 60);
    assert.ok(getSellValue(shelf) > 2 * inputWood);
  });

  it("scales board value by species rate", () => {
    // 3' x 4" x 4/4 is exactly one board foot
    assert.strictEqual(getSellValue(board("pine", 3, 4, 4)), 0.25);
    assert.strictEqual(getSellValue(board("maple", 3, 4, 4)), 1.75);
    assert.strictEqual(getSellValue(board("walnut", 3, 4, 4)), 4);
  });

  it("prices panels strip by strip", () => {
    // 5 maple strips at 3' x 4" x 4/4: one board foot each at $1.75/bf
    assert.strictEqual(getSellValue(uniformPanel("maple", 5, 3, 4, 4)), 8.75);
  });

  it("prices multi-species panels by each strip's own species", () => {
    const striped = panel(
      [
        { species: "walnut", width: 4 },
        { species: "pine", width: 4 },
      ],
      3,
      4,
    );
    const walnutStrip = getSellValue(board("walnut", 3, 4, 4));
    const pineStrip = getSellValue(board("pine", 3, 4, 4));
    assert.strictEqual(getSellValue(striped), walnutStrip + pineStrip);
  });

  it("scales finished product value by species", () => {
    const mapleBoard = makeMaterial<FinishedProduct>({
      type: "simpleCuttingBoard",
      species: "maple",
    });
    assert.strictEqual(
      getSellValue(mapleBoard),
      40 * SPECIES_VALUE_MULTIPLIER.maple,
    );
  });
});

describe("getBoardBuyPrice", () => {
  it("keeps buy-and-flip unprofitable for every species", () => {
    for (const species of [
      "pallet",
      "pine",
      "oak",
      "walnut",
      "purpleHeart",
    ] as const) {
      const b = board(species, 8, 8, 8);
      assert.ok(
        getBoardBuyPrice(b) > getSellValue(b),
        `${species} board should cost more than it sells for`,
      );
    }
  });

  it("charges more for fancier species", () => {
    assert.ok(
      getBoardBuyPrice(board("walnut", 4, 4, 2)) >
        getBoardBuyPrice(board("pine", 4, 4, 2)),
    );
  });

  it("keeps buy-and-flip unprofitable for every channel, species, and SKU", () => {
    for (const channel of LUMBER_CHANNELS) {
      for (const species of channel.species) {
        for (const sku of channel.skus) {
          const b = board(
            species,
            sku.length,
            sku.width,
            sku.thickness,
            channel.surface,
            { faces: channel.jointedFaces, edges: channel.jointedEdges },
          );
          assert.ok(
            getBoardBuyPrice(b, channel.priceMultiplier) > getSellValue(b),
            `${channel.id}: ${species} ${sku.length}x${sku.width}x${sku.thickness} should cost more than it sells for`,
          );
        }
      }
    }
  });

  it("prices the same wood cheaper the less milled it comes", () => {
    const bigBox = LUMBER_CHANNELS.find((c) => c.id === "bigBoxRack")!;
    const s2sRack = LUMBER_CHANNELS.find((c) => c.id === "s2sRack")!;
    const roughRack = LUMBER_CHANNELS.find((c) => c.id === "roughRack")!;
    const b = board("maple", 8, 4, 4);
    const bigBoxPrice = getBoardBuyPrice(b, bigBox.priceMultiplier);
    const s2sPrice = getBoardBuyPrice(b, s2sRack.priceMultiplier);
    const roughPrice = getBoardBuyPrice(b, roughRack.priceMultiplier);
    assert.ok(bigBoxPrice > s2sPrice && s2sPrice > roughPrice);
  });

  it("keeps mill-and-flip unprofitable even from the rough rack", () => {
    // Buy rough at the deepest discount, mill it to S4S (a skim pass keeps
    // the nominal thickness), sell smooth
    const roughRack = LUMBER_CHANNELS.find((c) => c.id === "roughRack")!;
    const roughCost = getBoardBuyPrice(
      board("maple", 8, 4, 4, "rough", { faces: 0, edges: 0 }),
      roughRack.priceMultiplier,
    );
    const milledValue = getSellValue(
      board("maple", 8, 4, 4, "smooth", { faces: 2, edges: 2 }),
    );
    assert.ok(roughCost > milledValue);
  });
});

describe("surface value", () => {
  it("rewards sanding raw stock a little", () => {
    const rough = getSellValue(board("pallet", 4, 6, 3, "rough"));
    const smooth = getSellValue(board("pallet", 4, 6, 3, "smooth"));
    const sanded = getSellValue(board("pallet", 4, 6, 3, "sanded"));
    assert.ok(rough < smooth && smooth < sanded);
    // ...but not product-level money: still less than double
    assert.ok(sanded < rough * 2);
  });
});

describe("cutting board economics", () => {
  it("is profitable from every channel that sells cutting-board stock", () => {
    // A cutting board consumes five 2' x 2" x 4/4 strips. Any 4/4 SKU rips
    // and crosscuts into floor(length/2) * floor(width/2) strips. Less-milled
    // channels cost more shop labor but must never cost more money.
    for (const channel of LUMBER_CHANNELS) {
      for (const species of channel.species) {
        const sellValue = getSellValue(
          makeMaterial<FinishedProduct>({
            type: "simpleCuttingBoard",
            species,
          }),
        );
        const stripSkus = channel.skus.filter(
          (sku) => sku.thickness === 4 && sku.width >= 2 && sku.length >= 2,
        );
        for (const sku of stripSkus) {
          const strips = Math.floor(sku.length / 2) * Math.floor(sku.width / 2);
          const lumberCost = getBoardBuyPrice(
            board(species, sku.length, sku.width, sku.thickness),
            channel.priceMultiplier,
          );
          const costPerCuttingBoard = (lumberCost * 5) / strips;
          assert.ok(
            sellValue > costPerCuttingBoard,
            `${channel.id} ${species}: sells $${sellValue} vs $${costPerCuttingBoard} in lumber`,
          );
        }
      }
    }
  });

  it("earns more per board with fancier species", () => {
    const profit = (species: (typeof REAL_WOOD_SPECIES)[number]) =>
      getSellValue(
        makeMaterial<FinishedProduct>({ type: "simpleCuttingBoard", species }),
      ) -
      (getBoardBuyPrice(board(species, 8, 4, 4)) * 5) / 8;
    assert.ok(profit("maple") > profit("pine"));
    assert.ok(profit("purpleHeart") > profit("maple"));
  });
});

describe("sheet good pricing", () => {
  const sheet = (kind: SheetGood["kind"]) =>
    makeMaterial<SheetGood>({
      type: "plywood",
      kind,
      length: 4,
      width: 4,
      thickness: 2,
    });

  it("prices sheets by board footage times the kind rate", () => {
    // A 4' x 4' half-inch sheet is 8 board feet
    assert.strictEqual(getSellValue(sheet("plywoodB")), 8);
    assert.strictEqual(getSellValue(sheet("particleBoard")), 3.2);
    assert.strictEqual(getSellValue(sheet("plywoodA")), 8.8);
  });

  it("orders every kind by the quality ladder", () => {
    const rack: SheetGood["kind"][] = [
      "particleBoard",
      "osb",
      "mdf",
      "plywoodC",
      "plywoodB",
      "plywoodA",
    ];
    for (let i = 1; i < rack.length; i++) {
      assert.ok(
        getSellValue(sheet(rack[i])) > getSellValue(sheet(rack[i - 1])),
      );
    }
  });

  it("marks up sheet buy prices like lumber, so flipping loses money", () => {
    assert.strictEqual(getSheetBuyPrice(sheet("plywoodB")), 24);
    assert.ok(getSheetBuyPrice(sheet("osb")) > getSellValue(sheet("osb")));
  });

  it("puts store shelves near real-world prices", () => {
    // The classic 2x4x8 stud: ~$4 at the big box
    assert.strictEqual(getBoardBuyPrice(board("pine", 8, 4, 8)), 3.99);
    // 4' x 4' half-inch particle board: ~$10
    assert.strictEqual(getSheetBuyPrice(sheet("particleBoard")), 9.6);
  });
});
