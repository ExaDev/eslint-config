import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { firstAndLastOrThrow } from './prefer-options-object-param';

describe('firstAndLastOrThrow', () => {
  it('returns the first and last element when the array is non-empty', () => {
    expect(firstAndLastOrThrow(['a', 'b', 'c'])).toEqual(['a', 'c']);
  });

  it('returns the same element twice for a single-element array', () => {
    expect(firstAndLastOrThrow(['x'])).toEqual(['x', 'x']);
  });

  it('throws for an empty array — never true of a real trailing optional run, which the caller has already confirmed has at least minTrailingOptional (>= 2) elements', () => {
    expect(() => firstAndLastOrThrow([])).toThrow(/Unreachable/);
  });
});

// Pins every literal in the rule's own metadata — name, docs url/description, message text, schema, and default options — against mutation, since none of these are otherwise observable through a RuleTester fixture.
describe('rule metadata', () => {
  it('has the expected name, docs, messages, schema, and default options', () => {
    expect(rule.name).toBe('prefer-options-object-param');
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/prefer-options-object-param.ts');
    expect(rule.meta.docs?.description).toBe(
      "Suggest bundling a run of 2+ trailing optional parameters into a single destructured 'options' parameter — without this, a caller needing only the last optional parameter must still pass 'undefined' for every optional parameter before it.",
    );
    expect(rule.meta.messages.tooManyTrailingOptional).toBe(
      "This {{ kind }} has {{ count }} trailing optional parameters ({{ names }}) — a caller needing only the last one must still pass 'undefined' for every parameter before it. Bundle the trailing optional run into a single destructured 'options' parameter instead.",
    );
    expect(rule.meta.messages.wrapInOptionsObject).toBe("Bundle the trailing optional parameters into a single 'options' parameter.");
    expect(rule.meta.schema).toEqual([
      { type: 'object', properties: { minTrailingOptional: { type: 'integer', minimum: 2 } }, additionalProperties: false },
    ]);
    expect(rule.meta.defaultOptions).toEqual([{ minTrailingOptional: 2 }]);
  });
});

// No type information is needed at lint time for this rule (every check is answerable from a parameter's own TSESTree shape, and the fixer only ever echoes verbatim source text) — see the rule's own file header for why it is therefore registered in both plugin.configs.recommended and the type-checked bundle. parserOptions.project/projectService is deliberately omitted here, matching prefer-readonly-array-param.unit.test.ts's own rationale for the same reason.
const ruleTester = new RuleTester({
  languageOptions: { parser: tseslint.parser, sourceType: 'module' },
});

ruleTester.run('prefer-options-object-param', rule, {
  valid: [
    // A single trailing optional parameter never meets the default 2-parameter threshold.
    'function f(a: number, b?: number): void {}',
    // Required-only parameters have no trailing optional run at all.
    'function f(a: number, b: number): void {}',
    // No parameters at all.
    'function f(): void {}',
    // A bare rest parameter is never itself optional, and there is nothing before it.
    'function f(...rest: number[]): void {}',
    // Only 1 parameter precedes a trailing rest parameter — still below the default threshold even though the rest parameter's mere presence does not by itself disqualify the run.
    'function f(a: number, b?: number, ...rest: number[]): void {}',
    // A custom, higher threshold (3) is honoured — 2 trailing optional parameters is not enough to trip it.
    {
      code: 'function f(a: number, b?: number, c?: number): void {}',
      options: [{ minTrailingOptional: 3 }],
    },
  ],
  invalid: [
    // A plain function, fixed by wrapping the trailing optional run in a destructured options parameter.
    {
      code: 'function f(a: number, b: string, c?: number, d?: string): void {\n  return a;\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 2, names: 'c, d' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                'function f(a: number, b: string, options?: { c?: number; d?: string }): void {\n  const { c, d } = options ?? {};\n  return a;\n}',
            },
          ],
        },
      ],
    },
    // A class constructor — proves the traversal reaches a constructor's own FunctionExpression (via MethodDefinition) and labels it 'constructor' in the message.
    {
      code: 'class C {\n  constructor(a: number, b?: number, c?: string) {\n    this.a = a;\n  }\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'constructor', count: 2, names: 'b, c' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                'class C {\n  constructor(a: number, options?: { b?: number; c?: string }) {\n  const { b, c } = options ?? {};\n    this.a = a;\n  }\n}',
            },
          ],
        },
      ],
    },
    // An arrow function with a real block body.
    {
      code: 'const f = (a: number, b?: number, c?: string): void => {\n  console.log(a);\n};',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 2, names: 'b, c' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                'const f = (a: number, options?: { b?: number; c?: string }): void => {\n  const { b, c } = options ?? {};\n  console.log(a);\n};',
            },
          ],
        },
      ],
    },
    // A complex generic/union parameter type — proves the type text is echoed verbatim (sourceCode.getText()) rather than reconstructed from the checker.
    {
      code: 'function f(a: number, b?: Map<string, number[]>, c?: { x: number } | undefined): void {\n  return;\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 2, names: 'b, c' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                'function f(a: number, options?: { b?: Map<string, number[]>; c?: { x: number } | undefined }): void {\n  const { b, c } = options ?? {};\n  return;\n}',
            },
          ],
        },
      ],
    },
    // Non-trivial default value expressions (a string literal, a call expression referencing an earlier parameter) — proves each default is echoed verbatim into the new destructuring statement.
    {
      code: "function f(a: number, b: string = 'x', c: number = computeDefault(a)): void {\n  return;\n}",
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 2, names: 'b, c' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                "function f(a: number, options?: { b?: string; c?: number }): void {\n  const { b = 'x', c = computeDefault(a) } = options ?? {};\n  return;\n}",
            },
          ],
        },
      ],
    },
    // A custom, higher threshold (3) is honoured on the fixable path too — 3 trailing optional parameters trips it and all 3 are bundled.
    {
      code: 'function f(a: number, b?: number, c?: number, d?: number): void {\n  return;\n}',
      options: [{ minTrailingOptional: 3 }],
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 3, names: 'b, c, d' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                'function f(a: number, options?: { b?: number; c?: number; d?: number }): void {\n  const { b, c, d } = options ?? {};\n  return;\n}',
            },
          ],
        },
      ],
    },

    // The real motivating case: agent-comms' own WireMeshTransport constructor (2 required parameters, then 8 trailing optional ones — a mix of `?`-marked callbacks/objects and default-valued numbers/class instances) — reproduced here as a permanent regression test, not just a one-off manual check, since it is what this rule was written to catch. Confirmed directly against a real build of this package (`eslint-config`'s own compiled `dist/`) run through a real `Linter` against the actual `wire-mesh-transport.ts` shape: the rule reports exactly this, the suggested fix produces exactly this output, and both a caller using the new `options` parameter and the OLD stale positional call (`new WireMeshTransport(events, identity, undefined, undefined, undefined, undefined, undefined, undefined, undefined, new GatewayTrust())`) were verified against `tsc --strict` — the former typechecks cleanly, the latter fails with a real `TS2554` "Expected 2-3 arguments, but got 10" error, confirming the design's own core claim that the signature edit alone turns every stale call site into a compile error.
    {
      code:
        'interface TransportEvents {}\ninterface PeerIdentity {}\ninterface RoomVerbHandler {}\ninterface AgentStatus {}\ninterface HostedRoomAdvert {}\ninterface KeyValueStorage {}\ninterface AgentSelfAdvert {}\ninterface GatewayTrustReader {}\nclass GatewayTrust implements GatewayTrustReader {}\ndeclare const DEFAULT_PENDING_CONNECTION_TIMEOUT_MS: number;\ndeclare const PRESENCE_READVERTISE_INTERVAL_MS: number;\nclass WireMeshTransport {\n  constructor(\n    events: Readonly<TransportEvents>,\n    identity: Readonly<PeerIdentity>,\n    roomVerbHandlers?: Partial<Record<string, RoomVerbHandler>>,\n    pendingConnectionTimeoutMs: number = DEFAULT_PENDING_CONNECTION_TIMEOUT_MS,\n    getCurrentPresence?: () => AgentStatus | undefined,\n    presenceReadvertiseIntervalMs: number = PRESENCE_READVERTISE_INTERVAL_MS,\n    getHostedRooms?: () => readonly HostedRoomAdvert[],\n    dataStorage?: KeyValueStorage,\n    getSelfAgentAdvert?: () => AgentSelfAdvert | undefined,\n    gatewayTrust: Readonly<GatewayTrustReader> = new GatewayTrust(),\n  ) {\n    console.log(events, identity);\n  }\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: {
            kind: 'constructor',
            count: 8,
            names: 'roomVerbHandlers, pendingConnectionTimeoutMs, getCurrentPresence, presenceReadvertiseIntervalMs, getHostedRooms, dataStorage, getSelfAgentAdvert, gatewayTrust',
          },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output:
                'interface TransportEvents {}\ninterface PeerIdentity {}\ninterface RoomVerbHandler {}\ninterface AgentStatus {}\ninterface HostedRoomAdvert {}\ninterface KeyValueStorage {}\ninterface AgentSelfAdvert {}\ninterface GatewayTrustReader {}\nclass GatewayTrust implements GatewayTrustReader {}\ndeclare const DEFAULT_PENDING_CONNECTION_TIMEOUT_MS: number;\ndeclare const PRESENCE_READVERTISE_INTERVAL_MS: number;\nclass WireMeshTransport {\n  constructor(\n    events: Readonly<TransportEvents>,\n    identity: Readonly<PeerIdentity>,\n    options?: { roomVerbHandlers?: Partial<Record<string, RoomVerbHandler>>; pendingConnectionTimeoutMs?: number; getCurrentPresence?: () => AgentStatus | undefined; presenceReadvertiseIntervalMs?: number; getHostedRooms?: () => readonly HostedRoomAdvert[]; dataStorage?: KeyValueStorage; getSelfAgentAdvert?: () => AgentSelfAdvert | undefined; gatewayTrust?: Readonly<GatewayTrustReader> },\n  ) {\n  const { roomVerbHandlers, pendingConnectionTimeoutMs = DEFAULT_PENDING_CONNECTION_TIMEOUT_MS, getCurrentPresence, presenceReadvertiseIntervalMs = PRESENCE_READVERTISE_INTERVAL_MS, getHostedRooms, dataStorage, getSelfAgentAdvert, gatewayTrust = new GatewayTrust() } = options ?? {};\n    console.log(events, identity);\n  }\n}',
            },
          ],
        },
      ],
    },

    // A destructured (ObjectPattern), non-optional leading parameter immediately before the run — proves isOptionalParam's own final fallback (neither AssignmentPattern nor a `?`-marked Identifier) is reached when walking backward past the run to find where it stops, not just when the walk stops at an ordinary required Identifier.
    {
      code: 'function f({ a }: { a: number }, b?: number, c?: number): void {\n  return;\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 2, names: 'b, c' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output: 'function f({ a }: { a: number }, options?: { b?: number; c?: number }): void {\n  const { b, c } = options ?? {};\n  return;\n}',
            },
          ],
        },
      ],
    },

    // --- Bail-outs below: still reported, but no suggestion offered. ---

    // Bail-out: a rest parameter anywhere in the full parameter list, even though it sits outside the trailing optional run itself.
    {
      code: 'function f(a: number, b?: number, c?: number, ...rest: number[]): void {\n  return;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: a KEPT parameter (not part of the run) is already named 'options', which would collide with the synthetic parameter this rule introduces.
    {
      code: 'function f(options: number, b?: number, c?: number): void {\n  return;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: a function-scope-local variable is already named 'options'.
    {
      code: 'function f(a: number, b?: number, c?: number): void {\n  const options = 5;\n  return options;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: a TSParameterProperty in the run — a parameter property auto-assigns `this.c`, which a destructured local cannot replicate.
    {
      code: 'class C {\n  constructor(a: number, b?: number, private c?: number) {}\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'constructor', count: 2, names: 'b, private c?: number' },
          suggestions: [],
        },
      ],
    },
    // Bail-out: a parameter in the run has no explicit type annotation of its own.
    {
      code: 'function f(a: number, b?, c?: number): void {\n  return;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b?, c' }, suggestions: [] }],
    },
    // Bail-out: an arrow function typed through a separately-declared function-type alias (whose own signature has no optional parameters of its own, so it does not independently trigger) — the arrow's own parameters carry a `?` marker but no explicit type annotation of their own to echo into the new options type, the same underlying "no explicit type annotation" mechanism as the case above, arising from the specific motivating scenario named in this rule's own design.
    {
      code: 'type Handler = (a: number) => void; const h: Handler = (a, b?, c?) => {\n  console.log(a, b, c);\n};',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b?, c?' }, suggestions: [] }],
    },
    // Bail-out: an arrow function with an expression body — no block to insert the destructuring statement into.
    {
      code: 'const f = (a: number, b?: number, c?: number): number => a;',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: a `@param` JSDoc tag names a parameter in the run — an existing doc comment describing it by name would go stale the moment it disappears from the signature.
    {
      code: '/**\n * Does something.\n * @param a - first\n * @param b - second\n */\nfunction f(a: number, b?: number, c?: number): void {\n  return;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: a decorated parameter in the run — this parameter is otherwise fully resolvable (a plain name and an explicit type), isolating the decorator check from the "no explicit type annotation" bucket above. The reported `names` text shows the bare 'b?: number' rather than '@dec() b?: number' — a parameter's own decorators sit outside its own node range in the AST (confirmed directly), so a plain source-text echo of the parameter node itself never includes them; this is a cosmetic property of the diagnostic text only and does not affect the bail-out itself, which reads `.decorators` directly rather than the node's own range.
    {
      code: 'declare function dec(): (target: unknown, key: string, index: number) => void;\nclass C {\n  method(a: number, @dec() b?: number, c?: number): void {}\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'method', count: 2, names: 'b?: number, c' },
          suggestions: [],
        },
      ],
    },
    // Bail-out: a declaration-only ambient function (TSDeclareFunction) — no block body to insert into, regardless of the rest of the signature being otherwise fully resolvable.
    {
      code: 'declare function f(a: number, b?: number, c?: number): void;',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: the same declaration-only shape, in a real ambient .d.ts file — proves no filename-specific check is needed, since the body-less node shape alone already catches it.
    {
      code: 'declare function f(a: number, b?: number, c?: number): void;',
      filename: 'foo.d.ts',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'function', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: an interface method signature (TSMethodSignature) — also declaration-only, and labelled 'method' rather than 'function'.
    {
      code: 'interface I {\n  m(a: number, b?: number, c?: number): void;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'method', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: an interface construct signature (TSConstructSignatureDeclaration) — declaration-only, and labelled 'constructor' directly from its own node type rather than through a MethodDefinition parent.
    {
      code: 'interface I {\n  new (a: number, b?: number, c?: number): I;\n}',
      errors: [{ messageId: 'tooManyTrailingOptional', data: { kind: 'constructor', count: 2, names: 'b, c' }, suggestions: [] }],
    },
    // Bail-out: a default-valued DESTRUCTURED parameter (the AssignmentPattern's own left side is an ObjectPattern, not a plain Identifier) in the run — there is no single bindable name to move into the new destructure, the same underlying "unresolvable" mechanism as a bare destructured parameter with no default.
    {
      code: 'function f(a: number, { b }: { b: number } = { b: 1 }, c?: number): void {\n  return;\n}',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'function', count: 2, names: "{ b }: { b: number } = { b: 1 }, c" },
          suggestions: [],
        },
      ],
    },
    // An object-literal method shorthand (a `Property` with `method: true`) — fixable, and labelled 'method' via that parent rather than a MethodDefinition.
    {
      code: 'const obj = {\n  m(a: number, b?: number, c?: number) {\n    return a;\n  },\n};',
      errors: [
        {
          messageId: 'tooManyTrailingOptional',
          data: { kind: 'method', count: 2, names: 'b, c' },
          suggestions: [
            {
              messageId: 'wrapInOptionsObject',
              output: 'const obj = {\n  m(a: number, options?: { b?: number; c?: number }) {\n  const { b, c } = options ?? {};\n    return a;\n  },\n};',
            },
          ],
        },
      ],
    },
  ],
});
