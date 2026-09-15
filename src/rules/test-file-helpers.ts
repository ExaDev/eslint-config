import { basenameOf } from './barrel-helpers';

// The extensions a real test/spec file can carry, matching this package's own long-established TEST_FILE_PATTERNS glob (see recommended-type-checked.ts) — both derive from this one list so they can never independently drift out of sync with each other. Typed as a plain `readonly string[]`, not a narrower `as const` literal tuple, specifically so `.includes()` below accepts an arbitrary `string` extension read from a real filename without needing a cast (this codebase bans them outright).
export const TEST_FILE_EXTENSIONS: readonly string[] = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];

export interface TestFileClassification {
  readonly isTestFile: boolean;
  readonly kind: string | undefined;
}

// A real test/spec file's basename always ends `<...>.test.<ext>` or `<...>.spec.<ext>`; the dot-segment immediately before that pair (if any) is the file's own declared "kind" tag — e.g. `foo.unit.test.ts` -> 'unit' — independent of how many further dots the remaining name part carries, since it is always the THIRD segment from the end regardless of how many precede it (`foo.bar.unit.test.ts` resolves the identical 'unit' kind). A bare `name.test.ext` (exactly three segments) has no kind tag at all: its own third-from-end segment is the base NAME, not a kind — a real kind tag needs a genuine fourth segment ahead of it (`name.kind.test.ext`) to exist as a distinct thing from the name.
const EXTENSION_INDEX = -1;
const TEST_OR_SPEC_INDEX = -2;
const KIND_INDEX = -3;
const SEGMENT_COUNT_WITH_A_REAL_KIND_TAG = 4;

export function classifyTestFile(filename: string): TestFileClassification {
  const segments = basenameOf(filename).split('.');
  const extension = segments.at(EXTENSION_INDEX);
  const testOrSpec = segments.at(TEST_OR_SPEC_INDEX);
  if (extension === undefined || !TEST_FILE_EXTENSIONS.includes(extension) || (testOrSpec !== 'test' && testOrSpec !== 'spec')) {
    return { isTestFile: false, kind: undefined };
  }
  return { isTestFile: true, kind: segments.length >= SEGMENT_COUNT_WITH_A_REAL_KIND_TAG ? segments.at(KIND_INDEX) : undefined };
}
