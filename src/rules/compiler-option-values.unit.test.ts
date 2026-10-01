import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { describeCompilerOptionValue, effectiveCompilerOption, parseRequirement } from './compiler-option-values';

describe('effectiveCompilerOption', () => {
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
