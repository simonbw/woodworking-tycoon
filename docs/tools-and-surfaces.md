# Tools & Surface Conditions — Design

This doc captures the agreed end-state vision for handheld tools and material
surface state, so future work builds toward it instead of colliding with it.
The **Now** sections are implemented; the **Later** sections are direction,
not commitments.

## Guiding principle: machines buy time, they don't gate products

Every processing step should have a slow cheap path and progressively faster
paid paths. Players spend money to convert it into throughput, not to unlock
recipes. (Example: sanding block → random orbit sander → wide-belt sander all
perform "sanding"; each tier is just faster.)

The milling steps are the canonical case: every jointing step has a machine
path and a budget path. Face jointing is the jointer or a $35 hand plane;
edge jointing is the jointer or a shop-built straight-line sled on the table
saw. The machines earn their price by being fast, and by making the cheap
rough-lumber channels economical at volume (see Lumber channels).

One correction to an older framing: sanding is NOT a slow substitute for
milling. Sanding never flattens or straightens anything — it only refines
surface quality. The slow-cheap paths into rough lumber are hand tools and
jigs, not abrasives.

## Attended vs hands-free operation phases (Now: v1)

Operations run as a list of **phases**, each `{ name, duration, attended }`.
An op that declares no phases is one attended stretch of hand work — the
default and the common case.

The rules (all in `tickAction`):

1. An **attended** phase only ticks while the player stands at the machine's
   operation cell (and isn't on an away trip). Otherwise it pauses — never
   cancels — and resumes on return.
2. A **hands-free** phase (`attended: false`) always ticks, including during
   away trips.
3. An operation cannot *enter* an attended phase without the player there:
   it finishes the prior phase and sits "ready — needs you" until they show
   up. (No current op has an attended phase after a hands-free one; kilns or
   a finishing room will.)

Today's only hands-free phases are glue **curing**: every glue-up is a short
attended Glue & Clamp followed by the same long unattended cure
(`GLUE_CURE_TICKS`, uniform across batch/pair/extend/join — glue doesn't
care how many strips you fed it). Quick-Dry Glue multiplies only the cure.

The intended economy: attended work serializes through the player (your
hands are the bottleneck), hands-free work parallelizes across stations —
so staged glue-ups (Glue Up Pair / Join Panels) plus extra benches convert
money into throughput, which is this doc's guiding principle applied to
time. Shop-view feedback: amber progress bar = attended work underway,
green = hands-free, amber pause marker = attended work waiting for you.

Later candidates for hands-free phases: oil/varnish curing, kiln drying,
CNC-style machines that run a whole job unattended.

## Shop-made jigs (Now: v1)

Some tools are never sold — you build them (`ToolType.craftedOnly`, granted
via `OperationOutput.toolOutputs`). The crosscut sled came first: plywood
base plus scrap runners, built at the workspace under `jigs-and-fixtures`,
mounts only on the table saw (`ToolType.compatibleMachines`) and unlocks
wide panel crosscuts — the doorway to end-grain boards. The straight-line
sled is its milling sibling: same ingredients, same station, and it turns
the table saw into a no-prerequisites edge jointer (see Milling). Later
jigs live here too: tapering jigs, box-joint jigs, router sleds.

Related hard rule: **end grain never meets the planer** (`Panel.grain`).
Planing an end-grain panel tears it apart in real life, so the planer's
`plane` operation rejects them and sanding is the only way to flatten one —
which keeps sanders relevant deep into the planer era and sets up a future
drum sander.

## Handheld tools (Now: v1)

- `ToolType { id, name, description, cost, operations }` — registry in
  `src/game/Tool.ts`, definitions in `src/game/tools/`.
- Workstations have **tool slots** (`MachineType.toolSlots`). Mounting a tool
  at a station adds that tool's operations to the station's operation list.
  - Makeshift workbench (id `workspace`): 2 slots. Worktables: 3–6 slots by
    size (see `docs/worktables.md` — the old store-bought makeshift bench
    retired in favor of shop-built worktables).
- Unmounted tools live in `GameState.storage.tools`. Buy at the store's Tool
  Wall; mount/unmount from the station's card.
- First tools: **sanding block** ($10, slow) and **random orbit sander**
  ($120, fast). Same operations, different durations.
- The **hand plane** ($35) is the budget mill: flattens a face or
  straightens an edge at any bench, slowly — the jointer's cheap rival.
- The **hand saw** ($18) is the budget crosscut: a backsaw and miter box
  with the miter saw's exact operation (same angle stops, same
  parameters — it's a `ParameterizedOperation` on a tool) at roughly
  triple the duration.
- The **drill** ($70) is the hammer's screw-driving sibling: screwed
  assembly recipes are drill operations. Its first recipe is the Rustic
  Planter Box (5 pallet slats crosscut to 2', 8 screws) — screws come only
  from the store, never salvage (see `docs/consumables.md`).

### Later

- More tools from the brainstorm doc: chisels (hand-cut joinery), router
  (edge profiles).
- More screw-assembly recipes on the drill (the furniture arc).
- **Tool scarcity → logistics**: once you own more tools than slots, you're
  choosing loadouts per station. Then: dedicated stations (a "finishing
  bench" with sanders + finishes), tool storage furniture (wall racks,
  chests) that hold unmounted tools in the shop instead of an abstract list,
  and maybe carry-one-tool-in-hand.
- Tool quality tiers / consumables (sandpaper grits from issue #7) — only if
  the game needs another sink.

## Surface conditions (Now: v1)

`surface: "rough" | "smooth" | "sanded"` on **Board** and **Panel** (scalar —
the whole piece has one state). Finished products don't carry it; recipes
bake it in. Surface is **finish quality only** — geometry (flat, straight)
lives on the milling axes below, and the two never substitute for each other.

- **Sanding** (tool op) bumps surface one step: rough → smooth → sanded.
  Never changes thickness, never flattens, never joints.
- **Planing** leaves the surface **smooth**. It cannot produce "sanded" —
  only sanding reaches the top state.
- **Glue-ups always output rough** panels (squeeze-out, alignment ridges),
  regardless of strip surfaces. Gluing requires smooth-or-better strips
  AND fully ripped edges (`jointedEdges: 2`) — edge joints need straight,
  clean edges.
- Cutting boards require a **sanded** panel. Rustic products accept anything
  (rough is the point of rustic).
- Value: sell multiplier rough ×1 / smooth ×1.15 / sanded ×1.3 on boards and
  panels.

## Milling: jointed faces and edges (Now — issue #6)

Boards carry two independent axes, not a ladder:

- `jointedFaces: 0 | 1 | 2` — 0 = rough/possibly warped, 1 = one flat
  reference face, 2 = faces parallel ("planed")
- `jointedEdges: 0 | 1 | 2` — 0 = wavy, 1 = one straight edge,
  2 = edges parallel ("ripped to width")

Two axes because milling order genuinely varies: after a reference face and
edge exist, `plane → rip` and `rip → plane` are both correct. Ends are never
tracked — crosscuts have no prerequisites. **Milling never consumes nominal
dimension**: rough stock carries sacrificial material beyond its listed
size, so a 4/4 rough board skim-planes to a finished 4/4 board (the planer
accepts a target equal to the current thickness).

Operation prerequisites and providers:

| Step | Effect | Providers |
|---|---|---|
| Joint face | faces 0→1 | jointer; hand plane (slow) |
| Plane | faces →2, surface→smooth; needs faces ≥ 1 | planer; later router sled/CNC |
| Joint edge | edges 0→1 | jointer (needs faces ≥ 1 — fence reference); straight-line sled on the table saw (**no prerequisites** — the board rides the sled, not the fence); hand plane |
| Rip to width | edges →2; needs edges ≥ 1 (never rip a wavy edge against the fence) | table saw |
| Crosscut | length only, rewrites board ends (see Board ends), no prerequisites | miter saw, crosscut sled, hand saw (slow) |

Pallet boards scavenge as `{ jointedFaces: 1, jointedEdges: 2 }` — they were
factory-milled once, weathered rough — which keeps the whole early game
(rip, crosscut, sand, glue) running without any milling equipment.
`millingLabel()` names the classic states (S4S / S3S / S2S / rough sawn) in
material names; the pallet-ish default state gets no label.

## Board ends & miter cuts (Now)

Boards carry per-end state: `Board.ends = { left, right }`, each a
`BoardEnd` — `{ kind: "square" }` or `{ kind: "mitered", angle }` with
angles from `MITER_ANGLES` (22.5 / 30 / 45). Absent means both ends square
(the `Panel.grain` precedent — old saves and untouched stock need no
migration). Per-end rather than a count because advanced work cares WHICH
end carries a treatment; tenons and dowel holes join the union as new
kinds later.

The miter saw's one operation models a real saw setup instead of a recipe
list: **Angle** (detents 0° / 22.5° / 30° / 45° — a crosscut is just the 0°
stop), **Cut End** (which end of the stock faces the blade), and **Target
Length** (the kept piece, measured from the stop). The blade leaves a fresh
face on both pieces: the kept piece keeps its stop-side end untouched, the
offcut keeps its far end. A frame rail is therefore two cuts — miter the
left end, then flip and cut to length mitering the right. Rips and resaws
run along the board, so both pieces inherit the input's ends; any square
crosscut squares the end it re-cuts.

`endsLabel()` names mitered ends in material names ("45° both ends"), and
the board sprite draws them as diagonal ends. First consumer: the Picture
Frame (`mitered-frames` skill, joinery branch) — four sanded real-wood
rails, 45° both ends, joined with brads from the nail stock. 30° and 22.5°
are seeded for future hexagonal/octagonal frames.

## Lumber channels (Now — issue #6)

The lumber aisle is organized as purchase channels modeled on the real
woodworker's journey. Channels are **reputation-gated and completely hidden
until unlocked** — no grayed-out teasers; sections appearing is the reward.
See `lumberStock.ts` for the data.

| Channel | Species | State | Price factor | Unlock |
|---|---|---|---|---|
| The curb | pallet | faces 1 / edges 2, rough | free | start |
| Construction Lumber | pine | S4S | ×1 | with store |
| S4S Hardwood Rack | poplar, oak, maple | S4S | ×1.6 (the big-box markup) | with store |
| Lumberyard — S2S | maple, oak, cherry, walnut | faces 2 / edges 0 | ×1 | 12 reputation |
| Rough Rack | maple, oak, cherry, walnut | faces 0 / edges 0 | ×0.55 | 22 reputation |

Exotics (mahogany, purple heart) are not sold anywhere yet — a future
"specialty dealer" brings them back as the channel past the rough rack.

### Later

- Router sled / CNC: whole-ladder unattended milling (pairs with the
  hands-free phase system).
- True per-face state (which face is jointed, S1S) — only if a feature ever
  needs to distinguish orientation; the two-count model covers everything
  current gameplay cares about.
