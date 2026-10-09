import { ESLint, type Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import { plugin } from './index';
import { isRecord } from './is-record';
import {
  buildViaAgentSkills,
  buildViaAgentSkillsOption,
  buildViaDefensiveFallbackAllow,
  buildViaDependAllowsReact,
  buildViaDynamicImportBan,
  buildViaImportPolicy,
  buildViaManualRules,
  buildViaPluginConfigsReactAndNextjs,
  buildViaPureModules,
  buildViaPureModulesOption,
  buildViaScopedComplexity,
  buildViaSequentialAwaitOverride,
  buildViaTestHygiene,
  buildViaStringExtends,
  buildViaTseslintPluginConfigsRecommended,
  buildViaWorkspaceArchitecture,
} from './readme-examples';

async function ruleSettingOf(eslint: ESLint, file: string, ruleId: string): Promise<unknown> {
  const config: unknown = await eslint.calculateConfigForFile(file);
  if (!isRecord(config) || !isRecord(config['rules'])) throw new Error(`Unreachable: ESLint resolves a rules object for ${file}.`);

  return config['rules'][ruleId];
}

async function complexityOf(eslint: ESLint, file: string): Promise<unknown> {
  return ruleSettingOf(eslint, file, 'complexity');
}

// This file's only job is proving README.md's own defineConfig() examples still resolve to the exact real config content they document, not just typecheck, mirroring consumer-compatibility.unit.test.ts's own role for the default export. Every assertion below checks a value this file's own literal supplies, not the shared bundles (exadev/recommended, workspaceArchitectureConfig's own wiring) those literals pull in, which already have their own dedicated tests. Each builder is called here, inside the test, rather than imported as an already-built constant, so a broken example's own thrown error surfaces as this specific test failing.
describe('README defineConfig examples', () => {
  it('the "lighter option" manual-rules example is passed through unchanged', () => {
    expect(buildViaManualRules()).toEqual([
      {
        files: ['src/**/*.ts'],
        ignores: ['src/index.ts'],
        plugins: { exadev: plugin },
        rules: {
          'exadev/no-non-barrel-reexport': 'error',
        },
      },
    ]);
  });

  it('the "lighter option" string-extends example wires its own file glob and plugin, and pulls in exadev/recommended', () => {
    const viaStringExtends = buildViaStringExtends();
    expect(viaStringExtends).toHaveLength(2);
    const ownEntry = viaStringExtends.find((entry) => entry.rules === undefined);
    expect(ownEntry?.files).toEqual(['**/*.ts']);
    expect(ownEntry?.plugins?.['exadev']).toBe(plugin);
    const recommendedEntry = viaStringExtends.find((entry) => entry.rules !== undefined);
    expect(recommendedEntry?.rules?.['exadev/barrel-policy']).toEqual(['error', { mode: 'banned' }]);
  });

  it('the group-ranked workspace architecture example passes its exact groups and naming through to no-uphill-dependency', () => {
    const viaWorkspaceArchitecture = buildViaWorkspaceArchitecture();
    const workspaceEntry = viaWorkspaceArchitecture.find((entry) => entry.rules?.['exadev/no-uphill-dependency'] !== undefined);
    expect(workspaceEntry?.rules?.['exadev/no-uphill-dependency']).toEqual([
      'error',
      {
        groups: [
          { name: 'core', rank: 0 },
          { name: 'features', rank: 1 },
          { name: 'product', rank: 2 },
          { name: 'targets', rank: 3 },
          { name: 'test', rank: 4, naming: 'keep-group' },
        ],
        naming: { scope: '@novus' },
      },
    ]);
  });

  it('the group-ranked workspace architecture example keeps react and nextjs off, as its trailing exadevConfig() call states', () => {
    const viaWorkspaceArchitecture = buildViaWorkspaceArchitecture();
    const pluginKeys = new Set(viaWorkspaceArchitecture.flatMap((entry) => Object.keys(entry.plugins ?? {})));
    expect(pluginKeys.has('react')).toBe(false);
    expect(pluginKeys.has('@next/next')).toBe(false);
  });

  it('the "lighter option" tseslint.config() example wires its own file glob and plugin, and pulls in plugin.configs.recommended by name', () => {
    // tseslint.config()'s own extends handling flattens plugin.configs.recommended's object into a SEPARATE entry (this file's own `files`/`plugins` intersected onto it), so the two entries below are not the same object: the recommended-rules entry carries plugin.configs.recommended's OWN `plugins` field, and this example's own `files: ['**/*.ts']`/`plugins: { exadev: plugin }` line surface only on the other, rules-less entry.
    const viaTseslintConfig = buildViaTseslintPluginConfigsRecommended();
    expect(viaTseslintConfig).toHaveLength(2);
    const ownEntry = viaTseslintConfig.find((entry) => entry.rules === undefined);
    expect(ownEntry?.files).toEqual(['**/*.ts']);
    expect(ownEntry?.plugins?.['exadev']).toBe(plugin);
    const recommendedEntry = viaTseslintConfig.find((entry) => entry.rules !== undefined);
    expect(recommendedEntry?.files).toEqual(['**/*.ts']);
    expect(recommendedEntry?.rules?.['exadev/barrel-policy']).toEqual(['error', { mode: 'banned' }]);
  });

  it('the "Optional features" example wires plugin.configs.react and plugin.configs.nextjs by name, each to its own exact file glob', () => {
    // No requireFn override: this repo's own real devDependencies (eslint-plugin-react/-hooks, eslint-plugin-jsx-a11y, @next/eslint-plugin-next) resolve for real, so plugin.configs.react/.nextjs each throw nothing and return their genuine upstream config blocks, which defineConfig() then flattens (each entry's own `extends` array becomes further top-level entries) rather than nesting them under the two entries this example itself declares. Each of those two entries' own remaining `files`/`plugins` still surfaces as its own entry here (the same flattening the tseslint.config() example above relies on), identified by carrying `plugins: { exadev: plugin }` with no `rules` of its own.
    const viaReactAndNextjs = buildViaPluginConfigsReactAndNextjs();
    const pluginKeys = new Set(viaReactAndNextjs.flatMap((entry) => Object.keys(entry.plugins ?? {})));
    expect(pluginKeys.has('react')).toBe(true);
    expect(pluginKeys.has('react-hooks')).toBe(true);
    expect(pluginKeys.has('jsx-a11y')).toBe(true);
    expect(pluginKeys.has('@next/next')).toBe(true);

    const ownEntries = viaReactAndNextjs.filter((entry) => entry.plugins?.['exadev'] === plugin && entry.rules === undefined);
    expect(ownEntries).toHaveLength(2);
    expect(ownEntries.find((entry) => JSON.stringify(entry.files) === JSON.stringify(['**/*.tsx']))).toBeDefined();
    expect(ownEntries.find((entry) => JSON.stringify(entry.files) === JSON.stringify(['**/*.ts', '**/*.tsx']))).toBeDefined();
  });

  it('the import policy example compiles all three policies into the one rule block', () => {
    const policyBlock = buildViaImportPolicy().find((entry) => entry.rules?.['exadev/import-policy'] !== undefined);
    const options = policyBlock?.rules?.['exadev/import-policy'];
    if (!Array.isArray(options)) throw new Error('Unreachable: the block enables the rule with options.');
    expect(options[0]).toBe('error');
    const policies = options[1];
    expect(Array.isArray(policies) ? policies.map((policy: { files: string[] }) => policy.files) : undefined).toStrictEqual([['src/worker/**'], ['src/**'], ['src/routes/**']]);
  });

  it('the ban-dependencies example allows eslint-plugin-react, which the rule otherwise reports, and still reports other banned packages', async () => {
    const reactPeers = ['eslint-plugin-react', 'eslint-plugin-react-hooks', 'eslint-plugin-jsx-a11y', '@next/eslint-plugin-next'];
    const manifest = JSON.stringify({ name: 'consumer', devDependencies: Object.fromEntries([...reactPeers, 'eslint-plugin-import'].map((name) => [name, '*'])) });
    const bannedIn = async (config: readonly Linter.Config[]): Promise<unknown[]> => {
      const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [...config], cwd: import.meta.dirname });
      const [result] = await eslint.lintText(manifest, { filePath: 'package.json' });
      if (result === undefined) throw new Error('Unreachable: lintText returns one result per text.');

      return result.messages.filter((message) => message.ruleId === 'depend/ban-dependencies').map((message) => message.message.split('"')[1]);
    };
    const allowing = buildViaDependAllowsReact();
    expect(await bannedIn(allowing)).toStrictEqual(['eslint-plugin-import']);
    expect(await bannedIn([...allowing, { files: ['package.json'], rules: { 'depend/ban-dependencies': ['error', {}] } }])).toStrictEqual(['eslint-plugin-react', 'eslint-plugin-import']);
  });

  it('the dynamic import ban reports the static, dynamic and template forms of the banned specifier, and a computed one', async () => {
    const policyBlocks = buildViaDynamicImportBan().filter((entry) => entry.rules?.['exadev/import-policy'] !== undefined);
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: policyBlocks, cwd: import.meta.dirname });
    const lines = [
      { code: "import { createFake } from 'pkg/fake';", messageId: 'restricted' },
      { code: "const lazy = await import('pkg/fake');", messageId: 'restricted' },
      { code: 'const template = await import(`pkg/fake`);', messageId: 'restricted' },
      { code: 'const computed = await import(`./${createFake.name}`);', messageId: 'computed' },
    ];
    const code = lines.map((line) => line.code).join('\n');
    const [result] = await eslint.lintText(code, { filePath: 'src/routes/lazy.js' });
    expect(result?.messages.map((message) => [message.line, message.messageId])).toStrictEqual(lines.map((line, index) => [index + 1, line.messageId]));
    const [inTest] = await eslint.lintText(code, { filePath: 'src/routes/lazy.test.ts' });
    expect(inTest?.messages).toStrictEqual([]);
  });

  it('the pure modules examples wire the one rule, with the exclude as an ignore, and no-control-flow when asked for', () => {
    const block = buildViaPureModules().find((entry) => entry.rules?.['exadev/pure-module'] !== undefined);
    expect(block?.files).toStrictEqual(['src/core/**']);
    expect(block?.ignores).toStrictEqual(['src/core/**/*.gen.ts']);
    expect(block?.rules).toStrictEqual({ 'exadev/pure-module': ['error', { allowImports: ['node:stream'] }], 'exadev/no-control-flow': 'error' });
    expect(buildViaPureModulesOption().some((entry) => entry.rules?.['exadev/pure-module'] !== undefined)).toBe(true);
  });

  it('the test hygiene example wires every list it names, and the kinds override accepts the guard and conformance kinds', () => {
    const blocks = buildViaTestHygiene();
    const filesOf = (rule: string) => blocks.filter((entry) => entry.rules?.[rule] !== undefined).map((entry) => entry.files);
    expect(filesOf('exadev/non-vacuous-guard')).toStrictEqual([['**/*.guard.test.ts']]);
    expect(filesOf('vitest/expect-expect')).toContainEqual(['**/*conformance*.test.ts', 'packages/*/src/conformance.ts']);
    const kindsBlock = blocks.find((entry) => entry.rules?.['exadev/test-file-kind'] !== undefined && entry.files === undefined);
    expect(kindsBlock?.rules?.['exadev/test-file-kind']).toStrictEqual(['error', { kinds: ['unit', 'integration', 'e2e', 'guard', 'conformance'] }]);
  });

  it('the scoped complexity example limits the scoped files only, because its block follows the shared config', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: buildViaScopedComplexity(), cwd: import.meta.dirname });
    expect(await complexityOf(eslint, 'src/views/home.ts')).toStrictEqual([2, { max: 2 }]);
    expect(await complexityOf(eslint, 'src/main.ts')).toStrictEqual([2, { max: 2 }]);
    expect(await complexityOf(eslint, 'src/lib/pick.ts')).toBeUndefined();
  });

  it('a broader complexity setting placed after the scoped block replaces its ceiling, which is why the README puts the scoped block last', async () => {
    const broaderBlock: Linter.Config = { files: ['src/**/*.ts'], rules: { complexity: ['error', { max: 20 }] } };
    const broaderLast = [...buildViaScopedComplexity(), broaderBlock];
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: broaderLast, cwd: import.meta.dirname });
    expect(await complexityOf(eslint, 'src/views/home.ts')).toStrictEqual([2, { max: 20 }]);
  });

  it('the sequential-await example turns no-await-in-loop off for the scoped files only', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: buildViaSequentialAwaitOverride(), cwd: import.meta.dirname });
    expect(await ruleSettingOf(eslint, 'src/migrations/run.ts', 'no-await-in-loop')).toStrictEqual([0]);
    expect(await ruleSettingOf(eslint, 'src/lib/pick.ts', 'no-await-in-loop')).toStrictEqual([2]);
  });

  it('the defensive-fallback example resolves the rule with its reasoned allow entry for the scoped files', async () => {
    const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: buildViaDefensiveFallbackAllow(), cwd: import.meta.dirname });
    expect(await ruleSettingOf(eslint, 'src/feature/items.ts', 'exadev/no-defensive-fallback')).toStrictEqual([
      2,
      { allow: [{ files: ['src/config/**'], reason: 'optional settings default to empty at the parsing boundary' }] },
    ]);
  });

  it('the agent skills examples apply the given globs, as the standalone export and through exadevConfig()', () => {
    for (const blocks of [buildViaAgentSkills(), buildViaAgentSkillsOption()]) {
      const skills = blocks.find((entry) => entry.rules?.['exadev/skill-frontmatter'] !== undefined);
      expect(skills?.files).toStrictEqual(['skills/*/SKILL.md', 'plugins/*/skills/*/SKILL.md']);
      expect(skills?.ignores).toStrictEqual(['plugins/legacy/**']);
      expect(blocks.find((entry) => entry.rules?.['exadev/plugin-manifest'] !== undefined)?.files).toStrictEqual(['plugins/*/.claude-plugin/plugin.json']);
      expect(blocks.find((entry) => entry.rules?.['exadev/marketplace-manifest'] !== undefined)?.files).toStrictEqual(['.claude-plugin/marketplace.json']);
    }
  });
});
