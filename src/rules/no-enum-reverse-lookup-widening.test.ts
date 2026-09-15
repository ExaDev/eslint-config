import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';
import rule from './no-enum-reverse-lookup-widening';

describe('rule metadata', () => {
  it('carries the exact docs url, built from this rule\'s own name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-enum-reverse-lookup-widening.ts');
  });

  it('carries the exact docs description', () => {
    expect(rule.meta.docs?.description).toBe(
      "Disallow indexing a numeric enum's reverse mapping with a bare (non-literal) number — TypeScript types the result as plain 'string' for any number, including one outside the enum's actual member range, where it genuinely returns 'undefined' at runtime.",
    );
  });

  it('carries the exact reported message text', () => {
    expect(rule.meta.messages.widening).toBe(
      "Indexing the numeric enum '{{ enumName }}' with a plain 'number' relies on its reverse mapping, which TypeScript types as 'string' for any number — including one outside the enum's actual members, where this genuinely returns 'undefined' at runtime. Narrow the index to a known member first (a runtime membership check against the enum's own values), or accept that the result may be 'undefined' and handle it.",
    );
  });

  it('declares no default options', () => {
    expect(rule.meta.defaultOptions).toEqual([]);
  });
});

// This rule reads real type information (getTypeAtLocation/getIndexInfoOfType), so the tester needs a genuine TypeScript project. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project rather than needing real fixture files on disk — the pattern typescript-eslint's own docs recommend for testing a type-aware rule with inline code.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

const ENUM_DECL = 'enum Direction { Up, Down }';

ruleTester.run('no-enum-reverse-lookup-widening', rule, {
  valid: [
    // A genuine enum member as the index is already a known, safe value.
    `${ENUM_DECL} const label: string = Direction[Direction.Up];`,
    // A numeric literal index is a concrete, reviewable value at the call site — out of this rule's scope even though tsc itself does not range-check it either.
    `${ENUM_DECL} const label: string = Direction[0];`,
    // A string enum has no reverse mapping at all — indexing it with a number is a real compile error on its own (no numeric index signature exists), and this rule must not additionally false-positive on top of that.
    "enum Colour { Red = 'red', Blue = 'blue' } declare const n: number; const c = Colour[n];",
    // A non-enum object indexed by a number is out of scope, even with a matching numeric index signature.
    'declare const record: Record<number, string>; declare const n: number; const v = record[n];',
    // Indexing an enum with a string key (name -> value direction) is unaffected — not a reverse (number -> name) lookup at all.
    `${ENUM_DECL} const value: Direction = Direction['Up'];`,
    // A bare, non-literal string index is neither NumberLike nor a literal — out of scope for a rule specifically about the number -> name reverse lookup.
    `${ENUM_DECL} declare const key: 'Up' | 'Down'; const value = Direction[key];`,
    // A plain, non-computed member access (`Direction.Up`, dot notation) is safe by the same assignability check a computed access to the enum's own member goes through: `Up`'s own property type is `Direction`'s own member type, which is always assignable to Direction's declared type, so this passes through without needing a dedicated "not computed" guard.
    `${ENUM_DECL} const value = Direction.Up;`,
  ],
  invalid: [
    // Bare non-literal number index, not inside a typed VariableDeclarator — plain report, no suggestion.
    {
      code: `${ENUM_DECL} declare const n: number; console.log(Direction[n]);`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // Bare non-literal number index as a return value — plain report, no suggestion (no annotation to rewrite).
    {
      code: `${ENUM_DECL} function f(): string { declare const n: number; return Direction[n]; }`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // The VariableDeclarator-with-'string'-annotation case — report WITH the suggestion, rewriting the annotation to 'string | undefined'.
    {
      code: `${ENUM_DECL} declare const n: number; const label: string = Direction[n];`,
      errors: [
        {
          messageId: 'widening',
          data: { enumName: 'Direction' },
          suggestions: [
            {
              messageId: 'suggestWidenAnnotation',
              output: `${ENUM_DECL} declare const n: number; const label: string | undefined = Direction[n];`,
            },
          ],
        },
      ],
    },
    // A DIFFERENT enum's member as the index — EnumLike and isLiteral() are both true here too, but Other.A is no more a valid Direction index than the bare literal 999 is (confirmed: Direction[Other.A] compiles clean under tsc --strict and is undefined at runtime).
    {
      code: `${ENUM_DECL} enum Other { A = 999 } console.log(Direction[Other.A]);`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // A generic parameter constrained to 'number' — its own type (a bare type parameter) carries none of NumberLike/EnumLike/Literal directly; only its resolved base constraint does (confirmed via the TS compiler API: getBaseConstraintOfType(T) is 'number' here, and is undefined for every concrete type already covered above).
    {
      code: `${ENUM_DECL} function g<T extends number>(n: T): string { return Direction[n]; }`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // A destructuring pattern (not a plain Identifier) as the declarator's own binding target — even though `[label]` carries a `: string` annotation of exactly the shape the suggestion looks for, the suggestion is specifically about widening ONE identifier's own declared type, which a pattern is not, so this gets a plain report with no suggestion.
    {
      code: `${ENUM_DECL} declare const n: number; const [label]: string = Direction[n];`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
  ],
});
