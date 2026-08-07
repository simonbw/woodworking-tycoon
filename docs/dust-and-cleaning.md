# Sawdust & Shop Cleaning

Machine work produces **sawdust** that settles on the shop floor, visibly
accumulates, and progressively slows you down until you clean it up. A
pipeline across state, tick, render, and two cleaning tools — this doc is
the map; each module carries its own detail. The governing rule for every
mechanic here: **dust is a substance that moves; only containers destroy
it.** Brooms relocate dust, the shop vac (and someday the dust collector,
issue #113) captures it into containers, and containers get emptied into
the garbage can.

There is deliberately no HUD meter — the dust you can see on the floor
_is_ the indicator.

## State model (`src/game/Dust.ts`)

- `GameState.dust: Record<CellKey, Record<Species, number>>` — sparse,
  keyed `"x,y"`, keys dropped at zero. Per-species amounts so the
  floor's color mix is reconstructable: plane a pile of walnut, reload,
  and the shavings are still walnut-dark, not generic pine. Sheet goods
  have no species, so they shed pseudo-species of their own — `plywood`
  (all three grades make the same mess), `mdf`, `osb`, `particleBoard` —
  in suitably nasty colors, dingier than the sheets themselves. The
  union of woods and pseudo-species is `DustSpecies`
  (`src/game/Materials.ts`); `materialDustSpecies` maps any material onto
  it, and `dustColorBySpecies` paints it.
- Each tile caps at `DUST_MAX_PER_CELL`; deposition beyond the cap
  spills to the least-dusty neighbor. Deposition splits between the core
  cells and a surrounding ring (`CORE_SHARE`).
- `GameState.dust` is the single source of truth; renderers and penalty
  math read it directly (there is no `CellMap` surfacing).

## Emission

- Producing operations carry a hand-tagged `dustOutput` rate
  (units/tick), following a rough ladder: planer ≫ table saw ≈ jointer >
  miter saw > sanding > hand-tool ops. Untagged operations emit nothing.
- Dust is emitted **per tick during attended phases** in `tickAction`
  (dust builds while the cut happens, which is also what drives the
  particle visuals). Interactive bench strokes dispatch the same
  emission, throttled, so hand sanding dirties the floor too. Hands-free
  phases (glue curing) emit nothing.
- The rate is scaled by the **cut load** (`src/game/cut-load.ts`) — the
  same stock-dimension scalar that strains the machine synths — so a
  wide slab sheds proportionally more than a skinny strip, and the
  sound, the particle spray, and the floor mess all agree. Emission is
  also scaled by 1/dust-multiplier so a dust-slowed operation sheds the
  same total rather than compounding.

**Pacing target:** with zero mitigation, heavy milling on the planer
should cost about **1 minute of cleaning per minute of milling**. All
rates (emission, sweep speed, vac speed) tune to hold that ratio;
lighter machines cost proportionally less.

## Penalties

- **Machine slowdown**: attended-phase durations scale with the average
  dust across the cells a machine occupies or borders
  (`machineDustMultiplier` in `Dust.ts`). A dead zone below
  `PENALTY_DEAD_ZONE` keeps a working shop from being nickel-and-dimed,
  then the penalty ramps to `MAX_SLOWDOWN`. Implemented in
  `getOperationPhases` (`src/game/skill-helpers.ts`) — the one funnel
  every duration read goes through.
- **Movement slowdown**: a tile's slowdown divides walking speed while
  standing on it (`playerWalkSpeed` in `src/game/player-motion.ts`) —
  full pace on a clean aisle, wading through a full drift is a crawl.

## Cleaning

Cleaning tools are **held tools** (`src/game/HeldTool.ts`): objects the
player picks up into a hand slot and works by **holding Space** — the
same held-operate idiom as pushing stock through a machine, aimed at the
tool in hand instead. A held tool commits the hands until it's set down.
"In hand" is derived, never stored: each tool records where it's resting
(`GameState.broomPosition`, `shopVac.position`) and null means it's
being carried.

### Broom + dustpan combo (the starter)

- A cheap one-time store purchase (`buyBroomAction`,
  `GameState.broomOwned`) that arrives at the material dropoff spot.
  Picked up with E standing beside it, leaned again with F, shown in the
  hands strip (with the pan's fill %) while held.
- **Sweeping gathers into the pan.** Holding Space runs a per-tick sweep
  (`sweepTickPass` in `dust-actions.ts`) with no busyTicks freeze —
  walking and sweeping happen together at a reduced stride
  (`SWEEPING_PENALTY`). Each tick the broom takes dust from its
  **swath** (the cell underfoot plus a patch in the facing direction)
  into the **dustpan** (`GameState.dustpan`, species mix preserved),
  paced by `SWEEP_TICK_CAP` so deep drifts take strokes instead of one
  inhale.
- Full pan, the strokes do nothing. **Emptying is the vac's idiom at
  broom scale**: stand next to the garbage can and hold Space
  (`DUSTPAN_EMPTY_RATE`). The pan's contents ride with the broom whether
  it's in hand or leaning.
- **Mouse aim**: with the broom in hand, the cursor's floor cell —
  clamped to `SWEEP_AIM_REACH` — steers the head, for working around a
  machine's legs. Transient pointer state (`Person.sweepAim`, stripped
  on load). WASD alone stays fully sufficient.
- The swath pulls dust out from under machines at a reduced rate —
  everything is broom-cleanable, under-machine just takes longer — and
  leaves a small film per pass: a broom-only shop is workably clean,
  never instantly _spotless_. Heavy sweeping ticks grant token XP
  (`SWEEP_XP`, floored by `XP_MINIMUM_GATHERED` against farming) so
  shopkeeping feeds progression instead of feeling like pure tax.
- There are no sawdust-pile materials — the pile/scoop loop played badly
  and was replaced by the pan.

### Shop vac (the mid-game upgrade)

- A canister on casters (`GameState.shopVac`, `src/game/ShopVac.ts`):
  bought at the store, grabbed or parked with `V` while standing on it.
  Grabbing it means holding its hose — a held tool, so it commits the
  hands like the broom.
- **Suction is the same held-Space idiom** (`vacuumTickPass`): the same
  swath — machine undersides very much included — cleaned to zero and
  into the canister, no film. Dragging also passively trickle-cleans the
  cell underfoot. The vac erases the broom's film and reaches the tight
  spots; dragging it costs walking speed (`SHOP_VAC_DRAG_PENALTY`),
  stacking with any dust penalty.
- The **canister** (`SHOP_VAC_CANISTER_CAPACITY`, species mix preserved)
  fills visibly; full, the suction dies. Emptying is deliberate: stand
  next to the garbage can and hold Space (`SHOP_VAC_EMPTY_RATE`) — a
  full canister is a real pour, never a silent side effect.
- The **hose** (`ShopVacSprite`) has no physics at all: every frame it
  is _the_ circular arc of fixed length from the drum's port to the
  player's hand — solve sin θ/θ = chord/length and draw the arc. Near
  the drum it lies in a wide loop; walking off pays it out; only taut
  does it tow the drum. Deterministic geometry, all render-layer; state
  never sees the hose.

### Dust bags (first mitigation)

A tool-slot item (`tools/dustBag.ts`) mountable on the dusty machines
(each grew a slot; the table saw has two so a sled and bag coexist).
Captures `DUST_BAG_CAPTURE` of emission at the port, thins the particle
spray to match, and hangs visibly off the machine. Bags never fill —
that chore arrives with the central collector (issue #113).

## Rendering

- **Particle layer** (`CutParticles`,
  `src/components/machine-sprites/CutParticles.tsx`): an imperative
  particle pool inside `useTick` drawing to one `pixiGraphics` — no
  per-particle React. Species-colored chips spray while the machine
  works; saws throw fast dust flecks, jointer/planer throw tumbling
  shaving curls. Particle counts are art-directed, not 1:1 with dust
  units. Emitters live inside each machine sprite's rotated local
  container, so settle positions convert to shop space (`toGlobal` at
  stamp time).
- **Floor bake** (`DustLayer` + `dustStampBus`,
  `src/components/shop-view/`): settling chips come to rest and bake
  into a shop-sized `RenderTexture` where they stopped — the chip you
  watched fly _is_ the smudge it left, at constant render cost
  regardless of filth. On load the texture is rebuilt from
  `GameState.dust` with a seeded RNG keyed on cell coords, so saves look
  stable and keep their species colors; every _changed_ cell redraws, so
  the texture is an exact picture of the ledger and cleaning visibly
  thins it. Particles stay purely cosmetic: state is authoritative,
  landings are the delivery animation.
- `DustMotionLayer` is the motion between the ledger entries: cells that
  lose dust throw pale flecks that fly into the broom head or the
  nozzle, and emptying pours a stream into the can.

## Disclosure & tutorial

No unlock latch for the system itself — dust simply starts appearing
when power tools run, and the broom, dust bag, and shop vac sit on the
store's shelves from the start. Once floor dust crosses
`DUST_TUTORIAL_THRESHOLD`, a one-time note fires (`sweepingUnlocked`, a
one-way latch in `ProgressionState`) explaining the penalty and the
sweep loop — and pointing at the store's broom if the shop doesn't own
one yet.

## Considered and deliberately cut

Leaf blower (relocation + airborne dust mechanics), dust spread/tracking
underfoot, finishing-quality damage from ambient dust (strong v2
candidate — it creates "clean the shop before finishing day"), sellable
pure-species sawdust. Per-machine parked shop vacs died in design
review; the central collector (issue #113) is the planned next tier.
