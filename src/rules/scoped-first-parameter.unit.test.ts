import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, expect, it } from 'vitest';
import rule, { readScopedFirstParameterOptions } from './scoped-first-parameter';

describe('scoped-first-parameter metadata', () => {
  it('names its docs page after the rule file, and says the check is on the signature', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/scoped-first-parameter.ts');
    expect(rule.meta.docs?.description).toContain('Checks the signature, not that the scope is used or that data is isolated.');
  });
});

describe('readScopedFirstParameterOptions', () => {
  it('compiles the interface pattern and keeps the parameter requirement', () => {
    const read = readScopedFirstParameterOptions({ interfaces: 'Repository$', parameter: { name: 'scope', type: 'TenantScope' } });
    expect(read.interfaces.test('OrderRepository')).toBe(true);
    expect(read.interfaces.test('RepositoryFactory')).toBe(false);
    expect(read.name).toBe('scope');
    expect(read.type).toBe('TenantScope');
  });

  it('leaves the name undefined when it is not required', () => {
    expect(readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: { type: 'TenantScope' } }).name).toBeUndefined();
  });

  it('throws for options that are missing or malformed, naming the rule', () => {
    expect(() => readScopedFirstParameterOptions({})).toThrow('"scoped-first-parameter" needs an "interfaces" regular expression and a "parameter" object with a "type".');
    expect(() => readScopedFirstParameterOptions(undefined)).toThrow('needs an "interfaces" regular expression');
    expect(() => readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: 'TenantScope' })).toThrow('needs an "interfaces" regular expression');
    expect(() => readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: {} })).toThrow('needs a non-empty string "parameter.type".');
    expect(() => readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: { type: '' } })).toThrow('needs a non-empty string "parameter.type".');
    expect(() => readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: { type: 'S', name: '' } })).toThrow('needs "parameter.name" to be a non-empty string when given.');
    expect(() => readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: { type: 'S' }, extra: true })).toThrow('has an unknown key "extra"');
    expect(() => readScopedFirstParameterOptions({ interfaces: 'Store$', parameter: { type: 'S', label: 'x' } })).toThrow('has an unknown key "label"');
  });

  it('throws for an interface pattern that is not a regular expression', () => {
    expect(() => readScopedFirstParameterOptions({ interfaces: '(', parameter: { type: 'S' } })).toThrow('"interfaces" is not a valid regular expression');
  });
});

// A type-aware rule needs a real TypeScript project. `allowDefaultProject` runs each inline snippet as an ad hoc single-file project.
const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: { allowDefaultProject: ['*.ts*'] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

const options = [{ interfaces: 'Repository$|Store$', parameter: { type: 'TenantScope' } }] as const;
const named = [{ interfaces: 'Repository$', parameter: { name: 'scope', type: 'TenantScope' } }] as const;

const PRELUDE = 'interface TenantScope { readonly tenantId: string }\ntype Order = { readonly id: string };\n';
const wrong = (owner: string, method: string, actual: string) => ({ messageId: 'wrongType' as const, data: { owner, method, type: 'TenantScope', actual } });
const missing = (owner: string, method: string) => ({ messageId: 'missingParameter' as const, data: { owner, method, type: 'TenantScope' } });

ruleTester.run('scoped-first-parameter', rule, {
  valid: [
    // Every method takes the scope first.
    { code: `${PRELUDE}interface OrderRepository { find(scope: TenantScope, id: string): Promise<Order | undefined>; list(scope: TenantScope): Promise<Order[]> }`, options },
    // The property-with-function-type spelling is checked too.
    { code: `${PRELUDE}interface OrderRepository { find: (scope: TenantScope, id: string) => Promise<Order | undefined> }`, options },
    // An interface whose name does not match is not checked.
    { code: `${PRELUDE}interface OrderService { list(): Promise<Order[]> }`, options },
    // The pattern is a regular expression on the name, so an anchored pattern does not match a longer name.
    { code: `${PRELUDE}interface RepositoryFactory { create(): void }`, options: named },
    // A type alias with an object body is checked.
    { code: `${PRELUDE}type OrderStore = { find(scope: TenantScope, id: string): Promise<Order | undefined> };`, options },
    // A second alias of the scope type resolves to the same declared type.
    { code: `${PRELUDE}type Scope = TenantScope;\ninterface OrderRepository { list(scope: Scope): Promise<Order[]> }`, options },
    // An alias of an object-literal alias resolves to the alias that declared it.
    { code: 'type TenantScope = { readonly tenantId: string };\ntype Scope = TenantScope;\ninterface OrderRepository { list(scope: Scope): void }', options },
    // An import alias under a different name resolves to the type's own declared name.
    { code: 'namespace Auth { export interface TenantScope { readonly tenantId: string } }\nimport Scope = Auth.TenantScope;\ninterface OrderRepository { list(scope: Scope): void }', options },
    // A type parameter constrained to the scope stands for the scope.
    { code: `${PRELUDE}interface OrderRepository { list<S extends TenantScope>(scope: S): void }`, options },
    // TypeScript's this pseudo-parameter is not the first argument.
    { code: `${PRELUDE}interface OrderRepository { list(this: OrderRepository, scope: TenantScope): void }`, options },
    // Accessors and non-function properties are not methods.
    { code: `${PRELUDE}interface OrderRepository { readonly name: string; get size(): number }`, options },
    // Overloads are each checked, and these each conform.
    { code: `${PRELUDE}interface OrderRepository { find(scope: TenantScope, id: string): Order; find(scope: TenantScope): Order[] }`, options },
    // The required name is matched when given.
    { code: `${PRELUDE}interface OrderRepository { list(scope: TenantScope): void }`, options: named },
    // Members of an interface the pattern does not select, even without a scope.
    { code: 'interface Clock { now(): number }', options },
    // A type alias that is not an object type declares no members to check.
    { code: `${PRELUDE}type OrderStore = Map<string, Order>;`, options },
    // An intersection alias checks the members of its literal parts.
    { code: `${PRELUDE}type OrderStore = Iterable<Order> & { find(scope: TenantScope): void };`, options },
  ],
  invalid: [
    { code: `${PRELUDE}interface OrderRepository { list(): Promise<Order[]> }`, options, errors: [missing('OrderRepository', 'list')] },
    { code: `${PRELUDE}interface OrderRepository { list: () => Promise<Order[]> }`, options, errors: [missing('OrderRepository', 'list')] },
    { code: `${PRELUDE}interface OrderRepository { find(id: string): Promise<Order | undefined> }`, options, errors: [wrong('OrderRepository', 'find', 'string')] },
    // A scope in the wrong position is still a wrong first parameter.
    { code: `${PRELUDE}interface OrderRepository { find(id: string, scope: TenantScope): void }`, options, errors: [wrong('OrderRepository', 'find', 'string')] },
    // A structurally identical type of another name is not the scope.
    { code: `${PRELUDE}interface OtherScope { readonly tenantId: string }\ninterface OrderRepository { list(scope: OtherScope): void }`, options, errors: [wrong('OrderRepository', 'list', 'OtherScope')] },
    // A union with the scope does not guarantee one.
    { code: `${PRELUDE}interface OrderRepository { list(scope: TenantScope | undefined): void }`, options, errors: [wrong('OrderRepository', 'list', 'TenantScope | undefined')] },
    // No annotation means no type to resolve.
    { code: `${PRELUDE}interface OrderRepository { list(scope): void }`, options, errors: [wrong('OrderRepository', 'list', 'untyped')] },
    { code: `${PRELUDE}interface OrderRepository { list(scope?: TenantScope): void }`, options, errors: [{ messageId: 'notRequired' }] },
    { code: `${PRELUDE}interface OrderRepository { list(...scopes: TenantScope[]): void }`, options, errors: [{ messageId: 'notRequired' }] },
    // A type alias with an object body.
    { code: `${PRELUDE}type OrderStore = { list(): void };`, options, errors: [missing('OrderStore', 'list')] },
    { code: `${PRELUDE}type OrderStore = Iterable<Order> & { list(): void };`, options, errors: [missing('OrderStore', 'list')] },
    // Each non-conforming overload is reported.
    { code: `${PRELUDE}interface OrderRepository { find(scope: TenantScope, id: string): Order; find(id: string): Order }`, options, errors: [wrong('OrderRepository', 'find', 'string')] },
    // A quoted method name is reported under its text.
    { code: `${PRELUDE}interface OrderRepository { 'find-all'(): void; ['computed'](): void }`, options, errors: [missing('OrderRepository', 'find-all'), missing('OrderRepository', 'computed')] },
    // The name is required when given.
    { code: `${PRELUDE}interface OrderRepository { list(tenant: TenantScope): void }`, options: named, errors: [{ messageId: 'wrongName', data: { owner: 'OrderRepository', method: 'list', type: 'TenantScope', name: 'scope' } }] },
    // Both interfaces the pattern selects are checked.
    { code: `${PRELUDE}interface OrderRepository { list(): void }\ninterface OrderStore { list(): void }`, options, errors: [missing('OrderRepository', 'list'), missing('OrderStore', 'list')] },
  ],
});
