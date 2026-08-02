# The Guided Opening — Design

How a brand-new shop is taught. Implemented in `src/game/tutorial.ts` (the
steps) and `src/components/tutorial/` (the card and the highlights).

## What it teaches, and where it stops

One pass through each thing the early game is made of, and then it gets
out of the way:

1. **Commission 1**, start to finish — scavenge a pallet, pry it apart,
   build the shelf, load the bed, drive it over. Five steps, because these
   five verbs are the whole game and none of them are guessable.
2. **The marketplace** — list spare wood, take a job off the board. This
   is where the shop actually lives between commissions, so it is the
   thing a new player most needs pointed at.
3. **A tool** — buy a sanding block, mount it on the bench. Mounting is
   the non-obvious half: a hand tool does nothing until it is in a rack.
4. **A skill point** — spend it on Rustic Projects.

It does **not** walk the player to commission 2. Commissions are rep-gated
milestones now (see `commissionSequence.ts`); the climb to the second one
is many iterations of the loop taught above, and chaperoning it would be
chaperoning the game. The last card teaches the loop and retires.

Nor does it explain that reputation summons the next client. The player
does not need to know clients call at all until one does; "earn money and
reputation" is instruction enough, and the phone ringing is a better
reveal than a progress bar toward a number.

## Derived, not scripted

There is no script and no cursor through a checklist. `TUTORIAL_STEPS` is
a table of predicates, and the current step is **the first one whose
`satisfied(gameState)` is still false**. The index lives in
`ProgressionState.tutorialStep` and is ratcheted forward by
`advanceTutorialStep`, called from `checkProgressionMilestonesAction` —
which already runs every tick, so no action has to know the tutorial
exists.

Two properties fall out of that, and both are the point:

- **It cannot desync.** Wander off, do a step early, reload mid-pallet:
  the card is recomputed from durable state, never from what the UI thinks
  happened. Predicates are written cumulatively ("this step's product
  exists, _or_ something only a later step could have produced does"), so
  getting ahead of the coach skips it forward instead of stranding it on a
  condition that has already come and gone.
- **It cannot lock.** Nothing here gates input — the coach points, the
  player acts. Every predicate reads a condition the player can always
  reach again: scavenging is free and unlimited, and the job board always
  carries one material-free offer (the income floor, see
  `docs/marketplace-and-jobs.md`).

`Skip` sets `tutorialDismissed` and retires the card for good, the way
`dustTipDismissed` retires the sweeping note.

## Why Rustic Projects exists

Birdhouses and crates used to belong to the starter `rustic-carpentry`
skill. They were moved behind a bought node for three reasons, in
ascending order of importance:

1. **The first pallet's nails.** A shelf needs 8 and a bad pallet yields
   9. A birdhouse quietly spends 6 of them, and a new player with $0 can't
   buy more. Gating the recipes means the tutorial bench offers exactly two
   plans: Dismantle and Shelf.
2. **The first skill point had no right answer.** There is no respec, and
   no commission needs a bought skill until the fourth one (reputation
   40). A point spent at random is dead weight for a long time. A directed
   spend can't be spent wrong.
3. **It pays off inside a minute.** Newly-available job templates get a
   burst of guaranteed offers on the next board refresh, and both recipes
   have a template. Learn the skill, open the phone, and there is work
   there that wasn't before — the skills-make-work loop taught without a
   word of explanation.

## The two highlights

Whatever the current step points at lights up. Targets are declared on the
step and sorted by `tutorialTargets()`:

- **In the world** — machines, floor piles, and the truck (cab or bed)
  wear `TUTORIAL_HIGHLIGHT_FILTERS`, an outline shader in orange. The white
  rim already means "the keys act on this, here, now"; orange means "go to
  this next", which is usually a thing you are not standing at yet. When
  both apply the white rim wins, because by then the arrow has done its job.
- **In the chrome** — buttons self-mark with `data-tutorial-target` and
  `TutorialSpotlightLayer` measures them and draws a ring, the same
  arrangement reward flights use (`payout/rewardTargets.ts`). It sits above
  the modal layer because what it points at is often inside one. A target
  that isn't mounted — the phone is closed, the aisle isn't open — simply
  has no ring. That is the normal case, not an error.

## Testing

`src/game/sequences/tutorial.test.ts` follows the card the way a player
does: read the step, do exactly what it says through the real actions,
assert the next step id. That is the proof each instruction is both
reachable from the one before and sufficient to satisfy it. It also proves
the design claim the last card rests on — that a skill point has arrived
by the time the card asks the player to spend one.

The browser tier only checks that the card is mounted, reads off game
state, and can be retired (`tests/floor.spec.ts`). Ten steps are a
sequence-test job.
