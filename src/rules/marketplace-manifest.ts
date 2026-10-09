import { dirname, join, posix } from 'node:path';
import type { JSONRuleDefinition, JSONRuleVisitor } from '@eslint/json';
import type { ObjectNode, StringNode } from '@humanwhocodes/momoa';
import { isRecord } from '../is-record';
import { CLAUDE_PLUGIN_DIR, findMember, isNonEmptyString, PLUGIN_MANIFEST_FILE, readJsonFile } from './claude-plugin-json';
import { listSubdirectories, realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

/**
 * The directory, relative to the marketplace root, whose subdirectories are the plugins of a monorepo marketplace. Every plugin found there must be listed.
 */
export const PLUGINS_DIR = 'plugins';

export type MarketplaceManifestMessageIds =
  | 'notObject'
  | 'invalidName'
  | 'invalidOwnerName'
  | 'pluginsNotArray'
  | 'invalidEntry'
  | 'invalidEntryName'
  | 'duplicateEntryName'
  | 'entryVersion'
  | 'entrySkills'
  | 'invalidSource'
  | 'sourceNotRelative'
  | 'missingPluginManifest'
  | 'invalidPluginManifest'
  | 'pluginNameMismatch'
  | 'duplicateSource'
  | 'unlistedPlugin';

export type MarketplaceManifestRuleDefinition = JSONRuleDefinition<{
  RuleOptions: [];
  MessageIds: MarketplaceManifestMessageIds;
}>;

function sourceDirectory(source: string): string {
  return posix.normalize(source).replace(/\/$/u, '');
}

/**
 * Checks a Claude Code `.claude-plugin/marketplace.json` and the plugins it lists. A marketplace needs a non-empty `name` and `owner.name` and a `plugins` array whose entries each have a unique non-empty `name` and a `source`. An entry must carry no `version` (Claude Code ignores a marketplace entry's version once the plugin's own `plugin.json` sets one, so the two silently disagree) and no `skills` key (Claude Code scans a plugin's `skills/` directory by default, so declaring the directory again lists each skill twice). A string `source` must start with `./`, because the skills CLI skips every other form when it searches a marketplace for skills. The directory it names must hold `.claude-plugin/plugin.json` whose `name` equals the entry's, no two entries may name one directory, and every directory under `plugins/` that holds a plugin manifest must be listed. An object `source` (github, git-subdir and the like) lives in another repository and is checked only for being an object. The filesystem is injectable so a test drives it from an in-memory tree. The marketplace root is the directory holding `.claude-plugin`.
 */
export function createMarketplaceManifestRule(fs: WorkspaceFs = realWorkspaceFs): MarketplaceManifestRuleDefinition {
  return {
    meta: {
      type: 'problem',
      languages: ['json/json', 'json/jsonc'],
      schema: [],
      docs: {
        recommended: false,
        description: 'Require a Claude Code marketplace.json to be well formed and consistent with the plugins it lists and the plugin directories beside it.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/marketplace-manifest.ts',
      },
      messages: {
        notObject: 'The marketplace must be a JSON object.',
        invalidName: 'The marketplace "name" must be a non-empty string.',
        invalidOwnerName: 'The marketplace "owner.name" must be a non-empty string.',
        pluginsNotArray: 'The marketplace "plugins" must be an array.',
        invalidEntry: 'Each marketplace plugin entry must be an object.',
        invalidEntryName: 'Marketplace plugin entry {{entry}} must have a non-empty string "name".',
        duplicateEntryName: 'The marketplace lists {{entry}} more than once.',
        entryVersion: 'Marketplace entry {{entry}} must not have a "version": the plugin\'s own plugin.json owns it, and Claude Code ignores the entry\'s once plugin.json sets one.',
        entrySkills: 'Marketplace entry {{entry}} must not have a "skills" key: skills are found in the default skills/ directory, and declaring it lists each skill twice.',
        invalidSource: 'Marketplace entry {{entry}} must have a "source" that is a string or an object.',
        sourceNotRelative: 'Marketplace entry {{entry}} has source "{{source}}", which does not start with "./", so the skills CLI skips it.',
        missingPluginManifest: 'Marketplace entry {{entry}} has source "{{source}}", which has no {{manifest}}.',
        invalidPluginManifest: 'Marketplace entry {{entry}} has source "{{source}}", whose {{manifest}} is not valid JSON: {{reason}}',
        pluginNameMismatch: 'Marketplace entry {{entry}} points at a plugin named "{{actual}}".',
        duplicateSource: '{{directory}} is listed by more than one marketplace entry, so its skills would be listed once per entry.',
        unlistedPlugin: '{{directory}} holds a plugin manifest but is not listed in the marketplace.',
      },
    },
    create(context) {
      const marketplaceRoot = dirname(dirname(context.filename));
      const manifestPathOf = (directory: string): string => join(marketplaceRoot, directory, CLAUDE_PLUGIN_DIR, PLUGIN_MANIFEST_FILE);

      function checkEntry(entry: ObjectNode, index: number, listed: Set<string>, names: Set<string>): void {
        const nameMember = findMember(entry, 'name');
        const entryName = nameMember !== undefined && isNonEmptyString(nameMember.value) ? nameMember.value : undefined;
        const label = entryName === undefined ? `at index ${String(index)}` : `"${entryName.value}"`;
        if (entryName === undefined) {
          context.report({ loc: nameMember?.value.loc ?? entry.loc, messageId: 'invalidEntryName', data: { entry: label } });
        } else {
          if (names.has(entryName.value)) context.report({ loc: entryName.loc, messageId: 'duplicateEntryName', data: { entry: label } });
          names.add(entryName.value);
        }
        const version = findMember(entry, 'version');
        if (version !== undefined) context.report({ loc: version.loc, messageId: 'entryVersion', data: { entry: label } });
        const skills = findMember(entry, 'skills');
        if (skills !== undefined) context.report({ loc: skills.loc, messageId: 'entrySkills', data: { entry: label } });
        const source = findMember(entry, 'source');
        if (source === undefined || (source.value.type !== 'String' && source.value.type !== 'Object')) {
          context.report({ loc: source?.value.loc ?? entry.loc, messageId: 'invalidSource', data: { entry: label } });
        } else if (source.value.type === 'String') {
          checkLocalSource(source.value, label, entryName, listed);
        }
      }

      function checkLocalSource(source: StringNode, label: string, entryName: StringNode | undefined, listed: Set<string>): void {
        if (!source.value.startsWith('./')) {
          context.report({ loc: source.loc, messageId: 'sourceNotRelative', data: { entry: label, source: source.value } });

          return;
        }
        const directory = sourceDirectory(source.value);
        if (listed.has(directory)) context.report({ loc: source.loc, messageId: 'duplicateSource', data: { directory } });
        listed.add(directory);
        const manifestPath = manifestPathOf(directory);
        const manifestName = `${CLAUDE_PLUGIN_DIR}/${PLUGIN_MANIFEST_FILE}`;
        if (!fs.existsSync(manifestPath)) {
          context.report({ loc: source.loc, messageId: 'missingPluginManifest', data: { entry: label, source: source.value, manifest: manifestName } });

          return;
        }
        const manifest = readJsonFile(fs, manifestPath);
        if (manifest.kind === 'invalid') {
          context.report({ loc: source.loc, messageId: 'invalidPluginManifest', data: { entry: label, source: source.value, manifest: manifestName, reason: manifest.reason } });

          return;
        }
        const actual = isRecord(manifest.value) && typeof manifest.value['name'] === 'string' ? manifest.value['name'] : 'unset';
        if (entryName !== undefined && actual !== entryName.value) {
          context.report({ loc: entryName.loc, messageId: 'pluginNameMismatch', data: { entry: label, actual } });
        }
      }

      return {
        Document(document) {
          const root = document.body;
          if (root.type !== 'Object') {
            context.report({ loc: root.loc, messageId: 'notObject' });

            return;
          }
          const nameMember = findMember(root, 'name');
          if (nameMember === undefined || !isNonEmptyString(nameMember.value)) {
            context.report({ loc: nameMember?.value.loc ?? root.loc, messageId: 'invalidName' });
          }
          const ownerMember = findMember(root, 'owner');
          const ownerName = ownerMember?.value.type === 'Object' ? findMember(ownerMember.value, 'name') : undefined;
          if (ownerName === undefined || !isNonEmptyString(ownerName.value)) {
            context.report({ loc: ownerName?.value.loc ?? ownerMember?.value.loc ?? root.loc, messageId: 'invalidOwnerName' });
          }
          const pluginsMember = findMember(root, 'plugins');
          if (pluginsMember?.value.type !== 'Array') {
            context.report({ loc: pluginsMember?.value.loc ?? root.loc, messageId: 'pluginsNotArray' });

            return;
          }
          const listed = new Set<string>();
          const names = new Set<string>();
          for (const [index, element] of pluginsMember.value.elements.entries()) {
            if (element.value.type !== 'Object') {
              context.report({ loc: element.value.loc, messageId: 'invalidEntry' });
              continue;
            }
            checkEntry(element.value, index, listed, names);
          }
          for (const name of listSubdirectories(fs, join(marketplaceRoot, PLUGINS_DIR))) {
            const directory = `${PLUGINS_DIR}/${name}`;
            if (!listed.has(directory) && fs.existsSync(manifestPathOf(directory))) {
              context.report({ loc: pluginsMember.value.loc, messageId: 'unlistedPlugin', data: { directory } });
            }
          }
        },
      } satisfies JSONRuleVisitor;
    },
  };
}

export default createMarketplaceManifestRule();
