# The command layer

Every world mutation that input can trigger is a command: a free function
(or sim-entity method re-exported here) that takes the `Game` plus its
arguments and effects the change through the sim entities.

Commands are the only mutation surface the input dispatcher and the
ShopDriver are allowed to touch — `src/import-boundaries.test.ts` enforces
that their imports from `src/sim` resolve into this directory (the driver
may additionally read `save/`, `bootstrap`, and singleton classes for
assertions). The pure resolvers (`interact.ts`, `store-interact.ts`) stay
shared between the dispatcher and the hint chips.

Commands are organized system by system, one file alongside the sim
entities each mutates.
