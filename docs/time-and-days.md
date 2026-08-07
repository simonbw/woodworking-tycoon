# Time & Days — The Spend-to-Advance Clock

Making the day a significant unit of play: the clock creeps while the
player thinks, runs while they spend time, and every day ends with the
drive home.

**Status: implemented.** The pace model lives in `src/game/time-flow.ts`
(what counts as spending time), `src/game/time.ts` (the day's units and
phases), `src/components/Ticker.tsx` (the variable-rate loop and the day
strip), and `src/game/game-actions/door-actions.ts` (trips, the drive
home, and the overnight). The tick pipeline
(`src/game/game-actions/tickAction.ts`) is unchanged — what changed is
when and how fast the Ticker feeds it.

## Why

Time used to be almost pure decoration: a tick was one shop-minute at
five ticks per real second, so a full day elapsed every two real minutes
whether the player did anything or not. Nothing had a deadline, nothing
happened *on* a day, and in a real-time game with no speed controls,
"actions cost time" could never be an economy — the resource being spent
was the player's real-world patience, and the moments the game is most
interesting (planning, reading, arranging) were penalized because the
clock ran while you thought.

Two things fix both problems at once:

1. **The clock's pace follows what the player is doing.** Thinking is
   nearly free. Work costs minutes.
2. **The day ends with the drive home.** A day is a budget of working
   hours with a deliberate close, not a two-minute metronome.

## The model

### Four speeds

`timeSpeed` (time-flow.ts) reduces the whole shop to one of four paces,
and the Ticker feeds ticks accordingly:

- **working** — time is being spent, at the familiar five shop-minutes a
  second: an attended machine phase actually advancing (player at the
  machine, holding the operate key, power on — or a power-feed operation
  pulling stock through on its own), the broom or vac working under the
  same hold, a busy body (trudging dust, mid-sweep), or a scavenging
  run's timer burning down.
- **waiting** — the wait verb: hold <kbd>T</kbd> and the clock winds up
  from a gentle spin to twice working pace over a few seconds (the
  Ticker's `waitTicksPerSecond` ramp) — a tap costs only minutes, a
  held key drains an hour's cure in about seven seconds and a whole day
  in roughly a minute. It needs no target and works anywhere in the
  shop; the player's hint cluster offers it whenever work is running
  with nobody spending time.
- **idle** — nobody is spending time. The clock still creeps at about
  five times real life (`IDLE_TICKS_PER_SECOND`; a full day of pure
  idling takes around two real hours): walking the floor, reading,
  arranging stock, and browsing a store's aisles are all nearly free.
- **stopped** — the shop is closed for the night (or the player is home
  in bed). No idle creep, and the wait key stands down — there is
  nothing left to spend. The only ticks left are the ones work causes.

Machines consume time, they never generate it: hands-free phases (glue
curing) advance whenever ticks flow but cause none themselves. A cure
finishes on the minutes something else spends — other work, a drive, or
the overnight. That's the throughput game in miniature: fill the cure
with a resaw run and get two things out of the same minutes.

Wait is the *easy* answer to a cure, and the game never punishes using
it — but every hour waited is an hour not worked, so the skilled play
that emerges is filling cures with other work (or gluing up at the end
of the day and letting the overnight do it). The verb teaches the
economy by being the baseline against which efficiency is measured.

### The day, told by its light

A working day is `TICKS_PER_DAY` (600) minutes, 7 AM to 5 PM — but there
is deliberately **no wall clock**. The top bar carries a dial
(`DayDial`): the date in the middle, with the sun and the moon opposite
each other on one orbit going around it. Where the sun stands is the
whole readout — high and the day is young, low on the right and it's
time to think about the drive home, gone and the shop is closed. The
daylight arc it travels doubles as the day's progress meter, which is
what the gold hairline under the old strip did on its own.

Durations are still quoted in minutes and hours (`formatDuration`);
moments are only ever told as broadly as `dayPhase`, which no longer
appears as a word on screen but still names the dial for screen readers
and carries the tooltip's "Afternoon of day 8".

The date is presentation only (`src/game/calendar.ts`): `GameState.day`
counts mornings, as every rule is written against, and the calendar is
derived from it — day 1 is Monday, 9 June 2025. Nothing is stored, so
there is no calendar in the save and nothing to migrate. The year is
never shown; it exists so month lengths and leap years come out right.
Early summer is a deliberate pick — long evenings for the daylight the
shop is lit by — and a Monday start means the save's first day is also a
week's first day, for whenever deadlines want one.

### The lot is lit by the same sun

`src/game/daylight.ts` owns where the sun is, and **both** the dial and
the world read it (`sunAltitude`). That sharing is the point: a shadow on
the lot pointing the wrong way against a sun the player can see on the
dial is exactly the kind of thing that reads as broken.

Three pieces, all pure functions of the hour, all eased per frame rather
than per tick (`daylight-tween.ts` — a tick lands every twelve seconds at
the idle creep and ten a second under the wait key; neither is a rate to
drive a color at):

- **The sky**, `DaylightLayer`. A multiply tint over everything outdoors,
  drawn last so it catches the lawn, the driveway, the truck, the
  building, and the player when they walk out. Bright and slightly cool at
  the open — 7 AM in June is hours after sunrise, and the ramp says so —
  neutral through the middle, warming through gold, and deep blue after
  close. Multiply means `0xffffff` is a no-op, so midday is simply the art
  showing its own colors.
- **The building's shadow**, `EnvironmentLayer`'s `BuildingShadow`. A slab
  that slides with the sun: long to the right first thing, short and
  straight down at noon, long to the left before close, gone after dark.
  Its alphas are much higher than they look like they should be, because
  the lawn it falls on is already tinted well down — a tenth of black over
  it moves three values out of 255, which is invisible against the grass
  texture's own noise.
- **The bulbs**, also `DaylightLayer`. The slab is cut out of the sky wash
  and carries its own nearly-neutral tint, so **the shop stays workable at
  every hour** — a woodworker doesn't lose the afternoon because the sun
  moved; they turn the lights on. Indoors only ever warms toward
  incandescent. The hard edge at the wall is the wall. What sells it is
  the third piece: after dark the shop's light spills out through the door
  opening onto the driveway, which is what makes the lit interior read as
  *lit* rather than as a hole the evening failed to reach.

### 5 PM and the night

When the day's budget is spent the shop is closed:

- **Nothing new starts.** `operateMachineAction` refuses
  ("shop's closed for the night"), and so do trips out — the truck card
  drops every destination but Home.
- **Idle time stops passing.** The creep stands down; `timeSpeed` says
  `stopped`.
- **What's already running may finish.** Attended work still ticks while
  the player pushes it — overtime is allowed, the day just doesn't end
  until they drive home. Deliveries are allowed too: handing the day's
  work over is finishing, not starting.

There is no pass-out and no penalty. The evening is a quiet state whose
one exit is the drive home.

### Home and the overnight

Home is a destination on the truck's cab card, always present, labelled
as calling it a day. Driving home sets `away: {kind: "home"}`; the trip
performance plays, a night card holds for a beat (`SleepOverlay`), and
morning arrives on its own via `wakeUpAction`:

- The day counter turns over first, then the whole overnight —
  `NIGHT_TICKS` (840) minutes, 5 PM around to 7 AM — runs as **one batch
  of ordinary ticks through the ordinary pipeline**. Cures finish,
  listings age and roll their sales, demand recovers, the job board
  rotates. Nothing overnight is a special path.
- `dayStartTick` restamps at the end of the batch: a fresh 600-minute
  budget, the player beside the cab.

Sleeping early just leaves the rest of the day unspent.

### Trips charge for the drive

Store and lumberyard runs charge `DRIVE_TICKS_ONE_WAY` (15) minutes each
way, run through the pipeline at the moment of departure and return — so
a cure gains the same minutes the drive spends. Browsing the aisles is
thinking, and thinking is nearly free. A scavenging run charges the same
way it plays: each stop's search and the drive home are working time,
while sitting at the cab deciding whether another stop is worth it is
thinking — and once a search plus the drive home would run past close,
"keep searching" is off the table and home is the only way.

### Days are calendar days now

`day` and `dayStartTick` live in `GameState`; the day number advances
**only by sleeping**, never by the tick counter rolling over. Everything
the marketplace quotes "in days" — offer lifetimes, the listing pity
timer, demand recovery, tip decay — is denominated in
`TICKS_PER_CALENDAR_DAY` (1440 = 600 working + 840 overnight), so
"three days" still means three mornings from now. The job board keys off
`jobBoardDay`: the first tick of a morning it hasn't seen rotates it,
which in play reads as *new offers every morning*.

Old saves load as a fresh morning at their saved tick
(`parseGameState` backfills `day`/`dayStartTick`).

### Responsiveness without ticks

Milestone unlocks, the coach's next card, and the empty-job-board refill
used to ride the 5-per-second tick stream. They answer the player's
actions, not the clock, so the Ticker runs them on their own steady
cadence (`checkProgressionMilestonesAction` + `refillEmptyJobBoardAction`)
regardless of the clock's pace. No time passes there.

## Testing

`ShopDriver` sleeps like a player: `sleep()` walks to the cab, drives
home, and wakes; every verb that starts something time-shaped runs
through `ensureDaylight()`, so long sequences (the progression ledger
included) roll through their days automatically. The day loop's promises
— evening glue-up dry by morning, the board rotating overnight, night
refusing new work but never trapping the shop — live in
`src/game/sequences/day-loop.test.ts`.

## What this unlocks (not in scope here)

- **Deadlines.** "Due by Friday" means something when a day is a budget
  the player can count. Commissions and job offers can carry due dates.
- **A calendar.** Events on specific days: a lumber sale at Sawyer &
  Sons, a craft fair, holiday commission seasons.
- **Day-shaped tutorialization.** "Your first day", "by the end of the
  week" — progression beats can be scheduled instead of purely gated.

## Open questions

- **Does walking cost anything?** Movement rides the idle creep, so shop
  layout efficiency matters for flow-feel more than economy. Options: a
  small time cost on carrying/hauling, or accepting layout as feel.
  Undecided.
- **Interactive bench work is idle-priced.** The bench view's hand work
  (sanding strokes, prying nails, assembly) advances no attended ticks —
  the view performs it — so it currently costs only the idle creep.
  Arguably it should spend minutes like any other work.
- **Day-length calibration.** 600 worked minutes is a different quantity
  than 600 free-running ones, and operation costs were tuned against the
  old regime. The progression ledger measures days-to-finish; watch it.
  Sale-roll rates (`BASE_SALE_RATE`) now also roll through 840 overnight
  ticks a night, which effectively speeds sales per calendar day.
- **The stamina layer.** Explicitly deferred; see the design history in
  git — the workday clock is the only meter for now.

## Honest flag: this is a genre shift

The game used to be idle-adjacent — listings sold and glue dried while
you stood around. Now nothing meaningful happens for free: the clock
creeps slowly when unspent, so the game stops rewarding leaving
the tab open and starts rewarding planning dense days, with the
real-time *texture* (WASD, hold-to-work, flying dust) fully preserved.
