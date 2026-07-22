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
   (the planer's cut height, the table saw's fence, the miter saw's angle
   and stop). Stored in `MachineState.selectedParameters`, which on
   direct-feed machines is a **settings bag shared by all the machine's
   operations**: each operation reads its own parameter ids and falls back
   to its defaults for anything never dialed in. Settings are adjusted via
   `setMachineSettingsAction` (which never touches which operation is
   selected or running) and rendered as `DetentScale`s — the scales
   printed on the machine.
2. **The workpiece in your hands** — there is no input bay
   (`inputSpaces: 0`) and no load step. Feeding runs
   `findFeedableOperation`: the first operation whose inputs are covered
   by carried stock under the current settings. Operations on a real
   direct-feed machine have naturally disjoint input specs, so the stock
   itself decides — a rough board at the jointer can only take a face
   pass; once face-jointed, feeding it again is the edge pass. At the
   table saw an edge-jointed board rips against the fence, a rough one
   rides the straight-line sled, and a panel goes on the crosscut sled —
   mounting a jig is the only "mode switch", and it's a physical act.
3. **One verb** — Feed (the miter saw says **Cut**, via
   `MachineType.feedVerb`). The UI (`DirectFeedMachineCard` in
   `MachinesSection`) collapses to name + status, the settings scales, the
   power switch if the machine has one, and the verb button; everything
   secondary (tools, description) sits behind a Details toggle, collapsed
   by default. The inventory list offers no "→ Machine" load buttons, and
   the action bar hint reads "Feed Planer" / "Cut Miter Saw". Single-point
   stations (the miter saw) show their cut pieces on the card for
   collection; feed-through machines deliver to the outfeed cell.

The *operation* stops being selected and becomes implied: given what
you're feeding and how the machine is set, only one thing can happen.
Direct-feed machines: the planer, jointer, jobsite table saw, and miter
saw. Benches keep explicit recipe selection, relabeled **Plan** — a bench
really is recipe-driven; you're choosing which drawing is pinned above it.

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

Save migrations: v16 → v17 collapsed the planer's op ids to `plane` and
flushed its input bay to piles at the infeed; v17 → v18 did the bay flush
for the jointer, table saw, and miter saw (their op ids are unchanged —
inference picks among them) and filled each machine's settings bag with
its selected operation's defaults.

## The other machines, briefly

- **Jointer** (hand-fed, power switch, no settings): face-vs-edge is
  inferred from the stock — `jointFace` only takes `jointedFaces: 0`
  boards, `jointEdge` only face-jointed ones with a rough edge. Fully
  milled stock is refused; the jointer has nothing to add.
- **Table saw** (hand-fed, power switch): the fence (`targetWidth`) is its
  one setting; the mounted jig decides everything else.
- **Miter saw** (trigger tool — no switch, verb "Cut"): angle, cut end,
  and stop length persist as settings; cut pieces stay on the saw table.
  The head swings **both ways** (−45…45, resting square), and mitered end
  angles are **signed** (`SignedMiterAngle`): ends with opposite signs
  mirror — the frame-rail pair the picture frame demands — while equal
  signs are parallel (a parallelogram, which can't close a corner). The
  turntable-and-head sprite swings to the signed stop, and which end
  faces the blade never moves the head.
- **Garbage can and benches** keep the classic sheet: per-item choice
  matters when the action is destructive, and a bench is honestly
  recipe-driven (its picker is labeled "Plan").

## Where this is headed (not yet built)

- **In-world settings**: the fence line on the table saw's table (the
  miter saw's swinging turntable and head are done).
- **Stop block accessory** for the miter saw: without one, each cut pays a
  measure-and-mark cost; with it, repeat cuts at the set length are quick.
- **Spatial cut widget**: slide the board under the blade line to set
  length and kept end in one gesture, replacing the two scales.
