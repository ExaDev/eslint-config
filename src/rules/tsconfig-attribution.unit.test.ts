import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createTsconfigAttribution } from './tsconfig-attribution';

const FIXTURES = join(import.meta.dirname, '__fixtures__', 'compiler-options');
const programFor = (options: ts.CompilerOptions): ts.Program => ts.createProgram({ rootNames: [], options });
const fromTsconfig = (name: string): ts.Program => programFor({ configFilePath: join(FIXTURES, name) });
const withoutTsconfig = programFor({});
const source = join(FIXTURES, 'source.ts');
const second = join(FIXTURES, 'second.ts');

describe('createTsconfigAttribution', () => {
  it('answers with the tsconfig the program was created from', () => {
    expect(createTsconfigAttribution()(fromTsconfig('tsconfig.once.json'), source)).toBe(join(FIXTURES, 'tsconfig.once.json'));
  });

  it('answers with nothing for a file never linted under a tsconfig and a program with none', () => {
    expect(createTsconfigAttribution()(withoutTsconfig, source)).toBeUndefined();
  });

  it('attributes a program with no tsconfig to the tsconfig the file was last linted under', () => {
    const attribute = createTsconfigAttribution();
    attribute(fromTsconfig('tsconfig.loose.json'), source);
    attribute(fromTsconfig('tsconfig.once.json'), source);
    expect(attribute(withoutTsconfig, source)).toBe(join(FIXTURES, 'tsconfig.once.json'));
  });

  it('does not attribute a file to a tsconfig that no longer lists it', () => {
    const attribute = createTsconfigAttribution();
    // tsconfig.second.json lists second.ts only, so it stands for a tsconfig that source.ts has since left.
    attribute(fromTsconfig('tsconfig.second.json'), source);
    attribute(fromTsconfig('tsconfig.second.json'), second);
    expect(attribute(withoutTsconfig, source)).toBeUndefined();
    expect(attribute(withoutTsconfig, second)).toBe(join(FIXTURES, 'tsconfig.second.json'));
  });

  it('keeps the files of separate attributions apart', () => {
    const first = createTsconfigAttribution();
    first(fromTsconfig('tsconfig.once.json'), source);
    expect(createTsconfigAttribution()(withoutTsconfig, source)).toBeUndefined();
  });
});
