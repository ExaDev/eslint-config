/**
 * Answers, for one lint of a file, whether that lint carries the finding.
 */
export type RunTracker = (filename: string, text: string) => boolean;

/**
 * Decides, lint by lint, which lint of a set of files carries a finding that belongs to the whole set rather than to any one file, so the finding is reported once per ESLint run instead of once per file. Returns a function to call for every lint of a file in the set, with the file's name and the text being linted; it answers whether this lint carries the finding.
 *
 * ESLint gives a rule no signal that a run has started, so the boundary is read from the sequence of lints. A file already linted since the last carrying lint marks the start of a new run, which a long-lived process (an editor integration, an ESLint instance that lints more than once) meets when it lints a file again in its next run. A file linted again straight after itself with different text is ESLint applying fixes, which re-lints the fixed text before moving on and keeps only the messages of the last pass, or an editor re-linting an edit; either way it repeats its own previous answer, so applying fixes neither moves the finding nor adds a second one. A run made only of files not linted since the last carrying lint cannot be told apart from the same run and gets no carrying lint.
 */
export function createRunTracker(): RunTracker {
  const lintedSinceCarrier = new Set<string>();
  let previous: { readonly filename: string; readonly text: string; readonly carries: boolean } | undefined;

  return (filename, text) => {
    if (previous?.filename === filename && previous.text !== text) {
      previous = { filename, text, carries: previous.carries };

      return previous.carries;
    }
    if (lintedSinceCarrier.has(filename)) lintedSinceCarrier.clear();
    const carries = lintedSinceCarrier.size === 0;
    lintedSinceCarrier.add(filename);
    previous = { filename, text, carries };

    return carries;
  };
}
