import { RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import noBoundariesIgnore, { BOUNDARIES_IGNORE_DIRECTIVE, commentLocation } from './no-boundaries-ignore';
import { turboOptionsSchema } from './turbo-options';

const ruleTester = new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } });

const ALLOW = [{ boundaries: { allowIgnore: [{ files: ['scripts/**', '!scripts/strict/**'], reason: 'build scripts import the workspace root' }] } }];
const MESSAGE =
  'A "@boundaries-ignore" comment hides an import that "turbo boundaries" reports. Fix the import, or list this file under "boundaries.allowIgnore" with a reason.';

describe('no-boundaries-ignore meta', () => {
  it('carries the documented docs, schema and message', () => {
    const { meta } = noBoundariesIgnore;
    if (meta === undefined) throw new Error('Unreachable: the rule always defines its own meta object literal.');
    expect(meta.type).toBe('problem');
    expect(meta.schema).toEqual([turboOptionsSchema]);
    expect(meta.docs?.description).toBe('Disallow the @boundaries-ignore comment, outside the files listed in boundaries.allowIgnore.');
    expect(meta.docs?.url).toBe('https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-boundaries-ignore.ts');
    expect(meta.messages).toEqual({ boundariesIgnore: MESSAGE });
  });

  it('names the directive turbo honours', () => {
    expect(BOUNDARIES_IGNORE_DIRECTIVE).toBe('@boundaries-ignore');
  });
});

describe('commentLocation', () => {
  const loc = { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } };

  it('returns the location of a comment', () => {
    expect(commentLocation({ loc })).toBe(loc);
  });

  it('throws for a comment without one, which ESLint never produces for parsed source', () => {
    expect(() => commentLocation({})).toThrow(/Unreachable/u);
    expect(() => commentLocation({ loc: null })).toThrow(/Unreachable/u);
  });
});

ruleTester.run('no-boundaries-ignore', noBoundariesIgnore, {
  valid: [
    { code: "import x from 'y';", filename: '/repo/src/a.ts' },
    // Only a comment that starts with the directive counts, the way turbo reads it.
    { code: "// see @boundaries-ignore in the docs\nimport x from 'y';", filename: '/repo/src/a.ts' },
    { code: "/** @boundaries-ignore reason */\nimport x from 'y';", filename: '/repo/src/a.ts' },
    { code: "const s = '// @boundaries-ignore';", filename: '/repo/src/a.ts' },
    // A file the allow list covers.
    { code: "// @boundaries-ignore reason\nimport x from 'y';", filename: `${process.cwd()}/scripts/build.ts`, options: ALLOW },
    // The glob dialect: any depth, and a second entry when the first does not match.
    {
      code: "// @boundaries-ignore reason\nimport x from 'y';",
      filename: `${process.cwd()}/tools/gen.ts`,
      options: [{ boundaries: { allowIgnore: [{ files: ['scripts/**'], reason: 'a' }, { files: ['tools/*.ts'], reason: 'b' }] } }],
    },
  ],
  invalid: [
    { code: "// @boundaries-ignore reason\nimport x from 'y';", filename: '/repo/src/a.ts', errors: [{ message: MESSAGE, line: 1, column: 1, endLine: 1 }] },
    { code: "//@boundaries-ignore\nimport x from 'y';", filename: '/repo/src/a.ts', errors: [{ messageId: 'boundariesIgnore' }] },
    { code: "/*   @boundaries-ignore reason */\nimport x from 'y';", filename: '/repo/src/a.ts', errors: [{ messageId: 'boundariesIgnore', line: 1 }] },
    {
      code: "import a from 'a';\n\n// @boundaries-ignore one\nimport b from 'b';\n// @ts-ignore\n// @boundaries-ignore two\nimport c from 'c';",
      filename: '/repo/src/a.ts',
      errors: [
        { messageId: 'boundariesIgnore', line: 3 },
        { messageId: 'boundariesIgnore', line: 6 },
      ],
    },
    // A file outside the allow list, and one the list excludes.
    { code: "// @boundaries-ignore reason\nimport x from 'y';", filename: `${process.cwd()}/src/a.ts`, options: ALLOW, errors: [{ messageId: 'boundariesIgnore' }] },
    { code: "// @boundaries-ignore reason\nimport x from 'y';", filename: `${process.cwd()}/scripts/strict/a.ts`, options: ALLOW, errors: [{ messageId: 'boundariesIgnore' }] },
    // An empty allow list tolerates nothing.
    { code: "// @boundaries-ignore reason\nimport x from 'y';", filename: `${process.cwd()}/scripts/a.ts`, options: [{ boundaries: { allowIgnore: [] } }], errors: [{ messageId: 'boundariesIgnore' }] },
    { code: "// @boundaries-ignore reason\nimport x from 'y';", filename: `${process.cwd()}/scripts/a.ts`, options: [{ boundaries: {} }], errors: [{ messageId: 'boundariesIgnore' }] },
  ],
});
