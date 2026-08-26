import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-enum-reverse-lookup-widening';

// This rule reads real type information (getTypeAtLocation/getIndexInfoOfType), so the tester needs a genuine TypeScript project. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project rather than needing real fixture files on disk -- the pattern typescript-eslint's own docs recommend for testing a type-aware rule with inline code.
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
    // A numeric literal index is a concrete, reviewable value at the call site -- out of this rule's scope even though tsc itself does not range-check it either.
    `${ENUM_DECL} const label: string = Direction[0];`,
    // A string enum has no reverse mapping at all -- indexing it with a number is a real compile error on its own (no numeric index signature exists), and this rule must not additionally false-positive on top of that.
    "enum Colour { Red = 'red', Blue = 'blue' } declare const n: number; const c = Colour[n];",
    // A non-enum object indexed by a number is out of scope, even with a matching numeric index signature.
    'declare const record: Record<number, string>; declare const n: number; const v = record[n];',
    // Indexing an enum with a string key (name -> value direction) is unaffected -- not a reverse (number -> name) lookup at all.
    `${ENUM_DECL} const value: Direction = Direction['Up'];`,
    // A bare, non-literal string index is neither NumberLike nor a literal -- out of scope for a rule specifically about the number -> name reverse lookup.
    `${ENUM_DECL} declare const key: 'Up' | 'Down'; const value = Direction[key];`,
  ],
  invalid: [
    // Bare non-literal number index, not inside a typed VariableDeclarator -- plain report, no suggestion.
    {
      code: `${ENUM_DECL} declare const n: number; console.log(Direction[n]);`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // Bare non-literal number index as a return value -- plain report, no suggestion (no annotation to rewrite).
    {
      code: `${ENUM_DECL} function f(): string { declare const n: number; return Direction[n]; }`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // The VariableDeclarator-with-'string'-annotation case -- report WITH the suggestion, rewriting the annotation to 'string | undefined'.
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
    // A DIFFERENT enum's member as the index -- EnumLike and isLiteral() are both true here too, but Other.A is no more a valid Direction index than the bare literal 999 is (confirmed: Direction[Other.A] compiles clean under tsc --strict and is undefined at runtime).
    {
      code: `${ENUM_DECL} enum Other { A = 999 } console.log(Direction[Other.A]);`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
    // A generic parameter constrained to 'number' -- its own type (a bare type parameter) carries none of NumberLike/EnumLike/Literal directly; only its resolved base constraint does (confirmed via the TS compiler API: getBaseConstraintOfType(T) is 'number' here, and is undefined for every concrete type already covered above).
    {
      code: `${ENUM_DECL} function g<T extends number>(n: T): string { return Direction[n]; }`,
      errors: [{ messageId: 'widening', data: { enumName: 'Direction' } }],
    },
  ],
});
