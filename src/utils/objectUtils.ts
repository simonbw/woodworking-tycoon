/**
 * Returns a new object with all undefined values removed.
 * Useful for conditionally spreading props to components that don't accept undefined values.
 */
export function omitUndefined<T extends Record<string, any>>(
  obj: T,
): Partial<T> {
  const result: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}
