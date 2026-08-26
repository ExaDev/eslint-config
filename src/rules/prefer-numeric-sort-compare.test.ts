import { RuleTester } from '@typescript-eslint/rule-tester';
import rule from './prefer-numeric-sort-compare';

// This rule reads real type information (getTypeAtLocation/isArrayType/getTypeArguments), so the tester needs a genuine TypeScript project. `projectService.allowDefaultProject` lets each inline code snippet below run against an ad hoc single-file project rather than needing real fixture files on disk -- the pattern typescript-eslint's own docs recommend for testing a type-aware rule with inline code.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

ruleTester.run('prefer-numeric-sort-compare', rule, {
  valid: [
    // A string array is @typescript-eslint/require-array-sort-compare's own domain -- lexicographic order is the CORRECT default there, so this rule must not fire.
    "declare const values: string[]; values.sort();",
    // A mixed (string | number)[] union is ambiguous: no single compare function is obviously right, so this rule stays out of scope even though require-array-sort-compare itself would still separately flag the missing compare function.
    "declare const values: (string | number)[]; values.sort();",
    // An 'any[]' array carries no real element-type information to reason about.
    "declare const values: any[]; values.sort();",
    // An 'unknown[]' array is the same -- the element type is deliberately opaque.
    "declare const values: unknown[]; values.sort();",
    // A compare function is already provided -- nothing to suggest, regardless of element type.
    "declare const values: number[]; values.sort((a, b) => a - b);",
    // '.toSorted()' with a compare function already provided is equally out of scope.
    "declare const values: number[]; values.toSorted((a, b) => b - a);",
    // A bare function call named 'sort' -- not a method call at all, so there is no MemberExpression callee to inspect.
    'declare const sort: () => void; sort();',
    // Computed member access ('obj[\'sort\']()') is out of scope by construction, matching this codebase's own convention elsewhere (e.g. no-object-assign) of only matching non-computed member expressions.
    "declare const values: number[]; values['sort']();",
    // An unrelated method sharing neither name is trivially out of scope.
    'declare const values: number[]; values.map((x) => x);',
    // A receiver that isn't an array at all, even though it happens to expose its own same-named method.
    'declare const obj: { sort(): void }; obj.sort();',
  ],
  invalid: [
    // A plain 'number[]'-typed variable's bare '.sort()'.
    {
      code: 'declare const values: number[]; values.sort();',
      errors: [
        {
          messageId: 'preferNumericCompare',
          data: { method: 'sort' },
          suggestions: [
            {
              messageId: 'addAscendingCompare',
              output: 'declare const values: number[]; values.sort((a, b) => a - b);',
            },
          ],
        },
      ],
    },
    // A number-array LITERAL's bare '.sort()' -- the receiver need not be a named variable.
    {
      code: '[3, 1, 2].sort();',
      errors: [
        {
          messageId: 'preferNumericCompare',
          data: { method: 'sort' },
          suggestions: [
            {
              messageId: 'addAscendingCompare',
              output: '[3, 1, 2].sort((a, b) => a - b);',
            },
          ],
        },
      ],
    },
    // '.toSorted()' on a number array -- the same lexicographic-default bug, via the non-mutating sibling method.
    {
      code: 'declare const values: number[]; values.toSorted();',
      errors: [
        {
          messageId: 'preferNumericCompare',
          data: { method: 'toSorted' },
          suggestions: [
            {
              messageId: 'addAscendingCompare',
              output: 'declare const values: number[]; values.toSorted((a, b) => a - b);',
            },
          ],
        },
      ],
    },
  ],
});
