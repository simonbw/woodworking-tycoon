export function isIterable<T>(obj: unknown): obj is Iterable<T> {
  return Symbol.iterator in Object(obj);
}
