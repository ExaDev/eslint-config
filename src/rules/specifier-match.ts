import { posix } from 'node:path';
import { createPathMatcher, relativeToCwd, type PathMatcher } from './file-scope';
import { isExcludePattern } from './workspace-glob';

/**
 * Decides whether a module specifier, as written in the file being linted, is selected by a pattern list.
 */
export type SpecifierMatcher = (specifier: string, filename: string, cwd: string) => boolean;

const NODE_PREFIX = 'node:';

function stripNodePrefix(specifier: string): string {
  return specifier.startsWith(NODE_PREFIX) ? specifier.slice(NODE_PREFIX.length) : specifier;
}

/**
 * Whether a module specifier names a file relative to the importing one: `.`, `..`, or a path starting `./` or `../`. A bare specifier that merely begins with a dot (`.hidden`) is a package name, not a relative path.
 */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * Adds the "and everything beneath it" variant to a pattern, so naming a package or a directory selects its subpaths too (`fs` selects `fs/promises`, `src/db` selects `src/db/client`). A pattern already ending in `**` is left alone.
 */
function withSubpaths(pattern: string): readonly string[] {
  const prefix = isExcludePattern(pattern) ? '!' : '';
  const body = bodyOf(pattern);

  return body.endsWith('**') ? [pattern] : [pattern, `${prefix}${body}/**`];
}

function bodyOf(pattern: string): string {
  return isExcludePattern(pattern) ? pattern.slice(1) : pattern;
}

/**
 * Compiles a specifier pattern list. Syntactic only: nothing is resolved through the module graph or `node_modules`, so a pattern works when the package is not installed.
 *
 * Patterns use the `fileGlobsSchema` dialect and each also selects everything beneath it. A leading `node:` is ignored on both sides, so `fs` and `node:fs` are the same builtin. A bare specifier (`zod`, `@scope/pkg/sub`) is matched as written. A relative specifier is first resolved against the linted file's directory to a path relative to the working directory, then matched only by patterns containing a `/`, which are the ones that can name a path; a bare pattern such as `fs` never selects `./fs`. A relative specifier that leaves the working directory matches nothing.
 */
export function createSpecifierMatcher(patterns: readonly string[]): SpecifierMatcher {
  const stripped = patterns.map(stripNodePrefixFromPattern);
  const matchesBare = createPathMatcher(stripped.flatMap(withSubpaths));
  const pathLike = stripped.filter((pattern) => bodyOf(pattern).includes('/'));
  const matchesPath: PathMatcher | undefined = pathLike.some((pattern) => !isExcludePattern(pattern)) ? createPathMatcher(pathLike.flatMap(withSubpaths)) : undefined;

  return (specifier, filename, cwd) => {
    if (!isRelativeSpecifier(specifier)) return matchesBare(stripNodePrefix(specifier));
    if (matchesPath === undefined) return false;
    const fromDirectory = posix.dirname(relativeToCwd(filename, cwd));

    return matchesPath(posix.normalize(posix.join(fromDirectory, specifier)));
  };
}

function stripNodePrefixFromPattern(pattern: string): string {
  return isExcludePattern(pattern) ? `!${stripNodePrefix(pattern.slice(1))}` : stripNodePrefix(pattern);
}
