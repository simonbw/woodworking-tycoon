# Woodworking Tycoon

An idle/simulation game about running a woodworking shop: buy machines, arrange your workshop, turn raw lumber into finished pieces, and fulfill commissions to work your way up from pallet-wood shelves toward building a retirement sailboat.

Built with React, TypeScript, PIXI.js, Tailwind CSS, and esbuild.

## Development

Requires Node 20.x.

```sh
npm install
npm run dev        # dev server on http://localhost:3001
npm run build      # production build to dist/
npm run tsc        # type checking
npm run test       # unit tests + Playwright E2E
```

## Design vision

The long arc runs from amateur woodworker with a scavenged pallet to master craftsman building a sailboat for retirement. The principles that shape it:

- More active than typical idle games, but with incremental progression satisfaction
- Most of play is non-commission work: the job board and marketplace listings are the day-to-day living, where money, reputation, and XP come from
- Commissions are rare "bosses" — reputation-gated milestone events that arrive as a phone call, each demanding a cluster of capabilities (machines, tools, skills) the shop doesn't have yet
- Manual operations, no automation
- Reputation is the pacing metric (it decides when the next commission calls); money is the capability metric (it buys the gear each commission demands)

Designs for unbuilt features live in the GitHub issue tracker, not in this repo.

## More

- `CLAUDE.md` — architecture overview and development guidelines
- `docs/` — system documentation and content-creation guidance
- `docs/asset-backlog.md` — which shop-view objects still want real art
