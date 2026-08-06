# Worktables & the Makeshift Workbench — Design

The bench system: what you start with, what you build, and why you'd
bother. The guiding principle from `tools-and-surfaces.md` applies to
benches too — **a better bench buys time, it doesn't gate products**.
Every bench-style station shares one recipe list
(`BENCH_OPERATIONS` in `src/game/machines/benchOperations.ts`).

## The Makeshift Workbench (Now)

The starting station (id `workspace`, kept for save compatibility): a
plywood offcut over a few paint buckets — the real thing most woodworkers
start on, and the sprite shows it. It knows every bench recipe, has 2
tool slots, no shelf, and baseline work speed. It is never sold; it's
simply in the garage when you arrive.

It is the one bench whose top isn't its footprint. The buckets stick out
past the plywood on every side, so the footprint is the 4×3 ft of floor
the whole thing stands on, and `MachineType.benchTopIn` states the sheet
itself: 40" × 30", measured off the art. Everything else derives its top
from `cellsOccupied` (`benchTopSizeIn`), which for a table is the same
rectangle.

That makes the starting top roomier than the small worktable's 2×2 and a
hair over the full-size 4×2 — deliberately. Room was never what a
worktable sells; see the three advantages below. What the bigger tables
buy is _shape_: a 6-ft run to lay long stock along, or the 4×4 island
that takes a whole ghost frame without it hanging off the ends. And room
is the one thing a table can buy for itself, by being pushed against
another one — see below.

## Tables pushed together are one bench (Now)

Shove two tables edge to edge in a real shop and you stop thinking of
them as two tables: you lay a long board across the seam and get on with
it. Worktables do the same (`bench-work/bench-group.ts`). The run is
found from the floor layout — every table sharing an edge with the one
you opened, and every table sharing an edge with those — and the bench
view spans the lot: one frame, one working surface, stock on any of them
in reach of the hands.

Three properties keep this from spreading through the codebase:

- **A lone bench is a run of one.** Its frame is exactly its own top and
  every conversion is the identity, so nothing branches on "is this
  bench joined". The makeshift workbench, which never joins — plywood on
  paint buckets, at its own height — goes down the path it always did.
- **Placements never move house.** `MachineState.benchLayout` still
  stores bench-top inches in the owning table's own frame, so there's no
  save migration and the shop view keeps drawing each table's stock from
  its own state. Only the view converts, and only while it's open.
- **The frame faces the bench you walked up to** (`BenchGroup.alignment`).
  You lean over a bench square to _it_, not to the shop, so a table
  turned sideways on the floor still reads the way it always has; a
  table pushed on at an angle (back to back, into a deep island) has its
  placements turned into that frame.

Seating generalizes for free. "Keep the piece's middle over the wood"
widens from one rectangle to several by running the same test down a
list — which is why the L-shaped run works too, notch and all. Asking
whether a whole piece _fits inside_ an L would have been a genuinely
awkward clamp; asking where its middle is, isn't.

An operation still belongs to one table — the one whose bays hold the
stock — so a run whose pieces sit on two tables slides them onto one
first (`gatherBenchPiecesAction`), which is what you'd do before winding
the clamps anyway. Every commit action downstream is untouched. Which
table is working is picked by `benchGroupWork`: whoever is mid-operation,
else whoever has something to offer, else the table you walked up to.

Not pooled yet: **tool racks**. A hammer mounted on the next table over
is not in reach — mount it on the table the work is on. Worth doing, and
the natural shape is the same slide-it-over move the pieces make.

## Worktables (Now)

Shop-built benches in four sizes — 1×1, 1×2, 1×3, and 2×2 — built at any
bench from plywood, stout boards (pallet stringers or 2×4s), and nails.
The build recipes live in the shared bench list with no skill gate:
building a real bench is every woodworker's first project. The output is
equipment, not product (`OperationOutput.machineOutputs`, the machine
sibling of the jigs' `toolOutputs`): the finished table comes off the
bench crated, ready to be carried into place (see
`carrying-machines.md`).

A bare worktable improves on the makeshift workbench three ways:

1. **Work speed** (`MachineType.workSpeed`, 1.25): attended hand work —
   glue-and-clamp, assembly, hand planing, sanding — runs a quarter
   faster. Hands-free phases (glue curing) are unaffected; the clamps
   don't care where they sit. Applied in `getOperationPhases`, same
   pipeline as the dust slowdown.
2. **Tool slots**: 3/4/5/6 by size (cells + 2) vs. the workbench's 2.
3. **The shelf** (`MachineType.materialStorage`, 3 per cell): parked
   stock lives on `MachineState.storedMaterials` — out of the input
   bay, off the floor. Stow/take from the station card. Shelf stock
   rides along when a table is carried.

More benches also parallelize hands-free work (more simultaneous glue
cures) — the "extra benches convert money into throughput" economy from
`tools-and-surfaces.md`.

## Benchtop machines mount on tables (Now)

The jobsite table saw, miter saw, lunchbox planer, and jointer are
benchtop machines (`MachineType.benchtop`) — each occupies one cell and
may be placed on a free worktable cell instead of the floor. Mounting is
per-cell: a planer on one end of a 1×3 leaves two cells of working top,
and the shelf below doubles as the machine's stand storage.

Rules (see `canPlaceMachine` / `CellMap`):

- One benchtop machine per table cell; the machine renders and operates
  on top (`CellInfo.machine`), the table underneath
  (`CellInfo.tableMachine`).
- A machine's required free cells (infeed/outfeed/operator) must be
  genuinely walkable — table top doesn't count.
- A table with machines mounted can't be moved or removed; take the
  machines off first.

## Upgrades (Now)

Worktables carry **upgrade slots** (`MachineType.upgradeSlots`: 1/2/3/3
by size — worktables only, the makeshift workbench stays humble).
Upgrades live in `src/game/Upgrade.ts`, are owned in
`GameState.storage.upgrades`, install/uninstall from the station card
(`MachineState.upgrades`), and their effects fold into the Machine
view's computed stats — anything reading a placed station's capacity or
speed goes through `machine.toolSlots` / `machine.materialStorage` /
`machine.workSpeed`, never the raw type. Duplicates stack (a front vise
and a tail vise is a real bench).

| Upgrade | Effect | Acquired |
|---|---|---|
| Bench Vise | ×1.25 attended work speed (stacks with the table's own ×1.25) | store, $80 — it's cast iron |
| Tool Drawers | +2 tool slots | built at a bench (plywood + thin boards + nails) |
| Material Shelf | +4 shelf spaces | built at a bench (two planks + nails) |

Shop-built upgrades arrive via `OperationOutput.upgradeOutputs` (the
upgrade sibling of `toolOutputs`/`machineOutputs`). Uninstalling is
refused while the station works, or when it would strand more mounted
tools / shelved stock than the remaining capacity holds. Removing a
table to storage returns its upgrades to upgrade storage, like tools.
The sprite shows the vise's jaws and the drawer fronts on the table's
front edge.

## Later

- **More upgrades**: bench dogs (another hand-work speed source),
  downdraft top (less sanding dust), clamp rack (shorter glue-and-clamp
  phases), pegboard backer (+tool slots, wall-adjacent tables only),
  outfeed extension (bonus to an adjacent feed-through machine),
  casters (move a loaded table, machines and all — today the carry
  system refuses a table with machines mounted).
- **Floor penalty for benchtop machines**: today a saw on the floor
  works at full speed; the incentive to mount is space-sharing and the
  shelf. If mounting should matter more, add a duration penalty for
  floor-placed benchtop machines.
- **Tool storage furniture** (wall racks, chests) from the
  tools-and-surfaces "Later" list — the shelf's sibling for tools.
