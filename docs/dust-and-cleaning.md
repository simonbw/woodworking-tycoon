# Sawdust & Shop Cleaning

Machine work produces **sawdust** that settles on the shop floor, visibly
accumulates, and progressively slows you down until you clean it up. The
governing rule for every mechanic here: **dust is a substance that moves;
only containers destroy it.** Brooms relocate dust, the shop vac and
(later) the dust collector capture it into containers, and containers get
emptied into the garbage can.

There is deliberately no HUD meter — the dust you can see on the floor
*is* the indicator.

## State model

- `GameState.dust: Record<CellKey, Record<Species, number>>` — sparse,
  keyed `"x,y"` (same convention as `categoryDemand`), keys dropped at
  zero. Per-species amounts so the floor's color mix is reconstructable:
  plane a pile of walnut, reload, and the shavings are still walnut-dark,
  not generic pine. Sheet goods emit their own pseudo-species (`plywood`,
  `mdf`) with suitably nasty colors.
- Each tile caps at `DUST_MAX` (nominal 100 units); deposition beyond the
  cap on a tile spills to its least-dusty neighbor.
- Surfaced onto `CellInfo` in `CellMap.fromGameState` for rendering and
  penalty math; the `GameState` record stays the single source of truth.
- Requires a `SAVE_VERSION` bump + migration; existing saves start clean.

## Emission

- Every `MachineOperation` gets a `dustOutput` rate (units/tick),
  defaulted by category so recipes don't need hand-tagging. Rough ladder:
  planer ≫ table saw ≈ jointer > miter saw > sanding > hand-tool and
  assembly ops ≈ 0.
- Dust is emitted **per tick during attended phases** in `tickAction`
  (dust builds while the cut happens, which is also what drives the
  particle visuals). Hands-free phases (glue curing) emit nothing.
- Deposition pattern: the machine's occupied cells + operation position
  get the bulk; orthogonally adjacent cells get a falloff share. A small
  deterministic scatter (seeded by cell + tick) keeps piles organic.

**Pacing target:** with zero mitigation, heavy milling on the planer
should cost about **1 minute of cleaning per minute of milling**. All
rates (emission, sweep speed, vac speed) tune to hold that ratio; lighter
machines cost proportionally less.

## Penalties

- **Machine slowdown**: attended-phase durations scale with the *average*
  dust across the cells a machine occupies or is orthogonally adjacent
  to. Dead zone below ~30% of cap (a working shop is never spotless, and
  players shouldn't be nickel-and-dimed), then ramps to **+300% duration
  at full dust**. Implemented in `getOperationPhases`
  (`src/game/skill-helpers.ts`) — the one funnel every duration read
  already goes through; its two game callers (`tickAction`,
  `operateMachineAction`) and the UI display path (`getOperationDuration`)
  thread the dust context in.
- **Movement slowdown**: crossing a tile costs **+1 tick per full +100%**
  of that tile's machine-slowdown equivalent — 0 extra ticks on a clean
  aisle, up to +3 at max dust. Discrete ticks, so it drops straight into
  the existing move-queue processing with no fractional-speed machinery.

## Cleaning

### Broom (starter)

- A physical object leaning in a corner of the shop; appears alongside
  the tutorial message (below).
- **Sweep** is a new work-queue action (a few ticks per tile). Sweeping
  doesn't destroy dust — it pushes the tile's contents into a growing
  **sawdust pile** on the adjacent tile in the sweep direction. Piles are
  real material piles: they render, they carry their species mix, and a
  pile holds at most one full tile's worth (`DUST_MAX`).
- Sweeping a tile adjacent to a machine also pulls dust out from under
  it, at a reduced rate — everything is broom-cleanable, under-machine
  just takes longer.
- The broom leaves a ~10% film (tunable): a broom-only shop is workably
  clean, never *spotless*.
- **Dustpan phase**: a pile is picked up like any carried material and
  dumped in the garbage can (infinite, v1). Sweeping and dumping grant a
  token amount of XP so shopkeeping feeds progression instead of feeling
  like pure tax.
- Drag-select a region of tiles to queue a sweeping route.

### Shop vac (mid-game store purchase)

- A carried item: grab it and it **passively cleans the tile you stand
  on**; press/hold the clean key to actively clean the current tile plus
  adjacent ones, including under machines, faster. Cleans to zero — the
  vac is how you erase the broom's film and reach tight spots quickly.
- No pile step: dust goes into the **canister** (capacity ~5 tiles'
  worth, species mix preserved), emptied at the garbage can — the same
  verb as the dustpan, so garbage-can placement keeps mattering.
- While carrying the vac you move at reduced speed.

## Rendering

- **Particle layer — already built** (`CutParticles`,
  `src/components/machine-sprites/CutParticles.tsx`): an imperative
  particle pool inside `useTick` drawing to one `pixiGraphics` — no
  per-particle React. Species-colored chips spray while
  `useMachineActivity(machine).isOperating && !needsYou`; saws throw fast
  dust flecks, jointer/planer throw tumbling shaving curls, each machine
  sprite sets its own spray direction. Particle counts are art-directed,
  not 1:1 with dust units. Note: emitters live inside each machine
  sprite's rotated local container — tier 2 stamping must convert settle
  positions to shop space (`toGlobal` at stamp time).
- **Floor stamps**: per-tile dust drawn in 3–4 visual buckets (film →
  scattered piles → drifts), tinted by the tile's species mix via
  `colorBySpecies`. Layered between the floor tiles and machines in
  `ShopView`.
- **Floor bake — already built** (`DustLayer` + `dustStampBus`,
  `src/components/shop-view/`): settling chips come to rest and bake
  into a shop-sized `RenderTexture` where they stopped — the chip you
  watched fly *is* the smudge it left, at constant render cost
  regardless of filth. On load the texture is rebuilt from
  `GameState.dust` with a seeded RNG keyed on cell coords, so saves
  look stable and keep their species colors. Particles stay purely
  cosmetic: state is authoritative, landings are the delivery
  animation. Cleaning will erase regions of the same texture.

## Disclosure & tutorial

No unlock latch for the system itself — dust simply starts appearing when
power tools run. Once *cumulative dust generated* crosses a threshold, a
one-time tutorial message fires (one-way latch in `ProgressionState`, per
`UNLOCK_CONDITIONS` pattern): *"You're making a lot of sawdust. Left on
the floor it'll slow your work down. You can sweep it up with that broom
in the corner."* The broom object appears with the message; the shop vac
is hidden from the store until the message has fired.

## v1 scope and roadmap

**v1** = generation + penalties + rendering (particle tier 1 + stamps) +
broom + shop vac. No capture/mitigation — players live the full chore
first so the first mitigation purchase lands as relief.

**Built so far**: the state model (`GameState.dust`, save v11), per-tick
emission in `tickAction` (`dustOutput` on the cutting operations), and
the full particle → floor-bake render pipeline. Still to come from v1:
penalties, per-tile stamp buckets for heavy accumulation, broom, vac,
and the tutorial latch.

Then, in order:

1. **Dust bags** — a tool-slot item per machine (the slot system already
   exists), cutting that machine's emission ~60%.
2. **Central dust collector** — a placed 240V machine that captures
   emission from machines it serves; its bag fills (species mix and all)
   and gets emptied at the garbage — the classic tycoon trade of a
   frequent small chore for an infrequent big one. A **floor-sweep
   inlet** upgrades the broom: sweep piles onto it and they vanish into
   the bag, no dustpan phase.
3. **Maybe**: dedicated per-machine shop vacs as a middle tier (multiple
   vacs, each parked at one machine — hose-dragging between machines
   didn't survive design review).

Considered and deliberately cut for now: leaf blower (relocation + airborne
dust mechanics), dust spread/tracking underfoot, finishing-quality damage
from ambient dust (strong v2 candidate — it creates "clean the shop
before finishing day"), sellable pure-species sawdust.

## Implementation map

| Concern             | Where                                                        |
| ------------------- | ------------------------------------------------------------ |
| Dust map            | `src/game/GameState.ts` (+ migration in `src/game/saveLoad.ts`) |
| Emission            | `src/game/game-actions/tickAction.ts`                        |
| Slowdown hook       | `getOperationPhases` in `src/game/skill-helpers.ts`          |
| Movement penalty    | move-queue processing in `tickAction`                        |
| Sweep/vac actions   | `src/game/game-actions/` (new), work-queue like `move`       |
| Tile surfacing      | `src/game/CellMap.ts` (`CellInfo`)                           |
| Particles (done)    | `src/components/machine-sprites/CutParticles.tsx`           |
| Floor stamps        | `src/components/shop-view/` (new layer in `ShopView.tsx`)    |
| Tutorial latch      | `src/game/progression-helpers.ts` (`UNLOCK_CONDITIONS`)      |
