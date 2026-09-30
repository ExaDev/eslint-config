import { RuleTester } from '@typescript-eslint/rule-tester';
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { moduleReferenceOf } from './import-policy';
import type { ImportPolicy } from './import-policy-options';

const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

const WORKER_MESSAGE = 'worker-safe code cannot use Node builtins';
const NODE_ONLY: readonly [readonly ImportPolicy[]] = [
  [{ files: ['src/worker/**'], deny: [{ specifiers: ['fs', 'path'], message: WORKER_MESSAGE }] }],
];
const WORKER_FILE = 'src/worker/main.ts';
const restricted = (specifier: string, message = WORKER_MESSAGE) => ({ messageId: 'restricted' as const, data: { specifier, message } });

function isProgram(node: unknown): node is TSESTree.Program {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === AST_NODE_TYPES.Program;
}

function parseProgram(code: string): TSESTree.Program {
  const { ast } = tseslint.parser.parseForESLint(code);
  if (!isProgram(ast)) throw new Error('Unreachable: the TypeScript parser always returns a Program.');

  return ast;
}

// An expression statement stands for its expression, which is the node the rule visits for `import()` and `require()`.
function firstNode(code: string): TSESTree.Node {
  const [statement] = parseProgram(code).body;
  if (statement === undefined) throw new Error('Unreachable: every snippet has a statement.');

  return statement.type === AST_NODE_TYPES.ExpressionStatement ? statement.expression : statement;
}

describe('import-policy metadata', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/import-policy.ts');
  });
});

describe('moduleReferenceOf', () => {
  const firstStatementReference = (code: string) => moduleReferenceOf(firstNode(code), () => true);

  it('returns nothing for a node that is not a module reference', () => {
    expect(firstStatementReference('const x = 1;')).toBeUndefined();
    expect(firstStatementReference('export const x = 1;')).toBeUndefined();
    expect(firstStatementReference('export { x };')).toBeUndefined();
    expect(firstStatementReference('import x = Foo.Bar;')).toBeUndefined();
    expect(firstStatementReference('import(name);')).toBeUndefined();
    expect(firstStatementReference('require(name);')).toBeUndefined();
    expect(firstStatementReference('require("a", "b");')).toBeUndefined();
    expect(firstStatementReference('require();')).toBeUndefined();
  });

  it('describes the names each import form brings in', () => {
    expect(firstStatementReference("import d, { a as b, 'str' as c } from 'm';")?.names).toStrictEqual(['default', 'a', 'str']);
    expect(firstStatementReference("import * as ns from 'm';")?.names).toStrictEqual(['*']);
    expect(firstStatementReference("import 'm';")?.names).toStrictEqual([]);
    expect(firstStatementReference("export { a as b, c } from 'm';")?.names).toStrictEqual(['a', 'c']);
    expect(firstStatementReference("export * from 'm';")?.names).toStrictEqual(['*']);
  });

  it('marks exactly the erased forms as type-only', () => {
    const typeOnly = (code: string) => firstStatementReference(code)?.typeOnly;
    expect(typeOnly("import type { A } from 'm';")).toBe(true);
    expect(typeOnly("import { type A, type B } from 'm';")).toBe(true);
    expect(typeOnly("import { type A, b } from 'm';")).toBe(false);
    expect(typeOnly("import 'm';")).toBe(false);
    expect(typeOnly("import d from 'm';")).toBe(false);
    expect(typeOnly("export type { A } from 'm';")).toBe(true);
    expect(typeOnly("export { type A } from 'm';")).toBe(true);
    expect(typeOnly("export { type A, b } from 'm';")).toBe(false);
    expect(typeOnly("export type * from 'm';")).toBe(true);
    expect(typeOnly("export * from 'm';")).toBe(false);
    expect(typeOnly("import type x = require('m');")).toBe(true);
    expect(typeOnly("import x = require('m');")).toBe(false);
    expect(typeOnly("import('m');")).toBe(false);
    expect(typeOnly("require('m');")).toBe(false);
  });

  it('reads static specifiers from every form', () => {
    expect(firstStatementReference("import x = require('m');")?.specifier).toBe('m');
    expect(firstStatementReference('import(`m`);')?.specifier).toBe('m');
    expect(firstStatementReference("require('m');")?.specifier).toBe('m');
    expect(firstStatementReference('type T = number;')).toBeUndefined();
  });

  it('ignores require when it is not the global', () => {
    expect(moduleReferenceOf(firstNode("require('m');"), () => false)).toBeUndefined();
  });
});

ruleTester.run('import-policy', rule, {
  valid: [
    // Out of scope, or no policy at all.
    { code: "import fs from 'fs';", filename: 'src/server/main.ts', options: NODE_ONLY },
    { code: "import fs from 'fs';", filename: WORKER_FILE, options: [[]] },
    { code: "import fs from 'fs';", filename: '../outside/worker.ts', options: NODE_ONLY },
    // Not a restricted specifier.
    { code: "import { x } from './local';\nimport z from 'zod';", filename: WORKER_FILE, options: NODE_ONLY },
    { code: "import fsevents from 'fsevents';", filename: WORKER_FILE, options: NODE_ONLY },
    // An exception edge spelt with a leading ./ still lifts the ban on that file.
    {
      code: "import fs from 'fs';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/worker/**'], deny: [{ specifiers: ['fs'], message: WORKER_MESSAGE }], exceptEdges: [{ file: `./${WORKER_FILE}`, specifier: 'fs', reason: 'needed' }] }]],
    },
    // ignores removes a file from a policy.
    {
      code: "import fs from 'fs';",
      filename: 'src/worker/node-only.ts',
      options: [[{ files: ['src/worker/**'], ignores: ['src/worker/node-only.ts'], deny: [{ specifiers: ['fs'], message: WORKER_MESSAGE }] }]],
    },
    // importNames restricts the ban to those names.
    {
      code: "import { readFile } from 'fs';\nimport type { Stats } from 'fs';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], importNames: ['writeFile'], message: 'no writes' }] }]],
    },
    { code: "import 'fs';", filename: WORKER_FILE, options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], importNames: ['writeFile'], message: 'no writes' }] }]] },
    // allowTypeImports exempts every erased form and nothing else.
    {
      code: "import type { A } from 'fs';\nimport { type B } from 'fs';\nexport type { C } from 'fs';\ntype D = import('fs').D;\nimport type E = require('fs');",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], allowTypeImports: true, message: WORKER_MESSAGE }] }]],
    },
    // A computed specifier and a shadowed require cannot be judged syntactically.
    { code: 'import(name);\nrequire(name);', filename: WORKER_FILE, options: NODE_ONLY },
    { code: "function f(require: (s: string) => void) { require('fs'); }", filename: WORKER_FILE, options: NODE_ONLY },
    { code: "const require = (s: string) => s;\nrequire('fs');", filename: WORKER_FILE, options: NODE_ONLY },
    // confine: allowed inside onlyIn, including type imports when allowed.
    {
      code: "import Anthropic from '@anthropic-ai/sdk';",
      filename: 'src/agent/adapter.ts',
      options: [[{ files: ['src/**'], confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/adapter.ts'] }] }]],
    },
    {
      code: "import type { Message } from '@anthropic-ai/sdk';",
      filename: 'src/other.ts',
      options: [[{ files: ['src/**'], confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/adapter.ts'], allowTypeImports: true }] }]],
    },
    // An exact edge is permitted for its own file and specifier only.
    {
      code: "import { db } from '../db/client';",
      filename: 'src/routes/legacy.ts',
      options: [
        [
          {
            files: ['src/routes/**'],
            deny: [{ specifiers: ['src/db'], message: 'routes go through the service layer' }],
            exceptEdges: [{ file: 'src/routes/legacy.ts', specifier: '../db/client', reason: 'legacy route predates the service layer' }],
          },
        ],
      ],
    },
    // An exception belongs to its policy: another policy still applies to other specifiers, and a second policy elsewhere does not.
    {
      code: "import fs from 'fs';",
      filename: 'src/x/a.ts',
      options: [
        [
          { files: ['src/y/**'], deny: [{ specifiers: ['fs'], message: 'y only' }] },
          { files: ['src/x/**'], deny: [{ specifiers: ['path'], message: 'x only' }] },
        ],
      ],
    },
  ],
  invalid: [
    // Each import form is covered.
    { code: "import fs from 'fs';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "import { join } from 'node:path';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('node:path')] },
    { code: "import { readFile } from 'fs/promises';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs/promises')] },
    { code: "import 'fs';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "import type { Stats } from 'fs';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "export { readFile } from 'fs';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "export * from 'fs';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "export * as fs from 'fs';", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "import fs = require('fs');", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "const fs = await import('fs');", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: 'const fs = await import(`fs`);', filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "const fs = require('fs');", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    { code: "type T = import('fs').Stats;", filename: WORKER_FILE, options: NODE_ONLY, errors: [restricted('fs')] },
    // Several violations in one file each report, in source order.
    {
      code: "import fs from 'fs';\nimport path from 'path';",
      filename: WORKER_FILE,
      options: NODE_ONLY,
      errors: [{ ...restricted('fs'), line: 1 }, { ...restricted('path'), line: 2 }],
    },
    // A wildcard specifier.
    {
      code: "import x from '@anthropic-ai/sdk/resources';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['@anthropic-ai/*'], message: 'wrap the SDK' }] }]],
      errors: [restricted('@anthropic-ai/sdk/resources', 'wrap the SDK')],
    },
    // importNames: the named import, a namespace, a default when listed, dynamic import and export * all take the banned name.
    {
      code: "import { writeFile, readFile } from 'fs';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], importNames: ['writeFile'], message: 'no writes' }] }]],
      errors: [restricted('fs', 'no writes')],
    },
    {
      code: "import * as fs from 'fs';\nconst other = await import('fs');\nexport * from 'fs';\nimport def from 'fs';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], importNames: ['writeFile'], message: 'no writes' }] }]],
      errors: [restricted('fs', 'no writes'), restricted('fs', 'no writes'), restricted('fs', 'no writes')].map((error, index) => ({ ...error, line: index + 1 })),
    },
    {
      code: "import def from 'fs';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], importNames: ['default'], message: 'no default' }] }]],
      errors: [restricted('fs', 'no default')],
    },
    // allowTypeImports does not exempt a value import alongside a type one.
    {
      code: "import { type A, b } from 'fs';",
      filename: WORKER_FILE,
      options: [[{ files: ['src/**'], deny: [{ specifiers: ['fs'], allowTypeImports: true, message: WORKER_MESSAGE }] }]],
      errors: [restricted('fs')],
    },
    // confine: outside onlyIn reports, with the default message listing where it is allowed and a custom one when given.
    {
      code: "import Anthropic from '@anthropic-ai/sdk';",
      filename: 'src/other.ts',
      options: [[{ files: ['src/**'], confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/*.ts', 'src/adapters/**'] }] }]],
      errors: [restricted('@anthropic-ai/sdk', 'it may only be imported in: src/agent/*.ts, src/adapters/**.')],
    },
    {
      code: "import Anthropic from '@anthropic-ai/sdk';",
      filename: 'src/other.ts',
      options: [[{ files: ['src/**'], confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/adapter.ts'], message: 'use the adapter' }] }]],
      errors: [restricted('@anthropic-ai/sdk', 'use the adapter')],
    },
    {
      code: "import type { Message } from '@anthropic-ai/sdk';",
      filename: 'src/other.ts',
      options: [[{ files: ['src/**'], confine: [{ specifiers: ['@anthropic-ai/sdk'], onlyIn: ['src/agent/adapter.ts'] }] }]],
      errors: [{ messageId: 'restricted' }],
    },
    // A relative specifier is resolved before matching.
    {
      code: "import { db } from '../db/client';",
      filename: 'src/routes/a.ts',
      options: [[{ files: ['src/routes/**'], deny: [{ specifiers: ['src/db'], message: 'routes go through the service layer' }] }]],
      errors: [restricted('../db/client', 'routes go through the service layer')],
    },
    // An exception covers one file and one specifier: a different file, or a different specifier from the same file, still reports.
    {
      code: "import { db } from '../db/client';",
      filename: 'src/routes/other.ts',
      options: [
        [
          {
            files: ['src/routes/**'],
            deny: [{ specifiers: ['src/db'], message: 'routes go through the service layer' }],
            exceptEdges: [{ file: 'src/routes/legacy.ts', specifier: '../db/client', reason: 'legacy' }],
          },
        ],
      ],
      errors: [{ messageId: 'restricted' }],
    },
    {
      code: "import { db } from '../db/other';",
      filename: 'src/routes/legacy.ts',
      options: [
        [
          {
            files: ['src/routes/**'],
            deny: [{ specifiers: ['src/db'], message: 'routes go through the service layer' }],
            exceptEdges: [{ file: 'src/routes/legacy.ts', specifier: '../db/client', reason: 'legacy' }],
          },
        ],
      ],
      errors: [{ messageId: 'restricted' }],
    },
    // Overlapping policies both apply to a file, which separate no-restricted-imports blocks could not do.
    {
      code: "import fs from 'fs';\nimport path from 'path';",
      filename: 'src/worker/a.ts',
      options: [
        [
          { files: ['src/**'], deny: [{ specifiers: ['fs'], message: 'from src' }] },
          { files: ['src/worker/**'], deny: [{ specifiers: ['path'], message: 'from worker' }] },
        ],
      ],
      errors: [restricted('fs', 'from src'), restricted('path', 'from worker')],
    },
    // An exception in one policy does not lift another policy's ban on the same edge.
    {
      code: "import fs from 'fs';",
      filename: 'src/worker/a.ts',
      options: [
        [
          { files: ['src/**'], deny: [{ specifiers: ['fs'], message: 'from src' }], exceptEdges: [{ file: 'src/worker/a.ts', specifier: 'fs', reason: 'needed' }] },
          { files: ['src/worker/**'], deny: [{ specifiers: ['fs'], message: 'from worker' }] },
        ],
      ],
      errors: [restricted('fs', 'from worker')],
    },
  ],
});
