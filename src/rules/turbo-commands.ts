import { containsTokenRun, tokenizeCommand } from './command-tokens';

/** The two spellings of the command a public script uses to hand a task to turbo. */
export type TurboDelegate = 'turbo run' | 'turbo';

// Tokens that end one command and start another (or redirect it); none of them may follow a delegating command, which would then do more than delegate.
function isShellControl(token: string): boolean {
  return /[;&|<>]/u.test(token);
}

/**
 * Whether `command` is `delegate task` and nothing more than flags for turbo after it: `turbo run _lint`, `turbo run _lint --force` and `turbo run _lint --filter web` delegate, while `tsc && turbo run _lint`, `turbo run _lint && tsc`, `turbo run _lint2` and `turbo run _lint _typecheck` do not. A word after the task must start with a dash or directly follow a token that does (a flag's value), so a second task or any other positional word is rejected; a word that follows a bare flag is taken as its value, since the command line does not say which flags take one. Compared token by token as the other script rules do, so the spacing and quoting of the command do not matter.
 */
export function delegatesTo(command: string, input: Readonly<{ delegate: TurboDelegate; task: string }>): boolean {
  const expected = tokenizeCommand(`${input.delegate} ${input.task}`);
  const tokens = tokenizeCommand(command);
  const rest = tokens.slice(expected.length);

  return (
    expected.every((token, index) => tokens[index] === token) &&
    !tokens.some(isShellControl) &&
    rest.every((token, index) => token.startsWith('-') || rest[index - 1]?.startsWith('-') === true)
  );
}

// The final path segment of a token, so `pnpm exec ./node_modules/.bin/turbo` and `turbo` both name the turbo binary.
function isTurboBinary(token: string): boolean {
  return token.slice(token.lastIndexOf('/') + 1) === 'turbo';
}

/**
 * Every word after `turbo` (and after `run`, when it follows) in each turbo invocation of `command`, leaving out words that start with a dash. Commands chained with `&&`, `||`, `;` or `|` are read one at a time, so an invocation ends at the next operator whether or not a space surrounds it. It over-approximates the tasks the command runs, since the value of a flag written as a separate word (`--filter web`) is included; callers intersect it with the task names they know. `pnpm turbo run lint` and `turbo lint` both yield `lint`.
 */
export function invokedTurboWords(command: string): readonly string[] {
  return command.split(/[;&|]/u).flatMap((segment) => {
    const tokens = tokenizeCommand(segment);
    const turboIndex = tokens.findIndex(isTurboBinary);
    if (turboIndex === -1) return [];
    const afterTurbo = tokens.slice(turboIndex + 1);
    const args = afterTurbo[0] === 'run' ? afterTurbo.slice(1) : afterTurbo;

    return args.filter((word) => !word.startsWith('-'));
  });
}

// Package manager flags that take no value, so the word after one is still the script (or `run`). A flag that takes a value (`--filter boundaries`) must not be skipped: the command line does not say which flags those are, and skipping them would read the flag's value as the script.
const VALUELESS_MANAGER_FLAGS: ReadonlySet<string> = new Set(['-s', '--silent', '-q', '--quiet', '--if-present', '-w', '--workspace-root']);

const PACKAGE_MANAGERS: readonly string[] = ['pnpm', 'npm', 'yarn', 'bun'];

function skipValuelessFlags(tokens: readonly string[]): readonly string[] {
  const next = tokens.findIndex((token) => !VALUELESS_MANAGER_FLAGS.has(token));

  return next === -1 ? [] : tokens.slice(next);
}

// Whether `tokens`, the words after a package manager, name the `boundaries` script: directly or after `run`, with valueless manager flags allowed before either.
function namesBoundariesScript(tokens: readonly string[]): boolean {
  const afterFlags = skipValuelessFlags(tokens);
  const script = afterFlags[0] === 'run' ? skipValuelessFlags(afterFlags.slice(1)) : afterFlags;

  return script[0] === 'boundaries';
}

/**
 * Whether `command` runs boundary checking: `turbo boundaries` directly, or the `boundaries` package script through a package manager (`pnpm boundaries`, `npm run boundaries`, `pnpm run -s boundaries`). A bare word `boundaries` elsewhere, such as the value of a flag or a task run by `turbo run`, does not count.
 */
export function runsBoundaries(command: string): boolean {
  const tokens = tokenizeCommand(command);
  const runsScript = tokens.some((token, index) => PACKAGE_MANAGERS.includes(token) && namesBoundariesScript(tokens.slice(index + 1)));

  return runsScript || containsTokenRun(tokens, ['turbo', 'boundaries']);
}
