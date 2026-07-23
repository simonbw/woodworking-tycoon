import {
  BoardDimension,
  JointedCount,
  Species,
  SurfaceCondition,
} from "./Materials";

export interface LumberSku {
  readonly length: BoardDimension;
  readonly width: BoardDimension;
  readonly thickness: BoardDimension;
}

/**
 * The places that sell lumber, each a separate trip out the garage door:
 * Orange Box (the big-box store) and Sawyer & Sons (the hardwood
 * lumberyard). A shopping trip is to one of them at a time.
 */
export type StoreId = "orangeBox" | "lumberyard";

/**
 * A lumber purchase channel: one rack at one store, modeled on the real
 * woodworker's journey — free pallets, construction lumber, overpriced
 * big-box S4S, fair-priced lumberyard S2S, and cheap rough stock that
 * demands a full milling chain. Higher channels cost less per board-foot
 * but more capability; every jig and machine you add reprices the whole
 * town in your favor.
 *
 * Anything milled short of S4S lives at the lumberyard — the big box only
 * sells wood that's ready to use. Channels are reputation-gated and fully
 * hidden until unlocked — no grayed-out teasers. New sections appearing
 * IS the reward.
 */
export interface LumberChannel {
  readonly id: "constructionLumber" | "bigBoxRack" | "s2sRack" | "roughRack";
  readonly name: string;
  /** Which store's racks this channel hangs in. */
  readonly store: StoreId;
  /** Store-voice flavor line shown under the section heading. */
  readonly tagline: string;
  readonly species: ReadonlyArray<Species>;
  readonly skus: ReadonlyArray<LumberSku>;
  /** The milled state boards from this channel arrive in. */
  readonly surface: SurfaceCondition;
  readonly jointedFaces: JointedCount;
  readonly jointedEdges: JointedCount;
  /**
   * Channel price factor on top of the base markup. The big-box rack is
   * where you overpay for someone else's milling; rough stock is where
   * your machines start paying rent.
   */
  readonly priceMultiplier: number;
  readonly minReputation: number;
}

export const LUMBER_CHANNELS: ReadonlyArray<LumberChannel> = [
  {
    id: "constructionLumber",
    name: "Construction Lumber",
    store: "orangeBox",
    tagline:
      "Framing stock. Straight enough for a wall, cheap enough for jigs.",
    species: ["pine"],
    // Framing sizes: 2x4s, 2x6s, and 1x4 strapping
    skus: [
      { length: 8, width: 4, thickness: 8 },
      { length: 8, width: 6, thickness: 8 },
      { length: 8, width: 4, thickness: 4 },
    ],
    surface: "smooth",
    jointedFaces: 2,
    jointedEdges: 2,
    priceMultiplier: 1,
    minReputation: 0,
  },
  {
    id: "bigBoxRack",
    name: "S4S Hardwood Rack",
    store: "orangeBox",
    tagline: "Ready to use. You're paying us to have done the milling.",
    species: ["poplar", "oak", "maple"],
    // Short, small boards — hobbyist portions
    skus: [
      { length: 4, width: 4, thickness: 4 },
      { length: 4, width: 6, thickness: 4 },
      { length: 6, width: 4, thickness: 4 },
    ],
    surface: "smooth",
    jointedFaces: 2,
    jointedEdges: 2,
    priceMultiplier: 1.6,
    minReputation: 0,
  },
  {
    id: "s2sRack",
    name: "S2S Rack",
    store: "lumberyard",
    tagline:
      "Faces planed, edges as the saw left them. Bring a straight-line rig.",
    species: ["maple", "oak", "cherry", "walnut"],
    skus: [
      { length: 8, width: 6, thickness: 4 },
      { length: 8, width: 4, thickness: 8 },
      { length: 6, width: 8, thickness: 4 },
    ],
    surface: "smooth",
    jointedFaces: 2,
    jointedEdges: 0,
    priceMultiplier: 1,
    minReputation: 12,
  },
  {
    id: "roughRack",
    name: "Rough Rack",
    store: "lumberyard",
    tagline:
      "Straight off the mill. Cheapest wood in town, if your shop can flatten it.",
    species: ["maple", "oak", "cherry", "walnut"],
    skus: [
      { length: 8, width: 6, thickness: 4 },
      { length: 8, width: 8, thickness: 8 },
      { length: 6, width: 6, thickness: 4 },
    ],
    surface: "rough",
    jointedFaces: 0,
    jointedEdges: 0,
    priceMultiplier: 0.55,
    minReputation: 22,
  },
];

/**
 * The reputation at which the lumberyard opens its gate — the cheapest
 * channel on its racks. The yard appearing at the garage door IS the
 * reputation reward; its remaining channels unlock inside as usual.
 */
export const LUMBERYARD_MIN_REPUTATION = Math.min(
  ...LUMBER_CHANNELS.filter((channel) => channel.store === "lumberyard").map(
    (channel) => channel.minReputation,
  ),
);

/**
 * The channels the player has earned at one store. Locked channels don't
 * render at all.
 */
export function unlockedLumberChannels(
  reputation: number,
  store: StoreId,
): ReadonlyArray<LumberChannel> {
  return LUMBER_CHANNELS.filter(
    (channel) => channel.store === store && reputation >= channel.minReputation,
  );
}
