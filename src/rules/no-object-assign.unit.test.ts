import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import rule from './no-object-assign';

describe('rule metadata', () => {
  it('carries the exact docs url, built from this rule\'s own name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-object-assign.ts');
  });

  it('carries the exact docs description', () => {
    expect(rule.meta.docs?.description).toBe(
      "Disallow Object.assign, whose own type declarations do not check a source object's properties against the target's declared types — object spread does.",
    );
  });

  it('carries the exact reported message text', () => {
    expect(rule.meta.messages.unsound).toBe(
      "Object.assign does not verify that a source object's properties are assignable to the target's declared types, so a type mismatch here passes silently where a direct property assignment would be rejected. Use object spread ({ ...target, ...source }) to build a correctly type-checked replacement instead.",
    );
  });

  it('declares no default options', () => {
    expect(rule.meta.defaultOptions).toEqual([]);
  });
});

// This rule is built with ESLintUtils.RuleCreator (needed for typed TSESTree node access and AST_NODE_TYPES comparisons), which plain eslint's own RuleTester cannot type-check a rule against. No type information is actually needed at lint time (it never touches the type checker), so parserOptions.project/projectService is deliberately omitted here.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-object-assign', rule, {
  valid: [
    'const merged = { ...target, ...source };',
    'target.prop = value;',
    // A user-defined object merely named `Object` calling its own `.assign` is not the global — this rule matches syntactically (like the rest of this plugin's rules), so only the exact `Object.assign` shape is flagged; a differently-named or non-member-expression call is out of scope by construction.
    'Objects.assign(target, source);',
    'Object.freeze(target);',
    'Object.assign;', // reference, not a call
    'Object["assign"](target, source);', // computed member access — out of scope for this syntactic check
    // A private class field happens to share the name "assign" — non-computed member access syntax only ever carries an Identifier or a PrivateIdentifier as its property, and this rule's own callee.property.type check requires an Identifier specifically, so a PrivateIdentifier property (whose own `.name` is still the bare string "assign", with no leading `#`) must not be mistaken for the genuine `Object.assign` shape.
    'class C { #assign() {} m() { Object.#assign(); } }',
  ],
  invalid: [
    // Undeclared (global) target — no local binding to resolve, so no reassignment suggestion is offered, just the plain report.
    {
      code: 'Object.assign(target, source);',
      errors: [{ messageId: 'unsound' }],
    },
    {
      code: 'Object.assign(target, { key: value });',
      errors: [{ messageId: 'unsound' }],
    },
    // Fresh object literal target, used as a statement — automatically fixed, wrapped in parens since a bare leading `{` would otherwise be misparsed as a block.
    {
      code: 'Object.assign({}, a, b);',
      output: '({ ...a, ...b });',
      errors: [{ messageId: 'unsound' }],
    },
    // Fresh object literal target carrying its own properties, used as a sub-expression — no parens needed.
    {
      code: 'const merged = Object.assign({ x: 1 }, a, b);',
      output: 'const merged = { x: 1, ...a, ...b };',
      errors: [{ messageId: 'unsound' }],
    },
    // Existing `let` binding, mutated as a bare statement — a reassignment suggestion is offered (never an automatic fix, since it changes the object's identity), because the binding is genuinely reassignable.
    {
      code: 'let target = {}; Object.assign(target, source);',
      errors: [
        {
          messageId: 'unsound',
          suggestions: [
            {
              messageId: 'suggestSpreadReassign',
              output: 'let target = {}; target = { ...target, ...source };',
            },
          ],
        },
      ],
    },
    // Existing `let` binding with MULTIPLE sources — the suggestion joins them with ', ', not run together.
    {
      code: 'let target = {}; Object.assign(target, a, b);',
      errors: [
        {
          messageId: 'unsound',
          suggestions: [
            {
              messageId: 'suggestSpreadReassign',
              output: 'let target = {}; target = { ...target, ...a, ...b };',
            },
          ],
        },
      ],
    },
    // A fresh object-literal target with a spread source is not safely rewritable (a spread's own properties can't be individually re-spread without evaluating it twice), so it falls through to a plain report with no fix — distinct from the "every source is spreadable" fast path above.
    {
      code: 'Object.assign({}, a, ...b);',
      errors: [{ messageId: 'unsound' }],
    },
    // Existing `const` binding — reassignment is not legal, so no suggestion is offered at all.
    {
      code: 'const target = {}; Object.assign(target, source);',
      errors: [{ messageId: 'unsound' }],
    },
    // A function parameter is a resolvable, reassignable binding — the suggestion is offered, carrying the same explicit "changes the reference" caveat a developer must judge for themselves (reassigning a parameter inside the function body would NOT be visible to the caller's own reference).
    {
      code: 'function forceField(obj, key, value) { Object.assign(obj, { [key]: value }); }',
      errors: [
        {
          messageId: 'unsound',
          suggestions: [
            {
              messageId: 'suggestSpreadReassign',
              output: 'function forceField(obj, key, value) { obj = { ...obj, ...{ [key]: value } }; }',
            },
          ],
        },
      ],
    },
    // Target consumed as a value (not a bare statement) — no suggestion, since prefixing `target = ` would not produce a valid replacement expression in this position.
    {
      code: 'let target = {}; const result = Object.assign(target, source);',
      errors: [{ messageId: 'unsound' }],
    },
  ],
});
