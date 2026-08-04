# Time & Days — The Spend-to-Advance Clock

Making the day a significant unit of play: the clock advances when the
player spends time, not while they stand around, and every day ends in
bed.

**Status: design, not implemented.** Today's time system lives in
`src/game/time.ts` (tick↔clock mapping), `src/components/Ticker.tsx`
(the loop and the day strip), and
`src/game/game-actions/tickAction.ts` (the tick pipeline). This doc
describes where it should go.

## Why

Time is almost pure decoration right now. A tick is one shop-minute at
five ticks per real second, so a full 7 AM–5 PM day elapses every **two
real minutes** whether the player does anything or not. The only systems
wired to the calendar are marketplace internals — the job-board refresh
at each day boundary, job-offer lifetimes, the sale pity timer, demand
recovery (`src/game/marketplace.ts`). Nothing has a deadline, nothing
happens *on* a day, and the Day counter in the top bar just accumulates.

Worse, in a real-time game with no speed controls, "actions cost time"
can never be an economy. The resource being spent is the player's
real-world patience: attended operations advance only while you stand
there holding <kbd>Space</kbd>, and the moments the game is most
interesting — reading the journal, studying a work order, planning a
cut sequence — are *penalized*, because the clock runs while you think.

Two things fix both problems at once:

1. **The clock only moves when the player spends time.** Thinking is
   free. Work costs minutes.
2. **The day ends in bed.** A day becomes a budget of working hours with
   a deliberate close, instead of a two-minute metronome.

Once a day is a real unit, things that were previously meaningless
become possible: deadlines that players can actually reason about
("due in 3 days" = three shops-full of working hours), a calendar with
events on it (the holiday commissions from
`docs/woodworking-features-brainstorm.md`), and simply a rhythm — the
morning check of the phone, the end-of-day glue-up, the drive home.

## One meter, not two

An earlier version of this idea had a separate stamina bar drained by
actions, with clock time kept alongside it for drying. We're
deliberately **not** doing that yet: the workday clock *is* the budget.
Actions consume minutes of the day; the day runs out at 5 PM; sleeping
starts the next one. This reuses everything that already exists —
operation durations are already quoted in minutes, `TICKS_PER_DAY` /
`formatClock` / the day strip are already in the top bar, and the
marketplace already keys off day boundaries.

A stamina layer earns its place only if we later want things the clock
can't express: coffee that restores it, a max-stamina skill, hand tools
that exhaust the body faster than they spend the day. That's a possible
future layer on top of this design, not part of it.

## The model

### What spends time

The tick pipeline (`tickAction`) stays exactly as it is. What changes is
*when the Ticker feeds it ticks*. The clock advances only while one of
these is true:

- **The player is working** — standing at a powered machine holding the
  operate key through an attended phase, or burning `busyTicks`
  (sweeping, vacuuming).
- **The player is away** — a shopping, lumberyard, or scavenging trip.
  Trips already carry tick costs (`returnTick`); they just keep doing so.
- **The player is waiting** — the explicit wait verb, below.
- **The player is asleep** — the overnight fast-forward, below.

Otherwise the clock is frozen: walking the floor, carrying stock,
reading the manual, browsing the phone, arranging the shop — all free.
Planning is the fun part; it should never cost the budget.

### Machines consume time, they never generate it

Hands-free phases (glue curing) and power-feed operations (the planer
pulling stock through) keep their current rule — they advance whenever
the tick pipeline runs — but they don't *cause* ticks. A curing glue-up
progresses only while the player is spending time on something else, or
waiting, or sleeping. This is the throughput game in miniature: early
on you glue up and hit wait; later you learn to fill that cure with a
resaw run and get two things out of the same minutes.

### The wait verb

If time only passes when spent, there must be a way to spend it on
nothing. **Wait** is a first-class verb: hold it and the clock runs,
plausibly at an accelerated rate (the same shape as hold-to-work — you
watch the clock spin, release to stop). It needs no target and works
anywhere in the shop.

The tutorial introduces it at the first glue-up: "clamp it, then wait."
Wait is the *easy* answer to a cure, and the game never punishes using
it — but every hour waited is an hour not worked, so the skilled play
that emerges is filling cures with other work. The verb teaches the
economy by being the baseline against which efficiency is measured.

### 5 PM and the evening

At 5 PM the working day is over:

- **Nothing new starts.** Machines refuse to begin an operation
  ("shop's closed for the night" — same refusal surface as the other
  machine refusals).
- **Time stops passing.** The wait verb stands down; there is nothing
  left to spend.
- **The bed is the way forward.** You can still walk the floor, tidy,
  read, admire the day's work — all the free verbs — but the only thing
  that moves the world is going to bed.

There is deliberately **no pass-out and no penalty**. The evening is a
soft landing, not a punishment: a quiet state whose one exit is sleep.
(Whether an operation already running at 5 PM finishes or holds at its
phase boundary is an implementation call; holding is simpler and the
morning resumes it, same as stepping away from a cut does today.)

### Bed and the overnight

Going to bed is a diegetic spot, not a menu item — the walk-up house
door on the lot, the same idiom as the truck's cab (`src/game/lot.ts`
owns the geometry). Sleeping fast-forwards the tick stream to 7 AM:

- **Cures finish.** Glue up at the end of the day, it's dry in the
  morning — the authentic rhythm, and the payoff of the evening state.
- **The job board refreshes.** `marketplaceTickPass` already refreshes
  offers at the day boundary; under this model that boundary is almost
  always crossed overnight, so it becomes legible: *new offers every
  morning*, checked on the phone with the first coffee.
- **Listings age and sell, demand recovers.** The pity timers and
  recovery rates in `marketplace.ts` are already expressed in days and
  carry over unchanged.

Mechanically the overnight is a batch of ordinary ticks run through the
ordinary pipeline (the same loop `__ADVANCE_TICKS__` uses in tests), not
a special path — everything that happens overnight happens because the
tick pipeline says so.

## What this unlocks (not in scope here)

- **Deadlines.** "Due by Friday" means something when a day is a budget
  the player can count. Commissions and job offers can carry due dates.
- **A calendar.** Events on specific days: a lumber sale at Sawyer &
  Sons, a craft fair, holiday commission seasons.
- **Day-shaped tutorialization.** "Your first day", "by the end of the
  week" — progression beats can be scheduled instead of purely gated.

## Open questions

- **Does walking cost anything?** If movement is free and untimed, shop
  layout efficiency — a stated design pillar — loses its economic teeth
  and matters only for flow-feel. Options: a small time cost on
  carrying/hauling, or accepting layout as feel. Undecided.
- **Day-length calibration.** 600 ticks was two real minutes of wall
  time; as a budget of *worked* minutes it's a different quantity
  entirely, and operation costs were tuned against the old regime. The
  progression ledger (`src/game/sequences/playthrough.ts`) now also
  measures days-to-finish, which becomes a number worth watching.
- **Wait speed.** How fast the accelerated wait runs, and whether it
  runs to "next interesting moment" (cure done, 5 PM) instead of a rate.
- **The stamina layer.** Explicitly deferred; see above.

## Honest flag: this is a genre shift

Today the game is idle-adjacent — listings sell and glue dries while
you stand around. Under this design **nothing happens for free**: time
passes only when spent, so the game stops rewarding leaving the tab
open and starts rewarding planning dense days. That is the point — the
complaint this design answers is that time passing is barely noticeable
— but it should be understood as a deliberate change of genre, from
ambient simulation toward a Stardew-style day loop, with the real-time
*texture* (WASD, hold-to-work, flying dust) fully preserved.
