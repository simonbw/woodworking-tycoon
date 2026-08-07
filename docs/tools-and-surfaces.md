# Tools & Surface Conditions

What a handheld tool is, how material surface state works, and the
design rules for adding more of either. Rosters, prices, and per-recipe
numbers are deliberately absent — the registries state them
(`src/game/Tool.ts`, `src/game/tools/`, `src/game/lumberStock.ts`), and
docs that repeat them drift.

## Guiding principle: machines buy time, they don't gate products

Every processing step should have a slow cheap path and progressively
faster paid paths. Players spend money to convert it into throughput,
not to unlock recipes. The milling steps are the canonical case: every
jointing step has a machine path and a budget path (face jointing is the
jointer or a hand plane; edge jointing is the jointer or a shop-built
sled on the table saw). The machines earn their price by being fast, and
by making the cheap rough-lumber channels economical at volume.

Two standing corrections to older framings:

- Sanding is NOT a slow substitute for milling. Sanding never flattens
  or straightens anything — it only refines surface quality. The
  slow-cheap paths into rough lumber are hand tools and jigs, not
  abrasives.
- Hand interaction is the slow path's *texture*, not a penalty — see
  "machines buy attention" in `docs/bench-work.md`.

## What a tool is

`ToolType` (registry in `src/game/Tool.ts`, one definition file per tool
in `src/game/tools/`): id, name, description, cost, `operations`, plus
`craftedOnly` for shop-built jigs and `compatibleMachines` to restrict
mounting.

- Workstations have **tool slots** (`MachineType.toolSlots`). Mounting a
  tool at a station adds that tool's operations to the station's
  operation list; a station's operation list is always its own
  operations plus its mounted tools'.
- An unmounted tool is a **physical object** — a `MaterialInstance` of
  kind `tool` — so it rides every system loose stock does: bought at the
  store's Tool Wall it comes home in the truck's bed, is carried in the
  arms (one hand slot), set down as a floor pile, or parked on a station
  shelf. There is no abstract tool storage. At a bench, mounting and
  unmounting happen on the tool rail in the bench view.
- A tool that does interactive hand work declares the script on its
  operations (`Operation.interaction` — see `docs/bench-work.md`). Tool
  tiers differ by interaction feel, not output: the sanding block and
  the random orbit sander perform the same operations with different
  brush geometry and speed.

**Adding a tool**: a definition file in `src/game/tools/`, a row in
`TOOL_TYPES`, an icon (`static/images/icons/tool-<id>.png`, tracked in
`docs/asset-backlog.md` if missing), and operations that follow the
gates below. If it's a jig, `craftedOnly` plus a build blueprint
(`bench-work/blueprint.ts`) instead of a store price.

## Shop-made jigs

Some tools are never sold — you build them (`ToolType.craftedOnly`,
granted via the build's `toolOutputs`). The pattern: cheap sheet-good
ingredients, built at a bench under a skill, mounted only on the machine
they fit (`compatibleMachines`), and unlocking a capability the bare
machine lacks — the crosscut sled opens wide panel crosscuts, the
straight-line sled turns the table saw into a no-prerequisites edge
jointer, the resaw fence stands the band saw's cut on edge.

Related hard rule: **end grain never meets the planer** (`Panel.grain`).
Planing an end-grain panel tears it apart in real life, so the planer
rejects them and sanding is the only way to flatten one — which keeps
sanders relevant deep into the planer era.

## Attended vs hands-free operation phases

Operations run as a list of **phases**, each `{ name, duration,
attended }`. An op that declares no phases is one attended stretch of
hand work — the default.

The rules (in `tickAction`):

1. An **attended** phase only ticks while the player stands at the
   machine's operation cell (and isn't away). Otherwise it pauses —
   never cancels — and resumes on return. The bench view amends this:
   an operation with a declared interaction never advances by tick at
   all; the player's gestures are the progress (`docs/bench-work.md`).
2. A **hands-free** phase (`attended: false`) always ticks, including
   during away trips.
3. An operation cannot _enter_ an attended phase without the player
   there: it finishes the prior phase and sits "ready — needs you".

Hands-free phases today are glue **curing** (every glue-up is a short
attended phase then the same long cure, `GLUE_CURE_TICKS`) and the oil
finish's **soak**. The intended economy: attended work serializes
through the player (your hands are the bottleneck), hands-free work
parallelizes across stations — so staged glue-ups plus extra benches
convert money into throughput. Clamps are the second dial on that
conversion: a glue-up ties up clamps for its whole run (`Clamp.ts`).
Shop-view feedback: amber progress = attended work underway, green =
hands-free, amber pause marker = attended work waiting for you.

## Surface conditions

`surface: "rough" | "smooth" | "sanded"` on **Board** and **Panel**
(scalar — the whole piece has one state). Finished products don't carry
it; recipes bake it in. Surface is **finish quality only** — geometry
(flat, straight) lives on the milling axes below, and the two never
substitute for each other.

- **Sanding** bumps surface one step: rough → smooth → sanded. Never
  changes thickness, never flattens, never joints.
- **Planing** leaves the surface **smooth**. Only sanding reaches the
  top state.
- **Glue-ups always output rough** panels (squeeze-out, alignment
  ridges), regardless of strip surfaces. Gluing requires smooth-or-better
  strips AND fully ripped edges (`jointedEdges: 2`).
- Fine products require a **sanded** blank; rustic products accept
  anything — rough is the point of rustic.
- **Surface is a gate, never a price.** A sanded board is worth exactly
  what a rough one is: nothing (wood has no sell value — see
  `material-values.ts`). Sanding buys access to the work that demands
  it, and that is the whole reward. Adding a surface value multiplier
  would re-open the board-foot arbitrage the value model exists to
  close.
- **Finish** is orthogonal to surface: `FinishedProduct.finish` is
  applied by the finishing kit's stroke work after the product exists
  (`src/game/tools/finishing-operations.ts`), and food-contact products
  only accept food-safe finishes.

## Milling: jointed faces and edges

Boards carry two independent axes, not a ladder:

- `jointedFaces: 0 | 1 | 2` — 0 = rough/possibly warped, 1 = one flat
  reference face, 2 = faces parallel ("planed")
- `jointedEdges: 0 | 1 | 2` — 0 = wavy, 1 = one straight edge,
  2 = edges parallel ("ripped to width")

Two axes because milling order genuinely varies: after a reference face
and edge exist, `plane → rip` and `rip → plane` are both correct. Ends
are never tracked for milling — crosscuts have no prerequisites.
**Milling never consumes nominal dimension**: rough stock carries
sacrificial material beyond its listed size, so a 4/4 rough board
skim-planes to a finished 4/4 board.

The prerequisite logic, which any new milling provider must respect:
planing needs a reference face (faces ≥ 1); the jointer's edge pass
needs a reference face against the fence, while a sled carries the board
so it needs none; ripping against the fence needs a straight edge
(edges ≥ 1 — never rip a wavy edge against a fence); crosscuts need
nothing.

Pallet boards scavenge as `{ jointedFaces: 1, jointedEdges: 2 }` — they
were factory-milled once, weathered rough — which keeps the whole early
game (rip, crosscut, sand, glue) running without any milling equipment.
`millingLabel()` names the classic states (S4S / S3S / S2S / rough
sawn); the pallet-ish default state gets no label.

## Board ends & miter cuts

Boards carry per-end state: `Board.ends = { left, right }`, each
`{ kind: "square" }` or `{ kind: "mitered", angle }` with angles from
`MITER_ANGLES`. Absent means both ends square (the `Panel.grain`
precedent — untouched stock needs no migration). Per-end rather than a
count because advanced work cares WHICH end carries a treatment; tenons
and dowel holes can join the union as new kinds later.

The miter saw models a real saw setup instead of a recipe list: Angle
(a crosscut is just the 0° stop), Cut End (which end faces the blade),
and Target Length (the kept piece, measured from the stop). The blade
leaves a fresh face on both pieces; rips and resaws run along the board,
so both pieces inherit the input's ends; any square crosscut squares the
end it re-cuts. `endsLabel()` names mitered ends in material names, and
the board sprite draws them as diagonal ends.

## Lumber channels

Lumber is sold as purchase channels modeled on the real woodworker's
journey, split across two stores: Orange Box carries only ready-to-use
wood, and Sawyer & Sons (the lumberyard, its own trip out the garage
door) carries everything milled short of S4S — the less milled the rack,
the cheaper the board-foot, which is what makes the milling machines
earn their price. Channels are **reputation-gated and completely hidden
until unlocked** — no grayed-out teasers; sections appearing is the
reward, and the lumberyard itself appearing at the truck is a reputation
reward. The channel data — species, milled state, price factors, gates —
lives in `src/game/lumberStock.ts`.
