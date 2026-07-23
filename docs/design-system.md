# The Paperwork Design System

The UI is the paperwork of a small woodworking shop: paper props sitting on
dark workshop chrome. Every panel should read as a *physical object* — a
receipt, a corkboard, a folder, a spec sheet taped to a machine — not as a
generic web card. The tokens live in `tailwind.config.ts`; the shared
component classes live in `src/styles/index.css`. This doc is the rubric for
using them.

The core rule: **when everything is stylized, nothing reads as important.**
Character fonts and loud surfaces are a budget to be spent, not a default.

## Font roles

| Font | Class | Role | Budget |
| --- | --- | --- | --- |
| Barlow Condensed | `font-condensed` | **The workhorse.** All UI chrome: labels, buttons, list rows, tabs, stats, tooltips, keyboard legends. This is the base font (`html`), so unstyled text gets it for free. | Unlimited — it's the quiet default. |
| JetBrains Mono | `font-mono` | **Machine-printed numbers.** Money, counts, timers, order numbers. Pair with `tabular-nums`. | Numbers only. Never prose. |
| Andada Pro (typewriter) | `font-typewriter` | **Typed documents.** Body text of in-fiction paperwork: commission sheets, the calendar page, receipt fine print. Opt-in only — never on interactive chrome. | A few document surfaces per screen. |
| Stardos Stencil | `font-stencil` | **Retired.** Too grating for UI at any size — it survives only as title-screen flair (`StartMenu`). Headings everywhere, including the store's retail signage, are bold condensed. Don't reintroduce it. | Title screen only. |
| Caveat | `font-ink` | **Handwriting.** Human margin notes: a client's note on a work order, a scribbled errand, a tally next to a quantity, a "nothing here" note pinned to the board. Runs small — use `text-base`/`text-lg`, never `text-xs`. | The character lever. Use it where a human would plausibly have written on the paper, nowhere else. |

Legacy fonts (`sans`/Nunito, `serif`/Bree Serif, `lumberjack`) are for the
logo and old sprites only. Don't use them in new UI.

## Surface roles

| Surface | Class / token | Means |
| --- | --- | --- |
| Workshop chrome | `workshop-bg` / `workshop-panel` / `workshop-edge` | The dark room the paper sits in. Never put body text directly on it except `.section-heading` object titles and `.button` chrome. |
| Manila | `.paper-card`, `paper-manila` | Folders and general shop paperwork. The default card. |
| Ivory | `.paper-card-ivory`, `.receipt-strip`, `paper-ivory` | Machine-printed output: receipts, the ledger, the calendar page, reference cards. Numbers on ivory are `font-mono`. |
| Legal | `.paper-card-legal`, `paper-legal` | Official documents from other people: commission work orders. |
| Lined sheet | `.lined-sheet` (cream) | Ruled paper — but only for **pure text tallies** (the supplies list). **Content must sit on the rules**: the ruling is 2rem, every text line gets `leading-[2rem]`, rows have no vertical padding, and the rules are the row dividers. Anything with icons or buttons cannot hold the ruling honestly — those lists (inventory, floor) use a plain cream sheet instead. |
| Corkboard | `corkboard-*` + `.corkboard-bg` | The job board. Things on it are *pinned* (thumbtack + slight rotation via `Thumbtack` component). |
| Big-box store | `store-*`, `.product-card`, `.aisle-heading`, `.price-tag` | The Orange Box trip (`StoreTripOverlay`, and the skills catalog, which mimics it) only. Deliberately louder — it's a different location with its own retail fiction. Don't leak these tokens into the shop UI. |

## Panel hierarchy (Home screen)

The home screen is composed of a small number of physical objects, not a
stack of equal-weight cards:

- **Top bar** (`NavBar`) — a thin chrome strip, no tabs: the shop's name,
  the day + speed controls (`Ticker`, which also drives the game loop —
  time always advances unless paused), the balance, and the pocket items
  (Phone, Journal, the `?` manual), all drawn directly on the dark bar,
  no paper. Everything that used to be a tab is an object in the world:
  the marketplace is the phone overlay, skills are the journal overlay,
  and the store is a trip out the garage door (`StoreTripOverlay`).
- **Job board** (`JobBoard`, left) — one corkboard holding the active
  commission (pinned legal sheet, foldable to a stub via its header) and,
  while the player is out scavenging, a "back soon" note (pinned cream
  memo). No label — a corkboard of work orders explains itself.
- **In-world placards** (`ShopOverlayLayer`, over the canvas) — the
  contextual UI is pinned to the thing it belongs to. The machine the
  player stands at wears its placard (`MachinePlacard`: a paper card with
  the machine's own controls and its live key caps), outfeed stock is
  offered at the machine it came off of, the garage door lists its
  numbered destinations on its own header (`DoorPrompt`), and a small
  dark hint cluster follows the player for floor-aimed verbs
  (`PlayerPrompt`, hint chrome wrapped in `HintSurfaceContext.Provider
  value="chrome"`). Recipe stations open a centered **station sheet**
  (`StationSheet`) — the full paperwork (plans, tools, shelf), spread out
  over a dimmed shop that keeps ticking; walking away folds it up.
- **Hands strip** (`HandsStrip`, under the canvas) — one manila folder
  row holding the In Hand, Underfoot, and Supplies sheets; long lists
  scroll inside their column. Supplies is the one ruled tally and hides
  entirely while the cabinet is empty.

**Every surface is viewport-sized** (`h-screen`/`inset-0` +
`overflow-hidden`, `p-6` margin) — the home screen and the store trip
overlay alike — so nothing ever adds or removes a page scrollbar. Long
content scrolls *inside* its own panel, aisle, or column. On Home,
placards float over the canvas without ever moving it, and panels
appearing or growing must never shove their neighbors around.

Spacing discipline for the anchored layout: **one gutter unit (`gap-6` /
`p-6`) everywhere** — page margin, column gutters, and panel gaps — so the
edge-anchored composition reads as a deliberate grid rather than
scattered cards. The shop view anchors to the top of the space the job
board leaves it, with the hands strip directly beneath.

When adding a new panel, first ask which existing object it belongs *inside*.
Only mint a new top-level object if it's genuinely a new piece of furniture,
and give it exactly one `.section-heading`.

## Rules of thumb

- Headings: one stencil `.section-heading` per top-level object, small
  `font-condensed` uppercase labels (`.subsection-heading` scale) for
  everything inside it.
- Buttons: `.button` / `.button-ghost` on dark chrome, `.button-paper` on
  paper. Don't invent new button styles outside the store.
- Emphasis comes from size, weight, and ink color (`ink-red` for warnings,
  `ink-blue` for active states, `gold` for money/progress) — not from
  switching fonts.
- It's a game: prefer diegetic weirdness (a thumbtack, a coffee-stain, a
  handwritten tally) over web-app decoration (badges, pills, gradients).
