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
 * Resolves `@eslint/markdown`'s plugin object or throws, naming `feature` (the thing that cannot work without it) and the install command. Nothing here is auto-detected: the features that use it are off unless configured, so a missing package is always an error.
 */
export function requireMarkdownPlugin(feature: string, requireFn?: RequireFn): Record<string, unknown> {
  const markdownPlugin = resolveMarkdownPlugin(tryRequire('@eslint/markdown', requireFn));
  if (markdownPlugin === undefined) {
    throw new Error(`@exadev/eslint-config: ${feature} needs '@eslint/markdown' but it could not be resolved. Install it with: pnpm add -D @eslint/markdown`);
  }

  return markdownPlugin;
}
