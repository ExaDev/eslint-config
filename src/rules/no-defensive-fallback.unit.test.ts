import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { readAllowedScopes } from './no-defensive-fallback';

describe('no-defensive-fallback meta', () => {
  it('names its docs page after the rule file', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-defensive-fallback.ts');
  });

  it('carries the exact description and default options', () => {
    expect(rule.meta.docs?.description).toBe('Disallow an empty-literal fallback after ?? or ||, and a catch that discards the error and returns nothing or a fixed value.');
    expect(rule.meta.defaultOptions).toStrictEqual([{}]);
  });

  it('points at modelling absence and at the allow option in its messages', () => {
    expect(rule.meta.messages.emptyFallback).toBe(
      'A fallback of `{{ fallback }}` after `{{ operator }}` turns a missing value into a plausible one, so the absence never reaches the code that could handle it. Model the value as `T | undefined` and handle the absence where it is meaningful, or list this file under "allow" with a reason.',
    );
    expect(rule.meta.messages.swallowedError).toBe(
      'This {{ construct }} discards the error and {{ outcome }}, so a failure becomes indistinguishable from success. Rethrow it, handle it, or let the caller see it, or list this file under "allow" with a reason.',
    );
  });
});

describe('readAllowedScopes', () => {
  const cwd = '/repo';

  it('reads no scopes when nothing is allowed', () => {
    expect(readAllowedScopes({})).toStrictEqual([]);
  });

  it('builds a scope per entry from a glob string or a glob list, relative to the working directory', () => {
    const [single, several] = readAllowedScopes({
      allow: [
        { files: 'src/options/**', reason: 'reads optional user options' },
        { files: ['scripts/**', '!scripts/strict/**'], reason: 'build scripts' },
      ],
    });
    expect(single?.('/repo/src/options/a.ts', cwd)).toBe(true);
    expect(single?.('/repo/src/other/a.ts', cwd)).toBe(false);
    expect(several?.('/repo/scripts/build.ts', cwd)).toBe(true);
    expect(several?.('/repo/scripts/strict/build.ts', cwd)).toBe(false);
  });

  it('widens a glob without a slash to any depth, as the per-file rules do', () => {
    const [bare] = readAllowedScopes({ allow: [{ files: 'config.ts', reason: 'r' }] });
    expect(bare?.('/repo/config.ts', cwd)).toBe(true);
    expect(bare?.('/repo/src/config.ts', cwd)).toBe(true);
    expect(bare?.('/repo/src/other.ts', cwd)).toBe(false);
  });

  it('rejects malformed options, naming the option', () => {
    expect(() => readAllowedScopes('allow')).toThrow(/"exadev\/no-defensive-fallback" options must be an object/u);
    expect(() => readAllowedScopes({ allowed: [] })).toThrow(/unknown key "allowed"/u);
    expect(() => readAllowedScopes({ allow: {} })).toThrow(/"exadev\/no-defensive-fallback allow" must be an array of objects/u);
    expect(() => readAllowedScopes({ allow: [{ files: 'a.ts' }] })).toThrow(/needs a non-empty string "reason"/u);
    expect(() => readAllowedScopes({ allow: [{ files: 'a.ts', reason: '' }] })).toThrow(/needs a non-empty string "reason"/u);
    expect(() => readAllowedScopes({ allow: [{ files: 'a.ts', reason: 'r', extra: 1 }] })).toThrow(/unknown key "extra"/u);
    expect(() => readAllowedScopes({ allow: [{ files: [], reason: 'r' }] })).toThrow(/"exadev\/no-defensive-fallback allow files"/u);
    expect(() => readAllowedScopes({ allow: [{ reason: 'r' }] })).toThrow(/"exadev\/no-defensive-fallback allow files"/u);
  });
});

// The rule reads syntax only, so no type information is needed.
const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, sourceType: 'module' } });

const fallback = (operator: string, fallbackText: string) => ({ messageId: 'emptyFallback' as const, data: { operator, fallback: fallbackText } });
const swallowed = (construct: string, outcome: string) => ({ messageId: 'swallowedError' as const, data: { construct, outcome } });

ruleTester.run('no-defensive-fallback', rule, {
  valid: [
    // A non-empty default carries information the caller chose.
    'const a = value ?? "default";',
    'const a = value ?? 10;',
    'const a = value || [1];',
    'const a = value ?? { key: 1 };',
    'const a = value ?? other;',
    'const a = value ?? true;',
    'const a = value ?? 1n;',
    // Only the right operand is a fallback; an empty literal on the left, or under &&, is not.
    'const a = [] ?? value;',
    'const a = value && [];',
    'const a = value ? value : [];',
    // A template with content or an expression is not empty.
    'const a = value ?? `text`;',
    'const a = value ?? `${other}`;',
    // `undefined` and other identifiers are not in the list.
    'const a = value ?? undefined;',
    // Assignment forms with other operators.
    'value += [];',
    'value &&= [];',
    'value ??= defaults;',
    // A catch that does real work, in whatever order.
    'try { run(); } catch (error) { report(error); }',
    'try { run(); } catch (error) { report(error); return null; }',
    'try { run(); } catch (error) { throw error; }',
    'function f() { try { return run(); } catch (error) { return { error }; } }',
    'function f() { try { return run(); } catch (error) { return fallbackFor(error); } }',
    'function f() { try { return run(); } catch (error) { return [error]; } }',
    'function f() { try { return run(); } catch (error) { return { ...base, n: 1 }; } }',
    'function f() { try { return run(); } catch (error) { return { [key]: 1 }; } }',
    'function f() { try { return run(); } catch (error) { return { method() { return 1; } }; } }',
    'function f() { try { return run(); } catch (error) { return [...items]; } }',
    'function f() { try { return run(); } catch (error) { return `${error}`; } }',
    'function f() { try { return run(); } catch (error) { return -value; } }',
    'function f() { try { return run(); } catch (error) { return typeof error; } }',
    'function f() { try { return run(); } catch { return typeof 1; } }',
    // An accessor's value is a function, never a fixed value.
    'function f() { try { return run(); } catch { return { get n() { return load(); } }; } }',
    // A continue that comes after other work is not a swallow.
    'for (const item of items) { try { run(item); } catch (error) { report(error); continue; } }',
    'try { run(); } catch { break; }',
    // A try with only a finally has no catch clause.
    'try { run(); } finally { cleanup(); }',
    // A rejection handler that does real work, or that is not a function.
    'promise.catch((error) => report(error));',
    'promise.catch((error) => { report(error); });',
    'promise.catch((error) => ({ error }));',
    'promise.catch(handler);',
    'promise.catch();',
    'promise.catch(() => null, extra);',
    'promise["catch"](() => null);',
    'promise.then(() => null);',
    'catchIt(() => null);',
    // A call that only happens to have a method named catch on a non-call member.
    'const c = promise.catch;',
    // An allowed file is skipped entirely.
    { code: 'const a = value ?? [];', filename: 'src/options/read.ts', options: [{ allow: [{ files: ['src/options/**'], reason: 'reads optional user options' }] }] },
    { code: 'try { run(); } catch { return; }', filename: 'src/options/read.ts', options: [{ allow: [{ files: ['src/options/**'], reason: 'optional dependency probe' }] }] },
  ],
  invalid: [
    { code: 'const a = value ?? [];', errors: [fallback('??', '[]')] },
    { code: 'const a = value ?? {};', errors: [fallback('??', '{}')] },
    { code: "const a = value ?? '';", errors: [fallback('??', "''")] },
    { code: 'const a = value ?? "";', errors: [fallback('??', '""')] },
    { code: 'const a = value ?? ``;', errors: [fallback('??', '``')] },
    { code: 'const a = value ?? 0;', errors: [fallback('??', '0')] },
    { code: 'const a = value ?? 0n;', errors: [fallback('??', '0n')] },
    { code: 'const a = value ?? false;', errors: [fallback('??', 'false')] },
    { code: 'const a = value ?? null;', errors: [fallback('??', 'null')] },
    { code: 'const a = value || [];', errors: [fallback('||', '[]')] },
    { code: 'const a = value || {};', errors: [fallback('||', '{}')] },
    { code: "const a = value || '';", errors: [fallback('||', "''")] },
    { code: 'const a = value || 0;', errors: [fallback('||', '0')] },
    { code: 'const a = value || false;', errors: [fallback('||', 'false')] },
    { code: 'const a = value || null;', errors: [fallback('||', 'null')] },
    // The fallback is found behind a type-only wrapper, which changes nothing at runtime.
    { code: 'const a = value ?? ([] as string[]);', errors: [fallback('??', '[] as string[]')] },
    { code: 'const a = value ?? ({} satisfies Options);', errors: [fallback('??', '{} satisfies Options')] },
    { code: 'const a = value ?? <string[]>[];', errors: [fallback('??', '<string[]>[]')] },
    // A chain reports each fallback once.
    { code: 'const a = first ?? second ?? [];', errors: [fallback('??', '[]')] },
    { code: 'const a = (first || 0) ?? "";', errors: [fallback('||', '0'), fallback('??', '""')] },
    // Logical assignment is the same fallback.
    { code: 'value ??= [];', errors: [fallback('??=', '[]')] },
    { code: 'value ||= {};', errors: [fallback('||=', '{}')] },
    { code: 'object.count ??= 0;', errors: [fallback('??=', '0')] },
    // A catch clause that does nothing, even with a comment or an unused binding.
    { code: 'try { run(); } catch {}', errors: [swallowed('catch clause', 'does nothing')] },
    { code: 'try { run(); } catch (error) {}', errors: [swallowed('catch clause', 'does nothing')] },
    { code: 'try { run(); } catch {\n  // ignored\n}', errors: [swallowed('catch clause', 'does nothing')] },
    // A catch clause that only moves on to the next iteration.
    { code: 'for (const item of items) { try { run(item); } catch { continue; } }', errors: [swallowed('catch clause', 'skips to the next iteration')] },
    { code: 'for (const item of items) { try { run(item); } catch { continue outer; } }', errors: [swallowed('catch clause', 'skips to the next iteration')] },
    // A catch clause that returns nothing, or a fixed value.
    { code: 'function f() { try { return run(); } catch { return; } }', errors: [swallowed('catch clause', 'returns nothing')] },
    { code: 'function f() { try { return run(); } catch (error) { return undefined; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return null; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return false; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return -1; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return !0; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return void 0; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return +1; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    // Unreachable statements after the return do not change what the handler does.
    { code: 'function f() { try { return run(); } catch { return null; cleanup(); } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return [,]; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return "none"; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return `none`; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return []; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return [1, [2]]; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return { ok: false, items: [] }; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    { code: 'function f() { try { return run(); } catch { return [] as string[]; } }', errors: [swallowed('catch clause', 'returns a fixed value')] },
    // A promise rejection handler that discards the error is the same swallow.
    { code: 'promise.catch(() => null);', errors: [swallowed('.catch() handler', 'returns a fixed value')] },
    { code: 'promise.catch(() => []);', errors: [swallowed('.catch() handler', 'returns a fixed value')] },
    { code: 'promise.catch(() => {});', errors: [swallowed('.catch() handler', 'does nothing')] },
    { code: 'promise.catch((error) => { return; });', errors: [swallowed('.catch() handler', 'returns nothing')] },
    { code: 'promise.catch(function () { return 0; });', errors: [swallowed('.catch() handler', 'returns a fixed value')] },
    { code: 'fetchAll().then(use).catch(() => undefined);', errors: [swallowed('.catch() handler', 'returns a fixed value')] },
    // Both forms in one file are reported independently.
    {
      code: 'const a = value ?? [];\ntry { run(); } catch { return null; }',
      errors: [fallback('??', '[]'), swallowed('catch clause', 'returns a fixed value')],
    },
    // A file outside every allowed glob is still reported.
    {
      code: 'const a = value ?? [];',
      filename: 'src/other/read.ts',
      options: [{ allow: [{ files: ['src/options/**'], reason: 'reads optional user options' }] }],
      errors: [fallback('??', '[]')],
    },
  ],
});
