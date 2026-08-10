# The Paperwork Design System

The UI is the paperwork of a small woodworking shop: paper props sitting on
dark workshop chrome. Every panel should read as a *physical object* — a
receipt, a corkboard, a folder, a spec sheet taped to a machine — not as a
generic web card. The tokens live in `tailwind.config.ts`; the shared
component classes live in `src/styles/index.css`. This doc is the rubric for
using them.

The core rule: **when everything is stylized, nothing reads as important.**
Character fonts and loud surfaces are a budget to be spent, not a default.

This doc covers the DOM UI. The art *inside* the shop view — machines,
materials, props on the floor — follows its own rules; what still needs
drawing is tracked in `docs/asset-backlog.md`.

## Font roles

| Font | Class | Role | Budget |
| --- | --- | --- | --- |
| Barlow Condensed | `font-condensed` | **The workhorse.** All UI chrome: labels, buttons, list rows, tabs, stats, tooltips, keyboard legends. This is the base font (`html`), so unstyled text gets it for free. | Unlimited — it's the quiet default. |
| Andada Pro (typewriter) | `font-typewriter` | **Typed documents.** Body text of in-fiction paperwork — commission sheets, the calendar page, receipt fine print — and the figures typed onto them (order numbers, payouts, receipt digits). Opt-in only — never on interactive chrome. | A few document surfaces per screen. |
| Stardos Stencil | `font-stencil` | **Logos only.** Too grating for UI at any size, but it's the right face for a painted sign: the Orange Box wordmark (`OrangeBoxLogo`). Headings, including the store's aisle signage, stay bold condensed. Never set a label, a row, or a heading in it. | One logo. Adding a second needs a new venue. |
| Shantell Notes | `font-ink` | **Handwriting.** Human margin notes: the player's own note on a work order, a scribbled errand, a tally next to a quantity, a "nothing here" note pinned to the board. Runs small — use `text-base`/`text-lg`, never `text-xs`. | The character lever. Use it where a human would plausibly have written on the paper, nowhere else — never on a screen (the phone's listings are typed, not inked). |
| Lumberjack | `font-lumberjack` | **Reserved for the shop's own signage.** Currently has no call sites — the title screen and the Sawyer & Sons sign both became artwork — but the family is kept declared and loaded for the next sign that needs live type. It is not a heading face. | Signs only. Nothing today. |

## Where the fonts come from

**We serve every font ourselves. Nothing may reference a font CDN.** A
third-party stylesheet is a render-blocking request to a host we don't
control, it hands every player's IP to that host, and when it's slow or
blocked the boot gate burns its full timeout and the shop opens in fallback
type.

The web families are vendored by `npm run fetch:fonts`
(`scripts/fetch-fonts.ts`), which downloads the latin subset into
`static/fonts/` and writes `src/styles/fonts.generated.css`. Both the
`.woff2` files and the generated CSS are committed. Faces of our own making
(Lumberjack, and Shantell Notes — our cut of Shantell Sans) aren't fetched
from anywhere, so they're hand-declared in `src/styles/fonts.css`.

Adding a family or a weight means four things in step, and skipping any one
of them fails quietly rather than loudly:

1. `FAMILIES` in `scripts/fetch-fonts.ts`, then re-run it
2. the `fontFamily` block in `tailwind.config.ts`
3. `FONT_FACES` in `src/utils/loadFonts.ts`, so boot waits for it
4. this table

A weight nobody fetched still renders — the browser picks the nearest one
it has — so the mistake shows up as type that's subtly the wrong thickness,
not as an error.

Glyphs are the other half of this. Our subset stops at the end of latin, so
a decorative character (★, ✦, arrows, box-drawing) is drawn by whatever
system font the player happens to have, at a different weight and baseline
on every machine. **Anything load-bearing gets drawn instead** — the
reputation star and the XP spark are `StarIcon` / `SparkIcon`
(`src/components/StarIcon.tsx`), sized in `em` and colored by
`currentColor` so they behave like the glyphs they replaced.

## Numbers

Player-facing numbers go through `src/utils/formatNumber.ts` — `formatMoney`,
`formatCount`, `formatDecimal`, and `formatLength` for lumber lengths —
never `toFixed`. The first three are `en-US`
`Intl` formatters, so a four-figure balance reads `$1,024.00`. Both
thresholds are reachable in a normal run: late-game money, and a level's XP
cost once craft level hits 10.

`formatMoney` writes its own `$`; call sites must not prefix one.

There is no monospace face — a number wears the face of the surface it
sits on: condensed (usually just inherited) in chrome and on screens,
`font-typewriter` on paper documents where the figure reads as typed.
`font-mono` resolves to the system stack and belongs only in dev-only
chrome (the fixture loader, debug panels).

Pair a number with `tabular-nums` wherever it sits in UI chrome, so a figure
that changes every tick doesn't reflow the row around it. Two exceptions:

- **Prose.** A number inside a sentence should carry the same widths as the
  words around it. Format it, but leave the figures proportional.
- **The handwriting face.** The hand-kept tallies (supplies, floor, in-hand)
  are `font-ink` on purpose; tabular figures fight that face. They still get
  separators — someone writing by hand would also write "1,200 nails".

Text that seeds an `<input>` is not a readout: leave it as `toFixed` and say
so in a comment, or the value stops surviving its own `parseFloat`.

## Surface roles

| Surface | Class / token | Means |
| --- | --- | --- |
| Workshop chrome | `workshop-bg` / `workshop-panel` / `workshop-edge` | The dark room the paper sits in. Never put body text directly on it except `.section-heading` object titles and `.button` chrome. |
| Manila | `.paper-card`, `paper-manila` | Folders and general shop paperwork. The default card. |
| Ivory | `.paper-card-ivory`, `.receipt-strip`, `paper-ivory` | Machine-printed output: receipts, the ledger, the calendar page, reference cards. Numbers on ivory are `font-typewriter`. |
| Legal | `.paper-card-legal`, `paper-legal` | Official documents from other people: commission work orders. |
| HUD chip | `.hud-chip` (dark, translucent) | A floating piece of workshop chrome over the world canvas: the top readouts, the hands strip, the supplies tally. Chrome is the language of *overlay*, paperwork of *documents* — a HUD element is chrome, and a document it opens (job board, station sheet, phone) is paper. Text on it follows the chrome rules (condensed, manila tones); numbers stay in the condensed face and carry `tabular-nums` — the top bar's readouts bold like the clock. |
| Corkboard | `corkboard-*` + `.corkboard-bg` | The job board. Things on it are *pinned* (thumbtack + slight rotation via `Thumbtack` component). |
| Big-box store | `store-*`, `.product-card`, `.aisle-heading`, `.price-tag` | The Orange Box trip (`StoreTripOverlay`, and the skills catalog, which mimics it) only. Deliberately louder — it's a different location with its own retail fiction. Don't leak these tokens into the shop UI. |
| Lumberyard | `mill-*` | The Sawyer & Sons trip (`LumberyardTripOverlay`) only: painted-sign green over stickered stacks and gravel. Same rule as the store tokens — a location's palette stays at that location. |

## HUD hierarchy (Home screen)

The home screen **is the world**: the canvas runs edge to edge with the
garage drawn as a building on its lot (`EnvironmentLayer`), and the
remaining UI floats over it as a small number of HUD objects, not a
stack of equal-weight cards:

- **Top row** (`NavBar`) — one floating `hud-chip` in the top-right, no
  tabs, split by hairline dividers into three segments: the date and
  light (`Ticker`, which also drives the game loop — time always
  advances unless the pause menu is open — rendering the sun-and-moon
  dial `DayDial`, whose daylight arc carries the day's progress; there
  is deliberately no wall clock), the balances (cash and reputation, set exactly
  like the clock — bold condensed, tabular figures — in the one gold
  accent, the star flowing inline with the digits), and the pocket
  items (Phone, Skills, the `?` manual, and Menu, which opens the pause
  screen). The row
  itself passes pointer events through to the world; only the chip
  catches them. Everything that used to be a tab is an object in the
  world: the marketplace is the phone overlay, skills are the journal
  overlay, and errands are trips out the garage door, each a full-screen
  overlay (`StoreTripOverlay`, `LumberyardTripOverlay`,
  `ScavengeTripOverlay` — the last a handwritten travel log beside the
  sketched truck, its bed stacking up with the haul).
- **Commission tracker** (`CommissionTracker`, top-left) — the
  objectives readout, and the one HUD corner that is paper rather than
  chrome: the work order's own legal sheet, cropped to the order's name,
  its checklist, and what it pays (or where to carry it once complete).
  Clicking it, or C, holds up the **clipboard** (`ClipboardModal`) — the
  same sheet at full length, with the client note, pay and reputation —
  and it gets there by growing out of the corner it was just sitting in,
  shrinking back on the way down. One `WorkOrder` component prints both,
  `compact` deciding which lines show, so the two can never disagree. A
  new commission opens the clipboard by itself once the previous one's
  reward flight has landed.
- **Hands strip** (`HandsStrip`, bottom-center) — a `hud-chip` of slots,
  one per kind of thing carried; clicking a slot sets one down,
  shift-click the group, and F speaks the same verb from the keyboard.
  Hidden while empty or away: an empty strip is just chrome.
- **Supplies tally** (`SuppliesSection`, bottom-right) — a small
  `hud-chip` tally of consumable stock and the clamp rack; hides
  entirely while the cabinet is empty.
- **Contextual UI lives in the world** as **hint chips**
  (`ShopOverlayLayer`): dark chrome clusters in the "[F] put down"
  idiom, pinned to the thing they belong to — the targeted machine's
  verbs, settings, and refusal notes (`MachineChips`), outfeed stock at
  the machine it came off of, the truck cab's "[E] head out"
  (`TruckPrompt` — the keypress opens the full destination card), and
  floor verbs beside the player (`PlayerPrompt`). Chip chrome wraps in
  `HintSurfaceContext.Provider value="chrome"`. A bench's plans and
  racks live on the centered **station sheet** (`StationSheet`, Tab) —
  paperwork, spread out over a dimmed shop that keeps ticking; walking
  away folds it up. Direct-feed machines have no sheet beyond a tool
  rack: running them is entirely floor keys.

**Every surface is viewport-sized** (`h-screen`/`inset-0` +
`overflow-hidden`, `p-6` margin) — the home screen and the store trip
overlay alike — so nothing ever adds or removes a page scrollbar. Long
content scrolls *inside* its own panel, aisle, or column. On Home, HUD
objects float over the canvas without ever moving it, and panels
appearing or growing must never shove their neighbors around.

Spacing discipline for the anchored layout: **one gutter unit (`gap-6` /
`p-6`) everywhere** — page margin and the gaps between HUD objects — so
the edge-anchored composition stays consistent around the world.

When adding a new panel, first ask which existing object it belongs *inside*.
Only mint a new top-level object if it's genuinely a new piece of furniture,
and give it exactly one `.section-heading`.

## Rules of thumb

- Headings: one `.section-heading` (bold condensed uppercase — stencil
  is reserved for retail signage) per top-level object, small
  `font-condensed` uppercase labels (`.subsection-heading` scale) for
  everything inside it.
- Buttons: `.button` / `.button-ghost` on dark chrome, `.button-paper` on
  paper. Don't invent new button styles outside the store.
- Emphasis comes from size, weight, and ink color (`ink-red` for warnings,
  `ink-blue` for active states, `gold` for money/progress) — not from
  switching fonts.
- It's a game: prefer diegetic weirdness (a thumbtack, a coffee-stain, a
  handwritten tally) over web-app decoration (badges, pills, gradients).
