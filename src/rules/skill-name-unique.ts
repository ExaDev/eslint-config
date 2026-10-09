import { join } from 'node:path';
import type { MarkdownRuleDefinition } from '@eslint/markdown';
import { assertSupportedGlob, createPathMatcher, fileGlobsSchema, relativeToCwd, type PathMatcher } from './file-scope';
import { createIgnoreMatcher, type IgnoreMatcher } from './ignore-patterns';
import { parseFrontmatter, readSkillName, SKILL_FILE_NAME } from './skill-document';
import { listEntriesOrEmpty, realWorkspaceFs, type WorkspaceFs } from './workspace-fs';

/**
 * The options of `skill-name-unique`. `files` limits which SKILL.md files are compared (minimatch globs with `dot: true`, as ESLint matches a config's `files`, a leading `!` excluding, so the comparison covers the files ESLint lints); omitted, every SKILL.md under the working directory counts.
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
    for (const entry of listEntriesOrEmpty(fs, directory)) {
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
 * Requires a skill name to be defined once across the repository. The skills CLI de-duplicates skills by `name` and silently drops every later one, so a copied SKILL.md whose name was never changed disappears from `skills add` with no error. The other SKILL.md files are found by scanning the working directory, once per directory, file selection and ignore list for the life of the process, and the current file is compared by its own linted text rather than its copy on disk. A scanned file that resolves (realpath) to the linted file is the same skill and not a duplicate, which is what a skill directory linked into a plugin is; the scan itself never follows a link. The scan is never invalidated, and the cache belongs to the rule, so every `ESLint` instance in the process shares it and a long-lived process (an editor's language server) keeps serving the files it saw first until it restarts, the same trade-off the workspace architecture rules make: ESLint gives a rule no signal that a run has started, so detecting a change would mean rescanning the tree for every SKILL.md linted, and checking only the files already seen would miss a newly added copy. ESLint's own `--cache` has the same effect from outside: it keys on the linted file and the configuration, so a SKILL.md whose text is unchanged is not linted again when another skill is added, renamed or removed, and the cache file has to be deleted after such a change (a cold cache is unaffected). The cache lives in the rule created by this factory, so a test that builds its own rule starts with an empty one. The filesystem is injectable so a test drives it from an in-memory tree.
 */
export function createSkillNameUniqueRule(fs: WorkspaceFs = realWorkspaceFs): SkillNameUniqueRuleDefinition {
  const scans = new Map<string, readonly SkillEntry[]>();

  function skillsUnder(cwd: string, { files, ignores = [] }: SkillNameUniqueOptions): readonly SkillEntry[] {
    const key = JSON.stringify([cwd, files, ignores]);
    const cached = scans.get(key);
    if (cached !== undefined) return cached;
    const scanned = scanSkillFiles(fs, cwd, files === undefined ? () => true : createPathMatcher(files, { dotMatching: 'any' }), createIgnoreMatcher(ignores));
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
      for (const glob of options.files ?? []) assertSupportedGlob(glob, 'skill-name-unique.files');
      // Absence is a legitimate branch here, not an error: the scan is cached for the life of the process, so a cached entry can name a skill that has since been renamed or removed, and the linted file can be an unsaved buffer with no copy on disk. A path that does not exist names itself.
      const realPathOf = (path: string): string => (fs.existsSync(path) ? fs.realpathSync(path) : path);
      const ownRealPath = realPathOf(context.filename);
      // A copy exists, and is not the linted file, which is the same skill when two paths resolve to one file (a skill directory linked into a plugin). The path comparison needs no clause of its own: the linted file resolves to itself.
      const isOtherExistingFile = (entry: SkillEntry): boolean => {
        const path = join(context.cwd, entry.path);

        return fs.existsSync(path) && fs.realpathSync(path) !== ownRealPath;
      };

      return {
        yaml(node) {
          const parsed = parseFrontmatter(node.value);
          if (parsed.kind !== 'mapping') return;
          const { name } = parsed.value;
          // Trimmed and otherwise exact, as the skills CLI de-duplicates (it trims a name and then compares strings), so a quoted " a" and "a" are one name, while a fullwidth or decomposed spelling is another.
          const trimmed = typeof name === 'string' ? name.trim() : '';
          if (trimmed.length === 0) return;
          const others = skillsUnder(context.cwd, options)
            .filter((entry) => entry.name === trimmed && isOtherExistingFile(entry))
            .map((entry) => entry.path)
            .sort();
          if (others.length > 0) context.report({ node, messageId: 'duplicateName', data: { name: trimmed, paths: others.join(', ') } });
        },
      };
    },
  };
}

export default createSkillNameUniqueRule();
