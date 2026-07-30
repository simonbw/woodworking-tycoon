/**
 * The game, played from a new save to the last commission.
 *
 * This is not a test — it's the ledger the progression tests and the fixtures
 * both read from. Each rung is a function from the shop as it stood to the
 * shop after that commission has been handed over at the door, done entirely
 * through the real actions: buy the stock, buy the machine, carry it into
 * place, mill, glue, sand, finish, walk to the door.
 *
 * Two things follow from that. Every checkpoint is a shop a player could
 * actually own — which is more than the hand-written fixtures could claim.
 * And if a rebalance ever makes a rung unaffordable or a recipe unreachable,
 * this is where it surfaces, loudly, instead of leaving a dozen tests passing
 * against a shop that can no longer exist.
 *
 * Keep the assertions here to *reachability*. Exact money, exact XP, and
 * exact recipe outputs belong in the unit and sequence tests, where they cost
 * nothing to update. What this file is for is "you can get from here to
 * there".
 */

import { COMMISSION_SEQUENCE } from "../commissionSequence";
import { GameState } from "../GameState";
import { initialGameState } from "../initialGameState";
import { MACHINE_TYPES } from "../Machine";
import { Board, MaterialInstance } from "../Materials";
import { isMiteredFrameRail } from "../board-helpers";
import { makePallet } from "../material-helpers";
import { isPanel } from "../panel-helpers";
import { clampsFor } from "../Clamp";
import { checkProgressionMilestonesAction } from "../game-actions/progression-actions";
import { openShop, ShopDriver } from "./shop-driver";

const WORKBENCH = "workspace";

// ---------------------------------------------------------------------------
// Stock predicates. Pallet salvage is the whole early economy: prying one
// apart yields 6"-wide stringers and 4"-wide deck boards, all rough.
// ---------------------------------------------------------------------------

const isPallet = (m: MaterialInstance) => m.type === "pallet";
const isBoard = (m: MaterialInstance) => m.type === "board";
const palletBoard =
  (width: number, length?: number) => (m: MaterialInstance) =>
    isBoard(m) &&
    (m as { species: string }).species === "pallet" &&
    (m as { width: number }).width === width &&
    (length === undefined || (m as { length: number }).length === length);

/** The 6"-wide stringers a pallet's frame is made of. */
const stringer = palletBoard(6);
/** The 4"-wide deck boards nailed across it, 3' as pried off. */
const deckBoard = palletBoard(4);
const deckBoardOfLength = (length: number) => palletBoard(4, length);
const roughDeckBoard = (m: MaterialInstance) =>
  deckBoard(m) && (m as { surface: string }).surface === "rough";
const smoothDeckBoard = (m: MaterialInstance) =>
  deckBoard(m) && (m as { surface: string }).surface === "smooth";

/** Maple stock at an exact length and width — the hardwood era's material. */
const mapleBoard = (length: number, width: number) => (m: MaterialInstance) =>
  isBoard(m) &&
  (m as { species: string }).species === "maple" &&
  (m as { length: number }).length === length &&
  (m as { width: number }).width === width;

/** A glued-up panel of one species, whatever its surface. */
const isSinglePanel = (m: MaterialInstance) => isPanel(m);

/** Pallet stock at an exact length, width, and thickness. */
const palletBoardAt =
  (width: number, length: number, thickness: number) =>
  (m: MaterialInstance) =>
    palletBoard(width, length)(m) &&
    (m as { thickness: number }).thickness === thickness;

/** Walnut stock at an exact size — the frame and shelf era. */
const walnutBoard =
  (length: number, width: number, thickness: number) =>
  (m: MaterialInstance) =>
    isBoard(m) &&
    (m as { species: string }).species === "walnut" &&
    (m as { length: number }).length === length &&
    (m as { width: number }).width === width &&
    (m as { thickness: number }).thickness === thickness;

const isPlanterBox = (m: MaterialInstance) => m.type === "planterBox";
const isEndGrainPanel = (m: MaterialInstance) =>
  isPanel(m) && (m as { grain?: string }).grain === "end";
const isUnoiledEndGrainBoard = (m: MaterialInstance) =>
  m.type === "endGrainCuttingBoard" &&
  (m as { finish?: string }).finish === undefined;

/** Mill `count` 2" strips of one species out of 4' x 4" stock, into hand. */
function stripsOf(shop: ShopDriver, species: string, count: number): void {
  for (let i = 0; i < count; i++) {
    millOneBoard(
      shop,
      { species, length: 4, width: 4, thickness: 4 },
      { species, length: 2, width: 2, thickness: 4 },
    );
  }
}

/** Match a smooth 2' x 2" strip of one species, for pattern-order loading. */
const stripOfSpecies = (species: string) => (m: MaterialInstance): boolean =>
  sized({ species, length: 2, width: 2, thickness: 4, surface: "smooth" })(m);
/** A finished product that hasn't been oiled yet. */
const isUnfinishedBoard = (m: MaterialInstance) =>
  m.type === "simpleCuttingBoard" &&
  (m as { finish?: string }).finish === undefined;

/**
 * Turn 4' x 4" maple into the 2' x 2" strips a panel glue-up wants: crosscut
 * each board in half, then rip each half down the middle.
 */
function makeMapleStrips(shop: ShopDriver): ShopDriver {
  while (shop.stock(mapleBoard(4, 4)).length > 0) {
    shop.feed("miterSaw", mapleBoard(4, 4), { angle: 0, cutPosition: 2 });
  }
  while (shop.stock(mapleBoard(2, 4)).length > 0) {
    shop.feed("jobsiteTableSaw", mapleBoard(2, 4), { targetWidth: 2 });
  }
  return shop;
}

/** A board by species and every dimension that a recipe cares about. */
type BoardSize = {
  species: string;
  length: number;
  width: number;
  thickness: number;
  surface?: string;
};

const sized =
  (size: BoardSize) =>
  (m: MaterialInstance): boolean => {
    if (!isBoard(m)) return false;
    const b = m as unknown as {
      species: string;
      length: number;
      width: number;
      thickness: number;
      surface: string;
    };
    return (
      b.species === size.species &&
      b.length === size.length &&
      b.width === size.width &&
      b.thickness === size.thickness &&
      (size.surface === undefined || b.surface === size.surface)
    );
  };

/**
 * Mill one board from `from` down to `to`, in the order a shop actually
 * works: crosscut to length, rip to width, plane to thickness a detent at a
 * time, then sand up to surface. Every step is skipped when it isn't needed,
 * so this reads the same whether one dimension changes or all four.
 *
 * The offcuts stay in hand. That's deliberate: a rung that quietly relied on
 * an offcut it never produced should fail on the next `load`, not silently
 * work because this helper tidied up after it.
 */
function millOneBoard(shop: ShopDriver, from: BoardSize, to: BoardSize): void {
  // The racks sell smooth stock; say so, so the sanding loop below knows how
  // many grades it has to climb.
  let current: BoardSize = { ...from, surface: from.surface ?? "smooth" };
  if (current.length !== to.length) {
    shop.feed("miterSaw", sized(current), {
      angle: 0,
      cutPosition: to.length,
    });
    current = { ...current, length: to.length };
  }
  if (current.width !== to.width) {
    shop.feed("jobsiteTableSaw", sized(current), { targetWidth: to.width });
    current = { ...current, width: to.width };
  }
  // One detent a pass: a full-depth bite is all that fits under the head.
  while (current.thickness > to.thickness) {
    const next = current.thickness - 1;
    shop.feed("lunchboxPlaner", sized(current), { targetThickness: next });
    // A planed face comes off smooth, whatever it was before.
    current = { ...current, thickness: next, surface: "smooth" };
  }
  // Sanding steps one grade a pass: rough → smooth → sanded. The surface has
  // to be part of the match, or a run of these picks up a board it already
  // finished on an earlier board's pass — and the bench refuses sanded stock.
  const grades = ["rough", "smooth", "sanded"];
  while (
    to.surface !== undefined &&
    grades.indexOf(current.surface ?? "smooth") < grades.indexOf(to.surface)
  ) {
    const from_ = current.surface ?? "smooth";
    shop.make(WORKBENCH, "blockSandBoard", sized({ ...current, surface: from_ }), {
      count: 1,
    });
    current = { ...current, surface: grades[grades.indexOf(from_) + 1] };
  }
}

/**
 * A true frame rail: 45° at both ends, mirrored, so the four corners close.
 * Parallel miters make a parallelogram, which is why the saw swings both ways.
 */
const isFrameRail = (m: MaterialInstance) =>
  isBoard(m) && isMiteredFrameRail(m as unknown as Board, 45);

/**
 * Make one 2' × 1" × 1/4 sanded walnut rail with mirrored miters, out of one
 * 4' × 4" board off the big-box rack.
 *
 * The two cuts are the interesting part. Every cut the saw makes puts its
 * fresh mitered face on the *right* of the kept piece and the *left* of the
 * offcut — so a single pass can never miter both ends of one piece. Cutting
 * once and then re-cutting the **offcut** is what mirrors them: the first
 * pass leaves +45 on the offcut's left end, and the second, with the head
 * swung the other way, puts -45 on its right.
 */
function makeOneFrameRail(shop: ShopDriver): void {
  const stock: BoardSize = {
    species: "walnut",
    length: 4,
    width: 4,
    thickness: 4,
  };
  const milled: BoardSize = { ...stock, width: 1, thickness: 1 };
  millOneBoard(shop, stock, { ...milled, surface: "sanded" });

  const blank = { ...milled, surface: "sanded" };
  // Nick 1' off the left end at +45; the 3' offcut carries that miter.
  shop.feed("miterSaw", sized(blank), { angle: 45, cutPosition: 1 });
  // Swing to -45 and take the offcut to length. Its left end keeps the +45.
  shop.feed("miterSaw", sized({ ...blank, length: 3 }), {
    angle: -45,
    cutPosition: 2,
  });
}

// ---------------------------------------------------------------------------
// Shared moves
// ---------------------------------------------------------------------------

/**
 * Pry a pallet apart at the bench. Four deck boards come off one at a time,
 * then a last pass takes the stringers and the final board together, and the
 * nails go back into the shop's tin.
 */
function dismantleAPallet(shop: ShopDriver): ShopDriver {
  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "dismantlePallet")
    .load(WORKBENCH, isPallet, 1);
  // Runs until the bench has nothing left to pry.
  while (shop.machine(WORKBENCH).state.inputMaterials.length > 0) {
    shop.run(WORKBENCH);
  }
  return shop.collect(WORKBENCH);
}

/** Build one rustic shelf: two stringers as the shelves, three boards behind. */
function buildRusticShelf(shop: ShopDriver): ShopDriver {
  return shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "buildRusticPalletShelf")
    .load(WORKBENCH, stringer, 2)
    .load(WORKBENCH, deckBoard, 3)
    .run(WORKBENCH)
    .collect(WORKBENCH);
}

/**
 * Fetch a fresh pallet from the scrap outside. Free, and the early economy.
 * Commission 1 proves the real scavenging trip works; the later rungs skip
 * the 150-tick drive and just find one on the dropoff spot.
 */
function fetchAPallet(shop: ShopDriver): ShopDriver {
  return shop.arrange((state: GameState) => ({
    ...state,
    materialPiles: [
      ...state.materialPiles,
      {
        material: makePallet(),
        position: state.shopInfo.materialDropoffPosition,
      },
    ],
  }));
}

/** What the store charges for a machine. */
function machinePrice(machineTypeId: keyof typeof MACHINE_TYPES): number {
  return MACHINE_TYPES[machineTypeId].cost;
}

// ---------------------------------------------------------------------------
// The rungs
// ---------------------------------------------------------------------------

/** A brand-new save, with the progression flags settled. */
export function newGame(): ShopDriver {
  return openShop(initialGameState).apply(
    checkProgressionMilestonesAction(),
  );
}

/**
 * 1. Your First Shelf. No money, no store, an empty floor and a hammer on
 *    the bench — the first pallet is scavenged with the truck, and the
 *    nails to build with come out of it.
 */
function commission1(shop: ShopDriver): ShopDriver {
  shop.scavenge();
  // Two pallets came home in the bed and were staged on the dropoff
  // spot; leave the spare there and work the other.
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  buildRusticShelf(shop);
  return shop.handOverCommission();
}

/**
 * 2. Cut to Order — four deck boards cut to 2'. The first purchase: a miter
 *    saw.
 */
function commission2(shop: ShopDriver): ShopDriver {
  // A crate takes both hands: the offcuts from the first shelf go on the floor.
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  // Against the left wall, clear of the milling lanes down columns 4 and
  // 8 — the feed-through machines need their runway (see feed-clearance)
  shop.buyAndPlaceMachine("miterSaw", machinePrice("miterSaw"), [1, 7]);
  shop.comeHome();

  // A pallet yields five deck boards; four of them become the order.
  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  // The saw is direct-feed: swing the head square, slide the cut line to
  // the 2' mark, and every board fed through comes off at 2' plus a 1' drop.
  for (let i = 0; i < 4; i++) {
    shop.feed("miterSaw", deckBoardOfLength(3), { angle: 0, cutPosition: 2 });
  }
  return shop.handOverCommission();
}

/**
 * 3. Slat Set — four deck boards ripped from 4" down to 2". The table saw
 *    is the second purchase, and the first machine bought out of profit.
 */
function commission3(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  // Centered on the long axis: an 8' rip needs 7' of lane each side
  shop.buyAndPlaceMachine(
    "jobsiteTableSaw",
    machinePrice("jobsiteTableSaw"),
    [8, 10],
  );
  shop.comeHome();

  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  for (let i = 0; i < 4; i++) {
    shop.feed("jobsiteTableSaw", deckBoardOfLength(3), { targetWidth: 2 });
  }
  return shop.handOverCommission();
}

/**
 * 4. Sanded Set — four deck boards taken to sanded. A $10 sanding block off
 *    the tool wall does it: tools before machines.
 */
function commission4(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  shop.buyTool("sandingBlock");
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  // rough → smooth → sanded, one pass each, on four boards
  for (let i = 0; i < 4; i++) {
    shop.select(WORKBENCH, "blockSandBoard").load(WORKBENCH, roughDeckBoard, 1);
    shop.run(WORKBENCH).collect(WORKBENCH);
    shop.load(WORKBENCH, smoothDeckBoard, 1).run(WORKBENCH).collect(WORKBENCH);
  }
  return shop.handOverCommission();
}

/** 5. Double Shelf Order — two rustic shelves, so two pallets' worth. */
function commission5(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  for (let shelf = 0; shelf < 2; shelf++) {
    fetchAPallet(shop);
    shop.takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    buildRusticShelf(shop);
  }
  return shop.handOverCommission();
}

/**
 * 6. A Proper Cutting Board — the first real hardwood. Two boards, each five
 *    2"-wide maple strips glued into a panel, sanded twice, and finished.
 *    Needs clamps, which nothing before this did.
 */
function commission6(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  // A panel glue-up ties up four bars, and the panels are done one at a time.
  const glueUp = shop.machine(WORKBENCH).operations.find(
    (op) => op.id === "glueUpPanel",
  )!;
  shop.buyClamps(Math.max(0, clampsFor(glueUp) - shop.shop.clamps));
  // The glue-up wants 2' × 2" strips, five to a panel. The big-box rack sells
  // 4' × 4" maple, so each board crosscuts into two and rips into four.
  shop.buyBoards(
    "bigBoxRack",
    "maple",
    { length: 4, width: 4, thickness: 4 },
    3,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  makeMapleStrips(shop);

  for (let panel = 0; panel < 2; panel++) {
    shop
      .make(WORKBENCH, "glueUpPanel", mapleBoard(2, 2), { count: 5 })
      .make(WORKBENCH, "blockSandPanel", isSinglePanel)
      .make(WORKBENCH, "blockSandPanel", isSinglePanel)
      .make(WORKBENCH, "finishCuttingBoard", isSinglePanel);
  }
  return shop.handOverCommission();
}

/**
 * 7. Dimensioned Stock — two stringers taken from 3/4 down to 2/4. Sanding
 *    can't remove a quarter inch; this is what the planer is for.
 */
function commission7(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  // Its own lane down column 4, clear now that the miter saw parks by
  // the left wall
  shop.buyAndPlaceMachine(
    "lunchboxPlaner",
    machinePrice("lunchboxPlaner"),
    [4, 9],
  );
  shop.comeHome();

  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  // The rollers pull the stock through on their own: one pass, one detent.
  for (let i = 0; i < 2; i++) {
    shop.feed("lunchboxPlaner", palletBoardAt(6, 4, 3), { targetThickness: 2 });
  }
  return shop.handOverCommission();
}

/** 8. Balcony Garden — two planter boxes, five 2' slats and 8 screws each. */
function commission8(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  shop.buyTool("drill");
  shop.buySupplies("screws");
  shop.comeHome();
  // Two slots, three tools: the sanding block comes off to make room. The
  // starter bench runs out of room right about here.
  shop.fitOut(WORKBENCH, ["hammer", "drill"]);

  for (let box = 0; box < 2; box++) {
    fetchAPallet(shop);
    shop.takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    for (let slat = 0; slat < 5; slat++) {
      shop.feed("miterSaw", deckBoardOfLength(3), { angle: 0, cutPosition: 2 });
    }
    shop.make(WORKBENCH, "buildPlanterBox", deckBoardOfLength(2), { count: 5 });
    shop.putEverythingDown();
  }
  shop.takeFromFloor(isPlanterBox);
  return shop.handOverCommission();
}

/** 9. Oiled & Ready — the same two boards as rung 6, wiped with oil. */
function commission9(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  shop.buySupplies("mineralOil");
  shop.buyBoards(
    "bigBoxRack",
    "maple",
    { length: 4, width: 4, thickness: 4 },
    3,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  makeMapleStrips(shop);
  for (let board = 0; board < 2; board++) {
    shop
      .make(WORKBENCH, "glueUpPanel", mapleBoard(2, 2), { count: 5 })
      .make(WORKBENCH, "blockSandPanel", isSinglePanel)
      .make(WORKBENCH, "blockSandPanel", isSinglePanel)
      .make(WORKBENCH, "finishCuttingBoard", isSinglePanel)
      .make(WORKBENCH, "oilCuttingBoard", isUnfinishedBoard);
  }
  return shop.handOverCommission();
}

/**
 * 10. Gallery Wall — two frames, four mirrored 45° rails each. The first
 *     commission that needs a skill point spent, and the first to use both
 *     of the miter saw's angle stops.
 */
function commission10(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.learn("miteredFrames");
  shop.goShopping("orangeBox");
  shop.buySupplies("nails");
  // Frame rails are 2' × 1" × 1/4 sanded: rip 1" strips off 4" stock.
  shop.buyBoards(
    "bigBoxRack",
    "walnut",
    { length: 4, width: 4, thickness: 4 },
    8,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  // Eight rails: four to a frame.
  for (let rail = 0; rail < 8; rail++) {
    makeOneFrameRail(shop);
  }
  for (let frame = 0; frame < 2; frame++) {
    shop.make(WORKBENCH, "buildPictureFrame", isFrameRail, { count: 4 });
  }
  return shop.handOverCommission();
}

/** 11. Shelving, But Nice — two hardwood shelves, two sanded boards each. */
function commission11(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.learn("fineShelving");
  shop.goShopping("orangeBox");
  shop.buyBoards("bigBoxRack", "oak", { length: 4, width: 6, thickness: 4 }, 4);
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  const stock: BoardSize = {
    species: "oak",
    length: 4,
    width: 6,
    thickness: 4,
  };
  for (let i = 0; i < 4; i++) {
    millOneBoard(shop, stock, { ...stock, surface: "sanded" });
  }
  for (let shelf = 0; shelf < 2; shelf++) {
    shop.make(WORKBENCH, "buildShelf", sized({ ...stock, surface: "sanded" }), {
      count: 2,
    });
  }
  return shop.handOverCommission();
}

/**
 * 12. Stripes — walnut and maple in strict alternation. Two points down the
 *     pattern branch, and the first glue-up that cares what order the strips
 *     go in.
 */
function commission12(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.learn("twoToneBoards");
  shop.learn("stripedBoards");
  shop.goShopping("orangeBox");
  // One board per strip: three walnut, two maple.
  shop.buyBoards("bigBoxRack", "walnut", { length: 4, width: 4, thickness: 4 }, 3);
  shop.buyBoards("bigBoxRack", "maple", { length: 4, width: 4, thickness: 4 }, 2);
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  stripsOf(shop, "walnut", 3);
  stripsOf(shop, "maple", 2);
  shop.standAtOperatorCell(WORKBENCH).select(WORKBENCH, "glueUpPanel");
  // Load in pattern order: the glue-up preserves it, and the stripe recipe
  // rejects anything that isn't strictly alternating.
  for (const species of ["walnut", "maple", "walnut", "maple", "walnut"]) {
    shop.load(WORKBENCH, stripOfSpecies(species), 1);
  }
  shop.run(WORKBENCH).collect(WORKBENCH);

  shop
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "finishStripedBoard", isSinglePanel);
  return shop.handOverCommission();
}

/** 13. Small Treasures — two jewelry boxes, four thin sanded boards each. */
function commission13(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.learn("boxJoinery");
  shop.goShopping("orangeBox");
  shop.buyBoards(
    "bigBoxRack",
    "cherry",
    { length: 4, width: 4, thickness: 4 },
    8,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  const stock: BoardSize = {
    species: "cherry",
    length: 4,
    width: 4,
    thickness: 4,
  };
  const panelStock: BoardSize = { ...stock, length: 2, thickness: 2 };
  for (let i = 0; i < 8; i++) {
    millOneBoard(shop, stock, { ...panelStock, surface: "sanded" });
  }
  for (let box = 0; box < 2; box++) {
    shop.make(
      WORKBENCH,
      "buildJewelryBox",
      sized({ ...panelStock, surface: "sanded" }),
      { count: 4 },
    );
  }
  return shop.handOverCommission();
}

/**
 * 14. The Sunrise Board — one wood fading into the other, glued a strip at a
 *     time. Freeform Lamination is what lets the widths differ.
 */
function commission14(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.learn("freeformLamination");
  shop.learn("sunriseBoards");
  shop.goShopping("orangeBox");
  // One board per strip of the fade: three of each species.
  for (const species of ["walnut", "maple"] as const) {
    shop.buyBoards(
      "bigBoxRack",
      species,
      { length: 4, width: 6, thickness: 4 },
      3,
    );
  }
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  // Walnut narrows 3-2-1 as maple widens 1-2-3: that gradient is the fade.
  const fade: ReadonlyArray<[string, number]> = [
    ["walnut", 3],
    ["maple", 1],
    ["walnut", 2],
    ["maple", 2],
    ["walnut", 1],
    ["maple", 3],
  ];
  for (const [species, width] of fade) {
    millOneBoard(
      shop,
      { species, length: 4, width: 6, thickness: 4 },
      { species, length: 2, width, thickness: 4 },
    );
  }

  const strip = (species: string, width: number) =>
    sized({ species, length: 2, width, thickness: 4, surface: "smooth" });

  shop.standAtOperatorCell(WORKBENCH).select(WORKBENCH, "glueUpPair");
  shop.load(WORKBENCH, strip("walnut", 3), 1);
  shop.load(WORKBENCH, strip("maple", 1), 1);
  shop.run(WORKBENCH).collect(WORKBENCH);

  shop.select(WORKBENCH, "extendPanel");
  for (const [species, width] of fade.slice(2)) {
    shop.load(WORKBENCH, isSinglePanel, 1);
    shop.load(WORKBENCH, strip(species, width), 1);
    shop.run(WORKBENCH).collect(WORKBENCH);
  }

  shop
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "finishSunriseBoard", isSinglePanel);
  return shop.handOverCommission();
}

/**
 * 15. The Butcher's Block — everything at once. Build a sled out of plywood
 *     and pallet runners, mount it on the saw, slice a sanded panel, stand
 *     the grain on end, glue it all again, sand, finish, oil.
 */
function commission15(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.learn("jigsAndFixtures");
  shop.learn("endGrainBoards");
  shop.goShopping("orangeBox");
  shop.buySheet("plywoodB");
  shop.buySupplies("mineralOil");
  shop.buyBoards(
    "bigBoxRack",
    "maple",
    { length: 4, width: 4, thickness: 4 },
    3,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  // The sled's runners are pallet scrap — the first thing this shop ever had.
  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "buildCrosscutSled")
    .load(WORKBENCH, (m) => m.type === "plywood", 1)
    .load(WORKBENCH, deckBoardOfLength(3), 2)
    .run(WORKBENCH)
    // The finished sled is a physical thing in the bench's output bay:
    // pick it up and carry it over to the saw
    .collect(WORKBENCH);
  shop.mount("jobsiteTableSaw", "crosscutSled");

  // A sanded single-species panel is what the sled slices.
  makeMapleStrips(shop);
  shop
    .make(WORKBENCH, "glueUpPanel", mapleBoard(2, 2), { count: 5 })
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "blockSandPanel", isSinglePanel);

  shop.feed("jobsiteTableSaw", isSinglePanel);
  shop
    .make(WORKBENCH, "glueUpEndGrain", (m) => m.type === "endGrainSlice", {
      count: 4,
    })
    .make(WORKBENCH, "blockSandPanel", isEndGrainPanel)
    .make(WORKBENCH, "blockSandPanel", isEndGrainPanel)
    .make(WORKBENCH, "finishEndGrainBoard", isEndGrainPanel)
    .make(WORKBENCH, "oilCuttingBoard", isUnoiledEndGrainBoard);
  return shop.handOverCommission();
}

/** The ledger, memoised. Playing to rung n plays 0..n exactly once. */
const RUNGS: ReadonlyArray<(shop: ShopDriver) => ShopDriver> = [
  commission1,
  commission2,
  commission3,
  commission4,
  commission5,
  commission6,
  commission7,
  commission8,
  commission9,
  commission10,
  commission11,
  commission12,
  commission13,
  commission14,
  commission15,
];

const checkpoints: GameState[] = [];

/**
 * The shop after `n` commissions have been handed over. `checkpointAfter(0)`
 * is a new game. Built lazily and cached, so a file full of tests each
 * reading a different rung still only plays the game once.
 */
export function checkpointAfter(n: number): GameState {
  if (n < 0 || n > RUNGS.length) {
    throw new Error(
      `No checkpoint for commission ${n} — the ledger covers 0..${RUNGS.length}` +
        ` of ${COMMISSION_SEQUENCE.length} authored commissions`,
    );
  }
  if (checkpoints.length === 0) {
    checkpoints.push(newGame().shop);
  }
  while (checkpoints.length <= n) {
    const from = checkpoints[checkpoints.length - 1];
    const rung = RUNGS[checkpoints.length - 1];
    checkpoints.push(rung(openShop(from)).shop);
  }
  return checkpoints[n];
}

/** How many rungs the ledger can currently play. */
export const LEDGER_DEPTH = RUNGS.length;
