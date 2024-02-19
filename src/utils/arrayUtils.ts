export function last<T>(array: ReadonlyArray<T>): T;
export function last(array: string): string;
export function last<T>(array: ReadonlyArray<T> | string): T | string {
  return array[array.length - 1];
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  ...keys: K[]
): Omit<T, K> {
  const result = { ...obj } as Omit<T, K>;
  keys.forEach((key) => {
    delete (result as any)[key];
  });
  return result;
}

export function pick<T extends object, K extends keyof T>(
  obj: T,
  ...keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    (result as any)[key] = obj[key];
  });
  return result;
}

export function objectValues<T extends object>(obj: T): T[keyof T][] {
  return Object.values(obj);
}

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export function objectEntries<T extends object>(obj: T): Entries<T> {
  return Object.entries(obj) as Entries<T>;
}

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function arrayEquals<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function findDuplicates<T>(items: T[]): T[] {
  const duplicates = new Set<T>();
  const seen = new Set<T>();
  for (const item of items) {
    if (seen.has(item)) {
      duplicates.add(item);
    }
    seen.add(item);
  }
  return [...duplicates];
}

export function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

export function countBy<T, K>(
  items: T[],
  keyFn: (item: T) => K
): Map<K, number> {
  const counts = new Map<K, number>();
  for (const item of items) {
    const key = keyFn(item);
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
  }
  return counts;
}
