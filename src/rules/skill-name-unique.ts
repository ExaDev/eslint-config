import { join } from 'node:path';
import type { MarkdownRuleDefinition } from '@eslint/markdown';
import { createPathMatcher, fileGlobsSchema, relativeToCwd, type PathMatcher } from './file-scope';
import { parseFrontmatter, readSkillName, SKILL_FILE_NAME } from './skill-document';
import { realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

/**
 * The options of `skill-name-unique`. `files` limits which SKILL.md files are compared (the dialect of every file glob in this package, a leading `!` excluding); omitted, every SKILL.md under the working directory counts.
 */
export interface SkillNameUniqueOptions {
  readonly files?: readonly string[];
}

export type SkillNameUniqueMessageIds = 'duplicateName';

export type SkillNameUniqueRuleDefinition = MarkdownRuleDefinition<{
  RuleOptions: [SkillNameUniqueOptions];
  MessageIds: SkillNameUniqueMessageIds;
}>;

// Never descended into: dependencies and version-control internals can hold copies of skills that are not this repository's own.
const IGNORED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git']);

/**
 * A SKILL.md found on disk: its path relative to the scan root (forward slashes) and the name its frontmatter declares.
 */
export interface SkillEntry {
  readonly path: string;
  readonly name: string;
}

/**
 * Every SKILL.md under `root` that `matches` selects and that declares a name, skipping `node_modules` and `.git`. A directory that is a symbolic link is not followed.
 */
export function scanSkillFiles(fs: WorkspaceFs, root: string, matches: PathMatcher): readonly SkillEntry[] {
  const found: SkillEntry[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory)) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(path);
        continue;
      }
      if (entry.name !== SKILL_FILE_NAME) continue;
      const relativePath = relativeToCwd(path, root);
      if (!matches(relativePath)) continue;
      const name = readSkillName(fs.readFileSync(path));
      if (name !== undefined) found.push({ path: relativePath, name });
    }
  };
  visit(root);

  return found;
}

/**
 * Requires a skill name to be defined once across the repository. The skills CLI de-duplicates skills by `name` and silently drops every later one, so a copied SKILL.md whose name was never changed disappears from `skills add` with no error. The other SKILL.md files are found by scanning the working directory, once per directory and file selection for the life of the process, and the current file is compared by its own linted text rather than its copy on disk. The scan is never invalidated, so a long-lived process (an editor's language server) keeps serving the files it saw first until it restarts, the same trade-off the workspace architecture rules make. The cache lives in the rule created by this factory, so a test that builds its own rule starts with an empty one. The filesystem is injectable so a test drives it from an in-memory tree.
 */
export function createSkillNameUniqueRule(fs: WorkspaceFs = realWorkspaceFs): SkillNameUniqueRuleDefinition {
  const scans = new Map<string, readonly SkillEntry[]>();

  function skillsUnder(cwd: string, files: readonly string[] | undefined): readonly SkillEntry[] {
    const key = JSON.stringify([cwd, files]);
    const cached = scans.get(key);
    if (cached !== undefined) return cached;
    const scanned = scanSkillFiles(fs, cwd, files === undefined ? () => true : createPathMatcher(files));
    scans.set(key, scanned);

    return scanned;
  }

  return {
    meta: {
      type: 'problem',
      languages: ['markdown/commonmark', 'markdown/gfm'],
      docs: {
        recommended: false,
        description: 'Require a skill name to be defined once across the repository, since the skills CLI silently drops a skill whose name is already taken.',
        url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/skill-name-unique.ts',
      },
      schema: [{ type: 'object', properties: { files: fileGlobsSchema }, additionalProperties: false }],
      defaultOptions: [{}],
      messages: {
        duplicateName: 'The skill name "{{name}}" is also defined in {{paths}}, so the skills CLI lists only one of them.',
      },
    },
    create(context) {
      const [{ files }] = context.options;
      const ownPath = relativeToCwd(context.filename, context.cwd);

      return {
        yaml(node) {
          const parsed = parseFrontmatter(node.value);
          if (parsed.kind !== 'mapping') return;
          const { name } = parsed.value;
          if (typeof name !== 'string' || name.length === 0) return;
          const others = skillsUnder(context.cwd, files)
            .filter((entry) => entry.name === name && entry.path !== ownPath)
            .map((entry) => entry.path)
            .sort();
          if (others.length > 0) context.report({ node, messageId: 'duplicateName', data: { name, paths: others.join(', ') } });
        },
      };
    },
  };
}

export default createSkillNameUniqueRule();
