import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { exadevConfig } from './create-config';
import { buildToolingWiringConfig, DEFAULT_PUBLISH_TOOLS, ROOT_TOOLS, toolingRequirements, toolingWiringConfig, type ToolingWiringOptions } from './tooling-wiring';

const throwingRequireFn = () => {
  throw new Error('simulated missing package');
};

const FIXTURES = resolve(import.meta.dirname, '__fixtures__/tooling-wiring');

describe('toolingRequirements', () => {
  it('states publish, root and hooks requirements by default, each under its own condition', () => {
    const [publish, root, hooks, ...rest] = toolingRequirements({});
    expect(rest).toEqual([]);
    expect(publish).toEqual({ when: { private: false }, scripts: [{ name: 'prepublishOnly', includes: ['publint', 'attw'] }], fields: ['engines'] });
    expect(root?.when).toEqual({ root: true });
    expect(root?.scripts).toEqual([
      { name: 'knip', includes: ['knip'] },
      { name: 'syncpack', includes: ['syncpack'] },
    ]);
    expect(root?.fields).toEqual(['packageManager']);
    expect(root?.files).toHaveLength(2);
    expect(hooks).toEqual({ when: { declares: ['husky'] }, scripts: [{ name: 'prepare', includes: ['husky'] }], files: ['.husky'] });
  });

  it('exposes the defaults it applies', () => {
    expect(DEFAULT_PUBLISH_TOOLS).toEqual(['publint', 'attw']);
    expect(ROOT_TOOLS).toEqual(['knip', 'syncpack']);
  });

  it('accepts a root config under either its file names or its package.json property', () => {
    const files = toolingRequirements({ publish: false, hooks: false }).flatMap((requirement) => requirement.files ?? []);
    expect(files).toEqual([
      expect.objectContaining({ orField: 'knip', glob: expect.stringContaining('.knip.jsonc') as string }),
      expect.objectContaining({ orField: 'syncpack', glob: expect.stringContaining('.syncpackrc.yml') as string }),
    ]);
  });

  it('drops a section given as false', () => {
    expect(toolingRequirements({ publish: false, root: false, hooks: false })).toEqual([]);
    expect(toolingRequirements({ root: false, hooks: false })).toHaveLength(1);
    expect(toolingRequirements({ publish: false, hooks: false })[0]?.when).toEqual({ root: true });
    expect(toolingRequirements({ publish: false, root: false })[0]?.when).toEqual({ declares: ['husky'] });
  });

  it('takes the publish tools and a smoke project from the options', () => {
    const [publish] = toolingRequirements({ publish: { tools: ['publint', 'attw', 'sherif'], smokeProject: 'smoke' }, root: false, hooks: false });
    expect(publish?.scripts).toEqual([{ name: 'prepublishOnly', includes: ['publint', 'attw', 'sherif'] }]);
    expect(publish?.files).toEqual(['smoke']);
  });

  it('takes a subset of the root tools', () => {
    const [root] = toolingRequirements({ publish: false, hooks: false, root: { tools: ['knip'] } });
    expect(root?.scripts).toEqual([{ name: 'knip', includes: ['knip'] }]);
    expect(root?.files).toHaveLength(1);
  });

  it.each<[string, unknown, RegExp]>([
    ['a publish section that is not an object', { publish: true }, /"toolingWiring.publish" must be false or an object/u],
    ['an unknown publish key', { publish: { tool: ['x'] } }, /unknown key "tool"/u],
    ['empty publish tools', { publish: { tools: [] } }, /non-empty array of distinct non-empty strings/u],
    ['an empty smoke project', { publish: { smokeProject: '' } }, /"toolingWiring.publish.smokeProject" must be a non-empty string/u],
    ['a smoke project that is not a string', { publish: { smokeProject: 1 } }, /"toolingWiring.publish.smokeProject" must be a non-empty string/u],
    ['an unknown root tool', { root: { tools: ['knip', 'sherif'] } }, /"toolingWiring.root.tools" names "sherif", which is not one of knip, syncpack/u],
    ['a non-boolean hooks', { hooks: 'yes' }, /"toolingWiring.hooks" must be a boolean/u],
  ])('rejects %s', (_, options, message) => {
    expect(() => toolingRequirements(options as ToolingWiringOptions)).toThrow(message);
  });
});

describe('buildToolingWiringConfig', () => {
  it('wires one package-requirements entry onto package.json, followed by the tool config block', () => {
    const [manifest, tools, ...rest] = buildToolingWiringConfig({});
    expect(rest).toEqual([]);
    expect(manifest?.files).toEqual(['**/package.json']);
    expect(manifest?.language).toBe('json/json');
    expect(manifest?.rules).toEqual({ 'exadev/package-requirements': ['error', { requirements: toolingRequirements({}) }] });
    expect(tools?.rules).toEqual({
      'exadev/vitest-config': 'error',
      'exadev/stryker-break-threshold': 'error',
      'exadev/stryker-thresholds-order': 'error',
      'exadev/playwright-config': 'error',
    });
  });

  it('pairs every tool config glob with the script extensions so a JSON file of the same name is never parsed as a script', () => {
    const files = buildToolingWiringConfig({ publish: false, root: false, hooks: false })[0]?.files;
    expect(files).toEqual(
      expect.arrayContaining([
        ['**/vitest*.config.*', '**/*.{ts,mts,cts,js,mjs,cjs}'],
        ['**/vitest.workspace.*', '**/*.{ts,mts,cts,js,mjs,cjs}'],
        ['**/stryker*.{conf,config}.*', '**/*.{ts,mts,cts,js,mjs,cjs}'],
        ['**/.stryker.{conf,config}.*', '**/*.{ts,mts,cts,js,mjs,cjs}'],
        ['**/playwright*.config.*', '**/*.{ts,mts,cts,js,mjs,cjs}'],
      ]),
    );
  });

  it('needs @eslint/json only for the package.json sections, naming the install command', () => {
    expect(() => buildToolingWiringConfig({ requireFn: throwingRequireFn })).toThrow(/^@exadev\/eslint-config: tooling wiring needs '@eslint\/json'.*pnpm add -D @eslint\/json$/u);
    expect(buildToolingWiringConfig({ publish: false, root: false, hooks: false, requireFn: throwingRequireFn })).toHaveLength(1);
  });

  it('returns nothing when every section is off', () => {
    expect(buildToolingWiringConfig({ publish: false, root: false, hooks: false, toolConfigs: false })).toEqual([]);
  });

  it('returns only the package.json block when the tool configs are off', () => {
    const result = buildToolingWiringConfig({ toolConfigs: false });
    expect(result).toHaveLength(1);
    expect(result[0]?.language).toBe('json/json');
  });

  it('rejects an unknown top-level key', () => {
    expect(() => buildToolingWiringConfig({ publsh: false } as ToolingWiringOptions)).toThrow(/unknown key "publsh"/u);
  });

  describe('toolConfigs', () => {
    const rulesOf = (toolConfigs: NonNullable<ToolingWiringOptions['toolConfigs']>) => buildToolingWiringConfig({ publish: false, root: false, hooks: false, toolConfigs })[0]?.rules;

    it('passes each tool its options', () => {
      expect(
        rulesOf({
          vitest: { forbidNumericMaxWorkers: true, coverageFiles: ['vitest.base.config.ts'] },
          stryker: { min: 80, base: { path: 'stryker.base.config.ts', relativeTo: 'root' } },
          playwright: { fullyParallel: true, workers: false },
        }),
      ).toEqual({
        'exadev/vitest-config': ['error', { forbidNumericMaxWorkers: true }],
        'exadev/vitest-coverage-config': ['error', { files: ['vitest.base.config.ts'] }],
        'exadev/stryker-break-threshold': ['error', { min: 80, base: { path: 'stryker.base.config.ts', relativeTo: 'root' } }],
        'exadev/stryker-thresholds-order': 'error',
        'exadev/playwright-config': ['error', { fullyParallel: true, workers: false }],
      });
    });

    it('adds the coverage base files to the files the block covers', () => {
      const files = buildToolingWiringConfig({ publish: false, root: false, hooks: false, toolConfigs: { vitest: { coverageFiles: ['vitest.base.config.ts'] } } })[0]?.files;
      expect(files).toContainEqual(['vitest.base.config.ts', '**/*.{ts,mts,cts,js,mjs,cjs}']);
    });

    it('leaves out a tool given as false, and its files', () => {
      const [block] = buildToolingWiringConfig({ publish: false, root: false, hooks: false, toolConfigs: { vitest: false, playwright: false } });
      expect(block?.rules).toEqual({ 'exadev/stryker-break-threshold': 'error', 'exadev/stryker-thresholds-order': 'error' });
      expect(JSON.stringify(block?.files)).not.toContain('vitest');
      expect(JSON.stringify(block?.files)).not.toContain('playwright');
    });

    it('wires nothing when every tool is false', () => {
      expect(buildToolingWiringConfig({ publish: false, root: false, hooks: false, toolConfigs: { vitest: false, stryker: false, playwright: false } })).toEqual([]);
    });

    it.each<[string, unknown, RegExp]>([
      ['a section that is not an object', true, /"toolingWiring.toolConfigs" must be false or an object/u],
      ['an unknown tool', { jest: {} }, /unknown key "jest"/u],
      ['an unknown vitest key', { vitest: { workers: 1 } }, /unknown key "workers"/u],
      ['a non-boolean forbidNumericMaxWorkers', { vitest: { forbidNumericMaxWorkers: 1 } }, /"toolingWiring.toolConfigs.vitest.forbidNumericMaxWorkers" must be a boolean/u],
      ['coverage files that are not an array', { vitest: { coverageFiles: 'a' } }, /"toolingWiring.toolConfigs.vitest.coverageFiles" must be an array of glob strings/u],
      ['a non-numeric stryker min', { stryker: { min: '80' } }, /"toolingWiring.toolConfigs.stryker.min" must be a number/u],
      ['a malformed stryker base', { stryker: { base: 'x' } }, /toolingWiring.toolConfigs.stryker.base/u],
      ['a non-boolean playwright setting', { playwright: { workers: 'two' } }, /"toolingWiring.toolConfigs.playwright.workers" must be a boolean/u],
      ['a non-boolean fullyParallel', { playwright: { fullyParallel: 'yes' } }, /"toolingWiring.toolConfigs.playwright.fullyParallel" must be a boolean/u],
    ])('rejects %s', (_, toolConfigs, message) => {
      expect(() => rulesOf(toolConfigs as NonNullable<ToolingWiringOptions['toolConfigs']>)).toThrow(message);
    });
  });
});

describe('toolingWiringConfig', () => {
  it('returns the same blocks as the internal builder', () => {
    expect(toolingWiringConfig({ root: false })).toEqual(buildToolingWiringConfig({ root: false }));
  });
});

describe('exadevConfig toolingWiring', () => {
  const base = { react: false, nextjs: false, turboEnv: false, packageJsonKeyOrder: false, gitignore: false } as const;
  const wiringRules = (config: ReturnType<typeof exadevConfig>) => config.filter((block) => block.rules !== undefined && 'exadev/package-requirements' in block.rules);

  it('wires the preset only when the option is given', () => {
    expect(wiringRules(exadevConfig(base))).toHaveLength(0);
    expect(wiringRules(exadevConfig({ ...base, toolingWiring: {} }))).toHaveLength(1);
  });
});

// The wiring end to end: the real ESLint reads the generated config, so the rule options, the JSON language and the file scopes are exercised together.
describe('the wired config under ESLint', () => {
  async function lint(directory: string, files: readonly string[], options: ToolingWiringOptions = {}) {
    const cwd = resolve(FIXTURES, directory);
    const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: toolingWiringConfig(options) });
    const results = await eslint.lintFiles([...files]);

    return results.flatMap((result) => result.messages.map((message) => ({ file: result.filePath.slice(cwd.length + 1), rule: message.ruleId, message: message.message })));
  }

  it('accepts a root that wires every tool', async () => {
    expect(await lint('wired', ['package.json', 'vitest.config.js'])).toEqual([]);
  });

  it('reports every missing piece of an unwired root', async () => {
    const messages = await lint('unwired', ['package.json', 'vitest.config.js']);
    expect(messages).toEqual([
      { file: 'package.json', rule: 'exadev/package-requirements', message: 'Package "unwired" must set: engines, packageManager.' },
      { file: 'package.json', rule: 'exadev/package-requirements', message: expect.stringContaining('is missing required file(s): one of knip.json, knip.jsonc, .knip.json') as string },
      { file: 'package.json', rule: 'exadev/package-requirements', message: 'Package "unwired" is missing required script(s): knip, syncpack.' },
      { file: 'package.json', rule: 'exadev/package-requirements', message: 'Script "prepare" in "unwired" must contain "husky", but is "echo ready".' },
      { file: 'package.json', rule: 'exadev/package-requirements', message: 'Script "prepublishOnly" in "unwired" must contain "attw", but is "tsdown && publint".' },
      { file: 'vitest.config.js', rule: 'exadev/vitest-config', message: expect.stringContaining('passWithNoTests') as string },
    ]);
  });

  it('reports a root whose tool scripts do not run the tool', async () => {
    const messages = await lint('stubbed', ['package.json'], { publish: false, hooks: false, toolConfigs: false });
    expect(messages.map((entry) => entry.message)).toEqual([
      'Script "knip" in "stubbed" must contain "knip", but is "echo skip".',
      'Script "syncpack" in "stubbed" must contain "syncpack", but is "true".',
    ]);
  });

  it('holds only the repository root to the root requirements, wherever ESLint runs from', async () => {
    const options: ToolingWiringOptions = { publish: false, hooks: false, toolConfigs: false };
    expect(await lint('monorepo', ['package.json', 'packages/lib/package.json'], options)).toEqual([]);
    expect(await lint('monorepo/packages/lib', ['package.json'], options)).toEqual([]);
  });

  it('reports the missing husky hook directory', async () => {
    const messages = await lint('unwired', ['package.json'], { publish: false, root: false });
    expect(messages.map((entry) => entry.message)).toEqual(['Package "unwired" is missing required file(s): .husky.', 'Script "prepare" in "unwired" must contain "husky", but is "echo ready".']);
  });
});
