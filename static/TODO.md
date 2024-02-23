# TODO

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

### Unlock System

Rather than all the features being available at once, it would help the playability of the game if features unlocked as the game progressed, so as not to overwhelm the player, and also to keep the gameplay interesting.

A basic order I imagine things being unlocked:

1. The

2.

## Content to add

This is more about using either the existing systems

### Shops

Different levels

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
- Each different shop

### Machine/Operation/Material Ideas

-

## Gameplay Ideas

These are ideas I'm less sure about that I don't necessarily have a system in mind for, but that I think could be good to explore in the future.

### Economics

Since this is a tycoon game, money should be an important part of it, and there should be

### Dust Collection

I think there could

### Wood Moisture Content
