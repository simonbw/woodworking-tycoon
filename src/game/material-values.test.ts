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
  it("gives wood no sale price at all", () => {
    // The whole rule in one place: stock is what you work, not what you
    // sell. Every one of these is worth real money on the way IN.
    assert.strictEqual(getSellValue(board("pallet", 48, 6, 6)), 0);
    assert.strictEqual(getSellValue(board("walnut", 96, 8, 8)), 0);
    assert.strictEqual(getSellValue(makePallet()), 0);
    assert.strictEqual(getSellValue(uniformPanel("maple", 5, 3, 48, 4)), 0);
    assert.strictEqual(
      getSellValue(
        panel(
          [
            { species: "walnut", width: 4 },
            { species: "pine", width: 4 },
          ],
          36,
          4,
        ),
      ),
      0,
    );
  });

  it("does not pay more for a sanded board than a rough one", () => {
    // Surface is a gate on what you can build, never a price bump —
    // see docs/tools-and-surfaces.md.
    for (const surface of ["rough", "smooth", "sanded"] as const) {
      assert.strictEqual(getSellValue(board("pallet", 48, 6, 3, surface)), 0);
    }
  });

  it("prices finished products from the product table", () => {
    const shelf = makeMaterial<FinishedProduct>({
      type: "rusticShelf",
      species: "pallet",
    });
    assert.strictEqual(getSellValue(shelf), 12);
  });

  it("scales finished product value by species", () => {
    const mapleBoard = makeMaterial<FinishedProduct>({
      type: "simpleCuttingBoard",
      species: "maple",
    });
    assert.strictEqual(
      getSellValue(mapleBoard),
      8 * SPECIES_VALUE_MULTIPLIER.maple,
    );
  });

  it("pays a quarter more for a board that has been oiled", () => {
    const raw = makeMaterial<FinishedProduct>({
      type: "simpleCuttingBoard",
      species: "maple",
    });
    const oiled = makeMaterial<FinishedProduct>({
      type: "simpleCuttingBoard",
      species: "maple",
      finish: "mineralOil",
    });
    // Maple simple cutting board: 8 x 3 = 24 raw, x1.25 oiled
    assert.strictEqual(getSellValue(raw), 24);
    assert.strictEqual(getSellValue(oiled), 30);
  });
});

describe("getBoardBuyPrice", () => {
  it("charges real money for wood that sells for nothing", () => {
    // There is no buy-and-flip to guard against any more — the flip side
    // is zero — so the assertion worth keeping is that lumber isn't free.
    for (const species of ["pine", "oak", "walnut", "purpleHeart"] as const) {
      const b = board(species, 8, 8, 8);
      assert.ok(getBoardBuyPrice(b) > 0, `${species} board should cost money`);
      assert.strictEqual(getSellValue(b), 0);
    }
  });

  it("charges more for fancier species", () => {
    assert.ok(
      getBoardBuyPrice(board("walnut", 48, 4, 2)) >
        getBoardBuyPrice(board("pine", 48, 4, 2)),
    );
  });

  it("prices every channel, species, and SKU above zero", () => {
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
            getBoardBuyPrice(b, channel.priceMultiplier) > 0,
            `${channel.id}: ${species} ${sku.length}x${sku.width}x${sku.thickness} should have a shelf price`,
          );
        }
      }
    }
  });

  it("prices the same wood cheaper the less milled it comes", () => {
    const bigBox = LUMBER_CHANNELS.find((c) => c.id === "bigBoxRack")!;
    const s2sRack = LUMBER_CHANNELS.find((c) => c.id === "s2sRack")!;
    const roughRack = LUMBER_CHANNELS.find((c) => c.id === "roughRack")!;
    const b = board("maple", 96, 4, 4);
    const bigBoxPrice = getBoardBuyPrice(b, bigBox.priceMultiplier);
    const s2sPrice = getBoardBuyPrice(b, s2sRack.priceMultiplier);
    const roughPrice = getBoardBuyPrice(b, roughRack.priceMultiplier);
    assert.ok(bigBoxPrice > s2sPrice && s2sPrice > roughPrice);
  });

  it("charges the same for a board however milled it arrives", () => {
    // A channel's milled state is priced by its multiplier, not by the
    // board's own condition — so the two never double-count.
    const b = (surface: "rough" | "smooth") =>
      getBoardBuyPrice(board("maple", 96, 4, 4, surface));
    assert.strictEqual(b("rough"), b("smooth"));
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
  /** A full 4'×8' sheet — the size the shelf rate is quoted for. */
  const sheet = (kind: SheetGood["kind"]) =>
    makeMaterial<SheetGood>({
      type: "plywood",
      kind,
      length: 96,
      width: 48,
      thickness: 2,
    });

  const cutTo = (kind: SheetGood["kind"], length: number, width: number) =>
    makeMaterial<SheetGood>({
      type: "plywood",
      kind,
      length,
      width,
      thickness: 2,
    });

  it("prices a full sheet by board footage times the kind rate", () => {
    // A 4' x 8' half-inch sheet is 16 board feet
    assert.strictEqual(getSheetBuyPrice(sheet("plywoodB")), 48);
    assert.strictEqual(getSheetBuyPrice(sheet("particleBoard")), 19.2);
  });

  it("surcharges the small panels — nearly double per square foot", () => {
    const perSqFt = (s: SheetGood) =>
      getSheetBuyPrice(s) / ((s.length / 12) * (s.width / 12));
    const full = perSqFt(sheet("plywoodB"));
    const handy = perSqFt(cutTo("plywoodB", 48, 24));
    const project = perSqFt(cutTo("plywoodB", 24, 24));
    assert.ok(handy / full > 1.45 && handy / full < 1.6, `2×4 at ${handy}`);
    assert.ok(project / full > 1.8 && project / full < 2, `2×2 at ${project}`);
  });

  it("still costs less in total to buy the smaller piece", () => {
    assert.ok(
      getSheetBuyPrice(cutTo("plywoodB", 24, 24)) <
        getSheetBuyPrice(cutTo("plywoodB", 48, 24)),
    );
    assert.ok(
      getSheetBuyPrice(cutTo("plywoodB", 48, 24)) <
        getSheetBuyPrice(sheet("plywoodB")),
    );
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
        getSheetBuyPrice(sheet(rack[i])) > getSheetBuyPrice(sheet(rack[i - 1])),
      );
    }
  });

  it("gives a sheet no more sale value than a board", () => {
    assert.strictEqual(getSellValue(sheet("plywoodA")), 0);
  });

  it("puts store shelves near real-world prices", () => {
    // The classic 2x4x8 stud: $4 at the big box
    assert.strictEqual(getBoardBuyPrice(board("pine", 96, 4, 8)), 4);
    // 4' x 8' half-inch particle board: ~$20
    assert.strictEqual(getSheetBuyPrice(sheet("particleBoard")), 19.2);
  });
});
