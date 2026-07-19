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
 * A lumber purchase channel: one section of the lumber aisle, modeled on
 * the real woodworker's journey — free pallets, construction lumber,
 * overpriced big-box S4S, fair-priced lumberyard S2S, and cheap rough
 * stock that demands a full milling chain. Higher channels cost less per
 * board-foot but more capability; every jig and machine you add reprices
 * the whole store in your favor.
 *
 * Channels are reputation-gated and fully hidden until unlocked — no
 * grayed-out teasers. New sections appearing IS the reward.
 */
export interface LumberChannel {
  readonly id: "constructionLumber" | "bigBoxRack" | "lumberyard" | "roughRack";
  readonly name: string;
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
    id: "lumberyard",
    name: "Lumberyard — S2S",
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

/** The channels the player has earned. Locked channels don't render at all. */
export function unlockedLumberChannels(
  reputation: number,
): ReadonlyArray<LumberChannel> {
  return LUMBER_CHANNELS.filter(
    (channel) => reputation >= channel.minReputation,
  );
}
