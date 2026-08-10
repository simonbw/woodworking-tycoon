# Bench work: the interface is your hands

How interactive hand work works — the zoomed bench view where materials
and tools are manipulated directly — and how to add a new kind of it.
This is the cross-cutting doc for a system that spans the engine
(`src/game/bench-work/`), the view (`src/components/bench-view/`), and
the commit actions (`src/game/game-actions/operation-actions.ts`).
Single-module details live at their modules: blueprints in
`bench-work/blueprint.ts`, bench groups in `bench-work/bench-group.ts`,
glue-ups in `bench-work/glue-up.ts`, the tool-first offer in
`bench-work/tool-work.ts`.

## The thesis

Direct-feed machines are "the interface is the machine": physical
settings, the stock deciding the cut, holding Space because you are the
one pushing the board through. The bench view completes that arc for the
half of the shop machines never reached. Hand work happens in a zoomed-in
look at the station's actual state — the staged stock, the mounted tools —
where the player performs the work with the pointer. Sanding means moving
the sander across the board. Pulling a nail means prying that nail. Not
six separate mini-games: one bench, one small gesture vocabulary, and
per-operation scripts that compose it.

## Decisions (settled — don't relitigate casually)

0. **The tool is the bench's mode selector.** The bench top is the
   interface: mounted tools hang on a rail across the top of the zoomed
   view and are taken in hand by clicking; applying the held tool to a
   valid target IS the operation. A staged pallet offers its nails to the
   hammer with no plan selected; the sanding block strokes the very piece
   it's over; the plane offers the face when the board lies flat and the
   edge when it's stood on edge (the arrangement is the mode picker); the
   hand saw ghosts its cut line along the half-foot detents; the
   finishing kit's rag over a sanded blank offers the pickiest finish the
   piece satisfies (operation order in `finishing-operations.ts` is the
   tiebreak). The offer is pure and unit-tested (`bench-work/tool-work.ts`:
   held tool + piece + how it lies → operation), and the claim takes
   exactly the piece under the tool (`BenchToolClaim` in
   `game-actions/player-actions.ts`, mirroring direct-feed's inferred
   start — it works pieces out of the output bay too, so rework needs no
   restaging). Work lands _in place_: the mask, kerf, and finished piece
   render through the piece's persistent placement, and the finish commit
   hands the workpiece's spot to its outputs (`inheritedBenchLayout`) — a
   sanded board doesn't move, a sawn board parts into two pieces lying
   end to end at the mark. Plans survive only where they genuinely choose
   between products: assembly builds, picked from the blueprint pile.
   Glue-ups are plan-free — clamps-first (`bench-work/glue-up.ts`): bar
   clamps set out on the top, glue-ready stock laid across them edge to
   edge, the contiguous run deciding the credited recipe
   (`inferGlueOperationId`) the way direct-feed stock decides the cut, a
   bead stroked down each seam, and winding the last clamp tight is the
   single commit straight into the hands-free cure.
1. **The bench view is the only player path.** There is no player-facing
   "hold Space instead", and no dial for it out on the shop floor: hand
   work carries its parameters in the gesture (the saw's mark measures
   the kept length, R swings the miter box), and a plan's settings ride
   the drawing pulled off the pile. The floor's chip cluster names a
   bench's verbs, never its settings (`docs/floor-interaction.md`).
   Tests and debug tooling complete work through the same commit actions
   the view dispatches — that hook is never exposed as UI.
2. **Performance affects speed, never quality.** A sloppy pass takes more
   strokes; it never produces a worse board. Outputs are computed from
   inputs and parameters (`Operation.output`), so material identity,
   commission matching, and every test assertion stay deterministic.
3. **Mid-action progress is ephemeral; the arrangement is not.** Refresh
   mid-sanding and the pass starts over: masks, glue beads, and tool
   positions are UI state, never saved. But where pieces **lie** on the
   bench is the state of the shop, like a machine's position on the
   floor: `MachineState.benchLayout` persists each staged piece's
   spot/turn/flip (written by the pry commit and
   `arrangeBenchMaterialAction`), and both the bench view and the
   shop-floor sprite render from it. The bench top is the working area —
   `seatInGroup` (`bench-work/bench-group.ts`) lets a piece follow the
   hand until its **middle** reaches the edge of the surface, then hangs
   there. Overhang is fine (stock hangs off a real bench constantly; a
   46" pallet outsizes the makeshift bench's 40" top on both axes); what
   a bench can't do is hold something balanced past its own edge.
   Turning and flipping pivot about the middle — the one point being
   held — so they never re-seat anything. A blueprint slot is the
   deliberate exception: a plan bigger than the bench puts its outlines
   past the edges on purpose, and a part snapped onto one goes where the
   slot says.
4. **Work that grants resources commits incrementally; work that only
   transforms the workpiece commits atomically.** Each nail pried out of
   a pallet lands in `GameState.consumables` immediately — so the pallet
   must remember its remaining nails, or a refresh would re-arm it and
   become a nail mine. Sanding grants nothing until it's done, so
   abandoning it costs only the strokes. Glue-up resolves in between:
   the set-out clamps and beads are ephemeral, and the single commit
   fires when the last clamp is wound tight.
5. **Direct-feed machines are out of scope.** The planer, jointer, table
   saw, band saw, and miter saw have their physical interface —
   settings, stock, held Space. They keep it. The bench is where the
   hand-work fantasy lives.
6. **Machines buy attention.** The guiding principle from
   `docs/tools-and-surfaces.md` — machines buy time, they don't gate
   products — gains a corollary: hand interaction is the slow, cheap,
   engaging path; better tools shrink the interaction (sanding block →
   random orbit sander is a wider, faster brush — and a _powered_ one:
   `powered` on a stroke interaction means the pad does its own
   scrubbing, so the sander keeps cutting while it rests where the block
   only cuts while it moves); a real machine removes the interaction
   entirely. Buying equipment literally buys back your hands.

## The gesture vocabulary

Three primitives, pointer-driven, composed per operation:

- **Stroke** — drag a tool across the workpiece, tracked as continuous
  coverage: sanding, planing, saw push-pull, spreading glue and finish.
- **Point** — press a marked target: driving a fastener, placing a
  clamp, prying a nail (a press-and-lever variant), laying a part on its
  ghost slot.
- **Mark** — position a line or a piece before committing to it: the
  hand saw's cut line.

Keeping the vocabulary this small is the point: one input framework, one
tuning surface, and each new operation is a script over existing verbs
rather than a new engine. A new kind of hand work should decompose into
these; if it genuinely can't, that's a design conversation, not a
speclet.

## The coverage mask (stroke work)

`src/game/bench-work/coverage.ts` (the accumulation grid, the completion
threshold, the saw's kerf mask) with the RenderTexture scratch-off in
`src/components/bench-view/StrokeSurface.tsx`:

- **Visual layer**: the workpiece draws its two surface states stacked,
  the upper erased through a PIXI `RenderTexture`. Each frame of active
  stroking stamps a soft brush at the pointer — standard scratch-off,
  one draw call per stamp.
- **Accounting layer**: completion never reads pixels back from the GPU
  (readback stalls the pipeline). A CPU-side accumulation grid is bumped
  analytically as stamps land; the operation completes when saturated
  coverage crosses `COVERAGE_COMPLETE`, so the last sliver of edge never
  holds the board hostage. The grid also tracks average accumulation —
  a % readout that sits at zero through the first thin pass reads as
  broken. The grid math is a pure function — stamps in, coverage out —
  and unit-tested.
- **The work budget** comes from the tool and the piece: brush width and
  per-second coverage are tool stats (`brushWidthIn`,
  `coveragePerSecond`), total area is the actual workpiece — a glued-up
  panel genuinely takes longer than a strip. `Operation.duration`
  survives only as the legacy tick budget (the ShopDriver's hands-free
  ceiling and old balance numbers); interactive stroke work never reads
  it.

The same engine covers the block plane (strokes constrained to an edge
band, shavings instead of dust) and the hand saw (a 1-D mask along the
marked line, deepened by push–pull strokes).

## The commit-action split

The bench view decides _when_; the actions in
`game-actions/operation-actions.ts` and `game-actions/player-actions.ts`
decide _what_. Every interactive operation has two commit points:

- **Start** (`operateMachineAction`, in `player-actions.ts`): claims
  inputs, spends `requiredConsumables`, ties up the clamps the stock's
  length derives.
- **Finish** (`finishAttendedWorkAction`): `op.output(...)`, XP, sound
  events, granted machines/upgrades — or the handoff into a hands-free
  remainder (the glue cure's `machineTickPass` path).

Between the two, resource-granting scripts dispatch incremental actions
(per-nail salvage via `pryPalletNailAction`, throttled dust emission).
Operations declare their script via `Operation.interaction`, and the
tick never advances a declared operation's attended phase. Dev builds
expose the commits as `__START_OPERATION__` / `__FINISH_ATTENDED_WORK__`
/ `__PRY_PALLET_NAIL__` / `__START_GLUE_UP__` for tests and debug
tooling — never as UI.

The world does not stop for the bench view. Overlays never stop the
world (only the pause menu does), and the player is standing at the
station the whole time — the planer keeps power-feeding, glue keeps
curing, dust keeps settling. Movement keys are pinned until Tab steps
back. **Dust and foley don't wait for the commit**: active stroking
dispatches a throttled dust-emission action so the dust simulation stays
honest, and continuous tool foley runs UI-side with the completion
stinger going through the `SoundEvent` queue as usual.

## Pallet dismantling: progressive transformation

The richest script, and the model for incremental commits. Dismantling
is the pallet instance transforming nail by nail:

- No plan is selected: the staged pallet is the offer. The player takes
  the hammer off the rail (it becomes the cursor, nails light up) and
  presses a nail; a short lever animation paces the pull, then the
  commit lands.
- The nails are pallet state (`Pallet.nails`): one at every crossing of
  a present deck board and a present stringer, so every nail is in two
  boards and joins exactly them. They render in both views from the same
  geometry (`pallet-geometry.ts` / `PalletSprite`), so the shop floor
  shows the same half-pried pallet the bench view does.
- Each face only presents its own side's nail heads. The pallet is a
  piece like any other — it drags, R turns it, F flips it — and flipping
  it over is how the bottom boards' nails come on offer.
- Z-order is physical: a freed board lying untouched on its berth keeps
  its place inside the pallet's layer stack, and only moved pieces ride
  on top. E takes the piece under the pointer, not the first in the bay.
- Each pry is an action: the nail leaves `Pallet.nails`, `+1 nail` to
  consumables (flying to the supplies tally — `flyToSupply`).
- A board comes free the moment its _last_ nail comes out — never
  before — and stays lying on the bench where it was nailed. Mid-job you
  hold a genuinely half-stripped pallet plus loose boards, all real
  state: refresh mid-dismantle and you resume at the exact nail you
  left, not because mini-game state was saved, but because every pull
  _was_ game state.

## The bench view itself

`src/components/bench-view/` — Tab at a bench fills the whole window
with the shop itself, leaned into. One measured PIXI `Application` at
device resolution draws the same concrete floor the shop view tiles and
the _same bench_ the shop floor draws (`BenchSceneBackdrop`:
`makeshift-bench@4x.png`, the starting bench's own drawing re-exported
at 32 px/inch against the pipeline's 8; the `WorktableSprite` vectors
for built tables) — the zoomed bench and the floor bench are one drawing
at two zooms, both anchored on their canvas center so the close-up lands
exactly over the shop's copy.

The bench's contents lie on it exactly where `MachineState.benchLayout`
says (`BenchScene`; a board flipped up on edge narrows to its thickness,
`BoardOnEdgeSprite`). Stroke and saw work runs on those very pieces in
place (`StrokeSurface` / `SawSurface` mount over the scene at the
piece's placement — no takeover surface exists). The chrome floats:
nameplate top-left, instruction + key hints bottom-center, the plan
picker as a diegetic pile of blueprint sheets bottom-right
(`BlueprintCorner` — the pulled drawing is the selection, its title
block reads supplies against shop stock), tools on a floating rail
(`BenchToolRail` — also where tools mount and unmount), and a
worktable's shelf/upgrades in an "Under the bench" drawer
(`UnderBenchPanel`). There is no paperwork card and no input/output
diagram: a bench top holds stock, not bays. The one attended-tick hold
left at a bench is the garbage can's Empty; every recipe at a real bench
is your hands. Assembly builds — products and shop equipment alike — lay
out and fasten on the scene from their blueprints (see
`bench-work/blueprint.ts` for the whole model).

Worktables pushed edge to edge are one bench (`bench-work/bench-group.ts`):
the view spans every member's top as one surface, a dragged piece is
bookkept by the table it comes to rest on, and an operation still
belongs to one table (`gatherBenchPiecesAction` slides a spanning job
onto one; `benchGroupWork` says which). Tool racks don't pool yet.

Opening and closing are performed by a camera dive
(`shop-view/BenchDiveLayer.tsx`), pure presentation: the shop's world
container swells about the bench while the scene lands on its
footprint, one similarity ramp applied to both halves in one tick —
everything draws in the shop's single canvas, the scene as a
screen-space container above the world (`BenchWorkSurface` publishes
the subtree through `bench-view/benchSceneSlot.ts`; the DOM chrome and
pointer handling stay in the portaled sheet). The zoomed live shop
remains the backdrop the whole time the view is open — the scene paints
no floor of its own and no vignette. Once the dive lands, the shop
hides its own copies of that bench's stock
(`setLeanedBench`/`useLeanedBenchKey`) so the scene's live versions
don't ghost against static ones. Tab-Tab mid-flight rolls the ramp
back. `prefers-reduced-motion` snaps straight to the end states — which
is also how the E2E suite runs (`reducedMotion: "reduce"` in the
Playwright config); `bench.spec` pins the landed stage via
`data-zoom="open"`.

In this view the pointer is the hand (right-click puts back whatever
it's holding); assist options — bigger brush, lower threshold — are
deliberately deferred but not foreclosed: they're per-script constants.

## Testing

- **Unit**: commit actions, the pallet transform, accumulation-grid
  math, the tool-work offer.
- **Sequence**: `ShopDriver.performWork(machine)` — start + finish
  through the real commit actions, no mini-game in between. The driver
  commits through the same actions the bench view commits through.
- **E2E**: `bench.spec.ts` tests exactly one real canvas drag per
  gesture type (one stroke, one pry); canvas drags are the flakiest tool
  in the box, so everything else sets up through fixtures and asserts on
  wiring, not feel.
