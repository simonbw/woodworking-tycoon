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

## Worktables (Now)

Shop-built benches in four sizes — 1×1, 1×2, 1×3, and 2×2 — built at any
bench from plywood, stout boards (pallet stringers or 2×4s), and nails.
The build recipes live in the shared bench list with no skill gate:
building a real bench is every woodworker's first project. The output is
equipment, not product (`OperationOutput.machineOutputs`, the machine
sibling of the jigs' `toolOutputs`): the finished table lands in machine
storage and is placed from the layout editor.

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
   rides along when a table moves, and dumps to the floor if the table
   is returned to storage.

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

## Later

- **Specialized tables**: recipes that take a basic worktable plus parts
  and produce a special-purpose station — a finishing bench (finishing
  bonuses, wants distance from dust), an assembly table, an outfeed
  table. The upgrade-a-machine recipe shape doesn't exist yet.
- **Floor penalty for benchtop machines**: today a saw on the floor
  works at full speed; the incentive to mount is space-sharing and the
  shelf. If mounting should matter more, add a duration penalty for
  floor-placed benchtop machines.
- **Tool storage furniture** (wall racks, chests) from the
  tools-and-surfaces "Later" list — the shelf's sibling for tools.
