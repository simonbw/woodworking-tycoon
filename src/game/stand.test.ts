import assert from "node:assert";
import { describe, it } from "node:test";
import { board } from "./board-helpers";
import { initialGameState } from "./initialGameState";
import { lotSize } from "./lot";
import { makeMaterial } from "./material-helpers";
import { FinishedProduct } from "./Materials";
import {
  atStand,
  isSellable,
  saleReputationGain,
  sidewalkY,
  standRect,
} from "./stand";

const shopInfo = initialGameState.shopInfo;

describe("the stand's geometry", () => {
  it("sits inside the walkable lot, in the grass beside the driveway", () => {
    const rect = standRect(shopInfo);
    const [lotWidth, lotBottom] = lotSize(shopInfo);
    assert.ok(rect.min[0] >= 0);
    assert.ok(rect.max[0] <= lotWidth);
    assert.ok(rect.min[1] > shopInfo.size[1], "outside the building");
    assert.ok(rect.max[1] <= lotBottom, "inside the walkable lot");
  });

  it("is reachable from the cell above it and not from indoors", () => {
    const rect = standRect(shopInfo);
    const beside: [number, number] = [
      Math.floor((rect.min[0] + rect.max[0]) / 2),
      Math.floor(rect.min[1]) - 1,
    ];
    assert.ok(atStand(shopInfo, beside));
    assert.ok(!atStand(shopInfo, [2, 2]), "indoors never counts");
    assert.ok(!atStand(shopInfo, [11, 17]), "across the lot is out of reach");
  });

  it("keeps the sidewalk line past the walkable lot's edge", () => {
    assert.ok(sidewalkY(shopInfo) > lotSize(shopInfo)[1]);
  });
});

describe("what the stand takes and pays", () => {
  it("takes finished work and refuses raw stock", () => {
    const shelfPiece = makeMaterial<FinishedProduct>({
      type: "rusticShelf",
      species: "pallet",
    });
    assert.ok(isSellable(shelfPiece));
    assert.ok(!isSellable(board()));
  });

  it("pays reputation that grows sub-linearly with value", () => {
    assert.strictEqual(saleReputationGain(0), 0);
    const small = saleReputationGain(9);
    const large = saleReputationGain(36);
    assert.ok(small > 0);
    // Four times the value travels twice as far, not four times.
    assert.strictEqual(large, small * 2);
  });
});
