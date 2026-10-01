import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { describeCompilerOptionValue, effectiveCompilerOption, isScalarOptionValue, parseRequirement, resolveCompilerOptions } from './compiler-option-values';

describe('isScalarOptionValue', () => {
  it('accepts a boolean, a number and a string and nothing else', () => {
    expect([true, 0, 'es2022'].every(isScalarOptionValue)).toBe(true);
    expect([undefined, null, {}, [], Symbol.iterator].some(isScalarOptionValue)).toBe(false);
  });
});

describe('effectiveCompilerOption', () => {
  it('names TypeScript 5.4, where computedOptions first appears, as the minimum when the compiler does not export it', () => {
    const original: (target: object, key: PropertyKey) => unknown = Reflect.get.bind(Reflect);
    const spy = vi.spyOn(Reflect, 'get').mockImplementation((target, key) => (key === 'computedOptions' ? undefined : original(target, key)));
    try {
      expect(() => effectiveCompilerOption({}, 'skipLibCheck')).toThrow(/requires TypeScript 5\.4 or later/u);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns the written value of a plain flag', () => {
    expect(effectiveCompilerOption({ skipLibCheck: true }, 'skipLibCheck')).toBe(true);
    expect(effectiveCompilerOption({ skipLibCheck: false }, 'skipLibCheck')).toBe(false);
  });

  it('falls back to the plain default the compiler documents for an unset flag', () => {
    expect(effectiveCompilerOption({}, 'skipLibCheck')).toBe(false);
    expect(effectiveCompilerOption({}, 'verbatimModuleSyntax')).toBe(false);
  });

  it('leaves an option whose unset state is neither true nor false undefined', () => {
    expect(effectiveCompilerOption({}, 'allowUnreachableCode')).toBeUndefined();
    expect(effectiveCompilerOption({ allowUnreachableCode: false }, 'allowUnreachableCode')).toBe(false);
  });

  it('follows strict for each flag strict controls, and lets an explicit value win', () => {
    expect(effectiveCompilerOption({ strict: true }, 'strictNullChecks')).toBe(true);
    expect(effectiveCompilerOption({ strict: false }, 'strictNullChecks')).toBe(false);
    expect(effectiveCompilerOption({ strict: true, strictNullChecks: false }, 'strictNullChecks')).toBe(false);
    expect(effectiveCompilerOption({ strict: false, noImplicitAny: true }, 'noImplicitAny')).toBe(true);
  });

  it('returns the enum member for an enum-valued option', () => {
    expect(effectiveCompilerOption({ target: ts.ScriptTarget.ES2022 }, 'target')).toBe(ts.ScriptTarget.ES2022);
  });
});

describe('parseRequirement', () => {
  it('requires a flag to be exactly the stated boolean', () => {
    expect(parseRequirement('strict', true)).toStrictEqual({ name: 'strict', accepted: [true], spelled: ['true'] });
    expect(parseRequirement('skipLibCheck', false)).toStrictEqual({ name: 'skipLibCheck', accepted: [false], spelled: ['false'] });
  });

  it('converts each tsconfig spelling of an enum option to the enum member, ignoring case', () => {
    expect(parseRequirement('target', ['ES2022', 'esnext'])).toStrictEqual({
      name: 'target',
      accepted: [ts.ScriptTarget.ES2022, ts.ScriptTarget.ESNext],
      spelled: ['ES2022', 'esnext'],
    });
  });

  it('throws, naming the option and quoting the compiler, for an unknown option', () => {
    expect(() => parseRequirement('stricter', true)).toThrow(/cannot require stricter: true: Unknown compiler option 'stricter'/u);
  });

  it('throws for a value the option does not accept', () => {
    expect(() => parseRequirement('target', ['es1999'])).toThrow(/cannot require target: "es1999"/u);
    expect(() => parseRequirement('strict', ['yes'])).toThrow(/cannot require strict: "yes"/u);
  });

  it('throws for a list-valued option, which has no single value to compare', () => {
    expect(() => parseRequirement('lib', ['es2024'])).toThrow(/cannot require lib: "es2024"/u);
  });
});

describe('describeCompilerOptionValue', () => {
  it('spells an enum member as its tsconfig name', () => {
    expect(describeCompilerOptionValue('target', ts.ScriptTarget.ES2022)).toBe('es2022');
  });

  it('spells a flag as true or false and an unset option as not set', () => {
    expect(describeCompilerOptionValue('strict', true)).toBe('true');
    expect(describeCompilerOptionValue('strict', false)).toBe('false');
    expect(describeCompilerOptionValue('allowUnreachableCode', undefined)).toBe('not set');
  });
});

describe('resolveCompilerOptions', () => {
  const FIXTURES = join(import.meta.dirname, '__fixtures__', 'compiler-options');
  const programFor = (options: ts.CompilerOptions): ts.Program => ts.createProgram({ rootNames: [], options });

  it('returns the options of the named tsconfig with extends resolved, not the options the program was given', () => {
    // typescript-eslint adds noUnusedLocals and noUnusedParameters to the program it builds; the tsconfig says otherwise.
    const program = programFor({ configFilePath: join(FIXTURES, 'tsconfig.unused.json'), noUnusedLocals: true, noUnusedParameters: true });
    const resolved = resolveCompilerOptions(program);
    expect(resolved.noUnusedLocals).toBe(false);
    expect(resolved.noUnusedParameters).toBe(false);
    expect(resolved.strict).toBe(true);
    expect(resolved.target).toBe(ts.ScriptTarget.ES2022);
  });

  it('returns the program options when no tsconfig is behind the program', () => {
    expect(resolveCompilerOptions(programFor({ strict: true })).strict).toBe(true);
  });

  it('throws, naming the file, when the tsconfig cannot be read', () => {
    const missing = join(FIXTURES, 'tsconfig.missing.json');
    expect(() => resolveCompilerOptions(programFor({ configFilePath: missing }))).toThrow(new RegExp(`cannot read ${missing.replaceAll('.', '\\.')}`, 'u'));
  });
});
