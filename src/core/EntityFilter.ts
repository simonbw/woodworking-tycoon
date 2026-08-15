import type { Entity } from "./entity/Entity";

export type EntityFilter<T extends Entity> = (e: Entity) => e is T;
