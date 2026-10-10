import { generateNotes } from '@semantic-release/release-notes-generator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRecord } from './src/is-record';
import config, { commitTypes, releaseCommit } from './release.config';

const NOTES_PLUGIN = '@semantic-release/release-notes-generator';

/** The hash of a synthetic commit is its two digit position in the list followed by this tail, which makes a full 40 character hash. */
const HASH_TAIL = 'abcdef0123456789abcdef0123456789abcdef';

/** The options release.config.ts hands to the release-notes generator, read out of the plugin list the way semantic-release reads it. */
function notesPluginConfig(): Readonly<Record<string, unknown>> {
  for (const plugin of config.plugins ?? []) {
    if (Array.isArray(plugin) && plugin[0] === NOTES_PLUGIN && isRecord(plugin[1])) {
      return plugin[1];
    }
  }
  throw new Error(`${NOTES_PLUGIN} is not configured in release.config.ts`);
}

/** Notes for `messages`, one commit each (the first is the newest, as `git log` lists them), through the real generator. */
async function notesFor(messages: readonly string[]): Promise<string> {
  return await generateNotes(notesPluginConfig(), {
    cwd: process.cwd(),
    commits: messages.map((message, index) => ({ hash: `${String(index + 1).padStart(2, '0')}${HASH_TAIL}`, message })),
    options: { repositoryUrl: 'git@github.com:ExaDev/eslint-config.git' },
    lastRelease: { gitTag: 'v1.0.0' },
    nextRelease: { gitTag: 'v1.0.1', version: '1.0.1' },
  });
}

describe('release notes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists every commit type under its own section, in the order of commitTypes', async () => {
    const messages = commitTypes.map((t) => `${t.type}: ${t.title} change`);
    const notes = await notesFor(messages);

    expect(notes).toBe(`## [1.0.1](https://github.com/ExaDev/eslint-config/compare/v1.0.0...v1.0.1) (2026-01-02)


### Features

* Features change ([01abcde](https://github.com/ExaDev/eslint-config/commit/01abcdef0123456789abcdef0123456789abcdef))


### Bug Fixes

* Bug Fixes change ([02abcde](https://github.com/ExaDev/eslint-config/commit/02abcdef0123456789abcdef0123456789abcdef))


### Performance Improvements

* Performance Improvements change ([03abcde](https://github.com/ExaDev/eslint-config/commit/03abcdef0123456789abcdef0123456789abcdef))


### Reverts

* Reverts change ([04abcde](https://github.com/ExaDev/eslint-config/commit/04abcdef0123456789abcdef0123456789abcdef))


### Code Refactoring

* Code Refactoring change ([05abcde](https://github.com/ExaDev/eslint-config/commit/05abcdef0123456789abcdef0123456789abcdef))


### Documentation

* Documentation change ([06abcde](https://github.com/ExaDev/eslint-config/commit/06abcdef0123456789abcdef0123456789abcdef))


### Styles

* Styles change ([07abcde](https://github.com/ExaDev/eslint-config/commit/07abcdef0123456789abcdef0123456789abcdef))


### Tests

* Tests change ([08abcde](https://github.com/ExaDev/eslint-config/commit/08abcdef0123456789abcdef0123456789abcdef))


### Build System

* Build System change ([09abcde](https://github.com/ExaDev/eslint-config/commit/09abcdef0123456789abcdef0123456789abcdef))


### Continuous Integration

* Continuous Integration change ([10abcde](https://github.com/ExaDev/eslint-config/commit/10abcdef0123456789abcdef0123456789abcdef))


### Chores

* Chores change ([11abcde](https://github.com/ExaDev/eslint-config/commit/11abcdef0123456789abcdef0123456789abcdef))
`);
  });

  it('gives a release made only of types the angular preset hides a body', async () => {
    const notes = await notesFor(['refactor: split the parser', 'test: cover the splitter', 'docs: describe the split']);

    expect(notes).toContain('### Code Refactoring\n\n* split the parser (');
    expect(notes).toContain('### Documentation\n\n* describe the split (');
    expect(notes).toContain('### Tests\n\n* cover the splitter (');
  });

  it('leaves the release commit out, even in a range that contains earlier release commits', async () => {
    const releaseMessage = `${releaseCommit.type}(${releaseCommit.scope}): 1.0.0 [skip ci]`;
    const notes = await notesFor([releaseMessage, 'chore(deps): bump left-pad from 1.0.0 to 1.1.0', 'fix: handle an empty list']);

    expect(notes).not.toContain('1.0.0 [skip ci]');
    expect(notes).not.toContain('release');
    expect(notes).toContain('### Chores\n\n* **deps:** bump left-pad from 1.0.0 to 1.1.0 (');
    expect(notes).toContain('### Bug Fixes\n\n* handle an empty list (');
  });

  it('keeps dependabot build(deps) commits', async () => {
    const notes = await notesFor(['build(deps): bump vite from 7.0.0 to 7.0.1']);

    expect(notes).toContain('### Build System\n\n* **deps:** bump vite from 7.0.0 to 7.0.1 (');
  });

  it('lists a breaking change under its type and in a BREAKING CHANGES section', async () => {
    const notes = await notesFor(['refactor!: drop the legacy entry point\n\nBREAKING CHANGE: the legacy entry point is gone']);

    expect(notes).toContain('### Code Refactoring\n\n* drop the legacy entry point (');
    expect(notes).toContain('### BREAKING CHANGES\n\n* the legacy entry point is gone');
  });

  it('links an issue number in a subject and a mention of a user', async () => {
    const notes = await notesFor(['fix: handle the case from #12 reported by @someone']);

    expect(notes).toContain('* handle the case from [#12](https://github.com/ExaDev/eslint-config/issues/12) reported by [@someone](https://github.com/someone) (');
  });

  it('leaves out a commit that is not a conventional commit', async () => {
    const notes = await notesFor(['Merge branch main into feature', 'fix: keep the merge target']);

    expect(notes).not.toContain('Merge branch');
    expect(notes).toContain('### Bug Fixes\n\n* keep the merge target (');
  });

  it('puts a revert commit under Reverts', async () => {
    const notes = await notesFor(['Revert "feat: add the flag"\n\nThis reverts commit 1234567890abcdef1234567890abcdef12345678.']);

    expect(notes).toContain('### Reverts\n\n* ');
  });
});
