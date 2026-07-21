# Direct-feed machines: the interface is the machine

Real machines don't have modes. Standing at a physical planer there are
exactly three things you can do: flip the switch, turn the height crank,
and feed stock in. This doc covers the game's model for machines that work
that way — `MachineType.directFeed` — and the design direction it pilots.

## The reframe

The old spec-sheet interface gave every station the same shape: a **Mode**
picker (choose an operation), parameters, a staged input bay, and an
Operate button. The direct-feed model splits that into what a real machine
actually has:

1. **Machine settings** — physical, persistent state of the machine itself
   (the planer's cut height). Stored in `MachineState.selectedParameters`,
   which persists across passes; there is only one operation, so nothing
   ever resets it. Rendered as the `DetentScale` — the scale printed on
   the machine.
2. **The workpiece in your hands** — there is no input bay
   (`inputSpaces: 0`) and no load step. `operateMachineAction` on a
   direct-feed machine consumes the first *carried* material the operation
   accepts, straight into `processingMaterials`.
3. **One verb** — Feed. The UI (`DirectFeedMachineCard` in
   `MachinesSection`) collapses to name + status, the settings scale, the
   power switch, and a Feed button; everything secondary (tools,
   description) sits behind a Details toggle, collapsed by default. The
   inventory list offers no "→ Planer" load buttons, and the action bar
   hint reads "Feed Planer".

The *operation* stops being selected and becomes implied: given what
you're feeding and how the machine is set, only one thing can happen.

## The planer (the pilot)

- `planeBoard`/`planePanel` merged into one `plane` operation — a real
  planer can't tell a board from a panel. The output branches on the input
  type (boards additionally come out `jointedFaces: 2`).
- `targetThickness` is the **cut height crank**: a machine setting, not a
  recipe choice.
- **One detent per pass.** The op accepts stock at the cut height (a skim
  pass — surfaced, same size) or one detent above (a full bite — comes out
  at the cut height). Thicknessing 8/4 to 4/4 means four passes, cranking
  the head down between each. Anything two or more detents above the
  setting "won't fit under the cutter head"; stock below it is never
  touched. Per-pass duration is tuned so a two-detent reduction costs
  about what the old single-shot operation did.
- Prerequisites unchanged: boards need a jointed reference face, end-grain
  panels are refused (see `docs/tools-and-surfaces.md`).
- **Power feed** (`MachineOperation.powerFeed`): the feed rollers pull the
  board through on their own, so the pass keeps ticking — dust, noise, and
  dust-slowdown included — while the player walks off. Power is still
  required: switching the machine off pauses the cut. This is distinct
  from `attended: false` phases (glue curing), which are inert waiting,
  not machine work.

Save migration (v16 → v17): planer op ids collapse to `plane`, staged
input-bay stock lands as piles at the infeed cell, and crated planers
migrate the same way.

## Where this is headed (not yet built)

- **Jointer**: infer face-vs-edge from the stock (face first, then edge)
  instead of a mode switch.
- **Table saw**: `targetWidth` becomes the fence position (a machine
  setting); rip-vs-crosscut is already physical via the mounted sled.
- **Miter saw**: the angle is a machine setting shown on the sprite; length
  and cut end become one spatial "slide the board under the blade" gesture;
  a stop block accessory turns length into a persistent setting.
- **Benches** keep recipe selection, reframed as the plan pinned above the
  bench — a bench really is recipe-driven.
