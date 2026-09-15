import { describe, expect, it } from 'vitest';
import { classifyTestFile, TEST_FILE_EXTENSIONS } from './test-file-helpers';

describe('TEST_FILE_EXTENSIONS', () => {
  it('is exactly the extension set this package\'s own TEST_FILE_PATTERNS glob (recommended-type-checked.ts) draws from', () => {
    expect(TEST_FILE_EXTENSIONS).toStrictEqual(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs']);
  });
});

describe('classifyTestFile', () => {
  it('is not a test file at all when the basename has no .test./.spec. segment', () => {
    expect(classifyTestFile('src/foo.ts')).toStrictEqual({ isTestFile: false, kind: undefined });
  });

  it('is not a test file when the extension is not a recognised one', () => {
    expect(classifyTestFile('src/foo.unit.test.py')).toStrictEqual({ isTestFile: false, kind: undefined });
  });

  it('is not a test file when the segment before the extension is neither "test" nor "spec"', () => {
    expect(classifyTestFile('src/foo.unit.check.ts')).toStrictEqual({ isTestFile: false, kind: undefined });
  });

  it('reports an undefined kind for a bare "name.test.ext" with no kind tag at all', () => {
    expect(classifyTestFile('src/foo.test.ts')).toStrictEqual({ isTestFile: true, kind: undefined });
  });

  it('reports an undefined kind for the degenerate two-segment basename "test.ext"', () => {
    expect(classifyTestFile('test.ts')).toStrictEqual({ isTestFile: true, kind: undefined });
  });

  it('extracts the kind tag immediately before ".test."', () => {
    expect(classifyTestFile('src/foo.unit.test.ts')).toStrictEqual({ isTestFile: true, kind: 'unit' });
  });

  it('extracts the kind tag immediately before ".spec." too', () => {
    expect(classifyTestFile('src/foo.integration.spec.ts')).toStrictEqual({ isTestFile: true, kind: 'integration' });
  });

  it('extracts the kind tag regardless of how many further dots the name part carries', () => {
    expect(classifyTestFile('src/foo.bar.baz.e2e.test.ts')).toStrictEqual({ isTestFile: true, kind: 'e2e' });
  });

  it('recognises every declared extension, not just .ts', () => {
    for (const extension of TEST_FILE_EXTENSIONS) {
      expect(classifyTestFile(`src/foo.unit.test.${extension}`)).toStrictEqual({ isTestFile: true, kind: 'unit' });
    }
  });

  it('reads only the basename, ignoring directory segments that might otherwise confuse a naive split', () => {
    expect(classifyTestFile('src/rules.unit/foo.integration.test.ts')).toStrictEqual({ isTestFile: true, kind: 'integration' });
  });
});
