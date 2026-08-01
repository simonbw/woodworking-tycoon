# Bench mini-games: the interface is your hands — Design

This doc captures the agreed design for interactive hand work — the zoomed
bench view where materials and tools are manipulated directly — so
implementation builds toward one vision instead of colliding with it.
Nothing in here is built yet; where a section firms up into code, mark it
**Now** the way `docs/tools-and-surfaces.md` does.

## The thesis

`docs/direct-feed-machines.md` reframed machines around "the interface is
the machine": physical settings, the stock deciding the cut, holding
`Space` because you are the one pushing the board through. Benches are the
half of the shop that reframe never reached — they still run on a plan
picker and an abstract progress bar.

This design completes the arc. Hand work happens in a **bench view**: a
zoomed-in look at the station's actual state — the staged stock, the
mounted tools — where the player performs the work with the pointer.
Sanding means moving the sander across the board. Pulling a nail means
prying that nail. Not six separate mini-games: one bench, one small gesture
vocabulary, and per-operation scripts that compose it.

## Decisions (settled — don't relitigate casually)

1. **The mini-game is the only player path.** There is no player-facing
   "hold Space instead". Tests and debug tooling complete work through the
   same commit actions the bench view dispatches (see The commit-action
   split) — that hook is never exposed as UI.
2. **Performance affects speed, never quality.** A sloppy pass takes more
   strokes; it never produces a worse board. Outputs are computed from
   inputs and parameters exactly as today (`Operation.output`), so material
   identity, commission matching, and every existing test assertion stay
   deterministic. (This extends the brainstorm doc's settled "no finish
   quality levels".)
3. **Mid-action progress is ephemeral.** Refresh mid-sanding and the board
   starts that sanding pass over. Masks, glue beads, and tool positions are
   UI state, never saved. The one principled exception is rule 4.
4. **Work that grants resources commits incrementally; work that only
   transforms the workpiece commits atomically.** Each nail pried out of a
   pallet lands in `GameState.consumables` immediately — so the pallet must
   remember its remaining nails, or a refresh would re-arm it and become a
   nail mine. Sanding grants nothing until it's done, so abandoning it
   costs only the strokes. Glue-up resolves in between: spreading and
   clamping are ephemeral, and the single commit (spend glue, tie up
   clamps, start the cure) fires when the last clamp goes on.
5. **Direct-feed machines are out of scope.** The planer, jointer, table
   saw, band saw, and miter saw already have their physical interface —
   settings, stock, held `Space`. They keep it. The bench is where the
   hand-work fantasy lives.
6. **Machines buy attention.** The guiding principle in
   `docs/tools-and-surfaces.md` — machines buy time, they don't gate
   products — gains a corollary. Hand interaction is the slow, cheap,
   engaging path; better tools shrink the interaction (sanding block →
   random orbit sander is a wider, faster brush, not a multiplier on a
   bar); a real machine removes the mini-game entirely. Buying equipment
   literally buys back your hands.

## The gesture vocabulary

Three primitives, pointer-driven, composed per operation:

- **Stroke** — drag a tool across the workpiece, tracked as continuous
  coverage: sanding, planing, saw push-pull, spreading glue.
- **Point** — press a marked target: driving a nail or screw, placing a
  clamp, prying a nail (a press-and-lever variant), snapping a component
  onto its ghost outline.
- **Mark** — position a line or a piece before committing to it: the hand
  saw's cut line. (`cutPosition` with `presentation: "slide"` and the
  miter saw's ghosted board are the precedent — the same idea zoomed in.)

Keeping the vocabulary this small is the point: one input framework, one
tuning surface, and each new operation is a script over existing verbs
rather than a new engine.

## The coverage mask (stroke work)

Stroke work renders as a per-pixel transition — the rough texture visibly
giving way to the smooth one under the tool:

- **Visual layer**: the workpiece draws its two surface states stacked,
  the upper erased through a PIXI `RenderTexture`. Each frame of active
  stroking stamps a soft brush at the pointer. Standard scratch-off
  rendering; one draw call per stamp.
- **Accounting layer**: completion never reads pixels back from the GPU
  (readback stalls the pipeline). A CPU-side accumulation grid at a few
  pixels per cell is bumped analytically as stamps land; the operation
  completes when coverage crosses **98%**, so the last sliver of edge
  never holds the board hostage. The grid math is a pure function —
  stamps in, coverage out — and unit-testable.
- **The work budget**: brush radius and per-stamp accumulation come from
  the tool (block = narrow and slow, orbit sander = wide and fast), and
  total area comes from the actual workpiece dimensions — a glued-up
  panel genuinely takes longer than a strip. For interactive operations
  `Operation.duration` stops meaning "ticks of held Space" and is
  reinterpreted as this budget. Expect to retune it after playtesting;
  it is the whole repetition curve now.

The same engine covers the block plane (strokes constrained to an edge
band, shavings instead of dust) and the hand saw (a 1-D mask along the
marked line, deepened by push–pull strokes).

## The commit-action split

The bench view decides *when*; actions decide *what*. Every interactive
operation gets two commit points in `game-actions/`:

- **Start**: claims inputs, spends `requiredConsumables`, ties up
  `requiredClamps` — everything operation start already does today.
- **Finish**: the completion block currently at the bottom of
  `machineTickPass` — `op.output(materials, resolvedParameters)`, XP,
  sound events, granted machines/upgrades — extracted into an action the
  bench view dispatches at completion.

Between the two, resource-granting scripts may dispatch incremental
actions (per-nail salvage, throttled dust emission — see below).
`tickAction` keeps only what runs without you: hands-free phases (glue
curing, and someday kilns and finishes) tick exactly as today, entered by
the glue-up's finish commit. Operations without an interactive script
keep the legacy attended-tick behavior until converted — an op-by-op
migration path — but conversion should land in coherent batches (all
sanding at once), so the shop never has two arbitrarily-assigned
interaction registers.

The world does not stop for the bench view. Overlays never stop the world
(only the pause menu does), and the player is standing at the station the
whole time — the planer keeps power-feeding, glue keeps curing, dust
keeps settling.

**Dust and foley don't wait for the commit.** Active stroking dispatches
a throttled dust-emission action (reusing `emitMachineDust`, on the order
of twice a second) so the dust simulation — slowdown, sweeping — stays
honest, and continuous tool foley runs UI-side the way `UiSoundLayer`
works, with the completion stinger going through the `SoundEvent` queue
as usual.

## Pallet dismantling: progressive transformation

The richest script, and the pilot for incremental commits. Dismantling is
modeled as the pallet instance transforming nail by nail:

- Each pry is an action: `+1 nail` to consumables (they clink in one at a
  time), and the pallet's remaining-nail state updates on the
  `MaterialInstance` itself (absent = full, per the established
  absent-means-default migration pattern — old saves load untouched).
- When a slat's last nail comes out, that board pops free as an output
  *right then* — mid-job you hold a genuinely half-stripped pallet plus
  loose boards, all real state.
- Refresh mid-dismantle and you resume at the exact nail you left —
  not because mini-game state was saved, but because every pull *was*
  game state.

## Script sketches for the rest

| Activity | Script | Lands on |
| --- | --- | --- |
| Sanding | strokes to 98% coverage | `surface` rough→smooth→sanded; tool tiers = brush feel; dust per stroke |
| Hand saw | mark the line, then push–pull strokes deepen the kerf | shares the miter saw's parameterized crosscut operation — same outputs, zoomed presentation |
| Block plane | strokes along a face or edge | `jointedFaces`/`jointedEdges` axes and their prerequisites, unchanged |
| Glue-up | spread glue (stroke) → butt boards (point/snap) → clamps (point, one per `requiredClamps`) → commit starts the hands-free cure | the existing phase system fits 1:1 |
| Assembly | snap components onto ghost outlines → drive fasteners, one per `requiredConsumables` | ghost rendering precedent from the miter saw; drill vs hammer picks the animation |

Note how many target counts already live in the data (`requiredClamps`,
`requiredConsumables`, pallet nail yields): the scripts mostly reveal
numbers the simulation already has.

## The bench view itself

`src/components/bench-view/` — an overlay in the Phone/Journal/Clipboard
family; diegetically, leaning over the bench. Entered with `Tab` at a
bench, evolving `StationSheet` rather than adding a key: the plan picker
survives inside it as the sheet of paper pinned to the bench (benches
are honestly recipe-driven; that doesn't change). Inside, its own PIXI
stage renders the machine's actual state at high zoom — staged stock via
the material sprites scaled up, mounted tools on their hooks. Closing it
abandons any uncommitted work per decision 3. A camera zoom-in
transition can arrive later as pure presentation, the way
`truckStageStore` performs the truck.

This is the game's first pointer-primary surface (the floor is
keyboard-first; `Person.sweepAim` is the one pointer precedent). Assist
options — bigger brush, lower threshold — are deliberately deferred, but
nothing in the design forecloses them: they're per-script constants.

## Testing

- **Unit**: commit actions, the pallet transform, accumulation-grid math.
- **Sequence**: `ShopDriver` grows `performWork(machine)` — start + finish
  through the real commit actions, no mini-game in between. This amends
  the driver's charter from "anything it can do a player can do" to
  "it commits through the same actions the mini-game commits through";
  update CLAUDE.md's testing section when the first interactive op lands.
  The progression ledger keeps working unchanged.
- **E2E**: a seventh spec file, `bench.spec.ts` — the bench view is a
  genuinely new kind of interface, which is the bar CLAUDE.md sets. Test
  exactly one real canvas drag per gesture type (one stroke, one pry);
  canvas drags are the flakiest tool in the box, so everything else sets
  up through fixtures and asserts on wiring, not feel.

## Rollout order

1. **Sanding** — pilots the mask engine, the commit split, and the bench
   view shell. (The pilot pattern the planer served for direct-feed.)
2. **Pallet dismantling** — pilots incremental commits and the material
   state change; the game's opening minutes get the biggest win.
3. **Hand saw + block plane** — reuse the mask engine.
4. **Glue-up** — pilots ephemeral-until-last-clamp and the hands-free
   handoff.
5. **Assembly** — last; per-recipe component layouts are the long-tail
   authoring cost. Mitigation: a generic derived layout (components in a
   row, fasteners at the joints), hand-authored art only for hero
   products.

## Open questions

- The per-op work budgets (seconds of stroking the fiftieth sanding pass
  deserves) — one tunable constant per script from day one, revised after
  playtesting.
- Whether the first pallet teardown should force the zoomed view as the
  tutorial beat, or trust the prompt chip.
- Whether per-nail salvage pacing needs a cap so mashing isn't optimal
  (a short pry animation per nail probably solves it for free).
