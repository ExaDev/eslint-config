import type { Rule } from 'eslint';

// Bans if/switch/for/for-in/for-of/while/do-while/ternary outright -- for a composition-root package where a branch or loop is itself the exact kind of implicit, hard-to-audit conditional logic the package's own architecture is meant to prevent. A backend/strategy selection becomes a lookup table indexed by a validated key instead: no branch to audit, no path a reviewer can miss. Deliberately unscoped by this rule itself (unlike the barrel rules, which self-scope via `context.filename`) -- which files this applies to is a genuinely project-specific decision, wired via the consumer's own `files` glob, since only some packages in a workspace are composition roots.
const messages = {
  ifStatement: 'Use a lookup table, not an if/else branch.',
  switchStatement: 'Use a lookup table, not a switch branch.',
  forStatement: 'Use a lookup table or a declarative array method, not a for loop.',
  forInStatement: 'Use a lookup table or Object.entries, not a for-in loop.',
  forOfStatement: 'Use a declarative array method, not a for-of loop.',
  whileStatement: 'Use a lookup table or a declarative array method, not a while loop.',
  doWhileStatement: 'Use a lookup table or a declarative array method, not a do-while loop.',
  conditionalExpression: 'Use a lookup table, not a ternary.',
} as const;

const noControlFlow: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages,
  },
  create(context) {
    return {
      IfStatement(node) {
        context.report({ node, messageId: 'ifStatement' });
      },
      SwitchStatement(node) {
        context.report({ node, messageId: 'switchStatement' });
      },
      ForStatement(node) {
        context.report({ node, messageId: 'forStatement' });
      },
      ForInStatement(node) {
        context.report({ node, messageId: 'forInStatement' });
      },
      ForOfStatement(node) {
        context.report({ node, messageId: 'forOfStatement' });
      },
      WhileStatement(node) {
        context.report({ node, messageId: 'whileStatement' });
      },
      DoWhileStatement(node) {
        context.report({ node, messageId: 'doWhileStatement' });
      },
      ConditionalExpression(node) {
        context.report({ node, messageId: 'conditionalExpression' });
      },
    };
  },
};

export default noControlFlow;
