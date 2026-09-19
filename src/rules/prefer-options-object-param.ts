import { AST_NODE_TYPES, AST_TOKEN_TYPES, ESLintUtils, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { firstTokenOrThrow } from './ts-node-guards';

// TypeScript disallows a required parameter after an optional one in a single declaration (compiler error 1016), so every optional (`?`-marked or default-valued) parameter in a valid signature is already part of one contiguous run at the tail of the parameter list, immediately before an optional trailing rest parameter if one is present — there is no "optional then required" interleaving to worry about. A caller who needs only the LAST parameter in that run must still pass `undefined` for every earlier one (`new WireMeshTransport(a, b, undefined, undefined, undefined, undefined, undefined, undefined, undefined, gatewayTrust)` is the real motivating case this rule was written for). `max-params` alone cannot catch this: it only fires once the *total* parameter count crosses a threshold, but the actual pain is having 2+ *trailing optional* parameters at all, independent of how many required parameters precede them — a 3-parameter function with 2 trailing optional ones already has this problem. This rule fires once a function/method/constructor's trailing optional run reaches a configurable length (`{ minTrailingOptional }`, default 2) and offers to bundle that run into a single destructured `options` parameter.
//
// `hasSuggestions: true`, not `fixable: 'code'` — this is the key call. `fixable` is applied silently by `--fix` with no review gate. no-pointless-reassignment.ts's own history (a far simpler identifier-swap fixer) already shipped real bugs this way (code that didn't parse, a deleted load-bearing type annotation), and this rule's own fixer is riskier still: it rewrites a parameter list AND inserts a new statement into the function body. prefer-numeric-sort-compare.ts already uses `hasSuggestions` in this exact package for the identical reason — a suggestion the developer explicitly reviews and accepts is appropriate; silently rewriting behaviour on every save is not. Call sites are deliberately never rewritten: the signature edit alone turns every stale positional call site into a real TypeScript compile error, which is the correct, sufficient signal for a human/agent to fix each one — ESLint's own fixer can only ever edit the single file it is linting, so it could never safely coordinate an edit to the declaration with edits to call sites scattered across other files in the same pass anyway.
//
// Every param-list/type-text extraction below uses a verbatim `sourceCode.getText()` slice of the parameter's own type-annotation node, never a checker-based reconstruction (a printer, not a source-text echo, that can silently diverge from what was actually written) — this is why the rule needs no type-checker access at all: every check it performs (is this parameter optional, does it already carry an explicit type annotation, is it a parameter property, is it decorated) is answerable from the parameter's own TSESTree shape, and the fixer only ever echoes source text it already has. It is registered only in the type-checked bundle (src/recommended-type-checked.ts), alongside this package's own other `prefer-*` rewrite-suggestion rules (prefer-readonly-object-param, prefer-numeric-sort-compare) — a deliberate family-placement choice for a consistent story about where a rewrite-suggestion rule lives, not a reflection of any actual type-information dependency.
//
// Every bail-out below still reports the diagnostic (a caller still deserves to be told about the anti-pattern) but withholds the suggestion (`suggest` omitted from the report) whenever collapsing the run mechanically would be unsafe or lossy:
// - a parameter property (`constructor(private x?: T)`) in the run — a parameter property auto-assigns `this.x` as a side effect of being a parameter at all; a destructured local binding cannot replicate that assignment.
// - a parameter in the run with no simple resolvable name and explicit type annotation — covers a destructured parameter (`{ a }: T = {}`, which has no single bindable name to move into the new destructure) and a parameter genuinely missing its own type annotation (including one typed only through an outer, separately-declared function-type alias — e.g. `const h: Handler = (a, b?, c?) => {...}` — since the arrow's own parameters carry no annotation of their own to echo into the new options type).
// - a decorated parameter (`@Body() x?: T`) — a parameter decorator's own runtime behaviour is defined against that exact parameter's position and identity; moving it into a destructured object property changes what it decorates.
// - a rest parameter anywhere in the full parameter list (not just the trailing run) — the fixer's insertion point assumes the new `options` parameter is safe to treat as an ordinary parameter, and a trailing rest parameter after it is an added interaction this rule does not attempt to reason about.
// - an arrow function with an expression body, or any function-like shape with no `BlockStatement` body at all (a declaration-only ambient/overload signature, an interface method signature, a call/construct signature, a standalone function type, or an abstract/ambient class method) — there is no block to insert the destructuring statement into. This is also exactly what makes an ambient `.d.ts` signature (which always parses as one of these body-less shapes) still reported but never fixed, with no separate filename-based check needed.
// - a `@param` JSDoc tag naming any parameter in the run — an existing doc comment describing that parameter by name would go stale the moment the parameter itself disappears from the signature.
// - a parameter or function-scope-local variable already named `options` — colliding with the synthetic `options` parameter this rule introduces. A parameter that is ITSELF part of the run being collapsed is exempted from this check (it disappears in the same edit), but any other same-named binding is not.

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`,
);

type FunctionLikeWithParams =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.TSCallSignatureDeclaration
  | TSESTree.TSConstructSignatureDeclaration
  | TSESTree.TSDeclareFunction
  | TSESTree.TSEmptyBodyFunctionExpression
  | TSESTree.TSFunctionType
  | TSESTree.TSMethodSignature;

// Every function-like shape that can carry a parameter list: the three with a real body, plus the declaration-only shapes (an ambient/overload `declare function`, an interface method signature, a standalone function type alias, and a call/construct signature) and abstract/ambient class methods (TSEmptyBodyFunctionExpression) — ported verbatim from prefer-readonly-array-param.ts/prefer-readonly-object-param.ts's own already-hardened traversal, deliberately not re-derived.
const FUNCTION_LIKE_SELECTOR = [
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'TSCallSignatureDeclaration',
  'TSConstructSignatureDeclaration',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
  'TSFunctionType',
  'TSMethodSignature',
].join(', ');

// A parameter is optional exactly when it carries a `?` marker or a default value — a TSParameterProperty is optional exactly when the parameter it wraps is, and a bare RestElement/ArrayPattern/ObjectPattern (with no default) never is, since none of those three can carry either marker.
function isOptionalParam(param: TSESTree.Parameter): boolean {
  if (param.type === AST_NODE_TYPES.TSParameterProperty) return isOptionalParam(param.parameter);
  if (param.type === AST_NODE_TYPES.AssignmentPattern) return true;
  if (param.type === AST_NODE_TYPES.Identifier) return param.optional;
  return false;
}

// The maximal run of trailing optional parameters, skipping a single trailing rest parameter first if one is present (a rest parameter is never itself optional, but its mere presence does not break the run of optional parameters immediately before it — `function f(a, b?, c?, ...rest)` still has a genuine 2-parameter trailing optional run, even though `...rest` is the parameter list's own final entry).
function getTrailingOptionalRun(params: readonly TSESTree.Parameter[]): TSESTree.Parameter[] {
  const hasTrailingRest = params.length > 0 && params[params.length - 1]?.type === AST_NODE_TYPES.RestElement;
  const run: TSESTree.Parameter[] = [];
  for (let i = params.length - (hasTrailingRest ? 2 : 1); i >= 0; i--) {
    const param = params[i];
    if (param === undefined || !isOptionalParam(param)) break;
    run.unshift(param);
  }
  return run;
}

interface ResolvedParamInfo {
  readonly identifierNode: TSESTree.Identifier;
  readonly typeNode: TSESTree.TypeNode;
  readonly defaultExpression: TSESTree.Expression | undefined;
}

// Resolves a single trailing-optional-run parameter down to everything the fixer needs to move it into the new options object, or `undefined` when doing so would not be safe/mechanical — folding several of the rule's own bail-out conditions (a parameter property, a destructured parameter with no single bindable name, a parameter with no explicit type annotation of its own, and a decorated parameter) into one "can this parameter be moved" question, since none of them need to be distinguished from one another in the reported message. Only ever called on a parameter isOptionalParam has already confirmed optional, so the final `: undefined` fallback below (neither an AssignmentPattern nor an Identifier) can never actually be reached through real linting — a bare RestElement/ArrayPattern/ObjectPattern is never itself optional — but is kept as a plain, non-throwing fallback rather than an "Unreachable" throw, since a hypothetical future caller passing a genuinely non-optional parameter should still get back a graceful "not fixable" rather than a crash.
function resolveFixableParam(param: TSESTree.Parameter): ResolvedParamInfo | undefined {
  if (param.type === AST_NODE_TYPES.TSParameterProperty) return undefined;
  const identifierNode =
    param.type === AST_NODE_TYPES.AssignmentPattern
      ? param.left.type === AST_NODE_TYPES.Identifier
        ? param.left
        : undefined
      : param.type === AST_NODE_TYPES.Identifier
        ? param
        : undefined;
  if (identifierNode === undefined) return undefined;
  const typeNode = identifierNode.typeAnnotation?.typeAnnotation;
  if (typeNode === undefined) return undefined;
  if (identifierNode.decorators.length > 0) return undefined;
  return {
    identifierNode,
    typeNode,
    defaultExpression: param.type === AST_NODE_TYPES.AssignmentPattern ? param.right : undefined,
  };
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// The fixer's own replacement range spans from the run's first parameter to its last — both are guaranteed to exist once the caller has already confirmed the run has at least `minTrailingOptional` (>= 2) elements, but a plain index/`.at(-1)` lookup under this codebase's own `noUncheckedIndexedAccess` still types each as possibly `undefined`. Exported so that guarantee is checked directly against a deliberately empty array, rather than assumed away with a cast.
export function firstAndLastOrThrow<T>(items: readonly T[]): readonly [T, T] {
  const first = items[0];
  const last = items.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error('Unreachable: expected at least one element (the caller already confirmed a minimum run length).');
  }
  return [first, last];
}

// A function/method/constructor label for the reported message. TSConstructSignatureDeclaration and TSMethodSignature are labelled directly from their own node type (an interface/type-literal member, never wrapped in a MethodDefinition); a concrete function-like node's own label instead comes from its parent — a class method/constructor (MethodDefinition/TSAbstractMethodDefinition, using that parent's own `kind`) or an object-literal method (a `Property` with `method: true`) — falling back to a plain 'function' for everything else (a function declaration/expression, an arrow function, or a standalone function type/call signature).
function describeFunctionKind(node: FunctionLikeWithParams): string {
  if (node.type === AST_NODE_TYPES.TSConstructSignatureDeclaration) return 'constructor';
  if (node.type === AST_NODE_TYPES.TSMethodSignature) return 'method';
  const { parent } = node;
  if (parent.type === AST_NODE_TYPES.MethodDefinition || parent.type === AST_NODE_TYPES.TSAbstractMethodDefinition) {
    return parent.kind === 'constructor' ? 'constructor' : 'method';
  }
  if (parent.type === AST_NODE_TYPES.Property && parent.method) return 'method';
  return 'function';
}

// A function-like node's own `body` field only ever holds a genuine `BlockStatement` for a FunctionDeclaration/FunctionExpression (always) or an ArrowFunctionExpression (when block-bodied, as opposed to an expression body). TSDeclareFunction's own `body` is always `undefined` and TSEmptyBodyFunctionExpression's is always `null` (both declaration-only, no real body to insert into); TSCallSignatureDeclaration/TSConstructSignatureDeclaration/TSFunctionType/TSMethodSignature carry no `body` field at all — the `in` check below narrows those four out structurally rather than needing a `null`/`undefined` check for shapes that were never going to have one. This single check is what makes an arrow function's expression body, and every declaration-only signature shape (including an ambient `.d.ts` function, which always parses as one of these body-less shapes), fall out as "no block to insert into" with no separate filename or node-type-specific check needed.
function getBlockBody(node: FunctionLikeWithParams): TSESTree.BlockStatement | undefined {
  return 'body' in node && node.body?.type === AST_NODE_TYPES.BlockStatement ? node.body : undefined;
}

const LIFTABLE_JSDOC_PARENTS: ReadonlySet<AST_NODE_TYPES> = new Set([
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.VariableDeclaration,
  AST_NODE_TYPES.MethodDefinition,
  AST_NODE_TYPES.TSAbstractMethodDefinition,
  AST_NODE_TYPES.PropertyDefinition,
  AST_NODE_TYPES.ExportNamedDeclaration,
  AST_NODE_TYPES.ExportDefaultDeclaration,
]);

// A function-like node's own leading JSDoc block comment, walking up through the handful of wrapper nodes a real declaration commonly sits under (a `const f = (...) => {}`'s own VariableDeclarator/VariableDeclaration, a class method's MethodDefinition, an `export`) until either a genuine block comment starting with `*` (the `/**` convention) is found immediately before the current node, or the parent chain reaches a node the JSDoc convention would never attach to.
function getLeadingJSDocComment(sourceCode: TSESLint.SourceCode, node: TSESTree.Node): TSESTree.Comment | undefined {
  let current: TSESTree.Node = node;
  for (;;) {
    const jsdocComment = sourceCode
      .getCommentsBefore(current)
      .findLast((comment) => comment.type === AST_TOKEN_TYPES.Block && comment.value.startsWith('*'));
    if (jsdocComment) return jsdocComment;
    const { parent } = current;
    // `parent` is only ever `undefined` here for a Program node (the one node type whose own `.parent` field is declared optional, since it genuinely has none) — reaching it means the walk ran out of liftable wrapper nodes without finding a doc comment, the same outcome as any other non-liftable parent type.
    if (parent === undefined || !LIFTABLE_JSDOC_PARENTS.has(parent.type)) return undefined;
    current = parent;
  }
}

// Whether a JSDoc block comment's own text documents `name` via an `@param` tag — matching the common forms (`@param name`, `@param {Type} name`, `@param [name]` for the optional-parameter convention, each optionally followed by a description) without requiring a full JSDoc parser, since this only ever needs to answer "does an existing doc comment already name this exact parameter", not validate or extract the tag's own structure.
function jsDocMentionsParam(commentValue: string, name: string): boolean {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const paramTagPattern = new RegExp(`@param\\s+(?:\\{[^}]*\\}\\s+)?\\[?${escapedName}\\b`);
  return paramTagPattern.test(commentValue);
}

// A collision exists when some variable in the function's own scope is named `options` (the synthetic parameter name this rule introduces) unless every one of that variable's own identifier occurrences belongs to the trailing run being collapsed — a run parameter that happens to already be named `options` is not itself a collision, since it disappears in the same edit that introduces the new one, but any OTHER binding of that name (an earlier kept parameter, a body-local `const`/`let`/function declaration) is.
function hasOptionsNameCollision(scope: TSESLint.Scope.Scope, exemptIdentifiers: ReadonlySet<TSESTree.Identifier>): boolean {
  return scope.variables.some(
    (variable) => variable.name === 'options' && !variable.identifiers.every((identifier) => exemptIdentifiers.has(identifier)),
  );
}

// Named explicitly and passed as createRule's own generic arguments rather than left for TS to infer from the `defaultOptions` object literal below — an array literal infers as the wider `{ minTrailingOptional: number }[]` in that position, not the 1-element tuple RuleCreator's own `Options extends readonly unknown[]` constraint expects, which otherwise surfaces as a spurious `noUncheckedIndexedAccess` "possibly undefined" on `create`'s own destructured second parameter.
type Options = readonly [{ readonly minTrailingOptional: number }];
type MessageIds = 'tooManyTrailingOptional' | 'wrapInOptionsObject';

const preferOptionsObjectParam = createRule<Options, MessageIds>({
  name: 'prefer-options-object-param',
  meta: {
    type: 'suggestion',
    hasSuggestions: true,
    docs: {
      description:
        "Suggest bundling a run of 2+ trailing optional parameters into a single destructured 'options' parameter — without this, a caller needing only the last optional parameter must still pass 'undefined' for every optional parameter before it.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          minTrailingOptional: { type: 'integer', minimum: 2 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooManyTrailingOptional:
        "This {{ kind }} has {{ count }} trailing optional parameters ({{ names }}) — a caller needing only the last one must still pass 'undefined' for every parameter before it. Bundle the trailing optional run into a single destructured 'options' parameter instead.",
      wrapInOptionsObject: "Bundle the trailing optional parameters into a single 'options' parameter.",
    },
    defaultOptions: [{ minTrailingOptional: 2 }],
  },
  create(context, [{ minTrailingOptional }]) {
    const { sourceCode } = context;

    function checkParams(node: FunctionLikeWithParams) {
      const run = getTrailingOptionalRun(node.params);
      if (run.length < minTrailingOptional) return;

      const resolved = run.map(resolveFixableParam);
      const names = run.map((param, index) => resolved[index]?.identifierNode.name ?? sourceCode.getText(param)).join(', ');
      const data = { kind: describeFunctionKind(node), count: run.length, names };

      const resolvedParams = resolved.filter(isDefined);
      const allResolvable = resolvedParams.length === run.length;
      const hasRestParam = node.params.some((param) => param.type === AST_NODE_TYPES.RestElement);
      const body = getBlockBody(node);

      let isFixable = allResolvable && !hasRestParam && body !== undefined;
      if (isFixable) {
        const jsdocComment = getLeadingJSDocComment(sourceCode, node);
        const jsDocBail =
          jsdocComment !== undefined &&
          resolvedParams.some((info) => jsDocMentionsParam(jsdocComment.value, info.identifierNode.name));
        const exemptIdentifiers = new Set(resolvedParams.map((info) => info.identifierNode));
        const optionsCollision = hasOptionsNameCollision(sourceCode.getScope(node), exemptIdentifiers);
        isFixable = !jsDocBail && !optionsCollision;
      }

      if (!isFixable || body === undefined) {
        context.report({ node, messageId: 'tooManyTrailingOptional', data });
        return;
      }

      context.report({
        node,
        messageId: 'tooManyTrailingOptional',
        data,
        suggest: [
          {
            messageId: 'wrapInOptionsObject',
            fix(fixer) {
              const properties = resolvedParams.map(
                (info) => `${info.identifierNode.name}?: ${sourceCode.getText(info.typeNode)}`,
              );
              const destructureEntries = resolvedParams.map((info) =>
                info.defaultExpression === undefined
                  ? info.identifierNode.name
                  : `${info.identifierNode.name} = ${sourceCode.getText(info.defaultExpression)}`,
              );
              const optionsParamText = `options?: { ${properties.join('; ')} }`;
              const destructureText = `const { ${destructureEntries.join(', ')} } = options ?? {};`;

              const [firstParam, lastParam] = firstAndLastOrThrow(run);
              const openBrace = firstTokenOrThrow(sourceCode, body);

              return [
                fixer.replaceTextRange([firstParam.range[0], lastParam.range[1]], optionsParamText),
                fixer.insertTextAfter(openBrace, `\n  ${destructureText}`),
              ];
            },
          },
        ],
      });
    }

    return {
      [FUNCTION_LIKE_SELECTOR](node: FunctionLikeWithParams) {
        checkParams(node);
      },
    };
  },
});

export default preferOptionsObjectParam;
