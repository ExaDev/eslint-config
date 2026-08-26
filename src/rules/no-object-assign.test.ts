import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import rule from './no-object-assign';

// This rule is built with ESLintUtils.RuleCreator (needed for typed TSESTree node access and AST_NODE_TYPES comparisons), which plain eslint's own RuleTester cannot type-check a rule against. No type information is actually needed at lint time (it never touches the type checker), so parserOptions.project/projectService is deliberately omitted here.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('no-object-assign', rule, {
  valid: [
    'const merged = { ...target, ...source };',
    'target.prop = value;',
    // A user-defined object merely named `Object` calling its own `.assign` is not the global -- this rule matches syntactically (like the rest of this plugin's rules), so only the exact `Object.assign` shape is flagged; a differently-named or non-member-expression call is out of scope by construction.
    'Objects.assign(target, source);',
    'Object.freeze(target);',
    'Object.assign;', // reference, not a call
    'Object["assign"](target, source);', // computed member access -- out of scope for this syntactic check
  ],
  invalid: [
    // Undeclared (global) target -- no local binding to resolve, so no reassignment suggestion is offered, just the plain report.
    {
      code: 'Object.assign(target, source);',
      errors: [{ messageId: 'unsound' }],
    },
    {
      code: 'Object.assign(target, { key: value });',
      errors: [{ messageId: 'unsound' }],
    },
    // Fresh object literal target, used as a statement -- automatically fixed, wrapped in parens since a bare leading `{` would otherwise be misparsed as a block.
    {
      code: 'Object.assign({}, a, b);',
      output: '({ ...a, ...b });',
      errors: [{ messageId: 'unsound' }],
    },
    // Fresh object literal target carrying its own properties, used as a sub-expression -- no parens needed.
    {
      code: 'const merged = Object.assign({ x: 1 }, a, b);',
      output: 'const merged = { x: 1, ...a, ...b };',
      errors: [{ messageId: 'unsound' }],
    },
    // Existing `let` binding, mutated as a bare statement -- a reassignment suggestion is offered (never an automatic fix, since it changes the object's identity), because the binding is genuinely reassignable.
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
    // Existing `const` binding -- reassignment is not legal, so no suggestion is offered at all.
    {
      code: 'const target = {}; Object.assign(target, source);',
      errors: [{ messageId: 'unsound' }],
    },
    // A function parameter is a resolvable, reassignable binding -- the suggestion is offered, carrying the same explicit "changes the reference" caveat a developer must judge for themselves (reassigning a parameter inside the function body would NOT be visible to the caller's own reference).
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
    // Target consumed as a value (not a bare statement) -- no suggestion, since prefixing `target = ` would not produce a valid replacement expression in this position.
    {
      code: 'let target = {}; const result = Object.assign(target, source);',
      errors: [{ messageId: 'unsound' }],
    },
  ],
});
