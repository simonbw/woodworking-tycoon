// export type WithRequired<T, K> = T & { [K]: T[K] }

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type Tuple<T, N extends number> = N extends N
  ? number extends N
    ? T[]
    : _TupleOf<T, N, []>
  : never;
type _TupleOf<T, N extends number, R extends unknown[]> = R["length"] extends N
  ? R
  : _TupleOf<T, N, [T, ...R]>;

export function objectKeysTuple<T extends object>(
  obj: T
): [keyof T, ...(keyof T)[]] {
  return Object.keys(obj) as [keyof T, ...(keyof T)[]];
}

export type Updater<T> = (oldGameState: T) => T;
export type UpdateFunction<T> = (updater: Updater<T>) => void;
