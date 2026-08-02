# Woodworking Tycoon - Comprehensive Gameplay Roadmap

## Core Game Vision

Woodworking Tycoon is an incremental/idle-inspired simulation game where players progress from amateur woodworkers with basic tools to master craftsmen capable of building a sailboat for retirement. The game emphasizes meaningful progression through tool acquisition, skill development, and increasingly complex projects.

**Key Design Principles:**
- More active than typical idle games, but with incremental progression satisfaction
- Most of play is non-commission work: the job board and marketplace listings are the day-to-day living, where money, reputation, and XP come from
- Commissions are rare "bosses" — reputation-gated milestone events that arrive as a phone call, each demanding a cluster of capabilities (machines, tools, skills) the shop doesn't have yet
- Manual operations (no automation initially)
- Reputation is the pacing metric (it decides when the next commission calls); money is the capability metric (it buys the gear each commission demands)

## Early Game: Tutorial Phase (First 8-10 Commissions)

### Starting Conditions
- **Space**: Empty garage workshop
- **Equipment**: Single workspace
- **Materials**: None — the first pallet is scavenged with the truck
- **Money**: $0
- **UI Access**: Main workshop view; the truck offers scavenging from day one

### The Commission Ladder (implemented: 6 rungs, `commissionSequence.ts`)

Each commission is reputation-gated — the client doesn't call until the
shop's reputation reaches its threshold — and demands a cluster of
capabilities the player has to earn between calls, living on the job board
and listings:

1. **Your First Shelf** ($20, gate 0) — the tutorial: scavenge a pallet,
   break it down, build a rustic shelf. Completing it unlocks the store
   *and* the phone (marketplace).
2. **The Frame Shop Order** ($30, gate 6) — boards cut to length, ripped
   to width, sanded: the whole starter shop (miter saw + table saw +
   sanding block, ~$460 of gear funded off the job board).
3. **A Proper Cutting Board** ($95, gate 30) — hardwood, clamps, the
   glue-up chain, and an oil finish.
4. **The Cafe Fit-Out** ($240, gate 40) — fine shelves, planter boxes
   (drill + screws), and a striped board: three skill points' worth of
   journal work.
5. **Small Treasures** ($290, gate 52) — jewelry boxes and mitered frames:
   the planer, Box Joinery, and Mitered Frames.
6. **The Butcher's Block** ($340, gate 66) — the finale: a shop-built
   crosscut sled and a true end-grain block.

### The Guided Opening (implemented, `docs/tutorial.md`)

A ten-step coach card that teaches one pass through each part of the early
game and then retires: commission 1 start to finish, then a listing, a
job, a bought-and-mounted tool, and the first skill point. Steps are
derived from game state rather than scripted, so it can't desync or lock.
It deliberately stops short of commission 2 — the climb to it is many
iterations of the loop it just taught — and never mentions that
reputation summons the next client. The phone ringing is the reveal.

### Key Mechanics
- **Commission System**: rare, rep-gated milestone events that arrive as a
  phone call and land on the clipboard
- **Jobs & Listings**: the day-to-day income, reputation, and XP between
  commissions (see `docs/marketplace-and-jobs.md`)
- **Tool Acquisition**: store purchases unlock new capabilities, funded by
  grinding — power tools take real work to afford
- **Workshop Layout**: strategic tool placement becomes important
- **Material Quality**: progression from pallet wood through big-box
  hardwood to the lumberyard's cheaper rough stock (rep-gated channels)

## Mid Game: Workshop Building Phase (Commissions 7-20)

### Expanding Capabilities
- **Tool Diversity**: Router, sanders, specialty tools
- **Material Variety**: Introduction of hardwoods (oak, maple, cherry)
- **Project Complexity**: Multi-step furniture pieces, advanced joinery
- **Workshop Efficiency**: Layout optimization becomes critical

### Major Milestones
- **First Hardwood Project**: Significant material cost investment
- **Shop Upgrade #1**: Garage → Hobby Shop (more space, better tools available)
- **Complex Furniture**: Moving beyond simple shelves to tables, cabinets
- **Technique Mastery**: Advanced operations requiring skill and precision

### Economic Complexity
- **Higher Stakes**: More expensive materials require careful planning
- **Investment Decisions**: Tool purchases vs. material inventory vs. shop upgrades
- **Risk Management**: Failed projects cost more than early game mistakes
- **Profit Optimization**: Understanding true costs and profit margins

## Late Game: Master Craftsman Phase (Commission 20+)

### Advanced Systems
- **Specialized Equipment**: Industrial-grade tools, finishing equipment
- **Premium Materials**: Exotic hardwoods, veneers, specialized hardware
- **Complex Projects**: Full furniture suites, architectural millwork
- **Shop Mastery**: Pro shop space with optimal workflow design

### Major Shop Progression
- **Hobby Shop → Pro Shop**: Maximum space, access to professional equipment
- **Workflow Optimization**: Efficient material flow and tool organization
- **Specialization Options**: Focus areas (furniture, cabinetry, artistic pieces)

## Endgame: Sailboat Project

### Ultimate Goal
- **Master Project**: Multi-part sailboat construction
- **New UI Tab**: Dedicated sailboat building interface
- **Complex Systems**: Requires mastery of all previous techniques and tools
- **Retirement Ending**: Complete the boat and sail away

### Sailboat Components (TBD)
- Hull construction
- Mast and rigging
- Interior finishing
- Hardware and systems

## Progression Systems

### Commission Progression
- **Linear Sequence**: Each commission builds on previous capabilities
- **Clear Requirements**: Players know what tools/materials they need
- **Escalating Complexity**: One new element per commission
- **Milestone Rewards**: Significant payment increases at key points

### Economic Progression  
- **Tool Investment Cycle**: Commission rewards → tool purchase → new capabilities
- **Material Quality Ladder**: Pallet wood → pine → hardwoods → exotics
- **Shop Expansion**: Garage ($X) → Hobby Shop ($Y) → Pro Shop ($Z)
- **Free Market**: Grinding option at reduced profitability

### Unlock System
- **Feature Unlocks**: Store access, free selling
- **Tool Requirements**: Higher-tier tools locked behind shop upgrades
- **Material Access**: Better materials unlock with reputation/progression
- **Technique Gates**: Complex operations require prerequisite tool mastery

## Key Gameplay Loops

### Primary Loop: Commission Fulfillment
1. Receive commission with clear requirements
2. Identify needed tools/materials not currently owned
3. Earn money through free selling or previous commissions
4. Purchase required equipment/materials
5. Place tools optimally in workshop layout
6. Execute project using acquired capabilities
7. Complete commission for major reward
8. Repeat with increased complexity

### Secondary Loop: Workshop Optimization
1. Acquire multiple tools creating layout challenges
2. Experiment with workshop arrangements
3. Optimize for material flow and efficiency
4. Upgrade to larger shop space when needed
5. Reorganize for new tools and workflows

### Economic Loop: Investment & Returns
1. Assess commission requirements vs. current capabilities
2. Calculate tool/material investment needed
3. Determine optimal earning strategy (free selling vs. saving)
4. Make strategic purchases
5. Utilize new capabilities for higher-value projects

## Balancing Considerations

### Difficulty Scaling
- **Learning Curve**: Gentle tutorial progression with clear success paths
- **Economic Pressure**: Meaningful but not frustrating resource constraints  
- **Complexity Growth**: Each commission adds manageable new complexity
- **Recovery Options**: Free selling provides fallback earning method

### Player Engagement
- **Big Moments**: Tool purchases, shop upgrades, complex commissions feel significant
- **Steady Progress**: Always clear next steps and achievable goals
- **Player Choice**: Layout decisions and earning strategy options
- **Long-term Vision**: Sailboat goal provides ultimate motivation

### Session Flexibility
- **Short Sessions**: Progress possible in 10-minute play periods
- **Long Sessions**: Deep engagement possible for hours-long sessions
- **Idle Elements**: Potential for passive progress in future updates
- **Save Continuity**: Single persistent game world

---

*This roadmap provides the framework for development priorities and ensures cohesive player progression from beginner woodworker to master craftsman capable of building their retirement sailboat.*