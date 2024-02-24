# Woodworking Tycoon Roadmap

There's a ton to do in this game, so I figured it might be good to keep a list of things that we want to add.

## Systems to add

These are the larger scale things that will need writing new code to make.

### Time

We need a system for time in the game. Rather than everything happening instantly, things would be set to happen, and the game would "tick" and make them happen. Calling tick every frame will be easy, but the complex part will be

#### Player work queue

- There is a `workQueue` of items to perform well as an `actionAvailable` boolean.
- On each tick:
  - Set `actionAvailable` to `true`
  - If the `workQueue` is not empty:
    - Pop an item from `workQueue` and perform it
    - Set `actionAvailable` to `false`
- When player adds an `action`:
  - If `actionAvailable` is `true`:
    - Perform the action
    - Set `actionAvailable` to `false`
  - Else (`actionAvailable` is `false`)
    - Add `action` to `workQueue`

### Sounds

We should have a good system for playing sounds, and maybe also ambient sound loops and/or background music.

### Load/Save Game

The game should not reset every time.

This should be pretty easy since all the game state is in a nice JSON object that can be easily written to/loaded from `localStorage`. The biggest piece of work will be writing the zod schema to validate loaded saves.

### Layout Editing

We need a system on a separate page that allows you to place/move machines around the shop.

### System for choosing

### Tool system

### Unlock System

Rather than all the features being available at once, it would help the playability of the game if features unlocked as the game progressed, so as not to overwhelm the player, and also to keep the gameplay interesting.

A basic order I imagine things being unlocked:

1. You start with a pallet, a workspace, and a hand saw.
2. Once you

## Content to add

This is more about using either the existing systems

### Workshops

There should be a few different levels of workshop.

#### 1. Small Garage

- Mostly limited by space
- Can only use 120V tools

#### 2. Large garage

- Significantly more space
- Can use up to 220V tools

#### 3. Commercial Space

- Lots of space
- Can use 3-Phase tools

Questions:

- Should you be able to have more than one shop at once?
- Should the shops be strictly increasing in difficulty, or should there

Some interesting challenges some shops could have:

- Weird space layout, like very narrow, or many small rooms
- No electricity. Everything has to be done with hand tools
-

### Sounds

Events that should have sounds associated with them:

- Movement (small simple footstep sound)
- Pick up item (it would be extra cool if items had unique sounds)
- Drop item (it would be extra cool if items had unique sounds)
- Perform operation (it would be extra cool if each operation had a unique sound)
- Change screen

I think we also want to have some unique sets of ambient sounds or background music for:

- Store page
- Layout page? (or just stick with )
- Each different shop has its own soundtrack

### Machine/Operation/Material Ideas

#### Bandsaw

- Resawing
- special curved shapes

#### Planer

- Gets boards to desired thickness
- Provides a "planed" finish, which is faster to sand than a rough finish

#### Sanding

Boards should have a "surface finish" property
Possibly also a "squareness" property

You should be able to sand

#### Lathe

Lathe should be highly skill dependant

- Make round table legs
- Make bowls

Some related ideas would be:

- Tool Sharpening
- Attachments?

### Intermediate project ideas

Cutting board

-

## Gameplay Ideas

These are ideas I'm less sure about that I don't necessarily have a system in mind for, but that I think could be good to explore in the future.

### Economics

Since this is a tycoon game, money should be an important part of it. In general, there should be tradeoffs on how to spend money.

The simple type of question is just "is this purchase worth the cost". That applies to things like:

- Should I buy this machine?
- Should I buy these materials to build this more advanced
- Should I buy a bigger shop?

Some more complex questions could be about operating costs. Things like:

- If I buy this bigger shop, will I make enough money for the upkeep to be worth it?
- If I buy this tool/machine/shop, what else do I need to buy to fully utilize it?
- If I take out a loan to buy this tool/machine/shop, will having it now be worth paying the interest instead of waiting until I can

### Dust Collection

I think there could be a possibility for something cool involving dust collection in the future. Some things about it:

-

### Balance between hand tools and

### Wood Moisture Content

Another system that could just add complexity as well as

### Making Money

Making money is an important part of any tycoon game.

## Performance Optimization Possibilities

The game is already reaching performance limitations.
I think this is largely due to the react/svg combo.
I'm wondering if we could gain a lot of performance by switching to a canvas-based renderer for react instead of an SVG one.

Consider [@pixi/react](https://www.npmjs.com/package/@pixi/react).
