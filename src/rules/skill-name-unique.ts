import { join } from 'node:path';
import type { MarkdownRuleDefinition } from '@eslint/markdown';
import { createPathMatcher, fileGlobsSchema, relativeToCwd, type PathMatcher } from './file-scope';
import { createIgnoreMatcher, type IgnoreMatcher } from './ignore-patterns';
import { parseFrontmatter, readSkillName, SKILL_FILE_NAME } from './skill-document';
import { realWorkspaceFs, type DirEntry, type WorkspaceFs } from './workspace-fs';

/**
 * The options of `skill-name-unique`. `files` limits which SKILL.md files are compared (the glob dialect of this package, a leading `!` excluding, but with a wildcard and `**` matching a dot-prefixed directory as they do in an ESLint config's `files`, so the comparison covers the files ESLint lints); omitted, every SKILL.md under the working directory counts.
 */
export interface SkillNameUniqueOptions {
  readonly files?: readonly string[];
  // The entries of the flat config's `ignores` that hide files from ESLint (a `.gitignore`-derived list, say). The rule cannot ask ESLint what it ignores, so a copy of a skill under an ignored directory, which ESLint never lints, would otherwise count as a duplicate of the real one. Evaluated in order, the last entry that selects a path deciding it, with `!` bringing a path back.
  readonly ignores?: readonly string[];
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

// Whether `error` is the operating system refusing access, as opposed to a path that is missing or not a directory.
function isPermissionError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'EACCES' || error.code === 'EPERM');
}

// A directory the process may not list is empty to the scan: ESLint lints nothing in it either, so no skill there can duplicate one it lints. Every other failure propagates.
function listDirectory(fs: WorkspaceFs, directory: string): readonly DirEntry[] {
  try {
    return fs.readdirSync(directory);
  } catch (error) {
    if (isPermissionError(error)) return [];
    throw error;
  }
}

// A SKILL.md the scan found but cannot read is not skipped, since a duplicate could hide in it; the error names the file, which the bare operating system error does not always.
function readSkillFile(fs: WorkspaceFs, path: string): string {
  try {
    return fs.readFileSync(path);
  } catch (error) {
    throw new Error(`@exadev/eslint-config: skill-name-unique cannot read "${path}": ${String(error)}`, { cause: error });
  }
}

/**
 * Every SKILL.md under `root` that `matches` selects and that declares a name, skipping `node_modules`, `.git` and whatever `isIgnored` ignores: an ignored directory is not entered and an ignored file is not read. A directory that cannot be listed for lack of permission counts as empty; a SKILL.md that cannot be read throws an error naming it. A directory that is a symbolic link is not followed.
 */
export function scanSkillFiles(fs: WorkspaceFs, root: string, matches: PathMatcher, isIgnored: IgnoreMatcher): readonly SkillEntry[] {
  const found: SkillEntry[] = [];
  const visit = (directory: string): void => {
    for (const entry of listDirectory(fs, directory)) {
      const path = join(directory, entry.name);
      const relativePath = relativeToCwd(path, root);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name) && !isIgnored(relativePath, true)) visit(path);
        continue;
      }
      if (entry.name !== SKILL_FILE_NAME || isIgnored(relativePath, false)) continue;
      if (!matches(relativePath)) continue;
      const name = readSkillName(readSkillFile(fs, path));
      if (name !== undefined) found.push({ path: relativePath, name });
    }
  };
  visit(root);

  return found;
}

/**
 * Requires a skill name to be defined once across the repository. The skills CLI de-duplicates skills by `name` and silently drops every later one, so a copied SKILL.md whose name was never changed disappears from `skills add` with no error. The other SKILL.md files are found by scanning the working directory, once per directory, file selection and ignore list for the life of the process, and the current file is compared by its own linted text rather than its copy on disk. A scanned file that resolves (realpath) to the linted file is the same skill and not a duplicate, which is what a skill directory linked into a plugin is; the scan itself never follows a link. The scan is never invalidated, and the cache belongs to the rule, so every `ESLint` instance in the process shares it and a long-lived process (an editor's language server) keeps serving the files it saw first until it restarts, the same trade-off the workspace architecture rules make: ESLint gives a rule no signal that a run has started, so detecting a change would mean rescanning the tree for every SKILL.md linted, and checking only the files already seen would miss a newly added copy. The cache lives in the rule created by this factory, so a test that builds its own rule starts with an empty one. The filesystem is injectable so a test drives it from an in-memory tree.
 */
export function createSkillNameUniqueRule(fs: WorkspaceFs = realWorkspaceFs): SkillNameUniqueRuleDefinition {
  const scans = new Map<string, readonly SkillEntry[]>();

  function skillsUnder(cwd: string, { files, ignores = [] }: SkillNameUniqueOptions): readonly SkillEntry[] {
    const key = JSON.stringify([cwd, files, ignores]);
    const cached = scans.get(key);
    if (cached !== undefined) return cached;
    const scanned = scanSkillFiles(fs, cwd, files === undefined ? () => true : createPathMatcher(files, 'any'), createIgnoreMatcher(ignores));
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
      schema: [{ type: 'object', properties: { files: fileGlobsSchema, ignores: { type: 'array', items: { type: 'string', minLength: 1 } } }, additionalProperties: false }],
      defaultOptions: [{}],
      messages: {
        duplicateName: 'The skill name "{{name}}" is also defined in {{paths}}, so the skills CLI lists only one of them.',
      },
    },
    create(context) {
      const [options] = context.options;
      const ownPath = relativeToCwd(context.filename, context.cwd);
      // The linted file as the file system names it, which is what makes two paths one skill. A file that is not on disk (an unsaved buffer) is its own path.
      const ownRealPath = fs.existsSync(context.filename) ? fs.realpathSync(context.filename) : context.filename;
      const isOwnFile = (entry: SkillEntry): boolean => entry.path === ownPath || fs.realpathSync(join(context.cwd, entry.path)) === ownRealPath;

      return {
        yaml(node) {
          const parsed = parseFrontmatter(node.value);
          if (parsed.kind !== 'mapping') return;
          const { name } = parsed.value;
          if (typeof name !== 'string' || name.length === 0) return;
          const others = skillsUnder(context.cwd, options)
            .filter((entry) => entry.name === name && !isOwnFile(entry))
            .map((entry) => entry.path)
            .sort();
          if (others.length > 0) context.report({ node, messageId: 'duplicateName', data: { name, paths: others.join(', ') } });
        },
      };
    },
  };
}

export default createSkillNameUniqueRule();
