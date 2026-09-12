import type { Options } from 'semantic-release';

type ReleaseLevel = 'major' | 'minor' | 'patch' | false;

interface CommitType {
  readonly type: string;
  readonly release: ReleaseLevel;
}

/**
 * Single source of truth for the conventional-commit types this project uses. commitlint's allowed type-enum (commitlint.config.ts imports this) and commit-analyzer's releaseRules below both derive from it, so a type can't trigger a release without also being accepted by commit-msg validation, or the reverse. Mirrors the identical pattern in documents.js/ooxml.js/etc.
 */
export const commitTypes: readonly CommitType[] = [
  { type: 'feat', release: 'minor' },
  { type: 'fix', release: 'patch' },
  { type: 'perf', release: 'patch' },
  { type: 'revert', release: 'patch' },
  { type: 'refactor', release: 'patch' },
  { type: 'docs', release: 'patch' },
  { type: 'style', release: 'patch' },
  { type: 'test', release: 'patch' },
  { type: 'build', release: 'patch' },
  { type: 'ci', release: 'patch' },
  { type: 'chore', release: 'patch' },
];

/**
 * Runs on `main`. Analyses commits since the last tag, bumps the version, publishes to npmjs.org (trusted OIDC publishing, no stored token -- see .github/workflows/ci.yml), creates a versioned tag and GitHub Release with generated notes, and commits CHANGELOG.md + package.json back to main.
 */
const config: Options = {
  branches: ['main'],
  // Deliberately the SSH form, not package.json's own git+https:// repository field (that field stays https:// -- it's public consumer-facing metadata, unrelated to how this release pushes). semantic-release only embeds an x-access-token:$GITHUB_TOKEN@ credential into an https:// repositoryUrl; the default GITHUB_TOKEN it would embed has no way to bypass main's branch ruleset. An SSH URL skips that embedding entirely and pushes using whatever key actions/checkout's ssh-key input already wired into core.sshCommand -- the deploy key added as a DeployKey bypass actor on the ruleset.
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
        // Deliberately angular, not conventionalcommits -- see documents.js's identical note: conventional-changelog-writer's bundled commit partial doesn't match the conventionalcommits preset's function-based partial signature, producing a changelog with a version header and nothing under it.
        preset: 'angular',
      },
    ],
    '@semantic-release/changelog',
    ['@semantic-release/npm', { npmPublish: true }],
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
  ],
};

export default config;
