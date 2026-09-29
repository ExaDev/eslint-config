import type { Rule } from 'eslint';
import { createFileScope } from './file-scope';
import { loadTurboOptions, turboOptionsSchema } from './turbo-options';

/** The directive `turbo boundaries` honours in a comment directly above an import. */
export const BOUNDARIES_IGNORE_DIRECTIVE = '@boundaries-ignore';

/**
 * The location of a comment, which ESLint always sets on the comments of a source it parsed itself. Exported so the throw, unreachable through a real lint, is tested directly.
 */
export function commentLocation(comment: Readonly<{ loc?: Rule.Node['loc'] }>): NonNullable<Rule.Node['loc']> {
  if (comment.loc === undefined || comment.loc === null) throw new Error('Unreachable: a comment ESLint collected from parsed source always has a location.');

  return comment.loc;
}

/**
 * Bans the `@boundaries-ignore` comment, the same stance `noInlineConfig` takes on `eslint-disable`. `turbo boundaries` skips an import that has the directive in a comment above it, and `turbo boundaries --ignore=all` inserts one above every import it reports, so a repository can silence the check wholesale without anyone deciding to. A comment is recognised the way turbo reads it: its text, trimmed, starts with the directive. Where a few reasoned exceptions are wanted, `boundaries.allowIgnore` lists file globs (relative to ESLint's working directory), each with a required reason, in which the comment is tolerated. Deviates from banning it with core `no-warning-comments`, which has no way to exempt a file and cannot say what to do instead.
 */
const noBoundariesIgnore: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [turboOptionsSchema],
    docs: {
      description: 'Disallow the @boundaries-ignore comment, outside the files listed in boundaries.allowIgnore.',
      url: 'https://github.com/ExaDev/eslint-config/blob/main/src/rules/no-boundaries-ignore.ts',
    },
    messages: {
      boundariesIgnore:
        'A "@boundaries-ignore" comment hides an import that "turbo boundaries" reports. Fix the import, or list this file under "boundaries.allowIgnore" with a reason.',
    },
  },
  create(context) {
    const { boundaries } = loadTurboOptions(context.options[0]);
    const isAllowed = (boundaries?.allowIgnore ?? []).map((entry) => createFileScope(entry.files)).some((inScope) => inScope(context.filename, context.cwd));
    if (isAllowed) return {};

    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.value.trim().startsWith(BOUNDARIES_IGNORE_DIRECTIVE)) context.report({ loc: commentLocation(comment), messageId: 'boundariesIgnore' });
        }
      },
    };
  },
};

export default noBoundariesIgnore;
