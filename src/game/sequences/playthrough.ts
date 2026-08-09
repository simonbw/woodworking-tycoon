/**
 * The game, played from a new save to the last commission.
 *
 * This is not a test — it's the ledger the progression tests and the fixtures
 * both read from. Each rung is a function from the shop as it stood to the
 * shop after that commission has been handed over at the door, done entirely
 * through the real actions: grind jobs and listings until the phone rings and
 * the till covers the gear, buy the stock, buy the machine, carry it into
 * place, mill, glue, sand, finish, walk to the door.
 *
 * Commissions are rep-gated events now (see commissionSequence.ts), so the
 * ledger lives the way a player does: pallet-board jobs for reputation,
 * rustic shelves listed at fair value for money (the two-day pity timer
 * makes fair-priced listings deterministic income — and shelves are the
 * money, because the marketplace won't take the boards they're made of),
 * and a commission only when the reputation gate lets the phone ring.
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
import { consumeRequiredMaterials } from "../delivery";
import { makePallet } from "../material-helpers";
import { isPanel } from "../panel-helpers";
import { cellCenter } from "../player-motion";
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
const palletBoard = (width: number, length?: number) => (m: MaterialInstance) =>
  isBoard(m) &&
  (m as { species: string }).species === "pallet" &&
  (m as { width: number }).width === width &&
  (length === undefined || (m as { length: number }).length === length);

/** The 6"-wide stringers a pallet's frame is made of. */
const stringer = palletBoard(6);
/** The 4"-wide deck boards nailed across it, 3' as pried off. */
const deckBoard = palletBoard(4);
const deckBoardOfLength = (length: number) => palletBoard(4, length);

const isRusticShelf = (m: MaterialInstance) => m.type === "rusticShelf";

/** The sled base, once the project panel has been ripped to width. */
const sledBase = (m: MaterialInstance) =>
  m.type === "plywood" && m.width === 20;

/** Maple stock at an exact length and width — the hardwood era's material. */
const mapleBoard = (length: number, width: number) => (m: MaterialInstance) =>
  isBoard(m) &&
  (m as { species: string }).species === "maple" &&
  (m as { length: number }).length === length &&
  (m as { width: number }).width === width;

/** A glued-up panel of one species, whatever its surface. */
const isSinglePanel = (m: MaterialInstance) => isPanel(m);

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
      { species, length: 48, width: 4, thickness: 4 },
      { species, length: 24, width: 2, thickness: 4 },
    );
  }
}

/** Match a smooth 2' x 2" strip of one species, for pattern-order loading. */
const stripOfSpecies =
  (species: string) =>
  (m: MaterialInstance): boolean =>
    sized({ species, length: 24, width: 2, thickness: 4, surface: "smooth" })(
      m,
    );
/** A finished product that hasn't been oiled yet. */
const isUnfinishedBoard = (m: MaterialInstance) =>
  m.type === "simpleCuttingBoard" &&
  (m as { finish?: string }).finish === undefined;

/**
 * Turn 4' x 4" maple into the 2' x 2" strips a panel glue-up wants: crosscut
 * each board in half, then rip each half down the middle.
 */
function makeMapleStrips(shop: ShopDriver): ShopDriver {
  while (shop.stock(mapleBoard(48, 4)).length > 0) {
    shop.feed("miterSaw", mapleBoard(48, 4), { angle: 0, cutPosition: 24 });
  }
  while (shop.stock(mapleBoard(24, 4)).length > 0) {
    shop.feed("jobsiteTableSaw", mapleBoard(24, 4), { targetWidth: 2 });
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
    shop.make(
      WORKBENCH,
      "blockSandBoard",
      sized({ ...current, surface: from_ }),
      { count: 1 },
    );
    current = { ...current, surface: grades[grades.indexOf(from_) + 1] };
  }
}

/**
 * A true frame rail: 45° at both ends, mirrored, so the four corners close.
 * Parallel miters make a parallelogram, which is why the saw swings both ways.
 */
const isFrameRail = (m: MaterialInstance) =>
  isBoard(m) && isMiteredFrameRail(m as unknown as Board, 45);

/** A finished rustic frame rail at one of the frame's two lengths. */
const rusticFrameRail = (length: number) => (m: MaterialInstance) =>
  isFrameRail(m) &&
  (m as unknown as Board).species === "pallet" &&
  (m as unknown as Board).length === length &&
  (m as unknown as Board).width === 2 &&
  (m as unknown as Board).surface === "sanded";

/**
 * Make one rustic frame rail out of a ripped 2"-wide pallet blank: sand it
 * up from rough, then miter both ends.
 *
 * The two cuts mirror the same way the walnut rail's do — every pass puts
 * its fresh mitered face on the right of the kept piece and the left of
 * the offcut, so cutting once and then re-cutting the *offcut* with the
 * head swung the other way is what leans the two ends toward each other.
 */
function makeRusticFrameRail(shop: ShopDriver, length: number): void {
  const rough: BoardSize = {
    species: "pallet",
    length: 36,
    width: 2,
    thickness: 2,
    surface: "rough",
  };
  // Scavenged stock starts rough, so it climbs two grades to sanded.
  shop.make(WORKBENCH, "blockSandBoard", sized(rough), { count: 1 });
  shop.make(
    WORKBENCH,
    "blockSandBoard",
    sized({ ...rough, surface: "smooth" }),
    {
      count: 1,
    },
  );

  const sanded = { ...rough, surface: "sanded" };
  // Nick 6" off the left at +45; the 30" offcut carries that miter.
  shop.feed("miterSaw", sized(sanded), { angle: 45, cutPosition: 6 });
  // Swing to -45 and take the offcut to length; its left end keeps the +45.
  shop.feed("miterSaw", sized({ ...sanded, length: 30 }), {
    angle: -45,
    cutPosition: length,
  });
}

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
    length: 48,
    width: 4,
    thickness: 4,
  };
  const milled: BoardSize = { ...stock, width: 1, thickness: 1 };
  millOneBoard(shop, stock, { ...milled, surface: "sanded" });

  const blank = { ...milled, surface: "sanded" };
  // Nick 1' off the left end at +45; the 3' offcut carries that miter.
  shop.feed("miterSaw", sized(blank), { angle: 45, cutPosition: 12 });
  // Swing to -45 and take the offcut to length. Its left end keeps the +45.
  shop.feed("miterSaw", sized({ ...blank, length: 36 }), {
    angle: -45,
    cutPosition: 24,
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
  // No plan gets selected: a staged pallet offers prying on its own, and
  // the freed boards stay lying on the bench until they're taken off.
  return shop
    .standAtOperatorCell(WORKBENCH)
    .load(WORKBENCH, isPallet, 1)
    .run(WORKBENCH)
    .takeStock(WORKBENCH);
}

/** Build one rustic shelf: two stringers as the shelves, three boards behind. */
function buildRusticShelf(shop: ShopDriver): ShopDriver {
  // The shelf is the hammer's recipe: the grind runs between rungs whose
  // rails hold other tools, so make sure the hammer is back on the bench
  if (!shop.machine(WORKBENCH).state.tools.includes("hammer")) {
    shop.fitOut(WORKBENCH, ["hammer"]);
  }
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
        position: cellCenter(state.shopInfo.materialDropoffPosition),
        rotation: 0,
      },
    ],
  }));
}

/** What the store charges for a machine. */
function machinePrice(machineTypeId: keyof typeof MACHINE_TYPES): number {
  return MACHINE_TYPES[machineTypeId].cost;
}

// ---------------------------------------------------------------------------
// The grind: what the shop lives on between commissions.
// ---------------------------------------------------------------------------

/**
 * One selling round: scavenge a truckload, pry it apart, build two rustic
 * shelves, and put them up on the phone at fair value. Only the shelves
 * go up — the marketplace doesn't take raw stock (see `isListable`), so
 * the leftover deck boards stay on the floor for the jobs to eat.
 * Fair-priced listings are guaranteed out by the two-day pity timer, so a
 * round is deterministic money plus the review-reputation trickle and the
 * shelves' craft XP.
 */
function sellRound(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.scavenge();
  for (let i = 0; i < 2; i++) {
    shop.takeFromFloor(isPallet, 1);
    dismantleAPallet(shop);
    buildRusticShelf(shop);
    shop.putEverythingDown();
  }
  shop.list(isRusticShelf);
  return shop.awaitListingSales();
}

/**
 * One reputation job: seed the board (rng 0 always leads with the
 * rustic-shelves income-floor offer), build shelves until the ask is
 * covered, and drive it off. Delivered fresh, a job pays double
 * reputation — the tip hasn't decayed — so each cycle is worth about +2.
 *
 * Shelves rather than loose boards because the board only ever asks for
 * things the shop built (see job-generation.ts). The income floor is
 * still free: pallets are free, and the starter hammer is mounted from
 * the first morning.
 */
function grindShelfJob(shop: ShopDriver): ShopDriver {
  shop.putEverythingDown();
  shop.seedJobBoard();
  const offer = shop.shop.jobBoard.find(
    (candidate) =>
      candidate.materialCostFree &&
      candidate.requiredMaterials.length === 1 &&
      (
        candidate.requiredMaterials[0].type as ReadonlyArray<string> | undefined
      )?.includes("rusticShelf"),
  );
  if (!offer) {
    throw new Error(
      `No rustic-shelf job on the seeded board — it offers ` +
        `[${shop.shop.jobBoard.map((o) => o.description).join("; ")}]`,
    );
  }
  const satisfied = () =>
    consumeRequiredMaterials(
      [
        ...shop.inventory,
        ...shop.shop.materialPiles.map((pile) => pile.material),
      ],
      offer.requiredMaterials,
    ) !== null;
  while (!satisfied()) {
    // A pallet carries three stringers and a shelf wants two, so it's one
    // shelf per pallet however many deck boards pile up.
    if (shop.stock(stringer).length < 2 || shop.stock(deckBoard).length < 3) {
      if (shop.stock(isPallet).length === 0) {
        shop.scavenge();
      }
      shop.takeFromFloor(isPallet, 1);
      dismantleAPallet(shop);
      shop.putEverythingDown();
    }
    buildRusticShelf(shop);
    shop.putEverythingDown();
  }
  return shop.acceptJob(offer.id).deliverJob(offer.id);
}

/**
 * Live off the marketplace until the shop holds this much money and the
 * phone's next call is within reach. Money first (selling rounds trickle
 * reputation too), then reputation jobs, then a money top-up in case the
 * job runs spent anything — each loop converges because nothing here can
 * lose either number.
 */
function grindUntil(
  shop: ShopDriver,
  minReputation: number,
  minMoney: number,
): ShopDriver {
  while (shop.money < minMoney) {
    sellRound(shop);
  }
  while (shop.shop.reputation < minReputation) {
    grindShelfJob(shop);
  }
  while (shop.money < minMoney) {
    sellRound(shop);
  }
  return shop;
}

// ---------------------------------------------------------------------------
// The rungs
// ---------------------------------------------------------------------------

/** A brand-new save, with the progression flags settled. */
export function newGame(): ShopDriver {
  return openShop(initialGameState).apply(checkProgressionMilestonesAction());
}

/**
 * 1. Your First Shelf. No money, no store, an empty floor and a hammer on
 *    the bench — the first pallet is scavenged with the truck, and the
 *    nails to build with come out of it. On the clipboard from the start;
 *    every later commission has to be earned into ringing.
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
 * 2. The Frame Shop Order — a rustic frame: two 2' rails and two 1' rails,
 *    ripped to 2", sanded, mitered at every end, and nailed up square. The
 *    whole starter shop in one buy: a miter saw for the angles, a table saw
 *    for the rip, and a sanding block for the last grade — all funded off
 *    the job board, the first real stretch of living between commissions.
 */
function commission2(shop: ShopDriver): ShopDriver {
  grindUntil(shop, COMMISSION_SEQUENCE[1].minReputation, 480);
  // A crate takes both hands: the leftovers go on the floor.
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  // Against the left wall, clear of the milling lanes down columns 4 and
  // 8 — the feed-through machines need their runway (see feed-clearance)
  shop.buyAndPlaceMachine("miterSaw", machinePrice("miterSaw"), [1, 7]);
  // Centered on the long axis: an 8' rip needs 7' of lane each side
  shop.buyAndPlaceMachine(
    "jobsiteTableSaw",
    machinePrice("jobsiteTableSaw"),
    [8, 10],
  );
  shop.buyTool("sandingBlock");
  // Salvaged nails come back a pallet at a time and the shelf grind eats
  // them; a frame's four corners shouldn't wait on a lucky teardown.
  shop.buySupplies("nails");
  shop.comeHome();
  // Both slots earn their keep this rung: the block sands the rails and
  // the hammer nails the corners.
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  shop.putEverythingDown();

  // Two deck boards rip into the four 2"-wide blanks the frame wants.
  for (let i = 0; i < 2; i++) {
    shop.feed(
      "jobsiteTableSaw",
      sized({
        species: "pallet",
        length: 36,
        width: 4,
        thickness: 2,
        surface: "rough",
      }),
      { targetWidth: 2 },
    );
  }
  makeRusticFrameRail(shop, 24);
  makeRusticFrameRail(shop, 24);
  makeRusticFrameRail(shop, 12);
  makeRusticFrameRail(shop, 12);

  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "buildRusticFrame")
    .load(WORKBENCH, rusticFrameRail(24), 2)
    .load(WORKBENCH, rusticFrameRail(12), 2)
    .run(WORKBENCH)
    .collect(WORKBENCH);

  return shop.handOverCommission();
}

/**
 * 3. A Proper Cutting Board — the first real hardwood, oiled and done. Two
 *    boards, each five 2"-wide maple strips glued into a panel, sanded
 *    twice, finished, and wiped with mineral oil. Needs clamps, which
 *    nothing before this did.
 */
function commission3(shop: ShopDriver): ShopDriver {
  grindUntil(shop, COMMISSION_SEQUENCE[2].minReputation, 160);
  shop.putEverythingDown();
  shop.goShopping("orangeBox");
  // A panel glue-up ties up four bars, and the panels are done one at a time.
  const glueUp = shop
    .machine(WORKBENCH)
    .operations.find((op) => op.id === "glueUpPanel")!;
  shop.buyClamps(Math.max(0, clampsFor(glueUp) - shop.shop.clamps));
  shop.buySupplies("mineralOil");
  // Finishing is the kit's work now — the cheapest tool on the wall
  shop.buyTool("finishingKit");
  // The glue-up wants 2' × 2" strips, five to a panel. The big-box rack sells
  // 4' × 4" maple, so each board crosscuts into two and rips into four.
  shop.buyBoards(
    "bigBoxRack",
    "maple",
    { length: 48, width: 4, thickness: 4 },
    3,
  );
  shop.comeHome();
  // Two slots: the hammer has no job this rung, so the block and the
  // new finishing kit take the rail
  shop.fitOut(WORKBENCH, ["sandingBlock", "finishingKit"]);

  makeMapleStrips(shop);

  for (let panel = 0; panel < 2; panel++) {
    shop
      .make(WORKBENCH, "glueUpPanel", mapleBoard(24, 2), { count: 5 })
      .make(WORKBENCH, "blockSandPanel", isSinglePanel)
      .make(WORKBENCH, "blockSandPanel", isSinglePanel)
      .make(WORKBENCH, "finishCuttingBoard", isSinglePanel)
      .make(WORKBENCH, "oilCuttingBoard", isUnfinishedBoard);
  }
  return shop.handOverCommission();
}

/**
 * 4. The Cafe Fit-Out — the first commission that's a whole shop's worth of
 *    work: two fine oak shelves, a striped walnut-and-maple counter board,
 *    and two screwed planter boxes. Three skill points and a drill.
 */
function commission4(shop: ShopDriver): ShopDriver {
  grindUntil(shop, COMMISSION_SEQUENCE[3].minReputation, 270);
  shop.putEverythingDown();
  shop.learn("fineShelving");
  shop.learn("twoToneBoards");
  shop.learn("stripedBoards");
  shop.goShopping("orangeBox");
  shop.buyTool("drill");
  shop.buySupplies("screws");
  shop.buySupplies("nails");
  shop.buyBoards(
    "bigBoxRack",
    "oak",
    { length: 48, width: 6, thickness: 4 },
    4,
  );
  // One board per strip of the counter board: three walnut, two maple.
  shop.buyBoards(
    "bigBoxRack",
    "walnut",
    { length: 48, width: 4, thickness: 4 },
    3,
  );
  shop.buyBoards(
    "bigBoxRack",
    "maple",
    { length: 48, width: 4, thickness: 4 },
    2,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["sandingBlock", "finishingKit"]);

  // The shelves: four oak boards taken to sanded, two to a shelf.
  const oakStock: BoardSize = {
    species: "oak",
    length: 48,
    width: 6,
    thickness: 4,
  };
  for (let i = 0; i < 4; i++) {
    millOneBoard(shop, oakStock, { ...oakStock, surface: "sanded" });
  }
  for (let shelf = 0; shelf < 2; shelf++) {
    shop.make(
      WORKBENCH,
      "buildShelf",
      sized({ ...oakStock, surface: "sanded" }),
      { count: 2 },
    );
  }

  // The striped board: strict alternation, walnut-maple-walnut-maple-walnut.
  stripsOf(shop, "walnut", 3);
  stripsOf(shop, "maple", 2);
  shop.standAtOperatorCell(WORKBENCH).select(WORKBENCH, "glueUpPanel");
  for (const species of ["walnut", "maple", "walnut", "maple", "walnut"]) {
    shop.load(WORKBENCH, stripOfSpecies(species), 1);
  }
  shop.run(WORKBENCH).collect(WORKBENCH);
  shop
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "blockSandPanel", isSinglePanel)
    .make(WORKBENCH, "finishStripedBoard", isSinglePanel);

  // The planter boxes: five 2' slats and six screws each. Two slots on
  // the bench, three tools — the sanding block comes off for the drill.
  shop.fitOut(WORKBENCH, ["hammer", "drill"]);
  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  for (let slat = 0; slat < 10; slat++) {
    shop.feed("miterSaw", deckBoardOfLength(36), { angle: 0, cutPosition: 24 });
  }
  for (let box = 0; box < 2; box++) {
    shop.make(WORKBENCH, "buildPlanterBox", deckBoardOfLength(24), {
      count: 5,
    });
    shop.putEverythingDown();
  }
  return shop.handOverCommission();
}

/**
 * 5. Small Treasures — the jeweler's refit: two cherry jewelry boxes from
 *    thin planed stock, and two walnut frames with mirrored miters. The
 *    planer is what this rung buys; Box Joinery and Mitered Frames are
 *    what it learns.
 */
function commission5(shop: ShopDriver): ShopDriver {
  grindUntil(shop, COMMISSION_SEQUENCE[4].minReputation, 920);
  shop.putEverythingDown();
  shop.learn("boxJoinery");
  shop.learn("miteredFrames");
  shop.goShopping("orangeBox");
  // Its own lane down column 4, clear now that the miter saw parks by
  // the left wall
  shop.buyAndPlaceMachine(
    "lunchboxPlaner",
    machinePrice("lunchboxPlaner"),
    [4, 9],
  );
  shop.buySupplies("nails");
  // One 4' cherry board yields a whole box's seven thin parts — the
  // crosscuts, rips, and rip offcuts all get used
  shop.buyBoards(
    "bigBoxRack",
    "cherry",
    { length: 48, width: 4, thickness: 4 },
    2,
  );
  // One walnut board per frame rail: rip 1" strips off 4" stock.
  shop.buyBoards(
    "bigBoxRack",
    "walnut",
    { length: 48, width: 4, thickness: 4 },
    8,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["hammer", "sandingBlock"]);

  // The boxes: seven thin parts each — two 12×3 bottom slats, two 12×2
  // walls, three 6×2 ends — all milled out of ONE cherry board per box,
  // walking the offcuts down: the crosscut leftovers become the next
  // pieces, and each rip's offcut is the very next blank.
  const cherry = (
    length: number,
    width: number,
    thickness: number,
  ): BoardSize => ({ species: "cherry", length, width, thickness });
  const thinCherry = (m: MaterialInstance) =>
    isBoard(m) &&
    m.species === "cherry" &&
    m.thickness === 2 &&
    m.surface === "sanded";
  for (let box = 0; box < 2; box++) {
    const sanded = { surface: "sanded" as const };
    millOneBoard(shop, cherry(48, 4, 4), { ...cherry(12, 3, 2), ...sanded });
    millOneBoard(shop, cherry(36, 4, 4), { ...cherry(12, 3, 2), ...sanded });
    millOneBoard(shop, cherry(24, 4, 4), { ...cherry(12, 2, 2), ...sanded });
    // The rip's twin: targeting 2" out of 4" leaves an identical blank
    millOneBoard(shop, cherry(12, 2, 4), { ...cherry(12, 2, 2), ...sanded });
    millOneBoard(shop, cherry(12, 4, 4), { ...cherry(6, 2, 2), ...sanded });
    millOneBoard(shop, cherry(6, 2, 4), { ...cherry(6, 2, 2), ...sanded });
    millOneBoard(shop, cherry(6, 4, 4), { ...cherry(6, 2, 2), ...sanded });
    shop.make(WORKBENCH, "buildJewelryBox", thinCherry, { count: 7 });
  }

  // The frames: eight mirrored rails, four to a frame.
  for (let rail = 0; rail < 8; rail++) {
    makeOneFrameRail(shop);
  }
  for (let frame = 0; frame < 2; frame++) {
    shop.make(WORKBENCH, "buildPictureFrame", isFrameRail, { count: 4 });
  }
  return shop.handOverCommission();
}

/**
 * 6. The Butcher's Block — everything at once. Build a sled out of plywood
 *    and pallet runners, mount it on the saw, slice a sanded panel, stand
 *    the grain on end, glue it all again, sand, finish, oil.
 */
function commission6(shop: ShopDriver): ShopDriver {
  grindUntil(shop, COMMISSION_SEQUENCE[5].minReputation, 100);
  shop.putEverythingDown();
  shop.learn("jigsAndFixtures");
  shop.learn("endGrainBoards");
  shop.goShopping("orangeBox");
  // A 2×2 project panel: the smallest piece the rack sells, and the
  // cheapest way to a sled base for a shop with no circular saw.
  shop.buySheet("plywoodB", "project");
  shop.buySupplies("mineralOil");
  shop.buyBoards(
    "bigBoxRack",
    "maple",
    { length: 48, width: 4, thickness: 4 },
    3,
  );
  shop.comeHome();
  shop.fitOut(WORKBENCH, ["sandingBlock", "finishingKit"]);

  // The panel is 2" wider than the sled base wants, so it goes across
  // the saw first — the shop's first sheet cut.
  shop.feed("jobsiteTableSaw", (m) => m.type === "plywood", {
    sheetRipWidth: 20,
  });
  shop.putEverythingDown();
  shop.takeFromFloor(sledBase, 1);

  // The sled's runners are pallet scrap — the first thing this shop ever had.
  fetchAPallet(shop);
  shop.takeFromFloor(isPallet, 1);
  dismantleAPallet(shop);
  shop
    .standAtOperatorCell(WORKBENCH)
    .select(WORKBENCH, "buildCrosscutSled")
    .load(WORKBENCH, sledBase, 1)
    .load(WORKBENCH, deckBoardOfLength(36), 2)
    .run(WORKBENCH)
    // The finished sled is a physical thing in the bench's output bay:
    // pick it up and carry it over to the saw
    .collect(WORKBENCH);
  shop.mount("jobsiteTableSaw", "crosscutSled");

  // A sanded single-species panel is what the sled slices.
  makeMapleStrips(shop);
  shop
    .make(WORKBENCH, "glueUpPanel", mapleBoard(24, 2), { count: 5 })
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
