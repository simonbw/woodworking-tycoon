/**
 * The layers that entities tick in, processed in order within each tick.
 *
 * The sim layers (player → cleaning → machines → clock → street →
 * milestones) encode the update ordering the old world documented in
 * `game-actions/tickAction.ts`: the player acts first, cleaning reacts to
 * what the player stirred up, machines run their operations, the clock
 * advances, the street (customers, stand) reacts, and milestone checks see
 * the finished tick.
 */
export const TICK_LAYERS = [
  "input", // IO handling, shortcut dispatch
  "player", // the player's body, hands, busy work
  "cleaning", // dust, sweeping, the shop vac
  "machines", // machine operations
  "clock", // time flow, day cycle
  "street", // customers and the stand
  "milestones", // progression checks over the finished tick
  "main", // default for entities with no ordering needs
  "effects", // view-side particles and transient effects
  "camera", // camera follows final positions
] as const;

export type TickLayerName = (typeof TICK_LAYERS)[number];

/** The layer that entities that do not specify a tick layer are added to. */
export const DEFAULT_TICK_LAYER: TickLayerName = "main";
