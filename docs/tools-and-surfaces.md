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

The planer is the canonical case: you never *need* it to make a cutting
board — a sander gets you there slowly. The planer earns its $450 by being
fast and by unlocking the rough-lumber discount (see Lumber tiers).

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
via `OperationOutput.toolOutputs`). The crosscut sled is the first: plywood
base plus scrap runners, built at the workspace under `jigs-and-fixtures`,
mounts only on the table saw (`ToolType.compatibleMachines`) and unlocks
wide panel crosscuts — the doorway to end-grain boards. Later jigs live
here too: tapering jigs, box-joint jigs, router sleds.

Related hard rule: **end grain never meets the planer** (`Panel.grain`).
Planing an end-grain panel tears it apart in real life, so `planePanel`
rejects them and sanding is the only way to flatten one — which keeps
sanders relevant deep into the planer era and sets up a future drum sander.

## Handheld tools (Now: v1)

- `ToolType { id, name, description, cost, operations }` — registry in
  `src/game/Tool.ts`, definitions in `src/game/tools/`.
- Workstations have **tool slots** (`MachineType.toolSlots`). Mounting a tool
  at a station adds that tool's operations to the station's operation list.
  - Workspace: 1 slot. Makeshift bench: 3 slots (this is what the bench is
    *for* — it previously had no operations at all).
- Unmounted tools live in `GameState.storage.tools`. Buy at the store's Tool
  Wall; mount/unmount from the station's card.
- First tools: **sanding block** ($10, slow) and **random orbit sander**
  ($120, fast). Same operations, different durations.

### Later

- More tools from the brainstorm doc: hand plane (fine smoothing without
  thickness loss), chisels (hand-cut joinery), router (edge profiles),
  drill (hardware).
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
bake it in.

- **Sanding** (tool op) bumps surface one step: rough → smooth → sanded.
  Never changes thickness.
- **Planing** takes a thickness step off and leaves the surface **smooth**.
  It cannot produce "sanded" — only sanding reaches the top state.
- **Glue-ups always output rough** panels (squeeze-out, alignment ridges),
  regardless of strip surfaces. Gluing requires smooth-or-better strips
  (clean faces make good joints) — this is what makes S4S lumber worth its
  premium and gives the planer its rough-lumber niche.
- Cutting boards require a **sanded** panel. Rustic products accept anything
  (rough is the point of rustic).
- Value: sell multiplier rough ×1 / smooth ×1.15 / sanded ×1.3 on boards and
  panels.

## Lumber tiers (Now: v1)

The store sells each SKU in two finishes:

- **S4S** (surface: smooth) at full price — work with it immediately.
- **Rough sawn** at ~65% of the S4S price — needs planing (fast, loses a
  thickness step) or sanding (slow) before it can be glued.

Pallet wood is always rough and always scavenged, never sold.

### Later

- S2S as a middle tier if per-face state lands.

## Flatness and the jointer (Later — deliberately separate axis)

Smoothness ≠ flatness. A planer makes faces parallel and smooth but cannot
remove warp without a flat reference face; that's the jointer's job. When the
jointer lands it brings its **own** dimension — e.g. `flat: boolean` or a
"warped" condition appearing on rough/scavenged stock — additive to the
surface ladder, not a change to it. Until then, we pretend all stock is flat.

## Per-face state (Later)

The scalar `surface` widens to per-face (`faces: { top, bottom, edges }`)
when S2S lumber or face-specific operations matter. Migration is mechanical:
scalar reads as "worst face", recipes already match via `matches` predicates
(edit one function), and save compatibility is handled by version-bumping
(old saves are discarded on structure changes). Don't build this until a
feature actually needs to distinguish faces.
