import { RuleTester } from '@typescript-eslint/rule-tester';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import rule, { readNoExternalMemberJsxTagOptions } from './no-external-member-jsx-tag';

describe('rule metadata', () => {
  it('carries the docs url built from the rule name', () => {
    expect(rule.meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-external-member-jsx-tag.ts');
  });
});

describe('readNoExternalMemberJsxTagOptions', () => {
  it('allows nothing by default', () => {
    const { allowSource, allowTags } = readNoExternalMemberJsxTagOptions({});
    expect(allowSource).toBeUndefined();
    expect(allowTags.size).toBe(0);
  });

  it('compiles allowSources into a matcher that also selects subpaths', () => {
    const { allowSource } = readNoExternalMemberJsxTagOptions({ allowSources: ['@scope/pkg'] });
    expect(allowSource?.('@scope/pkg', '/repo/a.tsx', '/repo')).toBe(true);
    expect(allowSource?.('@scope/pkg/icons', '/repo/a.tsx', '/repo')).toBe(true);
    expect(allowSource?.('@scope/other', '/repo/a.tsx', '/repo')).toBe(false);
  });

  it('reads the allowed tags', () => {
    expect([...readNoExternalMemberJsxTagOptions({ allowTags: ['Ctx.Provider'] }).allowTags]).toStrictEqual(['Ctx.Provider']);
  });

  it.each([
    ['a non-object', 'x', /must be an object/u],
    ['an unknown key', { allow: [] }, /unknown key "allow"/u],
    ['an empty allowSources list', { allowSources: [] }, /"allowSources" to be a non-empty array/u],
    ['a duplicated tag', { allowTags: ['A.B', 'A.B'] }, /"allowTags" to be a non-empty array of distinct/u],
    ['a non-string source', { allowSources: [1] }, /"allowSources" to be a non-empty array/u],
    ['an extglob source', { allowSources: ['@(ui|lib)'] }, /"no-external-member-jsx-tag\.allowSources" must not use extglob syntax/u],
  ])('rejects %s', (_label, value, message) => {
    expect(() => readNoExternalMemberJsxTagOptions(value)).toThrow(message);
  });
});

const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' } });

const report = (tag: string, root: string, source: string) => ({ messageId: 'externalMemberTag' as const, data: { tag, root, source } });

ruleTester.run('no-external-member-jsx-tag', rule, {
  valid: [
    // Plain tags carry no member access.
    'import { Icon } from "lib";\nconst a = <Icon />;',
    'import Lib from "lib";\nconst a = <div><Lib /></div>;',
    // A relative import is the project's own code.
    'import * as Ui from "./ui";\nconst a = <Ui.Icon />;',
    'import * as Ui from "..";\nconst a = <Ui.Icon />;',
    'import * as Ui from "../ui";\nconst a = <Ui.Icon />;',
    'import * as Ui from ".";\nconst a = <Ui.Icon />;',
    'import Ui from ".";\nconst a = <Ui.Icon />;',
    // A root that is not an import.
    'const Ctx = createContext(null);\nconst a = <Ctx.Provider value={1} />;',
    'function f(Lib) { return <Lib.Icon />; }',
    'const a = <Missing.Icon />;',
    'import * as Ui from "./ui";\nfunction f() { const Ui = local; return <Ui.Icon />; }',
    'import Local = Namespace.Member;\nconst a = <Local.Icon />;',
    // A file marked as client code is out of scope.
    '"use client";\nimport * as Lib from "lib";\nconst a = <Lib.Icon />;',
    // Allowed sources and tags.
    { code: 'import * as Lib from "lib";\nconst a = <Lib.Icon />;', options: [{ allowSources: ['lib'] }] },
    { code: 'import * as Lib from "lib/icons";\nconst a = <Lib.Icon />;', options: [{ allowSources: ['lib'] }] },
    { code: 'import { Ctx } from "state";\nconst a = <Ctx.Provider />;', options: [{ allowTags: ['Ctx.Provider'] }] },
    { code: 'import * as Lib from "lib";\nconst a = <Lib.Icons.Home />;', options: [{ allowTags: ['Lib.Icons.Home'] }] },
  ],
  invalid: [
    { code: 'import * as Lib from "lib";\nconst a = <Lib.Icon />;', errors: [report('Lib.Icon', 'Lib', 'lib')] },
    { code: 'import Lib from "lib";\nconst a = <Lib.Icon />;', errors: [report('Lib.Icon', 'Lib', 'lib')] },
    { code: 'import { Lib } from "lib";\nconst a = <Lib.Icon />;', errors: [report('Lib.Icon', 'Lib', 'lib')] },
    { code: 'import { Lib as Alias } from "lib";\nconst a = <Alias.Icon />;', errors: [report('Alias.Icon', 'Alias', 'lib')] },
    { code: 'import Lib = require("lib");\nconst a = <Lib.Icon />;', errors: [report('Lib.Icon', 'Lib', 'lib')] },
    // The root is what is bound to an import, however deep the member chain.
    { code: 'import * as Lib from "lib";\nconst a = <Lib.Icons.Home />;', errors: [report('Lib.Icons.Home', 'Lib', 'lib')] },
    // A non-relative alias to project code is reported too: the rule cannot tell, so it is listed in allowSources.
    { code: 'import * as Ui from "@/ui";\nconst a = <Ui.Icon />;', errors: [report('Ui.Icon', 'Ui', '@/ui')] },
    { code: 'import * as Ui from "@/ui";\nconst a = <Ui.Icon />;', options: [{ allowSources: ['@/other'] }], errors: [report('Ui.Icon', 'Ui', '@/ui')] },
    { code: 'import * as Lib from "lib";\nconst a = <Lib.Icon />;', options: [{ allowTags: ['Lib.Other'] }], errors: [report('Lib.Icon', 'Lib', 'lib')] },
    // A bare specifier that begins with a dot is a package name, not a relative path.
    { code: 'import * as Lib from ".hidden";\nconst a = <Lib.Icon />;', errors: [report('Lib.Icon', 'Lib', '.hidden')] },
    // A directive that is not in the prologue marks nothing.
    { code: 'import * as Lib from "lib";\n"use client";\nconst a = <Lib.Icon />;', errors: [report('Lib.Icon', 'Lib', 'lib')] },
    // An element with children is reported once, on the opening tag.
    { code: 'import * as Lib from "lib";\nconst a = <Lib.Box><Lib.Icon /></Lib.Box>;', errors: [report('Lib.Box', 'Lib', 'lib'), report('Lib.Icon', 'Lib', 'lib')] },
  ],
});
