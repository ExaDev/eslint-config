import type { Options } from 'semantic-release';

type ReleaseLevel = 'major' | 'minor' | 'patch' | false;

interface CommitType {
  readonly type: string;
  readonly release: ReleaseLevel;
  /** Heading of the section that lists this type's commits in the release notes and CHANGELOG.md. */
  readonly title: string;
}

/**
 * Single source of truth for the conventional-commit types this project uses. commitlint's allowed type-enum (commitlint.config.ts imports this), commit-analyzer's releaseRules and the release notes' sections below all derive from it, so a type can't trigger a release without also being accepted by commit-msg validation, or appear in a release without a section in its notes. The order is the order of the sections in the notes. Mirrors the identical pattern in documents.js/ooxml.js/etc.
 */
export const commitTypes: readonly CommitType[] = [
  { type: 'feat', release: 'minor', title: 'Features' },
  { type: 'fix', release: 'patch', title: 'Bug Fixes' },
  { type: 'perf', release: 'patch', title: 'Performance Improvements' },
  { type: 'revert', release: 'patch', title: 'Reverts' },
  { type: 'refactor', release: 'patch', title: 'Code Refactoring' },
  { type: 'docs', release: 'patch', title: 'Documentation' },
  { type: 'style', release: 'patch', title: 'Styles' },
  { type: 'test', release: 'patch', title: 'Tests' },
  { type: 'build', release: 'patch', title: 'Build System' },
  { type: 'ci', release: 'patch', title: 'Continuous Integration' },
  { type: 'chore', release: 'patch', title: 'Chores' },
];

/**
 * Type and scope of the commit semantic-release makes to publish CHANGELOG.md and package.json. It is a release artefact, not a change, so the notes leave it out; a range read by hand (a backfill, a re-run) contains the commits of earlier releases.
 */
export const releaseCommit = { type: 'chore', scope: 'release' } as const;

const sectionTitles = commitTypes.map((t) => t.title);
const revertTitle = commitTypes.find((t) => t.type === 'revert')?.title;

/** The fields of a commit parsed by conventional-commits-parser (plus the hash semantic-release adds) that the notes' transform reads. */
interface ParsedCommit {
  readonly type?: string | null | undefined;
  readonly scope?: string | null | undefined;
  readonly subject?: string | null | undefined;
  readonly hash?: string | null | undefined;
  readonly revert: object | null;
  readonly notes: readonly { readonly title: string; readonly text: string }[];
  readonly references: readonly { readonly issue: string }[];
}

/** The part of the changelog context that links in a commit subject are built from. */
interface NotesContext {
  readonly host?: string;
  readonly owner?: string;
  readonly repository?: string;
  readonly repoUrl?: string;
}

/** A commit in the shape the angular preset's templates render. */
interface ListedCommit {
  readonly notes: readonly { readonly title: string; readonly text: string }[];
  readonly type: string;
  readonly scope: string | null | undefined;
  readonly shortHash: string | undefined;
  readonly subject: string | undefined;
  readonly references: readonly { readonly issue: string }[];
}

/** A group of commits under one section title, as the writer sorts them. */
interface CommitGroup {
  readonly title: string;
}

const SHORT_HASH_LENGTH = 7;

/**
 * Turns a subject's `#123` references into issue links. Returns the new subject and the issue numbers it linked, so the caller can drop them from the references printed after the subject.
 * @param subject - The commit subject.
 * @param context - The changelog context that names the repository.
 * @returns The subject with issue links, and the linked issue numbers.
 */
function linkIssues(subject: string, context: NotesContext): { readonly subject: string; readonly issues: readonly string[] } {
  const repositoryUrl = context.repository === undefined ? context.repoUrl : `${context.host ?? ''}/${context.owner ?? ''}/${context.repository}`;
  if (repositoryUrl === undefined || repositoryUrl === '') {
    return { subject, issues: [] };
  }
  const issues: string[] = [];
  const linked = subject.replace(/#([0-9]+)/g, (_match, issue: string) => {
    issues.push(issue);

    return `[#${issue}](${repositoryUrl}/issues/${issue})`;
  });

  return { subject: linked, issues };
}

/**
 * Turns a subject's `@user` mentions into profile links, leaving code spans and `@scope/name` package names alone.
 * @param subject - The commit subject.
 * @param host - The repository host, such as `https://github.com`.
 * @returns The subject with mention links.
 */
function linkUsers(subject: string, host: string): string {
  return subject.replace(/`[^`]*`|\B@([a-z0-9](?:-?[a-z0-9/]){0,38})/g, (match, username: string | undefined) => {
    if (username === undefined) {
      return match;
    }

    return username.includes('/') ? `@${username}` : `[@${username}](${host}/${username})`;
  });
}

/**
 * Decides which commits reach the release notes and under which section. It replaces the transform of the `angular` preset, which returns `undefined` for every type but feat, fix, perf and revert (and for any commit without a breaking change), so a release made of other types had an empty body. Here every type in `commitTypes` is listed under its title, and only release commits and commits that are not conventional commits are left out. The returned shape, the issue and user links and the short hash follow the preset's own transform (conventional-changelog-angular, src/writer.js), because the preset's templates render them.
 * @param commit - The commit as parsed by conventional-commits-parser.
 * @param context - The changelog context built by the release-notes generator.
 * @returns The commit as the preset's templates expect it, or `undefined` when it is not listed.
 */
export function transformCommit(commit: ParsedCommit, context: NotesContext): ListedCommit | undefined {
  if (commit.type === releaseCommit.type && commit.scope === releaseCommit.scope) {
    return undefined;
  }
  const title = commit.revert === null ? commitTypes.find((t) => t.type === commit.type)?.title : revertTitle;
  if (title === undefined) {
    return undefined;
  }

  let subject: string | undefined;
  let issues: readonly string[] = [];
  if (typeof commit.subject === 'string') {
    ({ subject, issues } = linkIssues(commit.subject, context));
    if (context.host !== undefined) {
      subject = linkUsers(subject, context.host);
    }
  }

  return {
    notes: commit.notes.map((note) => ({ ...note, title: 'BREAKING CHANGES' })),
    type: title,
    scope: commit.scope === '*' ? '' : commit.scope,
    shortHash: commit.hash?.substring(0, SHORT_HASH_LENGTH),
    subject,
    // References that already appear as a link in the subject are not repeated after it.
    references: commit.references.filter((reference) => !issues.includes(reference.issue)),
  };
}

/**
 * Orders the sections of a release's notes as `commitTypes` does, instead of alphabetically as the angular preset does.
 * @param a - A commit group titled with one of the `commitTypes` titles.
 * @param b - The group compared with it.
 * @returns Negative when `a` is listed before `b`.
 */
export function compareSections(a: CommitGroup, b: CommitGroup): number {
  return sectionTitles.indexOf(a.title) - sectionTitles.indexOf(b.title);
}

/**
 * Runs on `main`. Analyses commits since the last tag, bumps the version, publishes to npmjs.org (trusted OIDC publishing, no stored token; see .github/workflows/ci.yml), creates a versioned tag and GitHub Release with generated notes, and commits CHANGELOG.md + package.json back to main.
 */
const config: Options = {
  branches: ['main'],
  // Deliberately the SSH form, not package.json's own git+https:// repository field (that field stays https://; it's public consumer-facing metadata, unrelated to how this release pushes). semantic-release first tries to push to repositoryUrl exactly as written, and the Release job's GIT_SSH_COMMAND (set only on the semantic-release step, pointing at a deploy key provisioned just before it; see .github/workflows/ci.yml) authenticates that push as a DeployKey bypass actor on main's ruleset. Only if that attempt fails does semantic-release embed x-access-token:$GITHUB_TOKEN into an https URL, which the ruleset rejects because the default GITHUB_TOKEN cannot bypass it; the workflow's preflight dry-run push makes a missing key fail before that fallback can be reached.
  repositoryUrl: 'git@github.com:ExaDev/eslint-config.git',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [{ breaking: true, release: 'major' }, ...commitTypes.map((t) => ({ type: t.type, release: t.release }))],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        // The angular preset's layout (templates, heading levels, link style) with its transform replaced, so every type in commitTypes is listed. Not the conventionalcommits preset: its templates are functions, which the conventional-changelog-writer that @semantic-release/release-notes-generator bundles does not call, so a changelog built from it has a version header and section titles with no commits under them (checked against the installed releases of both).
        preset: 'angular',
        // The header patterns of the conventionalcommits preset that commit-analyzer above uses, so a commit the analyser reads as breaking (`feat!:`) is read the same here. The angular preset's own pattern does not accept `!`, which would drop such a commit from the notes.
        parserOpts: {
          headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
          breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
          noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
        },
        writerOpts: { transform: transformCommit, commitGroupsSort: compareSections },
      },
    ],
    '@semantic-release/changelog',
    ['@semantic-release/npm', { npmPublish: true }],
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: `${releaseCommit.type}(${releaseCommit.scope}): \${nextRelease.version} [skip ci]`,
      },
    ],
  ],
};

export default config;
