# Woodworking Features Brainstorm

## Core Woodworking Systems

### Joinery System
- **Abstracted joinery types** required for different projects
  - Box joints / Dovetails for boxes and drawers
  - Mortise & tenon for furniture frames
  - Dado joints for shelving
  - Rabbet joints for cabinet backs
- Implementation: Convert boards into specific "component parts" that imply the joinery
  - Example: "jewelry box sides" implies box joints have been cut
  - Different projects require different joint types, adding complexity

### Surface Preparation & Finishing
- **Sanding system** (simplified)
  - Boards can be: Rough → Sanded → Finished
  - Single "sanding" operation rather than multiple grits
  - Required before finishing for quality products
- **Finishing system**
  - Basic: Hand-rubbed finish (slower, entry-level)
  - Advanced: Spray finish (faster, requires spray booth?)
  - Affects final product value and quality

### Lumber Processing Tiers
- **Rough sawn** → **S2S** (surfaced 2 sides) → **S4S** (surfaced 4 sides)
- Each tier requires different machines and processing
- Higher tiers cost more but save processing time

## Machine Ecosystem

### Primary Machines (in rough order of acquisition)
1. **Miter Saw** ✓ (already implemented)
   - Cutting to length
   - Clean crosscuts

2. **Table Saw**
   - Ripping boards to width
   - Edge jointing (with jig)
   - Dados, rabbets, grooves
   - Crosscuts (with sled jig)
   - Tenons (with tenoning jig)

3. **Band Saw**
   - Curved cuts
   - Template creation
   - Resawing (making thinner boards)

4. **Planer**
   - Thickness adjustment
   - Surface preparation (with jointer)

5. **Jointer**
   - Flattening faces
   - Squaring edges
   - Works in tandem with planer

6. **Router Table**
   - Edge profiles (roundovers, chamfers, ogees)
   - Template routing
   - Some joinery operations

7. **Lathe**
   - Turning round components (legs, spindles)
   - Bowl turning specialization path?

8. **CNC Router** (end-game)
   - Automated complex cuts
   - Batch production
   - Can run unattended

### Jigs & Fixtures
Essential upgrades for machines:
- **Crosscut sled** (table saw) - safer, more accurate crosscuts
- **Tenoning jig** (table saw) - consistent tenon cuts
- **Tapering jig** (table saw) - angled cuts for legs
- **Box joint jig** (table saw/router) - perfect box joints
- **Circle cutting jig** (band saw/router)

### Tool Upgrades for Workspace
Hand tools as workspace upgrades rather than individual items:
- **Basic hand tools** (included with workspace)
- **Chisel set upgrade** - enables hand-cut dovetails
- **Hand plane upgrade** - fine finishing capability
- **Measuring upgrade** - reduces waste, improves accuracy
- **Clamping upgrade** - enables larger glue-ups

## Product Progression System

### Progression Axes
1. **Complexity progression** (same item, more advanced)
   - Simple cutting board → Edge grain cutting board → End grain cutting board
   - Basic shelf → Adjustable shelf → Floating shelf with hidden mounting

2. **Category progression** (increasingly complex items)
   - Cutting board → Jewelry box → Shelf → Stool → Chair → Table → Cabinet

3. **Volume progression** (scaling production)
   - Single items → Small batches → Mass production
   - Unlocks batch operations and assembly line setups

### Component System
Multi-level assembly for complex projects:
```
Example: Dining Table
├── Tabletop
│   ├── Boards (glued into panel)
│   └── Edge banding
├── Apron assembly
│   ├── Apron pieces (4x)
│   └── Corner blocks
└── Legs (4x)
    ├── Turned on lathe
    └── Sanded & finished
```

### Glue-Up Operations
- Simple time-based operation (like other machine operations)
- Multiple boards → panels
- Component assembly → final products
- No complex clamp management - just time to dry

## Business & Resource Management

### Waste Management System
- **Sawdust generation**
  - Visual particle effects during operations
  - Accumulates requiring periodic cleanup?
  - Can sell to particle board manufacturers
  - Advanced: Dust collection system upgrade
- **Offcuts & scraps**
  - Can be used for small projects (coasters, small boxes)
  - Sell as kindling/firewood
  - Feed into chip production?

### Machine Maintenance
- Machines gradually lose efficiency over time
- Maintenance restores to 100% efficiency
- Could be automatic with hired help later?
- Visual indicators (dust buildup, worn blades)

### Commission System Evolution
- Start with simple, single-operation items
- Progress to multi-component assemblies
- Custom requests with specific requirements
  - Wood species preferences
  - Size specifications
  - Finish requirements
- Reputation affects commission quality/complexity

## Production Optimization

### Templates & Repeatability
- **Templates are essential for non-rectangular identical parts**
  - Required when a project needs multiple curved/shaped pieces
  - Create template → use with router/bandsaw to duplicate
  - Reusable across multiple projects
  - Example: 4 identical curved chair backs, shaped table legs
- **Template routing process**
  - Make master template (bandsaw, careful hand work)
  - Rough cut pieces close to shape
  - Template route to exact match

### Alternative Production Paths
Allow multiple ways to achieve the same result:
- **Example: Creating a mortise**
  - Drill press + chisel (slow, early game)
  - Mortising machine (dedicated, fast)
  - Router with jig (versatile)
  - CNC router (automated)

### Batch Processing
- Set up jigs once, run multiple pieces
- Assembly line organization
- Efficiency bonuses for repeated operations

### Material Flow Optimization
- Shop layout affects efficiency
- Material staging areas
- Tool/jig storage accessibility
- Finishing area separation (dust-free zone)

## Potential Specialization Paths

### Furniture Making
- Focus on large pieces
- Complex joinery
- Upholstery integration?

### Fine Woodworking
- Jewelry boxes, decorative items
- Inlay work?
- Exotic wood usage

### Production Woodworking
- Batch production focus
- Jigs and templates
- CNC integration

### Wood Turning
- Lathe specialization
- Bowls, vases, spindles
- Different wood preparation needs

## UI/UX Considerations

### Visual Feedback Systems
- Sawdust particles during cuts
- Wood shavings for planing
- Progress bars for multi-step operations
- Quality indicators on finished products

### Information Display
- Material requirements preview
- Operation time estimates
- Efficiency metrics
- Waste generation warnings

## Future Expansion Ideas

### Seasonal/Special Events
- Holiday ornament commissions
- Craft fair preparations
- Custom order rushes

### Advanced Materials
- Exotic woods with special properties
- Reclaimed wood with unique character
- Live edge slabs for premium products

### Business Expansion
- **Employee/Apprentice System**
  - Hire workers to operate machines
  - Assign tasks while you work elsewhere
  - Scale up production capacity
  - Training system to improve employee efficiency?
- Opening a showroom
- Online sales integration
- Teaching classes for passive income

## Skill & Progression Systems

### Player Skill System
- **Skill point system** (preferred over passive experience)
  - Earn experience points from completing projects
  - Spend skill points on perks/upgrades
  - Potential skill trees for different specializations
- **Possible skill perks:**
  - Faster operation speeds for specific machine types
  - Reduced material waste
  - Ability to eyeball measurements (skip some layout steps?)
  - Batch operation bonuses
  - Better commission negotiation (higher prices)
  - Unlock advanced techniques
  - Quality bonuses that increase sale value
  - Employee training speed bonuses

## Machine Tier System

### Progressive Machine Upgrades
Each machine type has multiple tiers representing quality/capability:

**Table Saw Evolution:**
- **Jobsite saw** (120V, portable, limited power)
  - Basic ripping and crosscutting
  - Limited width capacity
  - Slower, less precise
- **Contractor/Hybrid saw** (220V)
  - Better fence system
  - More power for hardwoods
  - Dust collection hookups
- **Cabinet saw** (220V, professional)
  - Precise, repeatable cuts
  - Large capacity
  - Faster operation
- **Industrial saw** (3-phase, production)
  - Continuous operation
  - Highest speed/precision
  - Advanced safety features

### Power Requirements Drive Shop Progression
- **Garage (120V only)**: Limits to entry-level machines
- **Hobby Shop (120V + 220V)**: Enables serious equipment
- **Pro Shop (3-phase power)**: Industrial machinery unlocked

## Advanced Material Challenges

### Working with Slabs
- **Unique slab challenges:**
  - Flattening operations (router sled, hand planes)
  - Dealing with irregular edges
  - Crack filling with epoxy?
  - Much heavier/harder to move
- Live edge products command premium prices
- Requires special handling and storage

### Size Complexity Scaling
- **Larger pieces = longer operation times**
  - Exponential scaling on basic tools
  - Linear scaling on professional tools
  - Negligible impact on industrial/CNC
- Examples:
  - Cutting a 2" thick slab on jobsite saw: 3x time
  - Same cut on industrial saw: 1.2x time
  - Moving large pieces between machines takes longer

## Storage & Organization Systems

### Material Storage
- **Limited carrying capacity** (replace infinite inventory)
- **Storage solutions:**
  - Lumber racks (vertical/horizontal)
  - Offcut bins
  - Hardware organizers
  - Finishing supplies cabinet
- **Organization affects efficiency:**
  - Searching for materials wastes time
  - Good organization provides speed bonuses
  - Visual indicators for full/empty storage

### Material Handling
- **Weight/size considerations:**
  - Can only carry limited quantity
  - Large pieces require special handling
  - May need helper or equipment for big items
- **Material carts/dollies** as upgrades
- **Overhead crane** for industrial shop?

## Questions Resolved

1. ~~How detailed should the glue-up system be?~~ → Simple time-based operation
2. ~~Should finishing have quality levels?~~ → No, complexity comes from simple vs advanced product variants
3. ~~Hardware (hinges, pulls, etc.)?~~ → Purchase complete, install during assembly
4. ~~Should templates be reusable?~~ → Yes, essential for making identical non-rectangular parts
5. ~~Machine maintenance?~~ → Skip this, not fun
6. ~~Skill/experience system?~~ → Yes, skill points for perks/upgrades
7. ~~Wood movement/seasonal changes?~~ → Skip this
8. Integration of non-wood materials (glass, metal, upholstery)?

## Implementation Priority

### Phase 1: Core Systems
- Sanding & finishing
- Basic joinery abstractions
- Table saw with basic operations

### Phase 2: Expansion
- Component assembly system
- Glue-ups
- Additional machines (planer, jointer, band saw)

### Phase 3: Advanced Features
- Jigs and fixtures
- Alternative production paths
- CNC and automation

### Phase 4: Polish
- Sawdust/waste system
- Maintenance mechanics
- Specialization paths