import { b2i } from './common';

// Nearest returns the element of candidates
// nearest to x using the Levenshtein metric,
// or "" if none were promising.
export function nearest(x: string, candidates: string[]): string {
  // Ignore underscores and case when matching.
  const fold = (s: string): string => {
    return s.replace(/_/g, '').toLowerCase();
  };
  x = fold(x);

  let best: string = '';
  let bestD: number = (x.length + 1) / 2; // allow up to 50% typos
  for (const c of candidates) {
    const d = levenshtein(x, fold(c), bestD);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// levenshtein returns the non-negative Levenshtein edit distance
// between the byte strings x and y.
//
// If the computed distance exceeds max,
// the function may return early with an approximate value > max.
function levenshtein(x: string, y: string, max: number): number {
  // This implementation is derived from one by Laurent Le Brun in
  // Bazel that uses the single-row space efficiency trick
  // described at bitbucket.org/clearer/iosifovich.

  // Let x be the shorter string.
  if (x.length > y.length) {
    [x, y] = [y, x];
  }

  let i = 0;
  while (i < x.length) {
    if (x[i] !== y[i]) {
      x = x.slice(i);
      y = y.slice(i);
      break;
    }
    i++;
  }
  if (x === '') {
    return y.length;
  }

  const d = Math.abs(x.length - y.length);
  if (d > max) {
    return d; // excessive length divergence
  }

  const row = new Array<number>(y.length + 1);
  for (let i = 0; i < row.length; i++) {
    row[i] = i;
  }

  for (let i = 1; i <= x.length; i++) {
    row[0] = i;
    let best = i;
    let prev = i - 1;
    for (let j = 1; j <= y.length; j++) {
      const a = prev + b2i(x[i - 1] !== y[j - 1]); // substitution
      const b = 1 + row[j - 1]; // deletion
      const c = 1 + row[j]; // insertion
      const k = Math.min(a, Math.min(b, c));
      prev = row[j];
      row[j] = k;
      best = Math.min(best, k);
    }
    if (best > max) {
      return best;
    }
  }
  return row[y.length];
}
