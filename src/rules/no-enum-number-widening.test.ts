import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './no-enum-number-widening';

// This rule reads real type information (getContextualType/getTypeAtLocation), so the tester needs a genuine TypeScript project. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project rather than needing real fixture files on disk -- the pattern typescript-eslint's own docs recommend for testing a type-aware rule with inline code.
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
    // A genuine enum member is already the enum's own type -- safe pass-through.
    `${ENUM_DECL} const d: Direction = Direction.Up;`,
    // A valid numeric literal is range-checked by tsc itself at the assignment.
    `${ENUM_DECL} const d: Direction = 0;`,
    // Not an enum-typed slot at all -- out of scope.
    'const n: number = 5;',
    // A non-numeric enum has no equivalent widening hole (string enums require exact literal match).
    "enum Colour { Red = 'red', Blue = 'blue' } const c: Colour = Colour.Red;",
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
