import type { TSESLint } from '@typescript-eslint/utils';
import type { PublicPlugin } from './config-types';

// Isolated in its own module, doing nothing but this one cast, so eslint.config.ts's own override for @typescript-eslint/consistent-type-assertions (this repo's noInlineConfig means that can only ever be a scoped `files` override, never an inline disable) applies to exactly this line and nothing else in the codebase, the same reason to-public-config-array.ts is isolated the same way.
//
// See PublicPlugin's own comment in config-types.ts for why this cast is necessary and safe: the plugin object this package builds in src/plugin.ts is already a real, valid ESLint plugin at runtime, matching @eslint/core's own Plugin shape byte for byte; only the *type* built from @typescript-eslint/utils' internal FlatConfig.Plugin isn't nominally assignable to @eslint/core's Plugin (its `configs` field's value type is typescript-eslint's own internal Config/ConfigArray union rather than @eslint/core's ConfigObject/LegacyConfigObject union).
export function toPublicPlugin(built: TSESLint.FlatConfig.Plugin): PublicPlugin {
  return built as unknown as PublicPlugin;
}
