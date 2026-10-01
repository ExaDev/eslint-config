import { describe, expect, it } from 'vitest';
import { createRunTracker } from './run-tracker';

// Each lint is a filename and the text linted; the result is which lints carry the finding.
function carriers(lints: readonly (readonly [string, string])[]): boolean[] {
  const carries = createRunTracker();

  return lints.map(([filename, text]) => carries(filename, text));
}

describe('createRunTracker', () => {
  it('lets only the first lint of a run carry the finding', () => {
    expect(carriers([['a.ts', 'a'], ['b.ts', 'b'], ['c.ts', 'c']])).toStrictEqual([true, false, false]);
  });

  it('starts a new run at a file already linted since the last carrying lint', () => {
    expect(carriers([['a.ts', 'a'], ['b.ts', 'b'], ['a.ts', 'a'], ['b.ts', 'b']])).toStrictEqual([true, false, true, false]);
  });

  it('starts a new run at a file linted since the last carrying lint that did not itself carry it', () => {
    expect(carriers([['a.ts', 'a'], ['b.ts', 'b'], ['b.ts', 'b'], ['a.ts', 'a']])).toStrictEqual([true, false, true, false]);
  });

  it('starts a new run when a run of one file lints it again with the same text', () => {
    expect(carriers([['a.ts', 'a'], ['a.ts', 'a']])).toStrictEqual([true, true]);
  });

  it('repeats the answer of a file linted again straight after itself with different text', () => {
    expect(carriers([['a.ts', 'a;'], ['a.ts', 'a'], ['b.ts', 'b;'], ['b.ts', 'b'], ['c.ts', 'c']])).toStrictEqual([true, true, false, false, false]);
  });

  it('gives no carrying lint to a run made only of files not linted since the last carrying lint', () => {
    // A run of a.ts and b.ts, then a run of c.ts and d.ts.
    expect(carriers([['a.ts', 'a'], ['b.ts', 'b'], ['c.ts', 'c'], ['d.ts', 'd']]).slice(2)).toStrictEqual([false, false]);
  });

  it('keeps the runs of separate trackers apart', () => {
    const first = createRunTracker();
    const second = createRunTracker();
    expect([first('a.ts', 'a'), second('a.ts', 'a'), first('b.ts', 'b'), second('b.ts', 'b')]).toStrictEqual([true, true, false, false]);
  });
});
