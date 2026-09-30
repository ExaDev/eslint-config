import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { hasUseClientDirective } from './use-client-directive';

// A probe rule reporting what hasUseClientDirective says about each file's program.
const probe = ESLintUtils.RuleCreator((name) => name)<[], 'marked' | 'unmarked'>({
  name: 'probe',
  meta: { type: 'problem', docs: { description: 'probe' }, schema: [], messages: { marked: 'marked', unmarked: 'unmarked' } },
  defaultOptions: [],
  create(context) {
    return {
      [AST_NODE_TYPES.Program](node) {
        context.report({ node, messageId: hasUseClientDirective(node) ? 'marked' : 'unmarked' });
      },
    };
  },
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const marked = (code: string) => ({ code, errors: [{ messageId: 'marked' as const }] });
const unmarked = (code: string) => ({ code, errors: [{ messageId: 'unmarked' as const }] });

ruleTester.run('hasUseClientDirective', probe, {
  valid: [],
  invalid: [
    marked('"use client";\nexport const a = 1;'),
    marked("'use client';\nexport const a = 1;"),
    marked('"use client"\nexport const a = 1;'),
    // Other directives may come first, and comments are not statements.
    marked('"use strict";\n"use client";\nexport const a = 1;'),
    marked('// note\n/* block */\n"use client";'),
    unmarked('import a from "a";\n"use client";'),
    unmarked('export const a = 1;\n"use client";'),
    unmarked('foo();\n"use client";'),
    unmarked('export function f() { "use client"; }'),
    unmarked('("use client");\nexport const a = 1;'),
    unmarked('"use server";\nexport const a = 1;'),
    unmarked('"use client-side";'),
    unmarked(''),
  ],
});
