export function idMaker(initialId: number = 1) {
  let id = initialId;

  return () => {
    return String(id++);
  };
}
