import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';
import rule from './no-enum-number-widening';

describe('rule metadata', () => {
  it('carries the exact docs url, built from this rule\'s own name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-enum-number-widening.ts');
  });

  it('carries the exact docs description', () => {
    expect(rule.meta.docs?.description).toBe(
      'Disallow assigning a bare (non-literal) number where a numeric enum type is expected — TypeScript accepts any number for a numeric enum slot, not just its own members, once the value is not a literal the compiler can range-check.',
    );
  });

  it('carries the exact reported message text', () => {
    expect(rule.meta.messages.widening).toBe(
      "A plain 'number' value is being used where the numeric enum '{{ enumName }}' is expected. TypeScript does not verify the value is actually one of the enum's members here — narrow it to a known member first (e.g. a lookup/guard against the enum's own values), or accept a plain 'number' parameter instead of widening it implicitly.",
    );
  });

  it('declares no default options', () => {
    expect(rule.meta.defaultOptions).toEqual([]);
  });
});

// This rule reads real type information (getContextualType/getTypeAtLocation), so the tester needs a genuine TypeScript project. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project rather than needing real fixture files on disk — the pattern typescript-eslint's own docs recommend for testing a type-aware rule with inline code.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

const ENUM_DECL = 'enum Direction { Up, Down }';

ruleTester.run('no-enum-number-widening', rule, {
  valid: [
    // A genuine enum member is already the enum's own type — safe pass-through.
    `${ENUM_DECL} const d: Direction = Direction.Up;`,
    // A valid numeric literal is range-checked by tsc itself at the assignment.
    `${ENUM_DECL} const d: Direction = 0;`,
    // Not an enum-typed slot at all — out of scope.
    'const n: number = 5;',
    // A bare `return;` with no argument at all has nothing for this rule to check.
    'function f(): void { return; }',
    // A non-numeric enum has no equivalent widening hole (string enums require exact literal match).
    "enum Colour { Red = 'red', Blue = 'blue' } const c: Colour = Colour.Red;",
    // A value that is neither the enum's own type, a literal, nor even number-flagged at all is out of this rule's scope regardless of the (type-error-producing) enum-typed slot it's being forced into.
    `${ENUM_DECL} declare const b: boolean; const d: Direction = b;`,
    // A spread argument is never checked individually — there is no single expression at that call position for checkNode to examine.
    `${ENUM_DECL} function f(d: Direction): void {} declare const args: number[]; f(...args);`,
    // An ambient (declare) enum member's own actual type carries the bare `Enum` flag alone (confirmed via the compiler API: `Direction.Up`'s type here has flags exactly `Enum`, with EnumLiteral, Union, and isLiteral() all absent) — unlike a real enum member, whose type is `EnumLiteral`-flagged and IS a literal. `Enum` overlaps both EnumLike (it is one of EnumLike's own two constituent flags) and NumberLike (TypeScript's own NumberLike flag set includes Enum), so this is the one shape that can distinguish the early EnumLike pass-through from the later NumberLike-widening report — every other case tried already returns via one branch or the other regardless of which fires first.
    `declare ${ENUM_DECL} function f(): Direction { return Direction.Up; }`,
  ],
  invalid: [
    {
      code: `${ENUM_DECL} declare const n: number; const d: Direction = n;`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    {
      code: `${ENUM_DECL} declare const n: number; let d: Direction; d = n;`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    {
      code: `${ENUM_DECL} function f(): Direction { declare const n: number; return n; }`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    {
      code: `${ENUM_DECL} function f(d: Direction): void {} declare const n: number; f(n);`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
  ],
});
