# Sawdust & Shop Cleaning

Machine work produces **sawdust** that settles on the shop floor, visibly
accumulates, and progressively slows you down until you clean it up. The
governing rule for every mechanic here: **dust is a substance that moves;
only containers destroy it.** Brooms relocate dust, the shop vac and
(later) the dust collector capture it into containers, and containers get
emptied into the garbage can.

There is deliberately no HUD meter — the dust you can see on the floor
_is_ the indicator.

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
- The rate is scaled by the **cut load** (`src/game/cut-load.ts`) — the
  same stock-dimension scalar that strains the machine synths — so a wide
  slab sheds proportionally more than a skinny strip, and the sound, the
  particle spray, and the floor mess all agree.
- Deposition pattern: the machine's occupied cells + operation position
  get the bulk; orthogonally adjacent cells get a falloff share. A small
  deterministic scatter (seeded by cell + tick) keeps piles organic.

**Pacing target:** with zero mitigation, heavy milling on the planer
should cost about **1 minute of cleaning per minute of milling**. All
rates (emission, sweep speed, vac speed) tune to hold that ratio; lighter
machines cost proportionally less.

## Penalties

- **Machine slowdown**: attended-phase durations scale with the _average_
  dust across the cells a machine occupies or is orthogonally adjacent
  to. Dead zone below ~30% of cap (a working shop is never spotless, and
  players shouldn't be nickel-and-dimed), then ramps to **+300% duration
  at full dust**. Implemented in `getOperationPhases`
  (`src/game/skill-helpers.ts`) — the one funnel every duration read
  already goes through; its two game callers (`tickAction`,
  `operateMachineAction`) and the UI display path (`getOperationDuration`)
  thread the dust context in.
- **Movement slowdown**: a tile's machine-slowdown equivalent divides
  walking speed while standing on it (`playerWalkSpeed` in
  `src/game/player-motion.ts`) — full pace on a clean aisle, down to
  quarter speed wading through a full drift. See
  docs/continuous-movement.md.

## Cleaning

Cleaning tools are **held tools** (`src/game/HeldTool.ts`): objects the
player picks up into a hand slot and works by **holding Space** — the
same held-operate idiom as pushing stock through a machine, aimed at the
tool in hand instead. A held tool commits the hands (no picking up
stock, no running machines, no grabbing the other tool) until it's set
down. "In hand" is derived, never stored: each tool records where it's
resting (`GameState.broomPosition`, `shopVac.position`) and null means
it's being carried — the convention the vac established.

### Broom + dustpan combo (starter — built, issue #81, reworked)

- A physical object leaning in the shop (home corner `BROOM_HOME`);
  revealed alongside the tutorial message (below). Picked up with E
  standing beside it, leaned again with F, shown in the hands strip
  (with the pan's fill %) while held.
- **Sweeping gathers into the pan.** Holding Space runs a per-tick
  sweep (`sweepTickPass` in `dust-actions.ts`, from `tickAction`) with
  no busyTicks freeze — walking and sweeping happen together, at a
  reduced stride (`SWEEPING_PENALTY` in `player-motion.ts`). Each tick
  the broom takes dust from its **swath** (the cell underfoot plus a
  3-wide, 2-deep patch in the facing direction) straight into the
  **dustpan** (`GameState.dustpan`, species mix preserved).
- The stroke is paced by `SWEEP_TICK_CAP` (units per tick, scaled
  proportionally across the swath so the whole patch thins together) —
  without it a stroke through deep drifts inhaled several cells at once
  and the pan filled in a blink.
- The pan holds `DUSTPAN_CAPACITY` (a fifth of the vac canister); full,
  the strokes do nothing. **Emptying is the vac's idiom at broom
  scale**: stand next to the garbage can and hold Space —
  `DUSTPAN_EMPTY_RATE` units pour per tick. The pan's contents ride
  with the broom whether it's in hand or leaning.
- **Mouse aim**: with the broom in hand, the cursor's floor cell —
  clamped to `SWEEP_AIM_REACH` — steers the head: the swath moves to
  the aimed 3×3 patch instead of the facing block, for working around a
  machine's legs. Transient pointer state (`Person.sweepAim`, stripped
  on load like `operating`), listened for on the ShopView container.
  WASD alone stays fully sufficient.
- The swath pulls dust out from under machines at a reduced rate —
  everything is broom-cleanable, under-machine just takes longer — and
  leaves a small film per pass: a broom-only shop is workably clean,
  never instantly _spotless_. Heavy sweeping ticks grant token XP so
  shopkeeping feeds progression instead of feeling like pure tax.
- There are no sawdust-pile materials anymore — the pile/scoop loop
  ("plow into a pile, lean the broom, carry the pile to the can")
  played badly and was replaced by the pan.

### Shop vac (mid-game store purchase — built, issue #81 phase 3)

- A canister on casters (`GameState.shopVac`): buy it at the store
  ($350, hidden until the sawdust tutorial fires), grab or park it with
  `V` while standing on it. Grabbing it means holding its hose — a held
  tool, so it commits the hands like the broom.
- **Suction is the same held-Space idiom as the broom**
  (`vacuumTickPass`): per tick, the same swath of cells — machine
  undersides very much included — cleaned to zero and into the canister,
  no film, no pile. Dragging also passively trickle-cleans the cell
  underfoot. The vac erases the broom's film and reaches the tight
  spots.
- The **canister** (5 tiles' worth, species mix preserved) fills
  visibly; full, the suction dies. Emptying is deliberate: stand next
  to the garbage can and hold Space — `SHOP_VAC_EMPTY_RATE` units drain
  per tick, so a full canister is a real pour, never a silent side
  effect of walking past.
- The **hose** (`ShopVacSprite`) has no physics at all: every frame it
  is _the_ circular arc of fixed length `HOSE_LENGTH` (6 cells) from
  the drum's port to the player's hand — solve sin θ/θ = chord/length
  and draw the arc. Near the drum it lies in a wide loop; walking off
  pays it out into a straightening curve; only taut does it tow the
  drum. Deterministic geometry, so it holds perfectly still while you
  do — a stiff corrugated hose, not a rope. While the hold is on, a
  nozzle wand appears. All render-layer; state never sees the hose.
- Dragging halves walking speed, stacking with any dust penalty.

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
  watched fly _is_ the smudge it left, at constant render cost
  regardless of filth. On load the texture is rebuilt from
  `GameState.dust` with a seeded RNG keyed on cell coords, so saves
  look stable and keep their species colors. Particles stay purely
  cosmetic: state is authoritative, landings are the delivery
  animation. Cleaning will erase regions of the same texture.

## Disclosure & tutorial

No unlock latch for the system itself — dust simply starts appearing when
power tools run. Once _cumulative dust generated_ crosses a threshold, a
one-time tutorial message fires (one-way latch in `ProgressionState`, per
`UNLOCK_CONDITIONS` pattern): _"You're making a lot of sawdust. Left on
the floor it'll slow your work down. You can sweep it up with that broom
in the corner."_ The broom object appears with the message; the shop vac
is hidden from the store until the message has fired.

## v1 scope and roadmap

**v1** = generation + penalties + rendering (particle tier 1 + stamps) +
broom + shop vac. No capture/mitigation — players live the full chore
first so the first mitigation purchase lands as relief.

**Built so far**: the state model, per-tick emission, the full particle
→ floor-bake render pipeline, both penalties (machine slowdown via
`getOperationPhases`; movement via `playerWalkSpeed`), the held-tool
broom+dustpan loop (pick up with E, sweep by holding Space, paced pan
fill, pour out at the can, under-machine pull at a reduced rate, the
film), the shop vac (drag on V, held-Space suction, trickle, deliberate
emptying, the fixed-length arc hose), and the tutorial latch
(`sweepingUnlocked` fires at 60 units on the floor; broom sprite +
one-time note appear, the sweep hint joins the player prompt with the
broom in hand on dusty ground). Emission is scaled by 1/multiplier so a
slowed operation sheds the same total dust rather than compounding.

The floor bake redraws every _changed_ cell (`DustLayer`), so the
texture is an exact picture of `GameState.dust` — a buried cell wears
an opaque clumped wash under its stamps, and cleaning visibly thins it.
`DustMotionLayer` is the motion between the ledger entries: cells that
lose dust throw pale flecks that fly into the broom head or the nozzle,
and emptying pours a stream into the can.

Then, in order:

1. **Dust bags — built**: a $45 tool-slot item (`tools/dustBag.ts`)
   mountable on the four dusty machines (each grew a slot; the table
   saw has two so a sled and bag coexist). Captures 60% of emission at
   the port (`DUST_BAG_CAPTURE`), thins the particle spray to match,
   hangs visibly off the machine, and stays out of the store until the
   sawdust tutorial has fired. Bags never fill — that chore arrives
   with the collector.
2. **Central dust collector** — a placed 240V machine that captures
   emission from machines it serves; its bag fills (species mix and all)
   and gets emptied at the garbage — the classic tycoon trade of a
   frequent small chore for an infrequent big one. A **floor-sweep
   inlet** upgrades the broom: sweep at it and the dust goes straight
   into the collector's bag, no dustpan trips.
3. **Maybe**: dedicated per-machine shop vacs as a middle tier (multiple
   vacs, each parked at one machine — hose-dragging between machines
   didn't survive design review).

Considered and deliberately cut for now: leaf blower (relocation + airborne
dust mechanics), dust spread/tracking underfoot, finishing-quality damage
from ambient dust (strong v2 candidate — it creates "clean the shop
before finishing day"), sellable pure-species sawdust.

## Implementation map

| Concern           | Where                                                           |
| ----------------- | --------------------------------------------------------------- |
| Dust map          | `src/game/GameState.ts` (+ migration in `src/game/saveLoad.ts`) |
| Emission          | `src/game/game-actions/tickAction.ts`                           |
| Slowdown hook     | `getOperationPhases` in `src/game/skill-helpers.ts`             |
| Movement penalty  | `playerWalkSpeed` in `src/game/player-motion.ts`                |
| Held tools        | `src/game/HeldTool.ts` (derived from resting positions)         |
| Sweep/vac actions | `src/game/game-actions/` (sweep is a tick pass off held Space)  |
| Tile surfacing    | `src/game/CellMap.ts` (`CellInfo`)                              |
| Particles (done)  | `src/components/machine-sprites/CutParticles.tsx`               |
| Floor stamps      | `src/components/shop-view/` (new layer in `ShopView.tsx`)       |
| Tutorial latch    | `src/game/progression-helpers.ts` (`UNLOCK_CONDITIONS`)         |
