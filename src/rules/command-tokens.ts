// The pattern is built per call, not held in a module constant: a module-level mutation is a static mutant that a test runner cannot switch on and off per test.
function unquote(token: string): string {
  return /^(["'])(.*)\1$/u.exec(token)?.[2] ?? token;
}

/**
 * Splits a shell command line into comparable tokens: whitespace-separated, one layer of surrounding quotes removed, and a `--flag=value` option split into `--flag` and `value` so it compares equal to `--flag value`. Shell operators are not interpreted, they are simply tokens, so a token run is found wherever it sits in a chained command.
 */
export function tokenizeCommand(command: string): readonly string[] {
  return [...command.matchAll(/\S+/gu)]
    .map(([token]) => unquote(token))
    .flatMap((token) => {
      const equalsIndex = token.indexOf('=');
      if (!token.startsWith('-') || equalsIndex === -1) return [token];

      return [token.slice(0, equalsIndex), token.slice(equalsIndex + 1)];
    });
}

/** Whether `needle` occurs as a contiguous run of tokens in `haystack`. An empty needle never matches: it names no flag. */
export function containsTokenRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0) return false;

  return haystack.some((_, start) => needle.every((token, offset) => haystack[start + offset] === token));
}
