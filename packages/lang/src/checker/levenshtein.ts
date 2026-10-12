/**
 * Edit distance for "Did you mean …?" suggestions (E-UNKNOWN-NAME, Levenshtein ≤ 2).
 * Spec: docs/02-language/errors-and-diagnostics.md §Catalogue (E-UNKNOWN-NAME).
 * Invariants: integers only; compares UTF-16 code units (names are ASCII); stops early once every
 * alignment exceeds `cap`, so the cost per pair is bounded by the name length limit.
 */

/** The Levenshtein distance between `a` and `b`, or `cap + 1` when it is larger than `cap`. */
export function boundedDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const value = Math.min(substitution, (previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1);
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > cap) return cap + 1;
    previous = current;
  }
  return Math.min(previous[b.length] ?? 0, cap + 1);
}
