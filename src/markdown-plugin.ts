import { isRecord } from './is-record';
import { tryRequire, type RequireFn } from './optional-plugin';

// A real check (the candidate's own `languages.gfm` entry exists) rather than an assertion: enough evidence this is genuinely @eslint/markdown's plugin object.
function isMarkdownLanguagePlugin(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const languages = value['languages'];

  return isRecord(languages) && 'gfm' in languages;
}

/**
 * `@eslint/markdown` is an ES module, so a synchronous `require()` of it returns the module namespace with the plugin object under `.default`, the same shape `@eslint/json` has (see `resolveJsonPlugin`). Checking `.default` first matches that shape; the value itself is accepted for a build that is its own default export.
 */
export function resolveMarkdownPlugin(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value) && isMarkdownLanguagePlugin(value['default'])) return value['default'];

  return isMarkdownLanguagePlugin(value) ? value : undefined;
}

/**
 * Resolves `@eslint/markdown`'s plugin object through the optional peer, or `undefined` when it cannot be resolved. Callers decide whether that is silence or an error; see `requireMarkdownPlugin` for the error case.
 */
export function tryResolveMarkdownPlugin(requireFn?: RequireFn): Record<string, unknown> | undefined {
  return resolveMarkdownPlugin(tryRequire('@eslint/markdown', requireFn));
}

/**
 * Resolves `@eslint/markdown`'s plugin object or throws, naming `feature` (the thing that cannot work without it) and the install command. A feature that is off unless configured always treats a missing package as an error; one that auto-detects uses `tryResolveMarkdownPlugin` instead.
 */
export function requireMarkdownPlugin(feature: string, requireFn?: RequireFn): Record<string, unknown> {
  const markdownPlugin = tryResolveMarkdownPlugin(requireFn);
  if (markdownPlugin === undefined) {
    throw new Error(`@exadev/eslint-config: ${feature} needs '@eslint/markdown' but it could not be resolved. Install it with: pnpm add -D @eslint/markdown`);
  }

  return markdownPlugin;
}
