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
| Special Elite (typewriter) | `font-typewriter` | **Typed documents.** Body text of in-fiction paperwork: commission sheets, the calendar page, receipt fine print. Opt-in only — never on interactive chrome. | A few document surfaces per screen. |
| Stardos Stencil | `font-stencil` | **Signage.** Spray-painted-on-a-crate energy: top-level object titles (`.section-heading`), spec-sheet names, stamps (`.stamp`), store aisle headings, the big day number. | 3–5 uses per screen. If a screen has more stencil than a real shop has stenciled crates, cut some. |
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
| Lined sheet | `.lined-sheet` (cream) | Ruled paper for lists people maintain by hand: inventory manifests, to-do notes. Quantities here may be handwritten (`font-ink`) tallies. |
| Corkboard | `corkboard-*` + `.corkboard-bg` | The job board. Things on it are *pinned* (thumbtack + slight rotation via `Thumbtack` component). |
| Big-box store | `store-*`, `.product-card`, `.aisle-heading`, `.price-tag` | StorePage (and the skills catalog, which mimics it) only. Deliberately louder — it's a different location with its own retail fiction. Don't leak these tokens into the shop UI. |

## Panel hierarchy (Home screen)

The home screen is composed of a small number of physical objects, not a
stack of equal-weight cards:

- **Calendar + speed controls** (`Ticker`) — one ivory tear-off calendar.
- **Ledger** (`ShopLedger`) — one receipt strip: balance on top, supply
  stock below a perforated rule. Appears as one piece of paper.
- **Job board** (`JobBoard`) — one corkboard holding the active commission
  (pinned legal sheet) and the errands note (pinned lined sheet).
- **Shop manifest** (`ShopManifest`) — one manila folder with file-folder
  tabs for Inventory and Floor. The lined sheets live *inside* the folder.
- **Machine spec sheet** (`MachinesSection`) — contextual; appears only
  when standing at a machine. It stays outside the folder because the core
  loop (load from inventory → operate) needs it visible *alongside* the
  inventory list.
- **Controls** (`ActionBar`) — small ivory reference card of live keys.

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
