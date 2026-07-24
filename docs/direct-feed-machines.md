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
   `MachineType.feedVerb`). In the shop view the machine wears hint
   chips (`src/components/station/MachineChips.tsx`): name + status,
   "[E] switch on", "[F] feed", the first setting's value on `Z`, and
   the refusal note when carried stock won't go. The full controls —
   settings scales, the power switch, the verb button, the tool rack —
   live on the machine's station sheet (Enter,
   `src/components/station/StationSheet.tsx`). The inventory list
   offers no "→ Machine" load buttons, and both `R` and `F` present the
   carried stock; `E` flips the switch. Single-point stations (the
   miter saw) offer their cut pieces where they lie (`E` takes them);
   feed-through machines deliver to the outfeed cell.

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

## Machines teach their refusals

A greyed-out Feed button used to keep its reasons to itself (a
`console.warn`, at best). Now the specs that refuse the stock also explain
it: `explainFeedRefusal` (machine-helpers) diagnoses the **nearest miss**
— the (operation, carried material) pair failing the fewest requirement
fields, computed by `materialInputMismatches`, the same walk
`materialMeetsInput` is built on so the two can't drift. The operation's
optional `explainRejection` turns the miss into a mentor line in the
machine's own vocabulary — "no flat reference face — joint a face first",
"a rough edge can't ride the fence", "won't fit under the cutter head —
raise the cut height to 7/4" — and can blame a *setting* instead of the
wood (the miter saw says "slide the cut line", the planer names the crank
mark to hit). Unauthored cases fall back to the generic requirement
description ("Needs: …"), so new machines get serviceable messages for
free. The line shows as a penciled note under the verb button whenever
stock is in hand and refused, and in the button's tooltip; a switched-off
machine still leads with "switch it on first", and a feedable match that's
only missing supplies reports that ("out of nails — this needs 4").

## The other machines, briefly

- **Jointer** (hand-fed, power switch, no settings): face-vs-edge is
  inferred from the stock — `jointFace` only takes `jointedFaces: 0`
  boards, `jointEdge` only face-jointed ones with a rough edge. Fully
  milled stock is refused; the jointer has nothing to add.
- **Table saw** (hand-fed, power switch): the fence (`targetWidth`) is its
  one setting; the mounted jig decides everything else — and you can see
  it. The fence sprite rides its rail to the set width (and parks at the
  far end for jig cuts), mounted sleds sit on the table aligned with the
  blade (a second one stacks askew on top), and a sled cut shows the jig
  traveling through the blade with the stock clamped to it — panels
  included, with the same kerf and dust as a rip.
- **Miter saw** (trigger tool — no switch, verb "Cut"): two settings —
  the head angle and the **cut line** (`cutPosition`, feet from the
  stock's left end); cut pieces stay on the saw table. The cut line is a
  slide input (`OperationParameter.presentation: "slide"`, drawn by
  `CutLineScale`): the carried board itself lies under the blade line,
  the readouts inside it are the two pieces the cut makes, and the
  shortcut key slides the board between the marks it actually reaches.
  There is no "kept piece" or "cut end" — one line, two pieces, both
  freshly faced at the head's signed angle. The head swings **both ways**
  (−45…45, resting square), and mitered end angles are **signed**
  (`SignedMiterAngle`): ends with opposite signs mirror — the frame-rail
  pair the picture frame demands — while equal signs are parallel (a
  parallelogram, which can't close a corner). In the shop the
  turntable-and-head sprite swings to the signed stop, and standing at
  the saw with cuttable stock ghosts the board on the table, slid to the
  set line.
- **Garbage can and benches** keep the classic sheet: per-item choice
  matters when the action is destructive, and a bench is honestly
  recipe-driven (its picker is labeled "Plan").

## Where this is headed (not yet built)

- **Stop block accessory** for the miter saw: without one, each cut pays a
  measure-and-mark cost; with it, repeat cuts at the set length are quick.
