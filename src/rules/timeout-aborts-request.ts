import { AST_NODE_TYPES, ASTUtils, ESLintUtils, TSESLint, type TSESTree } from '@typescript-eslint/utils';

type MessageIds = 'timeoutDoesNotAbort' | 'controllerNotLocal' | 'timerNotCleared' | 'catchDoesNotCheckAbort';

type Variable = TSESLint.Scope.Variable;

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/ExaDev/eslint-config/blob/main/src/rules/${name}.ts`);

function isFunction(node: TSESTree.Node): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression || node.type === AST_NODE_TYPES.FunctionExpression || node.type === AST_NODE_TYPES.FunctionDeclaration;
}

/**
 * Whether `node` is `name(...)` with `name` a bare identifier, which is how `setTimeout`, `clearTimeout` and `new Promise` are written.
 */
function isCallTo(node: TSESTree.Node, name: string): node is TSESTree.CallExpression {
  return node.type === AST_NODE_TYPES.CallExpression && node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === name;
}

/**
 * `Promise.race(...)`, matched on the two names as written.
 */
function isPromiseRace(node: TSESTree.CallExpression): boolean {
  const { callee } = node;

  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Promise' &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'race'
  );
}

function isNewOf(node: TSESTree.Node | null | undefined, name: string): node is TSESTree.NewExpression {
  return node?.type === AST_NODE_TYPES.NewExpression && node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === name;
}

/**
 * A non-null assertion changes no runtime value, so `controller!.abort()` is `controller.abort()`.
 */
function unwrap(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.TSNonNullExpression ? unwrap(node.expression) : node;
}

/**
 * Calls `visit` for `node` and every node below it. `skipFunctions` stops at a nested function, whose body does not run as part of the code around it.
 */
function walk(sourceCode: Readonly<TSESLint.SourceCode>, node: TSESTree.Node, visit: (node: TSESTree.Node) => void, skipFunctions: boolean): void {
  visit(node);
  const keys = sourceCode.visitorKeys[node.type] ?? [];
  for (const key of keys) {
    const child: unknown = Reflect.get(node, key);
    for (const candidate of Array.isArray(child) ? child : [child]) {
      if (isNode(candidate) && !(skipFunctions && isFunction(candidate))) walk(sourceCode, candidate, visit, skipFunctions);
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && 'type' in value && typeof value.type === 'string';
}

function collect<T extends TSESTree.Node>(sourceCode: Readonly<TSESLint.SourceCode>, root: TSESTree.Node, matches: (node: TSESTree.Node) => node is T, skipFunctions: boolean): T[] {
  const found: T[] = [];
  walk(
    sourceCode,
    root,
    (node) => {
      if (matches(node)) found.push(node);
    },
    skipFunctions,
  );

  return found;
}

function isAbortCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'abort'
  );
}

/**
 * The code a `setTimeout` callback argument stands for: the function written in place, or the function a name resolves to (a function declaration, or a `const` initialised with a function). `undefined` for anything else (an imported function, a bound method, a call result), whose body this rule cannot read.
 */
function callbackBody(scope: TSESLint.Scope.Scope, callback: TSESTree.Node): TSESTree.Node | undefined {
  if (isFunction(callback)) return callback.body;
  if (callback.type !== AST_NODE_TYPES.Identifier) return undefined;
  const definition = ASTUtils.findVariable(scope, callback.name)?.defs[0];
  if (definition?.type === TSESLint.Scope.DefinitionType.FunctionName) return definition.node.body ?? undefined;
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) return undefined;
  const { init } = definition.node;

  return init !== null && isFunction(init) ? init.body : undefined;
}

/**
 * Requires the timer of a `Promise.race` timeout to cancel the work it raced against. The accepted shape: a timer whose callback calls `.abort()` on an `AbortController` created in the function holding the race (not at module level, not a parameter), the timer's id kept and passed to `clearTimeout` in a `finally` around the race, and any `catch` around the race returning early when `controller.signal.aborted`.
 *
 * A timeout that only rejects leaves the request running: the caller moves on while the provider call keeps consuming budget and connections. The rule is syntactic and reads one function: it cannot see that a helper the race calls forwards the signal, and a race over work that cannot be cancelled is a false positive, for which the escape hatch is a scoped configuration block that turns the rule off for those files.
 */
const timeoutAbortsRequest = createRule<[], MessageIds>({
  name: 'timeout-aborts-request',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the timer of a Promise.race timeout to abort the AbortController of the request it raced against, and to be cleared in a finally.',
    },
    schema: [],
    messages: {
      timeoutDoesNotAbort: 'This timeout settles the race but never aborts the request it raced against, which keeps running. Call abort() on the request\'s AbortController in the timer callback.',
      controllerNotLocal: 'The AbortController this timer aborts must be created in the function that holds the race (a local const), not at module level, in an outer function or as a parameter, so each race aborts only its own request.',
      timerNotCleared: 'Keep the id this setTimeout returns in a variable and pass it to clearTimeout in a finally around the race, so a request that wins does not leave the timer pending.',
      catchDoesNotCheckAbort: 'This handler must return early when {{ controller }}.signal.aborted, so a timeout is handled apart from a failure of the request.',
    },
    defaultOptions: [],
  },
  create(context) {
    const { sourceCode } = context;

    /**
     * The `new Promise(...)` a race arm stands for: the expression itself, or the one a `const` it names was initialised with.
     */
    const promiseOfArm = (arm: TSESTree.Node): TSESTree.NewExpression | undefined => {
      if (isNewOf(arm, 'Promise')) return arm;
      if (arm.type !== AST_NODE_TYPES.Identifier) return undefined;
      const definition = ASTUtils.findVariable(sourceCode.getScope(arm), arm.name)?.defs[0];
      const init = definition?.type === TSESLint.Scope.DefinitionType.Variable ? definition.node.init : undefined;

      return isNewOf(init, 'Promise') ? init : undefined;
    };

    /**
     * The variable a timer's id is stored in: the target of `timer = setTimeout(...)` or the declarator of `const timer = setTimeout(...)`.
     */
    const timerVariable = (timer: TSESTree.CallExpression): Variable | undefined => {
      const { parent } = timer;
      if (parent.type === AST_NODE_TYPES.AssignmentExpression && parent.right === timer && parent.left.type === AST_NODE_TYPES.Identifier) {
        return ASTUtils.findVariable(sourceCode.getScope(timer), parent.left.name) ?? undefined;
      }
      if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.init === timer && parent.id.type === AST_NODE_TYPES.Identifier) {
        return ASTUtils.findVariable(sourceCode.getScope(timer), parent.id.name) ?? undefined;
      }

      return undefined;
    };

    /**
     * The AbortController variable an `.abort()` call is made on, when it is a local `const controller = new AbortController()` of the function that holds the race. `undefined` when the receiver is not a plain identifier, is a parameter or an import, or is declared anywhere but that function.
     */
    const localController = (abort: TSESTree.CallExpression, race: TSESTree.CallExpression): Variable | undefined => {
      if (abort.callee.type !== AST_NODE_TYPES.MemberExpression) return undefined;
      const receiver = unwrap(abort.callee.object);
      if (receiver.type !== AST_NODE_TYPES.Identifier) return undefined;
      const variable = ASTUtils.findVariable(sourceCode.getScope(abort), receiver.name);
      const definition = variable?.defs[0];
      if (variable === null || definition?.type !== TSESLint.Scope.DefinitionType.Variable) return undefined;
      const raceScope = sourceCode.getScope(race).variableScope;
      const isFunctionScope = raceScope.type === TSESLint.Scope.ScopeType.function;

      return isFunctionScope && variable.scope.variableScope === raceScope && isNewOf(definition.node.init, 'AbortController') ? variable : undefined;
    };

    /**
     * Whether `root` calls `clearTimeout` on the variable the timer id is stored in.
     */
    const clearsTimer = (root: TSESTree.Node, timer: Variable): boolean =>
      collect(sourceCode, root, (node): node is TSESTree.CallExpression => isCallTo(node, 'clearTimeout'), false).some((call) => {
        const [argument] = call.arguments;

        return argument?.type === AST_NODE_TYPES.Identifier && ASTUtils.findVariable(sourceCode.getScope(call), argument.name) === timer;
      });

    /**
     * The `try` statements around the race in its own function, each with the part of it (`block`, `handler` or `finalizer`) that holds the race.
     */
    const enclosingTries = (race: TSESTree.CallExpression): { readonly statement: TSESTree.TryStatement; readonly part: TSESTree.Node }[] => {
      const tries: { readonly statement: TSESTree.TryStatement; readonly part: TSESTree.Node }[] = [];
      let child: TSESTree.Node = race;
      for (let parent: TSESTree.Node = race.parent; parent.type !== AST_NODE_TYPES.Program && !isFunction(parent); parent = parent.parent) {
        if (parent.type === AST_NODE_TYPES.TryStatement) tries.push({ statement: parent, part: child });
        child = parent;
      }

      return tries;
    };

    /**
     * Every `finally` that runs after the race: the finalizer of an enclosing `try` whose `try` block or `catch` clause holds the race, and the callback of a `.finally(callback)` chained directly onto the race.
     */
    const finallyBodies = (race: TSESTree.CallExpression): TSESTree.Node[] => [
      ...enclosingTries(race).flatMap(({ statement, part }) => (statement.finalizer !== null && (part === statement.block || part === statement.handler) ? [statement.finalizer] : [])),
      ...chainedHandlers(race).filter(({ name }) => name === 'finally').map(({ callback }) => callback),
    ];

    /**
     * Every handler that sees the race's rejection: the `catch` clause of an enclosing `try` whose `try` block holds the race, and the callback of a `.catch(callback)` chained directly onto the race.
     */
    const catchHandlers = (race: TSESTree.CallExpression): TSESTree.Node[] => [
      ...enclosingTries(race).flatMap(({ statement, part }) => (statement.handler !== null && part === statement.block ? [statement.handler] : [])),
      ...chainedHandlers(race).filter(({ name }) => name === 'catch').map(({ callback }) => callback),
    ];

    /**
     * Whether a handler returns early on `controller.signal.aborted`: an `if` testing that property whose consequent returns.
     */
    const returnsOnAbort = (handler: TSESTree.Node, controller: Variable): boolean =>
      collect(sourceCode, handler, (node): node is TSESTree.IfStatement => node.type === AST_NODE_TYPES.IfStatement, true).some((statement) => {
        const testsAborted = collect(sourceCode, statement.test, isMemberNamed('aborted'), true).some((aborted) => {
          const signal = unwrap(aborted.object);
          if (signal.type !== AST_NODE_TYPES.MemberExpression || !isMemberNamed('signal')(signal)) return false;
          const receiver = unwrap(signal.object);

          return receiver.type === AST_NODE_TYPES.Identifier && ASTUtils.findVariable(sourceCode.getScope(receiver), receiver.name) === controller;
        });

        return testsAborted && collect(sourceCode, statement.consequent, (node): node is TSESTree.ReturnStatement => node.type === AST_NODE_TYPES.ReturnStatement, true).length > 0;
      });

    return {
      CallExpression(race) {
        if (!isPromiseRace(race)) return;
        const [arms] = race.arguments;
        if (arms?.type !== AST_NODE_TYPES.ArrayExpression) return;

        for (const arm of arms.elements) {
          const promise = arm === null || arm.type === AST_NODE_TYPES.SpreadElement ? undefined : promiseOfArm(arm);
          const [executor] = promise?.arguments ?? [];
          if (executor === undefined || !isFunction(executor)) continue;

          for (const timer of collect(sourceCode, executor.body, (node): node is TSESTree.CallExpression => isCallTo(node, 'setTimeout'), false)) {
            checkTimer(race, timer);
          }
        }
      },
    };

    function checkTimer(race: TSESTree.CallExpression, timer: TSESTree.CallExpression): void {
      const [callback] = timer.arguments;
      const body = callback === undefined ? undefined : callbackBody(sourceCode.getScope(timer), callback);
      const aborts = body === undefined ? [] : collect(sourceCode, body, isAbortCall, false);

      if (aborts.length === 0) {
        context.report({ node: timer, messageId: 'timeoutDoesNotAbort' });
      } else {
        const controllers = aborts.map((abort) => localController(abort, race)).filter((variable): variable is Variable => variable !== undefined);
        const [controller] = controllers;
        if (controller === undefined) {
          context.report({ node: timer, messageId: 'controllerNotLocal' });
        } else {
          for (const handler of catchHandlers(race)) {
            if (!returnsOnAbort(handler, controller)) context.report({ node: handler, messageId: 'catchDoesNotCheckAbort', data: { controller: controller.name } });
          }
        }
      }

      const variable = timerVariable(timer);
      if (variable === undefined || !finallyBodies(race).some((finalizer) => clearsTimer(finalizer, variable))) {
        context.report({ node: timer, messageId: 'timerNotCleared' });
      }
    }
  },
});

function isMemberNamed(name: string): (node: TSESTree.Node) => node is TSESTree.MemberExpression {
  return (node): node is TSESTree.MemberExpression => node.type === AST_NODE_TYPES.MemberExpression && !node.computed && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === name;
}

interface ChainedHandler {
  readonly name: string;
  readonly callback: TSESTree.Node;
}

/**
 * The `.catch(callback)` and `.finally(callback)` calls chained directly onto a promise expression, in order: `race.catch(a).finally(b)` yields both. A `.then(a, b)` chain is not followed.
 */
function chainedHandlers(promise: TSESTree.CallExpression): ChainedHandler[] {
  const handlers: ChainedHandler[] = [];
  let current: TSESTree.Node = promise;
  for (;;) {
    const parent: TSESTree.Node = current.parent;
    if (parent.type !== AST_NODE_TYPES.MemberExpression || parent.object !== current || parent.computed || parent.property.type !== AST_NODE_TYPES.Identifier) break;
    const call: TSESTree.Node = parent.parent;
    if (call.type !== AST_NODE_TYPES.CallExpression || call.callee !== parent) break;
    const [callback] = call.arguments;
    if (callback !== undefined) handlers.push({ name: parent.property.name, callback });
    current = call;
  }

  return handlers;
}

export default timeoutAbortsRequest;
