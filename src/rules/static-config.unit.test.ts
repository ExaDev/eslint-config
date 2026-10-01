import { parse } from '@typescript-eslint/typescript-estree';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import { describe, expect, it } from 'vitest';
import { createStaticConfig } from './static-config';

const HELPERS: ReadonlySet<string> = new Set(['defineConfig', 'mergeConfig']);
const NONE: ReadonlySet<string> = new Set();

function configFor(source: string, filePath: string) {
  return createStaticConfig(parse(source, { filePath, loc: true, range: true }));
}

interface KeysOptions {
  readonly helpers?: ReadonlySet<string>;
  readonly filePath?: string;
}

function keysOf(source: string, { helpers = HELPERS, filePath = 'config.ts' }: KeysOptions = {}): readonly (readonly string[])[] {
  return configFor(source, filePath)
    .configObjects(helpers)
    .map((object) =>
      object.properties.flatMap((member) => (member.type === AST_NODE_TYPES.Property && member.key.type === AST_NODE_TYPES.Identifier ? [member.key.name] : [])),
    );
}

describe('configObjects', () => {
  it('finds the object literal of a default export, with or without a type-only wrapper', () => {
    expect(keysOf('export default { a: 1 };')).toStrictEqual([['a']]);
    expect(keysOf('export default { a: 1 } as const;')).toStrictEqual([['a']]);
    expect(keysOf('export default { a: 1 } satisfies Config;')).toStrictEqual([['a']]);
  });

  it('finds the arguments of a listed helper, and nothing for an unlisted call', () => {
    expect(keysOf('export default defineConfig({ a: 1 });')).toStrictEqual([['a']]);
    expect(keysOf('export default mergeConfig(base, { b: 1 });')).toStrictEqual([['b']]);
    expect(keysOf('export default vite.defineConfig({ a: 1 });')).toStrictEqual([['a']]);
    expect(keysOf('export default build({ a: 1 });')).toStrictEqual([]);
    expect(keysOf('export default defineConfig({ a: 1 });', { helpers: NONE })).toStrictEqual([]);
  });

  it('follows the elements of an array and skips spreads and holes', () => {
    expect(keysOf('export default [{ a: 1 }, ...others, , { b: 1 }];')).toStrictEqual([['a'], ['b']]);
  });

  it('follows an identifier to a top-level const, repeatedly, and stops at a cycle', () => {
    expect(keysOf('const inner = { a: 1 }; const outer = inner; export default outer;')).toStrictEqual([['a']]);
    expect(keysOf('export const shared = { a: 1 };\nexport default shared;')).toStrictEqual([['a']]);
    expect(keysOf('const a = b; const b = a; export default a;')).toStrictEqual([]);
  });

  it('does not follow a let, an import or an unknown identifier', () => {
    expect(keysOf('let value = { a: 1 }; export default value;')).toStrictEqual([]);
    expect(keysOf("import value from './value'; export default value;")).toStrictEqual([]);
    expect(keysOf('export default missing;')).toStrictEqual([]);
  });

  it('finds the value a function form returns', () => {
    expect(keysOf('export default defineConfig(() => ({ a: 1 }));')).toStrictEqual([['a']]);
    expect(keysOf('export default defineConfig(async () => ({ a: 1 }));')).toStrictEqual([['a']]);
    expect(keysOf('export default defineConfig(({ mode }) => { return { a: 1 }; });')).toStrictEqual([['a']]);
    expect(keysOf('export default defineConfig(function () { if (x) { return { a: 1 }; } else return { b: 1 }; });')).toStrictEqual([['a'], ['b']]);
    expect(keysOf('export default function () { return { a: 1 }; }')).toStrictEqual([['a']]);
    expect(keysOf('export default defineConfig(() => { return; });')).toStrictEqual([]);
  });

  it('finds both branches of a conditional and the argument of an await', () => {
    expect(keysOf('export default cond ? { a: 1 } : { b: 1 };')).toStrictEqual([['a'], ['b']]);
    expect(keysOf('export default defineConfig(async () => await { a: 1 });')).toStrictEqual([['a']]);
  });

  it('finds CommonJS and export-equals forms', () => {
    expect(keysOf('module.exports = { a: 1 };', { filePath: 'config.cjs' })).toStrictEqual([['a']]);
    expect(keysOf('export = { a: 1 };')).toStrictEqual([['a']]);
    expect(keysOf('exports.other = { a: 1 };', { filePath: 'config.cjs' })).toStrictEqual([]);
    expect(keysOf('module.exports += { a: 1 };', { filePath: 'config.cjs' })).toStrictEqual([]);
    expect(keysOf("module['exports'] = { a: 1 };", { filePath: 'config.cjs' })).toStrictEqual([]);
    expect(keysOf('other.exports = { a: 1 };', { filePath: 'config.cjs' })).toStrictEqual([]);
  });

  it('finds nothing without a default export', () => {
    expect(keysOf('export const config = { a: 1 };')).toStrictEqual([]);
    expect(keysOf('foo();')).toStrictEqual([]);
  });
});

describe('configGroups and lookupGroup', () => {
  function groupLookup(source: string, name: string) {
    const config = configFor(source, 'config.ts');
    const [group] = config.configGroups(HELPERS);
    if (group === undefined) throw new Error('no group');

    return { group, found: config.lookupGroup(group, name) };
  }

  it('makes one group of the arguments of a helper call, marking an argument that is not visible', () => {
    const { group } = groupLookup('export default defineConfig(base, { a: 1 }, ...more);', 'a');
    expect(group.map((member) => member !== undefined)).toStrictEqual([false, true, false]);
  });

  it('makes a group of each element of an array and of each branch of a conditional', () => {
    expect(configFor('export default [{ a: 1 }, defineConfig({ b: 1 }, { c: 1 })];', 'config.ts').configGroups(HELPERS).map((group) => group.length)).toStrictEqual([1, 2]);
    expect(configFor('export default x ? { a: 1 } : { b: 1 };', 'config.ts').configGroups(HELPERS)).toHaveLength(2);
  });

  it('lets the last argument that spells a key decide it', () => {
    expect(groupLookup('export default defineConfig({ a: 1 }, { a: 2 });', 'a').found).toMatchObject({ kind: 'present' });
    expect(groupLookup('export default defineConfig({ a: 1 }, { b: 2 });', 'a').found).toMatchObject({ kind: 'present' });
    expect(groupLookup('export default defineConfig({ a: 1 }, { b: 2 });', 'c').found).toStrictEqual({ kind: 'absent' });
  });

  it('is opaque when an argument that is not visible comes after the last spelling, and decided when it comes before', () => {
    expect(groupLookup('export default defineConfig({ a: 1 }, base);', 'a').found).toStrictEqual({ kind: 'opaque' });
    expect(groupLookup('export default defineConfig({ b: 1 }, base);', 'a').found).toStrictEqual({ kind: 'opaque' });
    expect(groupLookup('export default defineConfig(base, { a: 1 });', 'a').found).toMatchObject({ kind: 'present' });
    expect(groupLookup('export default defineConfig(base, { b: 1 });', 'a').found).toStrictEqual({ kind: 'opaque' });
  });
});

describe('lookup', () => {
  const lookupIn = (source: string, name: string) => {
    const config = configFor(`export default ${source};`, 'config.ts');
    const [object] = config.configObjects(HELPERS);
    if (object === undefined) throw new Error('Unreachable: the fixture is an object literal.');

    return config.lookup(object, name);
  };

  it('finds a plain, quoted, template and computed-literal key', () => {
    expect(lookupIn('{ a: 1 }', 'a').kind).toBe('present');
    expect(lookupIn("{ 'a': 1 }", 'a').kind).toBe('present');
    expect(lookupIn('{ [`a`]: 1 }', 'a').kind).toBe('present');
    expect(lookupIn("{ ['a']: 1 }", 'a').kind).toBe('present');
  });

  it('reports a key spelled nowhere as absent', () => {
    expect(lookupIn('{ a: 1 }', 'b').kind).toBe('absent');
    expect(lookupIn('{}', 'a').kind).toBe('absent');
  });

  it('takes the last spelling of a repeated key', () => {
    const found = lookupIn('{ a: 1, a: 2 }', 'a');
    expect(found.kind).toBe('present');
    expect(found.kind === 'present' && found.value.type === AST_NODE_TYPES.Literal && found.value.value).toBe(2);
  });

  it('is opaque when a later spread or non-literal computed key could override or supply the key', () => {
    expect(lookupIn('{ a: 1, ...rest }', 'a').kind).toBe('opaque');
    expect(lookupIn('{ ...rest }', 'a').kind).toBe('opaque');
    expect(lookupIn('{ [key]: 1 }', 'a').kind).toBe('opaque');
    expect(lookupIn('{ a: 1, [key]: 1 }', 'a').kind).toBe('opaque');
  });

  it('is present when the spread comes before the explicit key, which wins', () => {
    expect(lookupIn('{ ...rest, a: 1 }', 'a').kind).toBe('present');
  });

  it('resolves a shorthand property through its const', () => {
    const config = configFor('const a = true; export default { a };', 'config.ts');
    const [object] = config.configObjects(HELPERS);
    const found = object === undefined ? undefined : config.literalProperty(object, 'a');
    expect(found?.value).toStrictEqual({ known: true, value: true });
  });
});

describe('literal', () => {
  const literalOf = (expression: string) => {
    const config = configFor(`export default { a: ${expression} };`, 'config.ts');
    const [object] = config.configObjects(HELPERS);
    const found = object === undefined ? undefined : config.literalProperty(object, 'a');
    if (found === undefined) throw new Error('Unreachable: the fixture spells key a.');

    return found.value;
  };

  it('reads booleans, numbers, strings, null and undefined', () => {
    expect(literalOf('true')).toStrictEqual({ known: true, value: true });
    expect(literalOf('false')).toStrictEqual({ known: true, value: false });
    expect(literalOf('42')).toStrictEqual({ known: true, value: 42 });
    expect(literalOf("'text'")).toStrictEqual({ known: true, value: 'text' });
    expect(literalOf('null')).toStrictEqual({ known: true, value: null });
    expect(literalOf('undefined')).toStrictEqual({ known: true, value: undefined });
  });

  it('reads a signed number, a plain template and a wrapped literal', () => {
    expect(literalOf('-1')).toStrictEqual({ known: true, value: -1 });
    expect(literalOf('+1')).toStrictEqual({ known: true, value: 1 });
    expect(literalOf('`text`')).toStrictEqual({ known: true, value: 'text' });
    expect(literalOf('true as const')).toStrictEqual({ known: true, value: true });
  });

  it('does not read a computed value', () => {
    expect(literalOf('!!process.env.CI')).toStrictEqual({ known: false });
    expect(literalOf('`a${b}`')).toStrictEqual({ known: false });
    expect(literalOf('-x')).toStrictEqual({ known: false });
    expect(literalOf('!1')).toStrictEqual({ known: false });
    expect(literalOf('/re/u')).toStrictEqual({ known: false });
    expect(literalOf('10n')).toStrictEqual({ known: false });
    expect(literalOf('call()')).toStrictEqual({ known: false });
    expect(literalOf('other')).toStrictEqual({ known: false });
  });
});
