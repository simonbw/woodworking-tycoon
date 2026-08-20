import { Entity } from "./entity/Entity";

/**
 * Pairs sim entity classes with the view entities that draw them.
 *
 * Sim entities own the simulation state and never touch Pixi or the DOM.
 * When a game has a renderer, `Game.addEntity` consults this registry and
 * spawns the registered view as a child of the sim entity, so the view's
 * lifetime tracks its subject's. Headless games skip the lookup entirely —
 * views never exist there.
 *
 * Registration is per-concrete-class but lookups walk the prototype chain,
 * so a subclass without its own view inherits its parent's.
 */

type SimConstructor<T extends Entity = Entity> =
  (new (...args: any[]) => T) | (abstract new (...args: any[]) => T);

type ViewConstructor<S extends Entity> = new (sim: S) => Entity;

const registry = new Map<Function, ViewConstructor<Entity>>();

/** Register the view class to spawn alongside instances of a sim class. */
export function registerView<S extends Entity>(
  simClass: SimConstructor<S>,
  viewClass: ViewConstructor<S>,
): void {
  if (registry.has(simClass)) {
    throw new Error(`View already registered for ${simClass.name}`);
  }
  registry.set(simClass, viewClass as ViewConstructor<Entity>);
}

/** Remove a registration (mostly for tests). */
export function unregisterView(simClass: SimConstructor): void {
  registry.delete(simClass);
}

/**
 * Instantiate the view for a sim entity, or undefined if none is
 * registered for its class (or any superclass).
 */
export function createViewFor(sim: Entity): Entity | undefined {
  let ctor: Function | null = sim.constructor;
  while (ctor && ctor !== Object && ctor !== Function) {
    const ViewClass = registry.get(ctor);
    if (ViewClass) {
      return new ViewClass(sim);
    }
    ctor = Object.getPrototypeOf(ctor);
  }
  return undefined;
}
