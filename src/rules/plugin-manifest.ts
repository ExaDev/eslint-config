import { basename, dirname, join } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import { isRecord } from '../is-record';
import { findMember, readJsonFile } from './claude-plugin-json';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

export type PluginManifestMessageIds = 'notObject' | 'nameMissing' | 'nameMismatch' | 'skillsKey' | 'versionMismatch' | 'invalidPackageJson';

export type PluginManifestRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [];
  MessageIds: PluginManifestMessageIds;
}>;

/**
 * Checks a Claude Code plugin's `.claude-plugin/plugin.json`. Its `name` must equal the plugin directory's name (the directory holding `.claude-plugin`), because the marketplace entry, the `/<plugin>:<skill>` command prefix and the directory are all read as one identifier and drift silently when they differ. It must carry no `skills` key: Claude Code scans the plugin's `skills/` directory by default, so declaring one adds a second scan of the same skills. When a `package.json` beside `.claude-plugin` declares a `version`, the manifest's `version` must equal it: the release tool bumps `package.json`, and Claude Code prefers the plugin manifest's version over the marketplace entry's, so a manifest left behind keeps announcing the old release. The filesystem is injectable so a test drives it from an in-memory tree.
 */
export function createPluginManifestRule(fs: WorkspaceFs = realWorkspaceFs): PluginManifestRuleDefinition {
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [],
      docs: {
        recommended: false,
        description: 'Require a Claude Code plugin.json to name its plugin directory, declare no skills key and carry the version of the package.json beside it.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/plugin-manifest.ts',
      },
      messages: {
        notObject: 'The plugin manifest must be a JSON object.',
        nameMissing: 'The plugin manifest must set "name" to its directory name "{{directory}}".',
        nameMismatch: 'The plugin name "{{name}}" must equal its directory name "{{directory}}".',
        skillsKey: 'The plugin manifest must not have a "skills" key: Claude Code scans the default skills/ directory, so declaring it scans the same skills twice.',
        invalidPackageJson: 'The package.json beside the plugin is not valid JSON, so its version cannot be compared: {{reason}}',
        versionMismatch: 'The plugin version is {{actual}} but package.json is {{expected}}; they must be equal.',
      },
    },
    create(context) {
      return {
        Document(document) {
          const root = document.body;
          if (root.type !== 'Object') {
            context.report({ loc: root.loc, messageId: 'notObject' });

            return;
          }
          const pluginDirectory = dirname(dirname(context.filename));
          const directory = basename(pluginDirectory);
          const nameMember = findMember(root, 'name');
          if (nameMember?.value.type !== 'String') {
            context.report({ loc: nameMember?.value.loc ?? root.loc, messageId: 'nameMissing', data: { directory } });
          } else if (nameMember.value.value !== directory) {
            context.report({ loc: nameMember.value.loc, messageId: 'nameMismatch', data: { name: nameMember.value.value, directory } });
          }
          const skills = findMember(root, 'skills');
          if (skills !== undefined) context.report({ loc: skills.loc, messageId: 'skillsKey' });
          const packageJsonPath = join(pluginDirectory, 'package.json');
          if (!fs.existsSync(packageJsonPath)) return;
          const packageJson = readJsonFile(fs, packageJsonPath);
          if (packageJson.kind === 'invalid') {
            context.report({ loc: root.loc, messageId: 'invalidPackageJson', data: { reason: packageJson.reason } });

            return;
          }
          const expected = isRecord(packageJson.value) ? packageJson.value['version'] : undefined;
          if (typeof expected !== 'string') return;
          const version = findMember(root, 'version');
          if (version?.value.type === 'String' && version.value.value === expected) return;
          const actual = version === undefined ? 'unset' : version.value.type === 'String' ? version.value.value : 'not a string';
          context.report({ loc: version?.value.loc ?? root.loc, messageId: 'versionMismatch', data: { actual, expected } });
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createPluginManifestRule();
