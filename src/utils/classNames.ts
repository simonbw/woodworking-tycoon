export function classNames(...classes: (string | undefined | false | null)[]) {
  return classes.filter((x) => Boolean(x)).join(" ");
}
