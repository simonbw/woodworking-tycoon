export function extractFirstNumber(str: string): number {
  return Number(str.match(/\d+/)?.[0]);
}
